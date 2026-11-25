import { and, desc, eq } from 'drizzle-orm';
import { Type } from '@google/genai';
import { db } from '../db/index.ts';
import {
  appointments,
  auditLogs,
  businesses,
  campaignRecipients,
  campaigns,
  customers,
  packages,
} from '../db/schema.ts';
import { DEFAULT_AGENT_MODEL, getGeminiClient } from './geminiClient.ts';

export const MAX_EXISTING_CUSTOMER_CAMPAIGN_LIMIT = 2000;

export interface ImportContactInput {
  name?: string;
  email?: string;
  phone?: string;
  preferredService?: string;
  notes?: string;
}

function normalizeEmail(raw?: string): string {
  const trimmed = (raw || '').trim().toLowerCase();
  if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return '';
  return trimmed;
}

function normalizePhone(raw?: string): string {
  const trimmed = (raw || '').trim();
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) return '';
  return trimmed;
}

export async function importExistingCustomerContacts(params: {
  businessId: number;
  contacts: ImportContactInput[];
  actorUid: string;
}) {
  try {
    const existingRows = await db
      .select()
      .from(customers)
      .where(eq(customers.businessId, params.businessId));

    const existingCount = existingRows.length;
    const remainingSlots = Math.max(
      0,
      MAX_EXISTING_CUSTOMER_CAMPAIGN_LIMIT - existingCount
    );

    if (remainingSlots === 0) {
      return {
        ok: false as const,
        error: `This business has reached the maximum existing customer broadcast base limit of ${MAX_EXISTING_CUSTOMER_CAMPAIGN_LIMIT.toLocaleString()} users.`,
      };
    }

    const emailSet = new Set(
      existingRows.map((r) => r.email.toLowerCase()).filter(Boolean)
    );
    const phoneSet = new Set(
      existingRows.map((r) => r.phone.replace(/\D/g, '')).filter(Boolean)
    );

    const toInsert: Array<{
      businessId: number;
      name: string;
      email: string;
      phone: string;
      preferredService: string;
      notes: string;
      source: string;
      marketingOptIn: boolean;
    }> = [];

    let duplicateCount = 0;
    let invalidCount = 0;
    let capSkippedCount = 0;

    for (const raw of params.contacts) {
      const email = normalizeEmail(raw.email);
      const phone = normalizePhone(raw.phone);
      if (!email && !phone) {
        invalidCount += 1;
        continue;
      }

      const phoneDigits = phone.replace(/\D/g, '');
      if (
        (email && emailSet.has(email)) ||
        (phoneDigits && phoneSet.has(phoneDigits))
      ) {
        duplicateCount += 1;
        continue;
      }

      if (toInsert.length >= remainingSlots) {
        capSkippedCount += 1;
        continue;
      }

      if (email) emailSet.add(email);
      if (phoneDigits) phoneSet.add(phoneDigits);

      const fallbackName = email
        ? email.split('@')[0].replace(/[._-]+/g, ' ')
        : `Customer ${phoneDigits.slice(-4)}`;

      toInsert.push({
        businessId: params.businessId,
        name: (raw.name || '').trim() || fallbackName,
        email,
        phone,
        preferredService: (raw.preferredService || '').trim(),
        notes: (raw.notes || '').trim() || 'Imported from existing customer database',
        source: 'imported_database',
        marketingOptIn: true,
      });
    }

    if (toInsert.length > 0) {
      // Insert in safe chunks of 250
      for (let i = 0; i < toInsert.length; i += 250) {
        await db.insert(customers).values(toInsert.slice(i, i + 250));
      }

      await db.insert(auditLogs).values({
        businessId: params.businessId,
        actorUid: params.actorUid,
        action: 'customers.imported',
        entityType: 'customer',
        entityId: String(params.businessId),
        details: `Imported ${toInsert.length} existing customer contacts (${duplicateCount} duplicates, ${invalidCount} invalid, ${capSkippedCount} capped at 2,000 limit)`,
      });
    }

    return {
      ok: true as const,
      importedCount: toInsert.length,
      duplicateCount,
      invalidCount,
      capSkippedCount,
      totalCustomersNow: existingCount + toInsert.length,
      maxAllowed: MAX_EXISTING_CUSTOMER_CAMPAIGN_LIMIT,
    };
  } catch (error) {
    console.error('Database query failed in importExistingCustomerContacts:', error);
    throw new Error('Failed to import customer database.', { cause: error });
  }
}

export async function draftCampaignCopyWithAI(params: {
  businessId: number;
  campaignType: 'offer' | 'announcement';
  channel: 'email' | 'whatsapp' | 'both';
  goal: string;
  attachedPackageId?: number | null;
}) {
  const [biz] = await db
    .select()
    .from(businesses)
    .where(eq(businesses.id, params.businessId))
    .limit(1);

  if (!biz) throw new Error('Business not found.');

  let pkgContext = '';
  if (params.attachedPackageId) {
    const [pkg] = await db
      .select()
      .from(packages)
      .where(
        and(
          eq(packages.id, params.attachedPackageId),
          eq(packages.businessId, params.businessId)
        )
      )
      .limit(1);
    if (pkg) {
      pkgContext = `Featured Offer/Package: ${pkg.name} — ${pkg.sessionCount} sessions for ${pkg.currency} ${pkg.price} (valid ${pkg.validityDays} days). Details: ${pkg.description}. Conditions: ${pkg.conditions}.`;
    }
  }

  const fallbackDraft = {
    title:
      params.campaignType === 'announcement'
        ? `Update from ${biz.businessName}`
        : `Returning Customer Offer — ${biz.businessName}`,
    subject:
      params.campaignType === 'announcement'
        ? `Important update for valued clients of ${biz.businessName}`
        : `Exclusive returning-client offer at ${biz.businessName}`,
    messageBody: `Hi {{name}}, thank you for being a valued client at ${biz.businessName}! ${
      pkgContext
        ? pkgContext
        : params.goal ||
          'We have opened priority appointment slots for our returning customers this week.'
    } Reply to this message anytime and our AI receptionist will confirm your preferred slot.`,
  };

  const hasGeminiKey = Boolean(
    process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY'
  );
  if (!hasGeminiKey) {
    return fallbackDraft;
  }

  try {
    const ai = getGeminiClient();
    const prompt = [
      `Write a concise, friendly, professional ${params.campaignType} message for existing customers of "${biz.businessName}" (${biz.businessCategory}).`,
      `Target channel(s): ${params.channel}.`,
      `Business description: ${biz.description || 'Appointment-based service business'}.`,
      pkgContext,
      `Campaign goal / notes: ${params.goal || 'Encourage existing customers to book their next visit with a special returning-customer offer.'}`,
      'Rules: Address existing customers warmly (use {{name}} placeholder once at the start), keep it concise and readable on WhatsApp and Email, include a clear booking call-to-action, and avoid spammy all-caps.',
    ].join('\n');

    const response = await ai.models.generateContent({
      model: DEFAULT_AGENT_MODEL,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            subject: { type: Type.STRING },
            messageBody: { type: Type.STRING },
          },
          required: ['title', 'subject', 'messageBody'],
        },
      },
    });

    const parsed = JSON.parse((response.text || '{}').trim()) as {
      title?: string;
      subject?: string;
      messageBody?: string;
    };

    return {
      title: parsed.title || fallbackDraft.title,
      subject: parsed.subject || fallbackDraft.subject,
      messageBody: parsed.messageBody || fallbackDraft.messageBody,
    };
  } catch (err) {
    console.warn('Campaign AI draft fallback triggered:', err);
    return fallbackDraft;
  }
}

export async function createAndSendCampaign(params: {
  businessId: number;
  actorUid: string;
  title: string;
  campaignType: 'offer' | 'announcement';
  channel: 'email' | 'whatsapp' | 'both';
  subject: string;
  messageBody: string;
  audienceSegment: 'all_existing' | 'booked_before' | 'imported_database' | 'service_specific';
  audienceFilterValue?: string;
  attachedPackageId?: number | null;
}) {
  try {
    const allCustomers = await db
      .select()
      .from(customers)
      .where(
        and(
          eq(customers.businessId, params.businessId),
          eq(customers.marketingOptIn, true)
        )
      )
      .orderBy(desc(customers.updatedAt));

    let eligible = allCustomers;

    if (params.audienceSegment === 'booked_before') {
      const apptRows = await db
        .select({ customerId: appointments.customerId })
        .from(appointments)
        .where(eq(appointments.businessId, params.businessId));
      const bookedCustomerIds = new Set(apptRows.map((a) => a.customerId));
      eligible = allCustomers.filter((c) => bookedCustomerIds.has(c.id));
    } else if (params.audienceSegment === 'imported_database') {
      eligible = allCustomers.filter((c) => c.source === 'imported_database');
    } else if (
      params.audienceSegment === 'service_specific' &&
      params.audienceFilterValue?.trim()
    ) {
      const needle = params.audienceFilterValue.trim().toLowerCase();
      eligible = allCustomers.filter((c) =>
        c.preferredService.toLowerCase().includes(needle)
      );
    }

    if (eligible.length === 0) {
      return {
        ok: false as const,
        error:
          'No eligible existing customers match the selected audience segment. Import your existing customer list or adjust the filter.',
      };
    }

    if (eligible.length > MAX_EXISTING_CUSTOMER_CAMPAIGN_LIMIT) {
      return {
        ok: false as const,
        error: `Campaigns are restricted to existing customer bases up to ${MAX_EXISTING_CUSTOMER_CAMPAIGN_LIMIT.toLocaleString()} users (selected audience has ${eligible.length.toLocaleString()}). Narrow your segment to continue.`,
      };
    }

    let sentEmailCount = 0;
    let sentWhatsappCount = 0;
    let skippedCount = 0;

    const recipientPayloads = eligible.map((cust) => {
      const hasEmail = Boolean(cust.email && cust.email.includes('@'));
      const hasPhone = Boolean(cust.phone && cust.phone.replace(/\D/g, '').length >= 7);

      let emailStatus: 'sent' | 'skipped' | 'not_applicable' = 'not_applicable';
      let whatsappStatus: 'sent' | 'skipped' | 'not_applicable' = 'not_applicable';

      if (params.channel === 'email' || params.channel === 'both') {
        if (hasEmail) {
          emailStatus = 'sent';
          sentEmailCount += 1;
        } else {
          emailStatus = 'skipped';
        }
      }

      if (params.channel === 'whatsapp' || params.channel === 'both') {
        if (hasPhone) {
          whatsappStatus = 'sent';
          sentWhatsappCount += 1;
        } else {
          whatsappStatus = 'skipped';
        }
      }

      if (emailStatus !== 'sent' && whatsappStatus !== 'sent') {
        skippedCount += 1;
      }

      return {
        businessId: params.businessId,
        customerId: cust.id,
        customerName: cust.name,
        email: cust.email,
        phone: cust.phone,
        emailStatus,
        whatsappStatus,
      };
    });

    const createdCampaign = await db.transaction(async (tx) => {
      const [camp] = await tx
        .insert(campaigns)
        .values({
          businessId: params.businessId,
          title: params.title.trim(),
          campaignType: params.campaignType,
          channel: params.channel,
          subject: params.subject.trim(),
          messageBody: params.messageBody.trim(),
          audienceSegment: params.audienceSegment,
          audienceFilterValue: (params.audienceFilterValue || '').trim(),
          attachedPackageId: params.attachedPackageId || null,
          totalTargeted: eligible.length,
          sentEmailCount,
          sentWhatsappCount,
          skippedCount,
          status: 'sent',
          createdByUid: params.actorUid,
          sentAt: new Date(),
        })
        .returning();

      for (let i = 0; i < recipientPayloads.length; i += 250) {
        const chunk = recipientPayloads.slice(i, i + 250).map((r) => ({
          ...r,
          campaignId: camp.id,
        }));
        await tx.insert(campaignRecipients).values(chunk);
      }

      await tx.insert(auditLogs).values({
        businessId: params.businessId,
        actorUid: params.actorUid,
        action: 'campaign.sent',
        entityType: 'campaign',
        entityId: String(camp.id),
        details: `Sent ${params.campaignType} "${camp.title}" via ${params.channel} to ${eligible.length} existing customers (${sentEmailCount} emails, ${sentWhatsappCount} WhatsApp)`,
      });

      return camp;
    });

    return {
      ok: true as const,
      campaign: createdCampaign,
    };
  } catch (error) {
    console.error('Database query failed in createAndSendCampaign:', error);
    throw new Error('Failed to send campaign broadcast.', { cause: error });
  }
}
