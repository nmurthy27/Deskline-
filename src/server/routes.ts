import crypto from 'node:crypto';
import express, { type Request, type Response } from 'express';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '../db/index.ts';
import {
  appointments,
  auditLogs,
  availabilityRules,
  businesses,
  campaignRecipients,
  campaigns,
  channelIntegrations,
  conversations,
  customers,
  knowledgeItems,
  packages,
  services,
  users,
  type ConversationMessage,
  type WorkingDaysMap,
} from '../db/schema.ts';
import { requireAuth, requireSuperAdmin, type AuthRequest } from '../middleware/auth.ts';
import { processCustomerMessage } from './bookingAgent.ts';
import {
  cancelAppointmentAtomic,
  createAppointmentAtomic,
  DEFAULT_WORKING_DAYS,
  getAvailableSlots,
  getBusinessBySlug,
  rescheduleAppointmentAtomic,
} from './bookingEngine.ts';
import {
  createAndSendCampaign,
  draftCampaignCopyWithAI,
  importExistingCustomerContacts,
  MAX_EXISTING_CUSTOMER_CAMPAIGN_LIMIT,
} from './campaignService.ts';
import {
  computeFieldAccuracyAudit,
  copyDesklineToMasterProfile,
  copyGooglePlaceToMasterProfile,
  fetchLiveGooglePlaceDetails,
  generateLocalBusinessJsonLd,
  getGoogleMapsApiKey,
  getOrInitGoogleProfile,
  saveMasterProfileEdits,
  searchGooglePublicProfiles,
  syncMasterIfAutoEnabled,
  type LiveGooglePlaceDetails,
} from './googleProfileService.ts';
import { generateMisReport } from './misService.ts';
import { DEMO_BUSINESS_SLUG, ensureDemoBusinessSeeded } from './seedDemo.ts';
import { analyzeWebsiteContent } from './websiteAnalyzer.ts';
import { googleProfiles } from '../db/schema.ts';

function resolveRequestOrigin(req: Request): string {
  const configured = (process.env.APP_URL || '').trim();
  if (configured && configured !== 'MY_APP_URL') {
    return configured.replace(/\/+$/, '');
  }
  const proto = req.headers['x-forwarded-proto']
    ? String(req.headers['x-forwarded-proto']).split(',')[0].trim()
    : req.protocol;
  const host = req.get('host') || 'localhost:3000';
  return `${proto}://${host}`.replace(/\/+$/, '');
}

function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return base || `business-${crypto.randomInt(1000, 9999)}`;
}

async function assertBusinessAccess(req: AuthRequest, businessId: number) {
  const [biz] = await db
    .select()
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1);

  if (!biz) {
    return { ok: false as const, status: 404, error: 'Business not found.' };
  }

  const isOwner = biz.ownerUid === req.user?.uid;
  const isSuperAdmin = req.dbUser?.role === 'super_admin';

  if (!isOwner && !isSuperAdmin) {
    return {
      ok: false as const,
      status: 403,
      error: 'Forbidden: You do not have access to this business tenant.',
    };
  }

  return { ok: true as const, business: biz };
}

export function createApiRouter() {
  const router = express.Router();

  // Health check
  router.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok' });
  });

  // Public Google Maps Platform JS SDK key config (scoped browser key)
  router.get('/public/maps-config', (_req: Request, res: Response) => {
    const apiKey = getGoogleMapsApiKey();
    return res.json({
      mapsConfigured: Boolean(apiKey),
      apiKey,
    });
  });

  // Public Master Business Profile & Schema.org LocalBusiness JSON-LD
  router.get('/public/profile/:slug', async (req: Request, res: Response) => {
    try {
      const slug = String(req.params.slug || '').trim().toLowerCase();
      if (slug === DEMO_BUSINESS_SLUG) {
        await ensureDemoBusinessSeeded();
      }
      const biz = await getBusinessBySlug(slug);
      if (!biz || biz.status === 'suspended') {
        return res.status(404).json({ error: 'Business profile not found.' });
      }

      const origin = resolveRequestOrigin(req);
      const profile = await getOrInitGoogleProfile(biz.id, origin);
      if (!profile.publicProfileEnabled) {
        return res.status(404).json({ error: 'Public master profile is disabled.' });
      }

      let livePlace: LiveGooglePlaceDetails | null = null;
      let quotaExceeded = false;
      if (profile.googlePlaceId) {
        const liveRes = await fetchLiveGooglePlaceDetails(profile.googlePlaceId);
        if (liveRes.ok) {
          livePlace = liveRes.place;
        } else if (liveRes.quotaExceeded) {
          quotaExceeded = true;
        }
      }

      const jsonLd = generateLocalBusinessJsonLd(
        biz.slug,
        profile.masterProfileJson,
        origin
      );

      return res.json({
        slug: biz.slug,
        currency: biz.currency,
        timezone: biz.timezone,
        widgetBrandColor: biz.widgetBrandColor,
        agentName: biz.agentName,
        googlePlaceId: profile.googlePlaceId,
        masterProfile: profile.masterProfileJson,
        livePlace,
        jsonLd,
        lastUpdatedAt: profile.updatedAt,
        quotaExceeded,
      });
    } catch (error) {
      console.error('Error loading public master profile:', error);
      return res.status(500).json({ error: 'Failed to load public profile.' });
    }
  });

  router.get('/public/profile/:slug/schema.json', async (req: Request, res: Response) => {
    try {
      const slug = String(req.params.slug || '').trim().toLowerCase();
      if (slug === DEMO_BUSINESS_SLUG) {
        await ensureDemoBusinessSeeded();
      }
      const biz = await getBusinessBySlug(slug);
      if (!biz || biz.status === 'suspended') {
        return res.status(404).json({ error: 'Business profile not found.' });
      }
      const origin = resolveRequestOrigin(req);
      const profile = await getOrInitGoogleProfile(biz.id, origin);
      const jsonLd = generateLocalBusinessJsonLd(
        biz.slug,
        profile.masterProfileJson,
        origin
      );
      res.type('application/ld+json');
      return res.json(jsonLd);
    } catch (error) {
      console.error('Error generating LocalBusiness JSON-LD:', error);
      return res.status(500).json({ error: 'Failed to generate schema.' });
    }
  });

  // ---------------------------------------------------------------------------
  // PUBLIC CUSTOMER CHANNELS (Website Chat Widget & WhatsApp Simulator)
  // ---------------------------------------------------------------------------
  router.get('/public/business/:slug', async (req: Request, res: Response) => {
    try {
      const slug = String(req.params.slug || '').trim().toLowerCase();
      if (slug === DEMO_BUSINESS_SLUG) {
        await ensureDemoBusinessSeeded();
      }
      const biz = await getBusinessBySlug(slug);
      if (!biz || biz.status === 'suspended') {
        return res.status(404).json({ error: 'Business not found or inactive.' });
      }

      const [activeServices, activePackages, [avail], channels] = await Promise.all([
        db
          .select()
          .from(services)
          .where(and(eq(services.businessId, biz.id), eq(services.isActive, true))),
        db
          .select()
          .from(packages)
          .where(and(eq(packages.businessId, biz.id), eq(packages.isActive, true))),
        db
          .select()
          .from(availabilityRules)
          .where(eq(availabilityRules.businessId, biz.id))
          .limit(1),
        db
          .select()
          .from(channelIntegrations)
          .where(eq(channelIntegrations.businessId, biz.id)),
      ]);

      const widgetChannel = channels.find((c) => c.channelType === 'website_widget');
      const whatsappChannel = channels.find((c) => c.channelType === 'whatsapp');

      return res.json({
        business: {
          id: biz.id,
          slug: biz.slug,
          businessName: biz.businessName,
          businessCategory: biz.businessCategory,
          description: biz.description,
          address: biz.address,
          timezone: biz.timezone,
          currency: biz.currency,
          websiteUrl: biz.websiteUrl,
          whatsappPhone: biz.whatsappPhone,
          agentName: biz.agentName,
          agentGreeting: biz.agentGreeting,
          widgetBrandColor: biz.widgetBrandColor,
          bookingPolicy: biz.bookingPolicy,
        },
        services: activeServices,
        packages: activePackages,
        workingDays: avail?.workingDaysJson ?? DEFAULT_WORKING_DAYS,
        widgetConfig: widgetChannel?.widgetConfigJson ?? {
          welcomeMessage: biz.agentGreeting,
          quickPrompts: [
            'Book an appointment',
            'Explore services',
            'View pricing',
            'View packages',
            'Talk to someone',
          ],
          enableWhatsAppHandoff: Boolean(biz.whatsappPhone),
          position: 'bottom-right',
          brandColor: biz.widgetBrandColor,
        },
        whatsappConnected: whatsappChannel?.connectionStatus === 'connected',
      });
    } catch (error: unknown) {
      console.error('Error loading public business:', error);
      return res.status(500).json({ error: 'Failed to load business details.' });
    }
  });

  router.get('/public/availability/:slug', async (req: Request, res: Response) => {
    try {
      const slug = String(req.params.slug || '').trim().toLowerCase();
      const date = String(req.query.date || '').trim();
      const serviceIdRaw = req.query.serviceId ? Number(req.query.serviceId) : undefined;
      const serviceNameRaw = req.query.serviceName ? String(req.query.serviceName) : undefined;

      if (slug === DEMO_BUSINESS_SLUG) {
        await ensureDemoBusinessSeeded();
      }
      const biz = await getBusinessBySlug(slug);
      if (!biz) {
        return res.status(404).json({ error: 'Business not found.' });
      }

      const result = await getAvailableSlots(
        biz.id,
        date,
        Number.isFinite(serviceIdRaw) ? serviceIdRaw : serviceNameRaw
      );
      return res.json(result);
    } catch (error: unknown) {
      console.error('Error checking public availability:', error);
      return res.status(500).json({ error: 'Failed to check availability.' });
    }
  });

  router.post('/public/chat/:slug', async (req: Request, res: Response) => {
    try {
      const slug = String(req.params.slug || '').trim().toLowerCase();
      if (slug === DEMO_BUSINESS_SLUG) {
        await ensureDemoBusinessSeeded();
      }
      const biz = await getBusinessBySlug(slug);
      if (!biz) {
        return res.status(404).json({ error: 'Business not found.' });
      }

      const messageText = String(req.body?.message || '').trim();
      const channel =
        req.body?.channel === 'whatsapp'
          ? 'whatsapp'
          : req.body?.channel === 'google_profile'
            ? 'google_profile'
            : 'website';
      const sessionKey = String(req.body?.sessionKey || '').trim() || crypto.randomUUID();
      const customerName = req.body?.customerName ? String(req.body.customerName) : undefined;
      const customerPhone = req.body?.customerPhone ? String(req.body.customerPhone) : undefined;

      if (!messageText || messageText.length > 2000) {
        return res
          .status(400)
          .json({ error: 'Please provide a message between 1 and 2000 characters.' });
      }

      const result = await processCustomerMessage({
        businessId: biz.id,
        sessionKey,
        channel,
        messageText,
        customerName,
        customerPhone,
      });

      return res.json({
        sessionKey,
        conversationId: result.conversation.id,
        status: result.status,
        replyText: result.replyText,
        toolActions: result.toolActions,
        humanTakeoverActive: result.humanTakeoverActive,
        messages: result.conversation.messagesJson,
      });
    } catch (error: unknown) {
      console.error('Error processing customer chat:', error);
      const message =
        error instanceof Error ? error.message : 'Unable to process chat message.';
      return res.status(500).json({ error: message });
    }
  });

  router.get('/public/conversation/:slug/:sessionKey', async (req: Request, res: Response) => {
    try {
      const slug = String(req.params.slug || '').trim().toLowerCase();
      const sessionKey = String(req.params.sessionKey || '').trim();
      const channel =
        req.query.channel === 'whatsapp'
          ? 'whatsapp'
          : req.query.channel === 'google_profile'
            ? 'google_profile'
            : 'website';

      const biz = await getBusinessBySlug(slug);
      if (!biz) {
        return res.status(404).json({ error: 'Business not found.' });
      }

      const [conv] = await db
        .select()
        .from(conversations)
        .where(
          and(
            eq(conversations.businessId, biz.id),
            eq(conversations.sessionKey, sessionKey),
            eq(conversations.channel, channel)
          )
        )
        .limit(1);

      return res.json({
        conversation: conv || null,
      });
    } catch (error) {
      console.error('Error fetching public conversation:', error);
      return res.status(500).json({ error: 'Failed to load conversation.' });
    }
  });

  // ---------------------------------------------------------------------------
  // META WHATSAPP CLOUD API WEBHOOKS
  // ---------------------------------------------------------------------------
  router.get('/webhooks/whatsapp/:slug', async (req: Request, res: Response) => {
    try {
      const slug = String(req.params.slug || '').trim().toLowerCase();
      const mode = String(req.query['hub.mode'] || '');
      const token = String(req.query['hub.verify_token'] || '');
      const challenge = String(req.query['hub.challenge'] || '');

      const biz = await getBusinessBySlug(slug);
      if (!biz) return res.sendStatus(404);

      const [wa] = await db
        .select()
        .from(channelIntegrations)
        .where(
          and(
            eq(channelIntegrations.businessId, biz.id),
            eq(channelIntegrations.channelType, 'whatsapp')
          )
        )
        .limit(1);

      if (mode === 'subscribe' && wa && token && token === wa.metaVerifyToken) {
        return res.status(200).send(challenge);
      }
      return res.sendStatus(403);
    } catch (error) {
      console.error('WhatsApp webhook verification error:', error);
      return res.sendStatus(500);
    }
  });

  router.post('/webhooks/whatsapp/:slug', async (req: Request, res: Response) => {
    try {
      const slug = String(req.params.slug || '').trim().toLowerCase();
      const biz = await getBusinessBySlug(slug);
      if (!biz) return res.sendStatus(404);

      const entry = req.body?.entry?.[0];
      const change = entry?.changes?.[0]?.value;
      const incoming = change?.messages?.[0];
      const contact = change?.contacts?.[0];

      if (incoming && incoming.type === 'text' && incoming.text?.body) {
        const senderPhone = String(incoming.from || '');
        const senderName = String(contact?.profile?.name || 'WhatsApp Customer');
        const result = await processCustomerMessage({
          businessId: biz.id,
          sessionKey: `wa_${senderPhone}`,
          channel: 'whatsapp',
          messageText: String(incoming.text.body),
          customerName: senderName,
          customerPhone: senderPhone,
        });
        return res.status(200).json({
          received: true,
          replyPreview: result.replyText,
        });
      }

      return res.status(200).json({ received: true });
    } catch (error) {
      console.error('WhatsApp webhook handler error:', error);
      return res.status(500).json({ error: 'Webhook processing failed' });
    }
  });

  // ---------------------------------------------------------------------------
  // AUTHENTICATED USER & BUSINESS TENANT MANAGEMENT
  // ---------------------------------------------------------------------------
  router.get('/me', requireAuth, async (req: AuthRequest, res: Response) => {
    return res.json({
      user: req.dbUser,
    });
  });

  router.get('/businesses', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      await ensureDemoBusinessSeeded();

      const rows =
        req.dbUser?.role === 'super_admin'
          ? await db.select().from(businesses).orderBy(desc(businesses.createdAt))
          : await db
              .select()
              .from(businesses)
              .where(eq(businesses.ownerUid, req.user!.uid))
              .orderBy(desc(businesses.createdAt));

      return res.json({ businesses: rows });
    } catch (error) {
      console.error('Failed to list businesses:', error);
      return res.status(500).json({ error: 'Failed to load your businesses.' });
    }
  });

  router.post('/businesses', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const businessName = String(req.body?.businessName || '').trim();
      const businessEmail =
        String(req.body?.businessEmail || '').trim() || req.dbUser!.email;
      const contactPerson =
        String(req.body?.contactPerson || '').trim() || req.dbUser!.displayName;
      const country = String(req.body?.country || 'India').trim();
      const timezone = String(req.body?.timezone || 'Asia/Kolkata').trim();
      const businessCategory = String(req.body?.businessCategory || 'Healthcare').trim();
      const websiteUrl = String(req.body?.websiteUrl || '').trim();
      const whatsappPhone = String(req.body?.whatsappPhone || '').trim();
      const description = String(req.body?.description || '').trim();
      const address = String(req.body?.address || '').trim();
      const currency = String(req.body?.currency || 'INR').trim().toUpperCase();

      if (!businessName) {
        return res.status(400).json({ error: 'Business name is required.' });
      }

      let slug = slugify(businessName);
      const existingSlug = await getBusinessBySlug(slug);
      if (existingSlug) {
        slug = `${slug}-${crypto.randomInt(100, 999)}`;
      }

      const [created] = await db
        .insert(businesses)
        .values({
          ownerUid: req.user!.uid,
          slug,
          businessName,
          businessEmail,
          contactPerson,
          country,
          timezone,
          businessCategory,
          websiteUrl,
          whatsappPhone,
          description,
          address,
          currency,
          status: 'active',
          onboardingStep: 2,
          agentName: 'Maya',
          agentGreeting: `Hi! Welcome to ${businessName}. How can I help you today?`,
        })
        .returning();

      await db.insert(availabilityRules).values({
        businessId: created.id,
        workingDaysJson: DEFAULT_WORKING_DAYS,
        breakStart: '13:00',
        breakEnd: '14:00',
        slotIntervalMinutes: 30,
      });

      const verifyToken = `deskline_${crypto.randomBytes(6).toString('hex')}`;
      await db.insert(channelIntegrations).values([
        {
          businessId: created.id,
          channelType: 'whatsapp',
          metaVerifyToken: verifyToken,
          webhookUrl: `/api/webhooks/whatsapp/${created.slug}`,
          connectionStatus: whatsappPhone ? 'pending_verification' : 'not_connected',
          approvedTemplatesJson: [
            {
              name: 'booking_confirmation',
              category: 'UTILITY',
              status: 'approved',
              body: `Hi {{1}}, your appointment at ${businessName} is confirmed for {{2}} at {{3}}. Ref: {{4}}.`,
            },
            {
              name: 'booking_reminder_24h',
              category: 'UTILITY',
              status: 'approved',
              body: `Reminder: You have an upcoming appointment at ${businessName} tomorrow at {{1}}.`,
            },
          ],
        },
        {
          businessId: created.id,
          channelType: 'website_widget',
          connectionStatus: 'connected',
          widgetConfigJson: {
            welcomeMessage: `Hi! Welcome to ${businessName}. How can I help you today?`,
            quickPrompts: [
              'Book an appointment',
              'Explore services',
              'View pricing',
              'View packages',
              'Talk to someone',
            ],
            enableWhatsAppHandoff: Boolean(whatsappPhone),
            position: 'bottom-right',
            brandColor: '#0F766E',
          },
        },
      ]);

      // Seed starter consultation service if user requests quick template
      if (req.body?.seedStarterCatalog) {
        await db.insert(services).values([
          {
            businessId: created.id,
            name: 'Initial Consultation',
            description: '30-minute introductory assessment and recommendation.',
            category: 'Consultations',
            durationMinutes: 30,
            price: currency === 'INR' ? 500 : 45,
            currency,
            staffMember: contactPerson || 'Lead Specialist',
          },
          {
            businessId: created.id,
            name: 'Full Session',
            description: '60-minute comprehensive appointment.',
            category: 'Core Services',
            durationMinutes: 60,
            price: currency === 'INR' ? 1200 : 95,
            currency,
            staffMember: contactPerson || 'Lead Specialist',
          },
        ]);
      }

      await db.insert(auditLogs).values({
        businessId: created.id,
        actorUid: req.user!.uid,
        action: 'business.created',
        entityType: 'business',
        entityId: String(created.id),
        details: `Created tenant ${created.businessName} (${created.slug})`,
      });

      return res.status(201).json({ business: created });
    } catch (error) {
      console.error('Failed to create business:', error);
      return res.status(500).json({ error: 'Failed to create business tenant.' });
    }
  });

  router.get('/businesses/:id', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const businessId = Number(req.params.id);
      if (!Number.isFinite(businessId)) {
        return res.status(400).json({ error: 'Invalid business ID.' });
      }
      const access = await assertBusinessAccess(req, businessId);
      if (!access.ok) return res.status(access.status).json({ error: access.error });

      const [
        serviceRows,
        packageRows,
        [availRow],
        channelRows,
        knowledgeRows,
        apptRows,
        convRows,
        customerRows,
      ] = await Promise.all([
        db
          .select()
          .from(services)
          .where(eq(services.businessId, businessId))
          .orderBy(desc(services.createdAt)),
        db
          .select()
          .from(packages)
          .where(eq(packages.businessId, businessId))
          .orderBy(desc(packages.createdAt)),
        db
          .select()
          .from(availabilityRules)
          .where(eq(availabilityRules.businessId, businessId))
          .limit(1),
        db
          .select()
          .from(channelIntegrations)
          .where(eq(channelIntegrations.businessId, businessId)),
        db
          .select()
          .from(knowledgeItems)
          .where(eq(knowledgeItems.businessId, businessId))
          .orderBy(desc(knowledgeItems.updatedAt)),
        db
          .select()
          .from(appointments)
          .where(eq(appointments.businessId, businessId)),
        db
          .select()
          .from(conversations)
          .where(eq(conversations.businessId, businessId)),
        db.select().from(customers).where(eq(customers.businessId, businessId)),
      ]);

      const today = new Date().toISOString().slice(0, 10);
      const totalAppointments = apptRows.length;
      const todayAppointments = apptRows.filter(
        (a) => a.appointmentDate === today && a.bookingStatus !== 'cancelled'
      ).length;
      const upcomingAppointments = apptRows.filter(
        (a) => a.appointmentDate >= today && a.bookingStatus !== 'cancelled'
      ).length;
      const cancelledAppointments = apptRows.filter(
        (a) => a.bookingStatus === 'cancelled'
      ).length;
      const totalConversations = convRows.length;
      const humanEscalations = convRows.filter(
        (c) => c.status === 'human_takeover'
      ).length;
      const bookedViaChat = apptRows.filter(
        (a) => a.channel === 'website' || a.channel === 'whatsapp'
      ).length;
      const conversionRate =
        totalConversations > 0
          ? Math.min(100, Math.round((bookedViaChat / totalConversations) * 100))
          : 0;

      return res.json({
        business: access.business,
        services: serviceRows,
        packages: packageRows,
        availability: availRow || {
          businessId,
          workingDaysJson: DEFAULT_WORKING_DAYS,
          breakStart: '13:00',
          breakEnd: '14:00',
          slotIntervalMinutes: 30,
          minAdvanceHours: 1,
          maxAdvanceDays: 30,
          cancellationWindowHours: 12,
          reschedulingPolicy: 'Free rescheduling up to 12 hours prior.',
          holidaysJson: [],
          blockedSlotsJson: [],
        },
        channels: channelRows,
        knowledge: knowledgeRows,
        metrics: {
          totalAppointments,
          todayAppointments,
          upcomingAppointments,
          cancelledAppointments,
          totalConversations,
          humanEscalations,
          conversionRate,
          totalCustomers: customerRows.length,
        },
      });
    } catch (error) {
      console.error('Failed to fetch business workspace:', error);
      return res.status(500).json({ error: 'Failed to load business workspace.' });
    }
  });

  router.patch('/businesses/:id', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const businessId = Number(req.params.id);
      const access = await assertBusinessAccess(req, businessId);
      if (!access.ok) return res.status(access.status).json({ error: access.error });

      const patch: Record<string, unknown> = { updatedAt: new Date() };
      const allowedStrings = [
        'businessName',
        'businessEmail',
        'contactPerson',
        'country',
        'timezone',
        'businessCategory',
        'websiteUrl',
        'whatsappPhone',
        'description',
        'address',
        'currency',
        'agentName',
        'agentGreeting',
        'agentPersonality',
        'agentInstructions',
        'bookingPolicy',
        'escalationPolicy',
        'widgetBrandColor',
      ];
      for (const field of allowedStrings) {
        if (typeof req.body?.[field] === 'string') {
          patch[field] = req.body[field].trim();
        }
      }
      if (typeof req.body?.reminder24h === 'boolean') {
        patch.reminder24h = req.body.reminder24h;
      }
      if (typeof req.body?.reminder2h === 'boolean') {
        patch.reminder2h = req.body.reminder2h;
      }
      if (typeof req.body?.onboardingStep === 'number') {
        patch.onboardingStep = Math.max(1, Math.min(8, Math.floor(req.body.onboardingStep)));
      }

      const [updated] = await db
        .update(businesses)
        .set(patch)
        .where(eq(businesses.id, businessId))
        .returning();

      await syncMasterIfAutoEnabled(businessId, resolveRequestOrigin(req));
      return res.json({ business: updated });
    } catch (error) {
      console.error('Failed to update business:', error);
      return res.status(500).json({ error: 'Failed to update business settings.' });
    }
  });

  // ---------------------------------------------------------------------------
  // STEP 2: AI WEBSITE URL ANALYSIS & REVIEW APPROVAL
  // ---------------------------------------------------------------------------
  router.post(
    '/businesses/:id/analyze-website',
    requireAuth,
    async (req: AuthRequest, res: Response) => {
      try {
        const businessId = Number(req.params.id);
        const access = await assertBusinessAccess(req, businessId);
        if (!access.ok) return res.status(access.status).json({ error: access.error });

        const websiteUrl = String(
          req.body?.websiteUrl || access.business.websiteUrl || ''
        ).trim();
        const pastedContent = String(req.body?.pastedContent || '').trim();

        const result = await analyzeWebsiteContent({
          websiteUrl,
          pastedContent,
          businessName: access.business.businessName,
          currency: access.business.currency,
        });

        return res.json(result);
      } catch (error: unknown) {
        console.error('Website analysis error:', error);
        const msg =
          error instanceof Error ? error.message : 'Website analysis failed.';
        return res.status(400).json({ error: msg });
      }
    }
  );

  router.post(
    '/businesses/:id/apply-extraction',
    requireAuth,
    async (req: AuthRequest, res: Response) => {
      try {
        const businessId = Number(req.params.id);
        const access = await assertBusinessAccess(req, businessId);
        if (!access.ok) return res.status(access.status).json({ error: access.error });

        const {
          sourceUrl = '',
          businessDescription,
          address,
          bookingPolicy,
          services: extractedServices = [],
          packages: extractedPackages = [],
          faqs: extractedFaqs = [],
        } = req.body || {};

        const bizPatch: Record<string, unknown> = {
          updatedAt: new Date(),
          onboardingStep: Math.max(access.business.onboardingStep, 3),
        };
        if (typeof businessDescription === 'string' && businessDescription.trim()) {
          bizPatch.description = businessDescription.trim();
        }
        if (typeof address === 'string' && address.trim()) {
          bizPatch.address = address.trim();
        }
        if (typeof bookingPolicy === 'string' && bookingPolicy.trim()) {
          bizPatch.bookingPolicy = bookingPolicy.trim();
        }
        if (typeof sourceUrl === 'string' && sourceUrl.trim()) {
          bizPatch.websiteUrl = sourceUrl.trim();
        }

        await db
          .update(businesses)
          .set(bizPatch)
          .where(eq(businesses.id, businessId));

        if (Array.isArray(extractedServices) && extractedServices.length > 0) {
          await db.insert(services).values(
            extractedServices.slice(0, 15).map((s: Record<string, unknown>) => ({
              businessId,
              name: String(s.name || 'Service').trim(),
              description: String(s.description || '').trim(),
              category: String(s.category || 'General').trim(),
              durationMinutes: Math.max(15, Number(s.durationMinutes) || 30),
              price: Math.max(0, Number(s.price) || 0),
              currency: String(s.currency || access.business.currency || 'INR'),
              staffMember: access.business.contactPerson || 'Any Available Specialist',
            }))
          );
        }

        if (Array.isArray(extractedPackages) && extractedPackages.length > 0) {
          await db.insert(packages).values(
            extractedPackages.slice(0, 8).map((p: Record<string, unknown>) => ({
              businessId,
              name: String(p.name || 'Package').trim(),
              description: String(p.description || '').trim(),
              includedServices: String(p.includedServices || '').trim(),
              sessionCount: Math.max(1, Number(p.sessionCount) || 1),
              price: Math.max(0, Number(p.price) || 0),
              currency: access.business.currency || 'INR',
              validityDays: Math.max(7, Number(p.validityDays) || 90),
            }))
          );
        }

        if (Array.isArray(extractedFaqs) && extractedFaqs.length > 0) {
          await db.insert(knowledgeItems).values(
            extractedFaqs.slice(0, 10).map((f: Record<string, unknown>) => ({
              businessId,
              sourceType: 'website_crawl',
              sourceUrl: String(sourceUrl || ''),
              title: String(f.title || 'Website FAQ').trim(),
              content: String(f.content || '').trim(),
              isApproved: true,
            }))
          );
        }

        return res.json({ applied: true });
      } catch (error) {
        console.error('Failed to apply website extraction:', error);
        return res.status(500).json({ error: 'Failed to save extracted information.' });
      }
    }
  );

  // ---------------------------------------------------------------------------
  // STEP 3: SERVICES CRUD
  // ---------------------------------------------------------------------------
  router.post(
    '/businesses/:id/services',
    requireAuth,
    async (req: AuthRequest, res: Response) => {
      try {
        const businessId = Number(req.params.id);
        const access = await assertBusinessAccess(req, businessId);
        if (!access.ok) return res.status(access.status).json({ error: access.error });

        const name = String(req.body?.name || '').trim();
        if (!name) return res.status(400).json({ error: 'Service name is required.' });

        const [created] = await db
          .insert(services)
          .values({
            businessId,
            name,
            description: String(req.body?.description || '').trim(),
            category: String(req.body?.category || 'General').trim(),
            durationMinutes: Math.max(10, Number(req.body?.durationMinutes) || 30),
            price: Math.max(0, Number(req.body?.price) || 0),
            currency: String(req.body?.currency || access.business.currency || 'INR'),
            bufferMinutes: Math.max(0, Number(req.body?.bufferMinutes) || 0),
            staffMember:
              String(req.body?.staffMember || '').trim() || 'Any Available Specialist',
            advancePaymentRequired: Boolean(req.body?.advancePaymentRequired),
            allowDirectBooking: req.body?.allowDirectBooking !== false,
            isActive: req.body?.isActive !== false,
          })
          .returning();

        return res.status(201).json({ service: created });
      } catch (error) {
        console.error('Failed to create service:', error);
        return res.status(500).json({ error: 'Failed to add service.' });
      }
    }
  );

  router.patch(
    '/businesses/:id/services/:serviceId',
    requireAuth,
    async (req: AuthRequest, res: Response) => {
      try {
        const businessId = Number(req.params.id);
        const serviceId = Number(req.params.serviceId);
        const access = await assertBusinessAccess(req, businessId);
        if (!access.ok) return res.status(access.status).json({ error: access.error });

        const patch: Record<string, unknown> = {};
        if (typeof req.body?.name === 'string') patch.name = req.body.name.trim();
        if (typeof req.body?.description === 'string')
          patch.description = req.body.description.trim();
        if (typeof req.body?.category === 'string')
          patch.category = req.body.category.trim();
        if (typeof req.body?.durationMinutes === 'number')
          patch.durationMinutes = Math.max(10, req.body.durationMinutes);
        if (typeof req.body?.price === 'number')
          patch.price = Math.max(0, req.body.price);
        if (typeof req.body?.bufferMinutes === 'number')
          patch.bufferMinutes = Math.max(0, req.body.bufferMinutes);
        if (typeof req.body?.staffMember === 'string')
          patch.staffMember = req.body.staffMember.trim();
        if (typeof req.body?.advancePaymentRequired === 'boolean')
          patch.advancePaymentRequired = req.body.advancePaymentRequired;
        if (typeof req.body?.allowDirectBooking === 'boolean')
          patch.allowDirectBooking = req.body.allowDirectBooking;
        if (typeof req.body?.isActive === 'boolean') patch.isActive = req.body.isActive;

        const [updated] = await db
          .update(services)
          .set(patch)
          .where(and(eq(services.id, serviceId), eq(services.businessId, businessId)))
          .returning();

        if (!updated) return res.status(404).json({ error: 'Service not found.' });
        return res.json({ service: updated });
      } catch (error) {
        console.error('Failed to update service:', error);
        return res.status(500).json({ error: 'Failed to update service.' });
      }
    }
  );

  router.delete(
    '/businesses/:id/services/:serviceId',
    requireAuth,
    async (req: AuthRequest, res: Response) => {
      try {
        const businessId = Number(req.params.id);
        const serviceId = Number(req.params.serviceId);
        const access = await assertBusinessAccess(req, businessId);
        if (!access.ok) return res.status(access.status).json({ error: access.error });

        await db
          .delete(services)
          .where(and(eq(services.id, serviceId), eq(services.businessId, businessId)));
        return res.json({ deleted: true });
      } catch (error) {
        console.error('Failed to delete service:', error);
        return res.status(500).json({ error: 'Failed to delete service.' });
      }
    }
  );

  // ---------------------------------------------------------------------------
  // STEP 4: PACKAGES CRUD
  // ---------------------------------------------------------------------------
  router.post(
    '/businesses/:id/packages',
    requireAuth,
    async (req: AuthRequest, res: Response) => {
      try {
        const businessId = Number(req.params.id);
        const access = await assertBusinessAccess(req, businessId);
        if (!access.ok) return res.status(access.status).json({ error: access.error });

        const name = String(req.body?.name || '').trim();
        if (!name) return res.status(400).json({ error: 'Package name is required.' });

        const [created] = await db
          .insert(packages)
          .values({
            businessId,
            name,
            description: String(req.body?.description || '').trim(),
            includedServices: String(req.body?.includedServices || '').trim(),
            sessionCount: Math.max(1, Number(req.body?.sessionCount) || 1),
            price: Math.max(0, Number(req.body?.price) || 0),
            currency: String(req.body?.currency || access.business.currency || 'INR'),
            validityDays: Math.max(1, Number(req.body?.validityDays) || 90),
            conditions: String(req.body?.conditions || '').trim(),
            isActive: req.body?.isActive !== false,
          })
          .returning();

        return res.status(201).json({ package: created });
      } catch (error) {
        console.error('Failed to create package:', error);
        return res.status(500).json({ error: 'Failed to add package.' });
      }
    }
  );

  router.delete(
    '/businesses/:id/packages/:packageId',
    requireAuth,
    async (req: AuthRequest, res: Response) => {
      try {
        const businessId = Number(req.params.id);
        const packageId = Number(req.params.packageId);
        const access = await assertBusinessAccess(req, businessId);
        if (!access.ok) return res.status(access.status).json({ error: access.error });

        await db
          .delete(packages)
          .where(and(eq(packages.id, packageId), eq(packages.businessId, businessId)));
        return res.json({ deleted: true });
      } catch (error) {
        console.error('Failed to delete package:', error);
        return res.status(500).json({ error: 'Failed to delete package.' });
      }
    }
  );

  // ---------------------------------------------------------------------------
  // STEP 5: AVAILABILITY RULES
  // ---------------------------------------------------------------------------
  router.put(
    '/businesses/:id/availability',
    requireAuth,
    async (req: AuthRequest, res: Response) => {
      try {
        const businessId = Number(req.params.id);
        const access = await assertBusinessAccess(req, businessId);
        if (!access.ok) return res.status(access.status).json({ error: access.error });

        const workingDaysJson = (req.body?.workingDaysJson ||
          DEFAULT_WORKING_DAYS) as WorkingDaysMap;
        const breakStart = String(req.body?.breakStart || '13:00');
        const breakEnd = String(req.body?.breakEnd || '14:00');
        const slotIntervalMinutes = Math.max(
          15,
          Number(req.body?.slotIntervalMinutes) || 30
        );
        const minAdvanceHours = Math.max(0, Number(req.body?.minAdvanceHours) || 1);
        const maxAdvanceDays = Math.max(1, Number(req.body?.maxAdvanceDays) || 30);
        const cancellationWindowHours = Math.max(
          0,
          Number(req.body?.cancellationWindowHours) || 12
        );
        const reschedulingPolicy = String(
          req.body?.reschedulingPolicy ||
            'Free rescheduling up to 12 hours before the appointment.'
        );
        const holidaysJson = Array.isArray(req.body?.holidaysJson)
          ? req.body.holidaysJson.map(String)
          : [];
        const blockedSlotsJson = Array.isArray(req.body?.blockedSlotsJson)
          ? req.body.blockedSlotsJson
          : [];

        const [saved] = await db
          .insert(availabilityRules)
          .values({
            businessId,
            workingDaysJson,
            breakStart,
            breakEnd,
            slotIntervalMinutes,
            minAdvanceHours,
            maxAdvanceDays,
            cancellationWindowHours,
            reschedulingPolicy,
            holidaysJson,
            blockedSlotsJson,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: availabilityRules.businessId,
            set: {
              workingDaysJson,
              breakStart,
              breakEnd,
              slotIntervalMinutes,
              minAdvanceHours,
              maxAdvanceDays,
              cancellationWindowHours,
              reschedulingPolicy,
              holidaysJson,
              blockedSlotsJson,
              updatedAt: new Date(),
            },
          })
          .returning();

        await syncMasterIfAutoEnabled(businessId, resolveRequestOrigin(req));
        return res.json({ availability: saved });
      } catch (error) {
        console.error('Failed to update availability:', error);
        return res.status(500).json({ error: 'Failed to save availability rules.' });
      }
    }
  );

  // ---------------------------------------------------------------------------
  // STEP 6 & 8: CHANNELS (WHATSAPP CLOUD API & WEBSITE WIDGET)
  // ---------------------------------------------------------------------------
  router.put(
    '/businesses/:id/channels/whatsapp',
    requireAuth,
    async (req: AuthRequest, res: Response) => {
      try {
        const businessId = Number(req.params.id);
        const access = await assertBusinessAccess(req, businessId);
        if (!access.ok) return res.status(access.status).json({ error: access.error });

        const whatsappPhone = String(req.body?.whatsappPhone || '').trim();
        const whatsappPhoneNumberId = String(
          req.body?.whatsappPhoneNumberId || ''
        ).trim();
        const whatsappBusinessAccountId = String(
          req.body?.whatsappBusinessAccountId || ''
        ).trim();
        const metaVerifyToken =
          String(req.body?.metaVerifyToken || '').trim() ||
          `deskline_${crypto.randomBytes(6).toString('hex')}`;
        const connectionStatus =
          whatsappPhoneNumberId && whatsappBusinessAccountId
            ? 'connected'
            : whatsappPhone
              ? 'pending_verification'
              : 'not_connected';

        if (whatsappPhone) {
          await db
            .update(businesses)
            .set({ whatsappPhone, updatedAt: new Date() })
            .where(eq(businesses.id, businessId));
        }

        const [existing] = await db
          .select()
          .from(channelIntegrations)
          .where(
            and(
              eq(channelIntegrations.businessId, businessId),
              eq(channelIntegrations.channelType, 'whatsapp')
            )
          )
          .limit(1);

        let saved;
        if (existing) {
          [saved] = await db
            .update(channelIntegrations)
            .set({
              whatsappPhoneNumberId,
              whatsappBusinessAccountId,
              metaVerifyToken,
              connectionStatus,
              approvedTemplatesJson: Array.isArray(req.body?.approvedTemplatesJson)
                ? req.body.approvedTemplatesJson
                : existing.approvedTemplatesJson,
              updatedAt: new Date(),
            })
            .where(eq(channelIntegrations.id, existing.id))
            .returning();
        } else {
          [saved] = await db
            .insert(channelIntegrations)
            .values({
              businessId,
              channelType: 'whatsapp',
              whatsappPhoneNumberId,
              whatsappBusinessAccountId,
              metaVerifyToken,
              webhookUrl: `/api/webhooks/whatsapp/${access.business.slug}`,
              connectionStatus,
              approvedTemplatesJson: Array.isArray(req.body?.approvedTemplatesJson)
                ? req.body.approvedTemplatesJson
                : [],
            })
            .returning();
        }

        return res.json({ channel: saved });
      } catch (error) {
        console.error('Failed to save WhatsApp config:', error);
        return res.status(500).json({ error: 'Failed to update WhatsApp integration.' });
      }
    }
  );

  router.put(
    '/businesses/:id/channels/widget',
    requireAuth,
    async (req: AuthRequest, res: Response) => {
      try {
        const businessId = Number(req.params.id);
        const access = await assertBusinessAccess(req, businessId);
        if (!access.ok) return res.status(access.status).json({ error: access.error });

        const widgetConfig = {
          welcomeMessage:
            String(req.body?.welcomeMessage || '').trim() ||
            'Hi! How can we help you today?',
          quickPrompts: Array.isArray(req.body?.quickPrompts)
            ? req.body.quickPrompts.map((p: unknown) => String(p).trim()).filter(Boolean)
            : [
                'Book an appointment',
                'Explore services',
                'View pricing',
                'View packages',
                'Talk to someone',
              ],
          enableWhatsAppHandoff: Boolean(req.body?.enableWhatsAppHandoff),
          position: (req.body?.position === 'bottom-left'
            ? 'bottom-left'
            : 'bottom-right') as 'bottom-right' | 'bottom-left',
          brandColor: String(req.body?.brandColor || '#0F766E'),
        };

        await db
          .update(businesses)
          .set({
            widgetBrandColor: widgetConfig.brandColor,
            agentGreeting: widgetConfig.welcomeMessage,
            updatedAt: new Date(),
          })
          .where(eq(businesses.id, businessId));

        const [existing] = await db
          .select()
          .from(channelIntegrations)
          .where(
            and(
              eq(channelIntegrations.businessId, businessId),
              eq(channelIntegrations.channelType, 'website_widget')
            )
          )
          .limit(1);

        let saved;
        if (existing) {
          [saved] = await db
            .update(channelIntegrations)
            .set({
              widgetConfigJson: widgetConfig,
              connectionStatus: 'connected',
              updatedAt: new Date(),
            })
            .where(eq(channelIntegrations.id, existing.id))
            .returning();
        } else {
          [saved] = await db
            .insert(channelIntegrations)
            .values({
              businessId,
              channelType: 'website_widget',
              connectionStatus: 'connected',
              widgetConfigJson: widgetConfig,
            })
            .returning();
        }

        return res.json({ channel: saved });
      } catch (error) {
        console.error('Failed to save widget config:', error);
        return res.status(500).json({ error: 'Failed to update widget settings.' });
      }
    }
  );

  // ---------------------------------------------------------------------------
  // APPOINTMENTS MANAGEMENT
  // ---------------------------------------------------------------------------
  router.get(
    '/businesses/:id/appointments',
    requireAuth,
    async (req: AuthRequest, res: Response) => {
      try {
        const businessId = Number(req.params.id);
        const access = await assertBusinessAccess(req, businessId);
        if (!access.ok) return res.status(access.status).json({ error: access.error });

        const rows = await db
          .select({
            id: appointments.id,
            bookingRef: appointments.bookingRef,
            serviceId: appointments.serviceId,
            serviceName: appointments.serviceNameSnapshot,
            price: appointments.priceSnapshot,
            currency: appointments.currencySnapshot,
            staffMember: appointments.staffMember,
            appointmentDate: appointments.appointmentDate,
            startTime: appointments.startTime,
            endTime: appointments.endTime,
            bookingStatus: appointments.bookingStatus,
            paymentStatus: appointments.paymentStatus,
            channel: appointments.channel,
            notes: appointments.notes,
            createdAt: appointments.createdAt,
            customerId: customers.id,
            customerName: customers.name,
            customerEmail: customers.email,
            customerPhone: customers.phone,
          })
          .from(appointments)
          .innerJoin(customers, eq(appointments.customerId, customers.id))
          .where(eq(appointments.businessId, businessId))
          .orderBy(desc(appointments.appointmentDate), desc(appointments.startTime));

        return res.json({ appointments: rows });
      } catch (error) {
        console.error('Failed to list appointments:', error);
        return res.status(500).json({ error: 'Failed to load appointments.' });
      }
    }
  );

  router.post(
    '/businesses/:id/appointments',
    requireAuth,
    async (req: AuthRequest, res: Response) => {
      try {
        const businessId = Number(req.params.id);
        const access = await assertBusinessAccess(req, businessId);
        if (!access.ok) return res.status(access.status).json({ error: access.error });

        const booking = await createAppointmentAtomic({
          businessId,
          serviceId: req.body?.serviceId ? Number(req.body.serviceId) : undefined,
          serviceName: req.body?.serviceName ? String(req.body.serviceName) : undefined,
          date: String(req.body?.appointmentDate || ''),
          startTime: String(req.body?.startTime || ''),
          customerName: String(req.body?.customerName || ''),
          customerEmail: String(req.body?.customerEmail || ''),
          customerPhone: String(req.body?.customerPhone || ''),
          channel: 'dashboard',
          notes: String(req.body?.notes || ''),
          actorUid: req.user!.uid,
        });

        if (!booking.ok) {
          return res.status(409).json({ error: booking.error });
        }

        return res.status(201).json({ appointment: booking.appointment });
      } catch (error) {
        console.error('Failed to create manual appointment:', error);
        return res.status(500).json({ error: 'Failed to create appointment.' });
      }
    }
  );

  router.patch(
    '/businesses/:id/appointments/:appointmentId',
    requireAuth,
    async (req: AuthRequest, res: Response) => {
      try {
        const businessId = Number(req.params.id);
        const appointmentId = Number(req.params.appointmentId);
        const access = await assertBusinessAccess(req, businessId);
        if (!access.ok) return res.status(access.status).json({ error: access.error });

        const [existing] = await db
          .select()
          .from(appointments)
          .where(
            and(
              eq(appointments.id, appointmentId),
              eq(appointments.businessId, businessId)
            )
          )
          .limit(1);

        if (!existing) {
          return res.status(404).json({ error: 'Appointment not found.' });
        }

        if (req.body?.action === 'reschedule') {
          const resched = await rescheduleAppointmentAtomic({
            businessId,
            bookingRef: existing.bookingRef,
            newDate: String(req.body.appointmentDate || ''),
            newStartTime: String(req.body.startTime || ''),
            actorUid: req.user!.uid,
            bypassCustomerCheck: true,
          });
          if (!resched.ok) return res.status(409).json({ error: resched.error });
          return res.json({ appointment: resched.appointment });
        }

        if (req.body?.action === 'cancel') {
          const cancelled = await cancelAppointmentAtomic({
            businessId,
            bookingRef: existing.bookingRef,
            reason: String(req.body.reason || 'Cancelled by business'),
            actorUid: req.user!.uid,
            bypassCustomerCheck: true,
          });
          if (!cancelled.ok) return res.status(400).json({ error: cancelled.error });
          return res.json({ appointment: cancelled.appointment });
        }

        const patch: Record<string, unknown> = { updatedAt: new Date() };
        if (
          typeof req.body?.bookingStatus === 'string' &&
          ['confirmed', 'rescheduled', 'cancelled', 'completed'].includes(
            req.body.bookingStatus
          )
        ) {
          patch.bookingStatus = req.body.bookingStatus;
        }
        if (
          typeof req.body?.paymentStatus === 'string' &&
          ['unpaid', 'pending', 'paid'].includes(req.body.paymentStatus)
        ) {
          patch.paymentStatus = req.body.paymentStatus;
        }

        const [updated] = await db
          .update(appointments)
          .set(patch)
          .where(eq(appointments.id, appointmentId))
          .returning();

        return res.json({ appointment: updated });
      } catch (error) {
        console.error('Failed to update appointment:', error);
        return res.status(500).json({ error: 'Failed to update appointment.' });
      }
    }
  );

  // ---------------------------------------------------------------------------
  // CUSTOMERS CRM
  // ---------------------------------------------------------------------------
  router.get(
    '/businesses/:id/customers',
    requireAuth,
    async (req: AuthRequest, res: Response) => {
      try {
        const businessId = Number(req.params.id);
        const access = await assertBusinessAccess(req, businessId);
        if (!access.ok) return res.status(access.status).json({ error: access.error });

        const [customerRows, apptRows, convRows] = await Promise.all([
          db
            .select()
            .from(customers)
            .where(eq(customers.businessId, businessId))
            .orderBy(desc(customers.updatedAt)),
          db
            .select()
            .from(appointments)
            .where(eq(appointments.businessId, businessId)),
          db
            .select()
            .from(conversations)
            .where(eq(conversations.businessId, businessId)),
        ]);

        const enriched = customerRows.map((c) => {
          const cAppts = apptRows.filter((a) => a.customerId === c.id);
          const cConvs = convRows.filter((cv) => cv.customerId === c.id);
          return {
            ...c,
            bookingCount: cAppts.length,
            upcomingCount: cAppts.filter((a) => a.bookingStatus !== 'cancelled').length,
            conversationCount: cConvs.length,
            appointments: cAppts,
          };
        });

        return res.json({ customers: enriched });
      } catch (error) {
        console.error('Failed to load customers:', error);
        return res.status(500).json({ error: 'Failed to load customers.' });
      }
    }
  );

  // ---------------------------------------------------------------------------
  // CONVERSATION INBOX & HUMAN TAKEOVER
  // ---------------------------------------------------------------------------
  router.get(
    '/businesses/:id/conversations',
    requireAuth,
    async (req: AuthRequest, res: Response) => {
      try {
        const businessId = Number(req.params.id);
        const access = await assertBusinessAccess(req, businessId);
        if (!access.ok) return res.status(access.status).json({ error: access.error });

        const rows = await db
          .select()
          .from(conversations)
          .where(eq(conversations.businessId, businessId))
          .orderBy(desc(conversations.lastMessageAt));

        return res.json({ conversations: rows });
      } catch (error) {
        console.error('Failed to list conversations:', error);
        return res.status(500).json({ error: 'Failed to load conversations.' });
      }
    }
  );

  router.post(
    '/businesses/:id/conversations/:convId/reply',
    requireAuth,
    async (req: AuthRequest, res: Response) => {
      try {
        const businessId = Number(req.params.id);
        const convId = Number(req.params.convId);
        const access = await assertBusinessAccess(req, businessId);
        if (!access.ok) return res.status(access.status).json({ error: access.error });

        const text = String(req.body?.text || '').trim();
        if (!text) return res.status(400).json({ error: 'Reply text is required.' });

        const [existing] = await db
          .select()
          .from(conversations)
          .where(
            and(
              eq(conversations.id, convId),
              eq(conversations.businessId, businessId)
            )
          )
          .limit(1);

        if (!existing) {
          return res.status(404).json({ error: 'Conversation not found.' });
        }

        const humanMsg: ConversationMessage = {
          id: crypto.randomUUID(),
          role: 'agent',
          text,
          timestamp: new Date().toISOString(),
        };

        const [updated] = await db
          .update(conversations)
          .set({
            status: 'human_takeover',
            assignedTo: req.dbUser?.displayName || req.dbUser?.email || 'Team Member',
            messagesJson: [...(existing.messagesJson || []), humanMsg],
            lastMessageAt: new Date(),
          })
          .where(eq(conversations.id, convId))
          .returning();

        return res.json({ conversation: updated });
      } catch (error) {
        console.error('Failed to send human reply:', error);
        return res.status(500).json({ error: 'Failed to send reply.' });
      }
    }
  );

  router.patch(
    '/businesses/:id/conversations/:convId/status',
    requireAuth,
    async (req: AuthRequest, res: Response) => {
      try {
        const businessId = Number(req.params.id);
        const convId = Number(req.params.convId);
        const access = await assertBusinessAccess(req, businessId);
        if (!access.ok) return res.status(access.status).json({ error: access.error });

        const nextStatus = String(req.body?.status || '');
        if (!['ai_active', 'human_takeover', 'resolved'].includes(nextStatus)) {
          return res.status(400).json({ error: 'Invalid conversation status.' });
        }

        const patch: Record<string, unknown> = { status: nextStatus };
        if (typeof req.body?.assignedTo === 'string') {
          patch.assignedTo = req.body.assignedTo.trim();
        }

        const [updated] = await db
          .update(conversations)
          .set(patch)
          .where(
            and(
              eq(conversations.id, convId),
              eq(conversations.businessId, businessId)
            )
          )
          .returning();

        if (!updated) return res.status(404).json({ error: 'Conversation not found.' });
        return res.json({ conversation: updated });
      } catch (error) {
        console.error('Failed to update conversation status:', error);
        return res.status(500).json({ error: 'Failed to update status.' });
      }
    }
  );

  // ---------------------------------------------------------------------------
  // AI KNOWLEDGE BASE CRUD
  // ---------------------------------------------------------------------------
  router.post(
    '/businesses/:id/knowledge',
    requireAuth,
    async (req: AuthRequest, res: Response) => {
      try {
        const businessId = Number(req.params.id);
        const access = await assertBusinessAccess(req, businessId);
        if (!access.ok) return res.status(access.status).json({ error: access.error });

        const title = String(req.body?.title || '').trim();
        const content = String(req.body?.content || '').trim();
        if (!title || !content) {
          return res.status(400).json({ error: 'Title and content are required.' });
        }

        const sourceType = ['website_crawl', 'faq', 'policy', 'document'].includes(
          String(req.body?.sourceType)
        )
          ? String(req.body.sourceType)
          : 'faq';

        const [created] = await db
          .insert(knowledgeItems)
          .values({
            businessId,
            sourceType,
            sourceUrl: String(req.body?.sourceUrl || '').trim(),
            title,
            content,
            isApproved: req.body?.isApproved !== false,
          })
          .returning();

        return res.status(201).json({ item: created });
      } catch (error) {
        console.error('Failed to add knowledge item:', error);
        return res.status(500).json({ error: 'Failed to save knowledge entry.' });
      }
    }
  );

  router.delete(
    '/businesses/:id/knowledge/:itemId',
    requireAuth,
    async (req: AuthRequest, res: Response) => {
      try {
        const businessId = Number(req.params.id);
        const itemId = Number(req.params.itemId);
        const access = await assertBusinessAccess(req, businessId);
        if (!access.ok) return res.status(access.status).json({ error: access.error });

        await db
          .delete(knowledgeItems)
          .where(
            and(
              eq(knowledgeItems.id, itemId),
              eq(knowledgeItems.businessId, businessId)
            )
          );
        return res.json({ deleted: true });
      } catch (error) {
        console.error('Failed to delete knowledge item:', error);
        return res.status(500).json({ error: 'Failed to delete entry.' });
      }
    }
  );

  // ---------------------------------------------------------------------------
  // SUPER-ADMIN SAAS MANAGEMENT CONSOLE
  // ---------------------------------------------------------------------------
  router.get(
    '/admin/overview',
    requireAuth,
    requireSuperAdmin,
    async (_req: AuthRequest, res: Response) => {
      try {
        await ensureDemoBusinessSeeded();

        const [allBusinesses, allChannels, allAppts, allConvs, allUsers, recentLogs] =
          await Promise.all([
            db.select().from(businesses).orderBy(desc(businesses.createdAt)),
            db.select().from(channelIntegrations),
            db
              .select({
                businessId: appointments.businessId,
                count: sql<number>`count(*)::int`,
              })
              .from(appointments)
              .groupBy(appointments.businessId),
            db
              .select({
                businessId: conversations.businessId,
                count: sql<number>`count(*)::int`,
              })
              .from(conversations)
              .groupBy(conversations.businessId),
            db.select().from(users),
            db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(25),
          ]);

        const apptCountByBiz = new Map(allAppts.map((r) => [r.businessId, r.count]));
        const convCountByBiz = new Map(allConvs.map((r) => [r.businessId, r.count]));

        const tenants = allBusinesses.map((b) => {
          const wa = allChannels.find(
            (c) => c.businessId === b.id && c.channelType === 'whatsapp'
          );
          return {
            ...b,
            whatsappStatus: wa?.connectionStatus || 'not_connected',
            appointmentCount: apptCountByBiz.get(b.id) || 0,
            conversationCount: convCountByBiz.get(b.id) || 0,
          };
        });

        const totals = {
          totalTenants: tenants.length,
          activeTenants: tenants.filter((t) => t.status === 'active').length,
          totalUsers: allUsers.length,
          totalAppointments: tenants.reduce((acc, t) => acc + t.appointmentCount, 0),
          totalConversations: tenants.reduce((acc, t) => acc + t.conversationCount, 0),
          totalMessages: tenants.reduce((acc, t) => acc + t.messageCount, 0),
          totalTokens: tenants.reduce((acc, t) => acc + t.tokenUsage, 0),
          whatsappConnectedCount: tenants.filter(
            (t) => t.whatsappStatus === 'connected'
          ).length,
        };

        return res.json({ totals, tenants, auditLogs: recentLogs });
      } catch (error) {
        console.error('Failed to load super-admin overview:', error);
        return res.status(500).json({ error: 'Failed to load platform analytics.' });
      }
    }
  );

  router.patch(
    '/admin/businesses/:id',
    requireAuth,
    requireSuperAdmin,
    async (req: AuthRequest, res: Response) => {
      try {
        const businessId = Number(req.params.id);
        const patch: Record<string, unknown> = { updatedAt: new Date() };

        if (
          typeof req.body?.status === 'string' &&
          ['active', 'suspended', 'onboarding'].includes(req.body.status)
        ) {
          patch.status = req.body.status;
        }
        if (
          typeof req.body?.subscriptionPlan === 'string' &&
          ['starter', 'growth', 'enterprise'].includes(req.body.subscriptionPlan)
        ) {
          patch.subscriptionPlan = req.body.subscriptionPlan;
        }

        const [updated] = await db
          .update(businesses)
          .set(patch)
          .where(eq(businesses.id, businessId))
          .returning();

        if (!updated) return res.status(404).json({ error: 'Tenant not found.' });

        await db.insert(auditLogs).values({
          businessId,
          actorUid: req.user!.uid,
          action: 'admin.tenant_updated',
          entityType: 'business',
          entityId: String(businessId),
          details: `Updated status=${updated.status}, plan=${updated.subscriptionPlan}`,
        });

        return res.json({ business: updated });
      } catch (error) {
        console.error('Admin tenant update error:', error);
        return res.status(500).json({ error: 'Failed to update tenant.' });
      }
    }
  );

  // ---------------------------------------------------------------------------
  // MIS ANALYTICS (DAILY / WEEKLY / MONTHLY APPOINTMENTS & BUSINESS VALUE)
  // ---------------------------------------------------------------------------
  router.get(
    '/businesses/:id/mis',
    requireAuth,
    async (req: AuthRequest, res: Response) => {
      try {
        const businessId = Number(req.params.id);
        if (!Number.isFinite(businessId)) {
          return res.status(400).json({ error: 'Invalid business ID.' });
        }
        const access = await assertBusinessAccess(req, businessId);
        if (!access.ok) return res.status(access.status).json({ error: access.error });

        const report = await generateMisReport(businessId);
        return res.json(report);
      } catch (error) {
        console.error('Failed to load MIS report:', error);
        return res.status(500).json({ error: 'Failed to load MIS analytics.' });
      }
    }
  );

  // ---------------------------------------------------------------------------
  // EXISTING CUSTOMER DATABASE IMPORT & OFFERS / ANNOUNCEMENTS CAMPAIGNS
  // Strictly restricted to existing customer base up to 2,000 users per business
  // ---------------------------------------------------------------------------
  router.post(
    '/businesses/:id/customers/import',
    requireAuth,
    async (req: AuthRequest, res: Response) => {
      try {
        const businessId = Number(req.params.id);
        const access = await assertBusinessAccess(req, businessId);
        if (!access.ok) return res.status(access.status).json({ error: access.error });

        const contacts = req.body?.contacts;
        if (!Array.isArray(contacts) || contacts.length === 0) {
          return res
            .status(400)
            .json({ error: 'Please provide at least one existing customer contact.' });
        }

        if (contacts.length > MAX_EXISTING_CUSTOMER_CAMPAIGN_LIMIT) {
          return res.status(400).json({
            error: `Import batch exceeds the maximum existing customer limit of ${MAX_EXISTING_CUSTOMER_CAMPAIGN_LIMIT.toLocaleString()} users.`,
          });
        }

        const result = await importExistingCustomerContacts({
          businessId,
          contacts,
          actorUid: req.user!.uid,
        });

        if (!result.ok) {
          return res.status(400).json({ error: result.error });
        }

        return res.status(201).json(result);
      } catch (error) {
        console.error('Failed to import customer database:', error);
        return res.status(500).json({ error: 'Failed to import existing customer list.' });
      }
    }
  );

  router.patch(
    '/businesses/:id/customers/:customerId/opt-in',
    requireAuth,
    async (req: AuthRequest, res: Response) => {
      try {
        const businessId = Number(req.params.id);
        const customerId = Number(req.params.customerId);
        const access = await assertBusinessAccess(req, businessId);
        if (!access.ok) return res.status(access.status).json({ error: access.error });

        const marketingOptIn = Boolean(req.body?.marketingOptIn);
        const [updated] = await db
          .update(customers)
          .set({ marketingOptIn, updatedAt: new Date() })
          .where(
            and(eq(customers.id, customerId), eq(customers.businessId, businessId))
          )
          .returning();

        if (!updated) return res.status(404).json({ error: 'Customer not found.' });
        return res.json({ customer: updated });
      } catch (error) {
        console.error('Failed to update opt-in:', error);
        return res.status(500).json({ error: 'Failed to update customer opt-in status.' });
      }
    }
  );

  router.get(
    '/businesses/:id/campaigns',
    requireAuth,
    async (req: AuthRequest, res: Response) => {
      try {
        const businessId = Number(req.params.id);
        const access = await assertBusinessAccess(req, businessId);
        if (!access.ok) return res.status(access.status).json({ error: access.error });

        const [campaignRows, customerRows, apptRows] = await Promise.all([
          db
            .select()
            .from(campaigns)
            .where(eq(campaigns.businessId, businessId))
            .orderBy(desc(campaigns.sentAt)),
          db
            .select()
            .from(customers)
            .where(eq(customers.businessId, businessId)),
          db
            .select({ customerId: appointments.customerId })
            .from(appointments)
            .where(eq(appointments.businessId, businessId)),
        ]);

        const bookedIds = new Set(apptRows.map((a) => a.customerId));
        const optedIn = customerRows.filter((c) => c.marketingOptIn);

        return res.json({
          campaigns: campaignRows,
          audienceStats: {
            totalCustomers: customerRows.length,
            optedInCount: optedIn.length,
            withEmailCount: optedIn.filter((c) => c.email.includes('@')).length,
            withPhoneCount: optedIn.filter(
              (c) => c.phone.replace(/\D/g, '').length >= 7
            ).length,
            bookedBeforeCount: optedIn.filter((c) => bookedIds.has(c.id)).length,
            importedDatabaseCount: optedIn.filter(
              (c) => c.source === 'imported_database'
            ).length,
            maxAllowed: MAX_EXISTING_CUSTOMER_CAMPAIGN_LIMIT,
            remainingCapacity: Math.max(
              0,
              MAX_EXISTING_CUSTOMER_CAMPAIGN_LIMIT - customerRows.length
            ),
          },
        });
      } catch (error) {
        console.error('Failed to fetch campaigns:', error);
        return res.status(500).json({ error: 'Failed to load campaigns.' });
      }
    }
  );

  router.post(
    '/businesses/:id/campaigns/draft-ai',
    requireAuth,
    async (req: AuthRequest, res: Response) => {
      try {
        const businessId = Number(req.params.id);
        const access = await assertBusinessAccess(req, businessId);
        if (!access.ok) return res.status(access.status).json({ error: access.error });

        const campaignType =
          req.body?.campaignType === 'announcement' ? 'announcement' : 'offer';
        const channel =
          req.body?.channel === 'email' || req.body?.channel === 'whatsapp'
            ? req.body.channel
            : 'both';
        const goal = String(req.body?.goal || '').trim().slice(0, 600);
        const attachedPackageId = req.body?.attachedPackageId
          ? Number(req.body.attachedPackageId)
          : null;

        const draft = await draftCampaignCopyWithAI({
          businessId,
          campaignType,
          channel,
          goal,
          attachedPackageId,
        });

        return res.json(draft);
      } catch (error) {
        console.error('Failed to draft campaign copy:', error);
        return res.status(500).json({ error: 'Unable to draft campaign message.' });
      }
    }
  );

  router.post(
    '/businesses/:id/campaigns',
    requireAuth,
    async (req: AuthRequest, res: Response) => {
      try {
        const businessId = Number(req.params.id);
        const access = await assertBusinessAccess(req, businessId);
        if (!access.ok) return res.status(access.status).json({ error: access.error });

        const title = String(req.body?.title || '').trim();
        const messageBody = String(req.body?.messageBody || '').trim();
        const subject = String(req.body?.subject || title).trim();
        const campaignType =
          req.body?.campaignType === 'announcement' ? 'announcement' : 'offer';
        const channel =
          req.body?.channel === 'email' || req.body?.channel === 'whatsapp'
            ? req.body.channel
            : 'both';
        const allowedSegments = [
          'all_existing',
          'booked_before',
          'imported_database',
          'service_specific',
        ] as const;
        const audienceSegment = allowedSegments.includes(req.body?.audienceSegment)
          ? (req.body.audienceSegment as (typeof allowedSegments)[number])
          : 'all_existing';
        const audienceFilterValue = String(req.body?.audienceFilterValue || '').trim();
        const attachedPackageId = req.body?.attachedPackageId
          ? Number(req.body.attachedPackageId)
          : null;

        if (!title || !messageBody) {
          return res
            .status(400)
            .json({ error: 'Campaign title and message body are required.' });
        }

        const result = await createAndSendCampaign({
          businessId,
          actorUid: req.user!.uid,
          title,
          campaignType,
          channel,
          subject,
          messageBody,
          audienceSegment,
          audienceFilterValue,
          attachedPackageId,
        });

        if (!result.ok) {
          return res.status(400).json({ error: result.error });
        }

        return res.status(201).json({ campaign: result.campaign });
      } catch (error) {
        console.error('Failed to dispatch campaign:', error);
        return res.status(500).json({ error: 'Failed to send campaign broadcast.' });
      }
    }
  );

  router.get(
    '/businesses/:id/campaigns/:campaignId',
    requireAuth,
    async (req: AuthRequest, res: Response) => {
      try {
        const businessId = Number(req.params.id);
        const campaignId = Number(req.params.campaignId);
        const access = await assertBusinessAccess(req, businessId);
        if (!access.ok) return res.status(access.status).json({ error: access.error });

        const [[campaign], recipients] = await Promise.all([
          db
            .select()
            .from(campaigns)
            .where(
              and(eq(campaigns.id, campaignId), eq(campaigns.businessId, businessId))
            )
            .limit(1),
          db
            .select()
            .from(campaignRecipients)
            .where(
              and(
                eq(campaignRecipients.campaignId, campaignId),
                eq(campaignRecipients.businessId, businessId)
              )
            )
            .orderBy(desc(campaignRecipients.dispatchedAt))
            .limit(500),
        ]);

        if (!campaign) return res.status(404).json({ error: 'Campaign not found.' });
        return res.json({ campaign, recipients });
      } catch (error) {
        console.error('Failed to load campaign detail:', error);
        return res.status(500).json({ error: 'Failed to load campaign delivery logs.' });
      }
    }
  );

  // ---------------------------------------------------------------------------
  // GOOGLE PUBLIC PROFILE & MASTER BUSINESS PROFILE SYNC
  // ---------------------------------------------------------------------------
  router.get(
    '/businesses/:id/google-profile',
    requireAuth,
    async (req: AuthRequest, res: Response) => {
      try {
        const businessId = Number(req.params.id);
        if (!Number.isFinite(businessId)) {
          return res.status(400).json({ error: 'Invalid business ID.' });
        }
        const access = await assertBusinessAccess(req, businessId);
        if (!access.ok) return res.status(access.status).json({ error: access.error });

        const origin = resolveRequestOrigin(req);
        const profile = await getOrInitGoogleProfile(businessId, origin);

        let livePlace: LiveGooglePlaceDetails | null = null;
        let quotaExceeded = false;

        if (profile.googlePlaceId) {
          const liveRes = await fetchLiveGooglePlaceDetails(profile.googlePlaceId);
          if (liveRes.ok) {
            livePlace = liveRes.place;
          } else if (liveRes.quotaExceeded) {
            quotaExceeded = true;
          }
        }

        const audit = computeFieldAccuracyAudit(profile.masterProfileJson, livePlace);

        if (livePlace && audit.accuracyScore !== profile.lastAccuracyScore) {
          await db
            .update(googleProfiles)
            .set({
              lastAuditedAt: new Date(),
              lastAccuracyScore: audit.accuracyScore,
              updatedAt: new Date(),
            })
            .where(eq(googleProfiles.businessId, businessId));
          profile.lastAccuracyScore = audit.accuracyScore;
          profile.lastAuditedAt = new Date();
        }

        const [googleLeadsRow] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(appointments)
          .where(
            and(
              eq(appointments.businessId, businessId),
              eq(appointments.channel, 'google_profile')
            )
          );

        const jsonLd = generateLocalBusinessJsonLd(
          access.business.slug,
          profile.masterProfileJson,
          origin
        );

        return res.json({
          profile,
          livePlace,
          audit,
          jsonLd,
          publicProfileUrl: `${origin}/?profile=${encodeURIComponent(access.business.slug)}`,
          googleLeadCount: googleLeadsRow?.count ?? 0,
          mapsConfigured: Boolean(getGoogleMapsApiKey()),
          quotaExceeded,
        });
      } catch (error) {
        console.error('Failed to load Google Public Profile:', error);
        return res.status(500).json({ error: 'Failed to load Google Public Profile.' });
      }
    }
  );

  router.post(
    '/businesses/:id/google-profile/search',
    requireAuth,
    async (req: AuthRequest, res: Response) => {
      try {
        const businessId = Number(req.params.id);
        const access = await assertBusinessAccess(req, businessId);
        if (!access.ok) return res.status(access.status).json({ error: access.error });

        const query = String(req.body?.query || '').trim();
        const regionCode = req.body?.regionCode
          ? String(req.body.regionCode).trim()
          : undefined;

        const searchRes = await searchGooglePublicProfiles(query, regionCode);
        if (!searchRes.ok) {
          return res.status(searchRes.statusCode || 400).json({
            error: searchRes.error,
            quotaExceeded: Boolean(searchRes.quotaExceeded),
          });
        }

        return res.json({ places: searchRes.places });
      } catch (error) {
        console.error('Google Public Profile search failed:', error);
        return res.status(500).json({ error: 'Failed to search Google Public Profiles.' });
      }
    }
  );

  router.post(
    '/businesses/:id/google-profile/copy-deskline',
    requireAuth,
    async (req: AuthRequest, res: Response) => {
      try {
        const businessId = Number(req.params.id);
        const access = await assertBusinessAccess(req, businessId);
        if (!access.ok) return res.status(access.status).json({ error: access.error });

        const origin = resolveRequestOrigin(req);
        const result = await copyDesklineToMasterProfile(
          businessId,
          origin,
          req.user!.uid
        );
        const jsonLd = generateLocalBusinessJsonLd(
          access.business.slug,
          result.profile.masterProfileJson,
          origin
        );

        return res.json({
          ...result,
          jsonLd,
          publicProfileUrl: `${origin}/?profile=${encodeURIComponent(access.business.slug)}`,
        });
      } catch (error) {
        console.error('Failed to copy Deskline details to Master Profile:', error);
        return res
          .status(500)
          .json({ error: 'Failed to copy business details into Master Profile.' });
      }
    }
  );

  router.post(
    '/businesses/:id/google-profile/link-and-copy',
    requireAuth,
    async (req: AuthRequest, res: Response) => {
      try {
        const businessId = Number(req.params.id);
        const access = await assertBusinessAccess(req, businessId);
        if (!access.ok) return res.status(access.status).json({ error: access.error });

        const placeId = String(req.body?.placeId || '').trim();
        if (!placeId) {
          return res.status(400).json({ error: 'Google Place ID is required.' });
        }

        const origin = resolveRequestOrigin(req);
        const result = await copyGooglePlaceToMasterProfile({
          businessId,
          placeId,
          copyFieldsIntoMaster: req.body?.copyFieldsIntoMaster !== false,
          alsoUpdateDesklineCore: Boolean(req.body?.alsoUpdateDesklineCore),
          appOrigin: origin,
          actorUid: req.user!.uid,
        });

        if (!result.ok) {
          return res.status(result.statusCode || 400).json({
            error: result.error,
            quotaExceeded: Boolean(result.quotaExceeded),
          });
        }

        const jsonLd = generateLocalBusinessJsonLd(
          access.business.slug,
          result.profile.masterProfileJson,
          origin
        );

        return res.json({
          profile: result.profile,
          livePlace: result.livePlace,
          audit: result.audit,
          jsonLd,
          publicProfileUrl: `${origin}/?profile=${encodeURIComponent(access.business.slug)}`,
        });
      } catch (error) {
        console.error('Failed to link and copy Google Place:', error);
        return res
          .status(500)
          .json({ error: 'Failed to link Google Public Profile.' });
      }
    }
  );

  router.put(
    '/businesses/:id/google-profile/master',
    requireAuth,
    async (req: AuthRequest, res: Response) => {
      try {
        const businessId = Number(req.params.id);
        const access = await assertBusinessAccess(req, businessId);
        if (!access.ok) return res.status(access.status).json({ error: access.error });

        const origin = resolveRequestOrigin(req);
        const result = await saveMasterProfileEdits({
          businessId,
          masterProfile: req.body?.masterProfile || {},
          storeCode: req.body?.storeCode,
          autoSyncFromDeskline: req.body?.autoSyncFromDeskline,
          publicProfileEnabled: req.body?.publicProfileEnabled,
          syncBackToDeskline: Boolean(req.body?.syncBackToDeskline),
          appOrigin: origin,
          actorUid: req.user!.uid,
        });

        const jsonLd = generateLocalBusinessJsonLd(
          access.business.slug,
          result.profile.masterProfileJson,
          origin
        );

        return res.json({
          ...result,
          jsonLd,
          publicProfileUrl: `${origin}/?profile=${encodeURIComponent(access.business.slug)}`,
        });
      } catch (error) {
        console.error('Failed to save Master Profile:', error);
        return res.status(500).json({ error: 'Failed to save Master Profile.' });
      }
    }
  );

  router.delete(
    '/businesses/:id/google-profile/link',
    requireAuth,
    async (req: AuthRequest, res: Response) => {
      try {
        const businessId = Number(req.params.id);
        const access = await assertBusinessAccess(req, businessId);
        if (!access.ok) return res.status(access.status).json({ error: access.error });

        const origin = resolveRequestOrigin(req);
        const existing = await getOrInitGoogleProfile(businessId, origin);
        const audit = computeFieldAccuracyAudit(existing.masterProfileJson, null);

        const [updated] = await db
          .update(googleProfiles)
          .set({
            googlePlaceId: '',
            lastAccuracyScore: audit.accuracyScore,
            updatedAt: new Date(),
          })
          .where(eq(googleProfiles.businessId, businessId))
          .returning();

        return res.json({ profile: updated, livePlace: null, audit });
      } catch (error) {
        console.error('Failed to unlink Google Place:', error);
        return res.status(500).json({ error: 'Failed to unlink Google listing.' });
      }
    }
  );

  return router;
}
