import { eq } from 'drizzle-orm';
import { db } from '../db/index.ts';
import {
  appointments,
  availabilityRules,
  businesses,
  channelIntegrations,
  conversations,
  customers,
  knowledgeItems,
  packages,
  services,
  users,
} from '../db/schema.ts';
import { SUPER_ADMIN_EMAIL } from '../db/users.ts';
import { DEFAULT_WORKING_DAYS } from './bookingEngine.ts';

export const DEMO_BUSINESS_SLUG = 'soma-wellness';

function offsetIsoDate(daysFromNow: number): string {
  const dt = new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000);
  return dt.toISOString().slice(0, 10);
}

export async function ensureDemoBusinessSeeded() {
  try {
    const [existing] = await db
      .select()
      .from(businesses)
      .where(eq(businesses.slug, DEMO_BUSINESS_SLUG))
      .limit(1);

    if (existing) {
      return existing;
    }

    const demoOwnerUid = 'demo_soma_owner';
    await db
      .insert(users)
      .values({
        uid: demoOwnerUid,
        email: SUPER_ADMIN_EMAIL,
        displayName: 'Soma Wellness Team',
        role: 'super_admin',
      })
      .onConflictDoNothing({ target: users.uid });

    const [biz] = await db
      .insert(businesses)
      .values({
        ownerUid: demoOwnerUid,
        slug: DEMO_BUSINESS_SLUG,
        businessName: 'Soma Wellness & Dental',
        businessEmail: 'care@somawellness.in',
        contactPerson: 'Dr. Meera Nair',
        country: 'India',
        timezone: 'Asia/Kolkata',
        businessCategory: 'Healthcare',
        websiteUrl: 'https://somawellness.in',
        whatsappPhone: '+91 98450 22190',
        description:
          'Modern preventive dental studio and holistic wellness clinic in Indiranagar, Bengaluru offering routine check-ups, cosmetic treatments, and restorative therapy.',
        address: '100 Feet Road, Indiranagar, Bengaluru 560038',
        currency: 'INR',
        subscriptionPlan: 'growth',
        status: 'active',
        isDemoPublic: true,
        agentName: 'Maya',
        agentGreeting:
          'Hi! Welcome to Soma Wellness & Dental. I can help you explore services, check live slots, or book an appointment.',
        agentPersonality:
          'Warm, attentive, concise, and clinical-grade professional.',
        agentInstructions:
          'Always mention if a service includes a digital scan. Offer the Wellness Duo Package when patients ask about combining dental care with physiotherapy.',
        bookingPolicy:
          'Please arrive 10 minutes prior to your appointment. Complimentary valet parking is available at the clinic entrance.',
        escalationPolicy:
          'Escalate immediately to a human coordinator for acute dental emergencies, insurance reimbursement letters, or corporate wellness inquiries.',
        widgetBrandColor: '#0F766E',
        reminder24h: true,
        reminder2h: true,
        onboardingStep: 8,
        tokenUsage: 14820,
        messageCount: 64,
      })
      .onConflictDoNothing({ target: businesses.slug })
      .returning();

    if (!biz) {
      const [refetched] = await db
        .select()
        .from(businesses)
        .where(eq(businesses.slug, DEMO_BUSINESS_SLUG))
        .limit(1);
      return refetched;
    }

    await db.insert(availabilityRules).values({
      businessId: biz.id,
      workingDaysJson: DEFAULT_WORKING_DAYS,
      breakStart: '13:00',
      breakEnd: '14:00',
      slotIntervalMinutes: 30,
      minAdvanceHours: 1,
      maxAdvanceDays: 30,
      cancellationWindowHours: 12,
      reschedulingPolicy:
        'Free rescheduling or cancellation up to 12 hours before your scheduled time.',
      holidaysJson: [],
      blockedSlotsJson: [],
    });

    const insertedServices = await db
      .insert(services)
      .values([
        {
          businessId: biz.id,
          name: 'General Consultation',
          description:
            'Comprehensive 30-minute dental or wellness evaluation with a personalized care plan.',
          category: 'Consultations',
          durationMinutes: 30,
          price: 500,
          currency: 'INR',
          bufferMinutes: 0,
          staffMember: 'Dr. Meera Nair',
          advancePaymentRequired: false,
          allowDirectBooking: true,
        },
        {
          businessId: biz.id,
          name: 'Premium Consultation',
          description:
            'Extended 60-minute diagnostic consultation including digital 3D intraoral scan and full wellness assessment.',
          category: 'Consultations',
          durationMinutes: 60,
          price: 1000,
          currency: 'INR',
          bufferMinutes: 15,
          staffMember: 'Dr. Meera Nair',
          advancePaymentRequired: false,
          allowDirectBooking: true,
        },
        {
          businessId: biz.id,
          name: 'Scaling & Polishing',
          description:
            'Ultrasonic plaque removal, stain polishing, and gentle enamel remineralisation.',
          category: 'Preventive Care',
          durationMinutes: 45,
          price: 1800,
          currency: 'INR',
          bufferMinutes: 15,
          staffMember: 'Dr. Rohan Kulkarni',
          advancePaymentRequired: false,
          allowDirectBooking: true,
        },
        {
          businessId: biz.id,
          name: 'Full Restorative Treatment',
          description:
            '90-minute comprehensive restorative session tailored to cosmetic or structural recovery.',
          category: 'Treatments',
          durationMinutes: 90,
          price: 2500,
          currency: 'INR',
          bufferMinutes: 15,
          staffMember: 'Dr. Meera Nair',
          advancePaymentRequired: true,
          allowDirectBooking: true,
        },
      ])
      .returning();

    await db.insert(packages).values([
      {
        businessId: biz.id,
        name: '5-Session Preventive Wellness Pack',
        description:
          'Five scheduled preventive care or physiotherapy sessions with priority morning slots.',
        includedServices: 'General Consultation, Scaling & Polishing',
        sessionCount: 5,
        price: 4200,
        currency: 'INR',
        validityDays: 180,
        conditions: 'Shareable with one immediate family member.',
      },
      {
        businessId: biz.id,
        name: 'First-Visit Consultation + Cleaning Combo',
        description:
          'Ideal for new patients: combines a 30-min General Consultation with full Ultrasonic Scaling & Polishing.',
        includedServices: 'General Consultation, Scaling & Polishing',
        sessionCount: 2,
        price: 1950,
        currency: 'INR',
        validityDays: 30,
        conditions: 'Valid for first-time visitors only.',
      },
    ]);

    await db.insert(knowledgeItems).values([
      {
        businessId: biz.id,
        sourceType: 'faq',
        sourceUrl: 'https://somawellness.in/faq',
        title: 'Parking & Directions',
        content:
          'Located on 100 Feet Road, Indiranagar (200m from Indiranagar Metro Station). Complimentary valet parking is available.',
        isApproved: true,
      },
      {
        businessId: biz.id,
        sourceType: 'policy',
        sourceUrl: 'https://somawellness.in/policies',
        title: 'Cancellation & Rescheduling Policy',
        content:
          'Appointments can be rescheduled or cancelled free of charge up to 12 hours in advance via WhatsApp or Website Chat using your booking reference.',
        isApproved: true,
      },
      {
        businessId: biz.id,
        sourceType: 'faq',
        sourceUrl: 'https://somawellness.in/insurance',
        title: 'Payment Methods & Receipts',
        content:
          'We accept UPI, credit/debit cards, and cash at the clinic. Itemized receipts are emailed immediately for corporate reimbursement.',
        isApproved: true,
      },
    ]);

    await db.insert(channelIntegrations).values([
      {
        businessId: biz.id,
        channelType: 'whatsapp',
        whatsappPhoneNumberId: '384920184756102',
        whatsappBusinessAccountId: '109283746519283',
        metaVerifyToken: 'deskline_soma_verify_2026',
        webhookUrl: `/api/webhooks/whatsapp/${DEMO_BUSINESS_SLUG}`,
        connectionStatus: 'connected',
        approvedTemplatesJson: [
          {
            name: 'appointment_confirmation_v1',
            category: 'UTILITY',
            status: 'approved',
            body: 'Hi {{1}}, your {{2}} at Soma Wellness & Dental is confirmed for {{3}} at {{4}}. Ref: {{5}}.',
          },
          {
            name: 'appointment_reminder_24h',
            category: 'UTILITY',
            status: 'approved',
            body: 'Reminder: You have {{1}} tomorrow at {{2}}. Reply RESCHEDULE or CANCEL anytime.',
          },
        ],
      },
      {
        businessId: biz.id,
        channelType: 'website_widget',
        connectionStatus: 'connected',
        widgetConfigJson: {
          welcomeMessage: 'Hi! How can we help you today?',
          quickPrompts: [
            'Book an appointment',
            'Explore services',
            'View pricing',
            'View packages',
            'Talk to someone',
          ],
          enableWhatsAppHandoff: true,
          position: 'bottom-right',
          brandColor: '#0F766E',
        },
      },
    ]);

    const insertedCustomers = await db
      .insert(customers)
      .values([
        {
          businessId: biz.id,
          name: 'Rahul Sharma',
          phone: '+91 98451 88301',
          email: 'rahul.sharma@example.com',
          preferredService: 'General Consultation',
          notes: 'Prefers late morning appointments.',
        },
        {
          businessId: biz.id,
          name: 'Ananya Rao',
          phone: '+91 97412 55210',
          email: 'ananya.rao@example.com',
          preferredService: 'Premium Consultation',
          notes: 'New patient interested in preventive care pack.',
        },
        {
          businessId: biz.id,
          name: 'Vikram Menon',
          phone: '+91 99001 44892',
          email: 'vikram.menon@example.com',
          preferredService: 'Scaling & Polishing',
          notes: 'Returning patient.',
        },
      ])
      .returning();

    const today = offsetIsoDate(0);
    const tomorrow = offsetIsoDate(1);
    const dayAfter = offsetIsoDate(2);

    await db.insert(appointments).values([
      {
        bookingRef: 'AP10245',
        businessId: biz.id,
        customerId: insertedCustomers[0].id,
        serviceId: insertedServices[0].id,
        serviceNameSnapshot: insertedServices[0].name,
        priceSnapshot: insertedServices[0].price,
        currencySnapshot: 'INR',
        staffMember: 'Dr. Meera Nair',
        appointmentDate: tomorrow,
        startTime: '11:30',
        endTime: '12:00',
        bookingStatus: 'confirmed',
        paymentStatus: 'unpaid',
        channel: 'whatsapp',
        notes: 'Booked via WhatsApp AI receptionist',
      },
      {
        bookingRef: 'AP10248',
        businessId: biz.id,
        customerId: insertedCustomers[1].id,
        serviceId: insertedServices[1].id,
        serviceNameSnapshot: insertedServices[1].name,
        priceSnapshot: insertedServices[1].price,
        currencySnapshot: 'INR',
        staffMember: 'Dr. Meera Nair',
        appointmentDate: today,
        startTime: '15:00',
        endTime: '16:00',
        bookingStatus: 'confirmed',
        paymentStatus: 'paid',
        channel: 'website',
        notes: 'Requested 3D intraoral scan',
      },
      {
        bookingRef: 'AP10251',
        businessId: biz.id,
        customerId: insertedCustomers[2].id,
        serviceId: insertedServices[2].id,
        serviceNameSnapshot: insertedServices[2].name,
        priceSnapshot: insertedServices[2].price,
        currencySnapshot: 'INR',
        staffMember: 'Dr. Rohan Kulkarni',
        appointmentDate: dayAfter,
        startTime: '10:00',
        endTime: '10:45',
        bookingStatus: 'confirmed',
        paymentStatus: 'unpaid',
        channel: 'whatsapp',
        notes: 'Routine 6-month cleaning',
      },
    ]);

    const nowIso = new Date().toISOString();
    await db.insert(conversations).values([
      {
        businessId: biz.id,
        customerId: insertedCustomers[0].id,
        sessionKey: 'wa_demo_rahul',
        customerName: 'Rahul Sharma',
        customerPhone: '+91 98451 88301',
        channel: 'whatsapp',
        status: 'resolved',
        messagesJson: [
          {
            id: 'm1',
            role: 'customer',
            text: 'Hi, I want to book a consultation for tomorrow.',
            timestamp: nowIso,
          },
          {
            id: 'm2',
            role: 'ai',
            text: 'Of course! Our General Consultation is 30 minutes (₹500) and our Premium Consultation is 60 minutes (₹1,000) including a 3D scan. Which would you prefer?',
            timestamp: nowIso,
            toolActions: ['Checked service catalog'],
          },
          {
            id: 'm3',
            role: 'customer',
            text: 'General consultation at 11:30 AM please. Rahul Sharma, rahul.sharma@example.com.',
            timestamp: nowIso,
          },
          {
            id: 'm4',
            role: 'ai',
            text: `Your General Consultation is confirmed for ${tomorrow} at 11:30 AM with Dr. Meera Nair. Your booking reference is AP10245.`,
            timestamp: nowIso,
            toolActions: [`Checked live slots for ${tomorrow}`, 'Confirmed booking AP10245'],
          },
        ],
      },
      {
        businessId: biz.id,
        customerId: insertedCustomers[1].id,
        sessionKey: 'web_demo_ananya',
        customerName: 'Ananya Rao',
        customerPhone: '+91 97412 55210',
        channel: 'website',
        status: 'human_takeover',
        escalationReason: 'Customer asked for corporate insurance pre-authorization letter',
        assignedTo: 'Front Desk Coordinator',
        messagesJson: [
          {
            id: 'm5',
            role: 'customer',
            text: 'Can you issue a custom pre-authorization form for my employer health plan before my 3 PM visit?',
            timestamp: nowIso,
          },
          {
            id: 'm6',
            role: 'ai',
            text: "I've alerted our clinic coordinator so they can prepare the corporate pre-authorization form for your visit today. Someone from our desk will follow up right here shortly.",
            timestamp: nowIso,
            toolActions: ['Escalated to human receptionist'],
          },
        ],
      },
    ]);

    return biz;
  } catch (error) {
    console.error('Failed to seed demo business:', error);
    return null;
  }
}
