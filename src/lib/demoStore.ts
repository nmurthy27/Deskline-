import type {
  AppointmentRecord,
  AvailabilityRecord,
  BusinessRecord,
  BusinessWorkspaceData,
  CampaignAudienceStats,
  CampaignRecipientRecord,
  CampaignRecord,
  ChannelIntegrationRecord,
  ConversationMessage,
  ConversationRecord,
  CustomerRecord,
  ExtractedWebsiteData,
  GoogleProfileRecord,
  GoogleProfileWorkspaceResponse,
  KnowledgeItemRecord,
  LiveGooglePlaceCandidate,
  LiveGooglePlaceDetails,
  MasterProfileSnapshot,
  MisBucket,
  MisChannelBreakdown,
  MisReportResponse,
  MisServiceBreakdown,
  PackageRecord,
  ProfileAccuracyAudit,
  ProfileAuditCheck,
  ProfileSyncEvent,
  PublicBusinessPayload,
  ServiceRecord,
  UserProfile,
  WorkingDaysMap,
} from '../types';

export const DEMO_USER_PROFILE: UserProfile = {
  id: 9001,
  uid: 'demo-super-admin',
  email: 'meera@somawellness.in',
  displayName: 'Dr. Meera Nair (Demo)',
  role: 'super_admin',
};

const DEFAULT_WORKING_DAYS: WorkingDaysMap = {
  mon: { enabled: true, open: '09:00', close: '19:00' },
  tue: { enabled: true, open: '09:00', close: '19:00' },
  wed: { enabled: true, open: '09:00', close: '19:00' },
  thu: { enabled: true, open: '09:00', close: '19:00' },
  fri: { enabled: true, open: '09:00', close: '19:00' },
  sat: { enabled: true, open: '10:00', close: '18:00' },
  sun: { enabled: false, open: '10:00', close: '14:00' },
};

const ORDERED_DAYS: Array<{ key: keyof WorkingDaysMap; label: string; schemaDay: string }> = [
  { key: 'mon', label: 'Mon', schemaDay: 'Monday' },
  { key: 'tue', label: 'Tue', schemaDay: 'Tuesday' },
  { key: 'wed', label: 'Wed', schemaDay: 'Wednesday' },
  { key: 'thu', label: 'Thu', schemaDay: 'Thursday' },
  { key: 'fri', label: 'Fri', schemaDay: 'Friday' },
  { key: 'sat', label: 'Sat', schemaDay: 'Saturday' },
  { key: 'sun', label: 'Sun', schemaDay: 'Sunday' },
];

const MAX_CAMPAIGN_LIMIT = 2000;

interface DemoAuditLog {
  id: number;
  businessId: number | null;
  actorUid: string;
  action: string;
  entityType: string;
  entityId: string;
  details: string;
  createdAt: string;
}

interface DemoCustomerRaw {
  id: number;
  businessId: number;
  name: string;
  phone: string;
  email: string;
  notes: string;
  preferredService: string;
  source: string;
  marketingOptIn: boolean;
  createdAt: string;
}

interface DemoState {
  initialized: boolean;
  nextId: number;
  businesses: BusinessRecord[];
  services: ServiceRecord[];
  packages: PackageRecord[];
  availability: Record<number, AvailabilityRecord>;
  channels: ChannelIntegrationRecord[];
  knowledge: KnowledgeItemRecord[];
  customers: DemoCustomerRaw[];
  appointments: AppointmentRecord[];
  conversations: ConversationRecord[];
  campaigns: CampaignRecord[];
  campaignRecipients: CampaignRecipientRecord[];
  googleProfiles: Record<number, GoogleProfileRecord>;
  auditLogs: DemoAuditLog[];
}

function isoDateOffset(daysOffset: number): string {
  const d = new Date(Date.now() + daysOffset * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

function isoTimestampOffset(hoursOffset: number): string {
  return new Date(Date.now() + hoursOffset * 60 * 60 * 1000).toISOString();
}

function getAppOrigin(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return 'http://localhost:3000';
}

function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function minutesToTime(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function formatTime12h(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

function formatWorkingDaysSummary(days: WorkingDaysMap): string {
  return ORDERED_DAYS.map(({ key, label }) => {
    const cfg = days[key];
    if (!cfg || !cfg.enabled) return `${label}: Closed`;
    return `${label}: ${cfg.open}–${cfg.close}`;
  }).join(' | ');
}

const SAMPLE_GOOGLE_PLACES: Record<string, LiveGooglePlaceDetails> = {
  demo_place_soma_indiranagar: {
    id: 'demo_place_soma_indiranagar',
    displayName: 'Soma Wellness & Dental',
    formattedAddress: '42, 100 Feet Road, HAL 2nd Stage, Indiranagar, Bengaluru, Karnataka 560038',
    primaryTypeDisplayName: 'Dental Clinic',
    businessStatus: 'OPERATIONAL',
    // Intentional minor drift (88200 vs 99100) + Sat closing 15:00 vs 18:00 so accuracy audit demonstrates catching stale Google data!
    internationalPhoneNumber: '+91 80 4128 8200',
    nationalPhoneNumber: '080 4128 8200',
    websiteUri: 'https://somawellness.in',
    googleMapsUri: 'https://maps.google.com/?q=12.9716,77.6412',
    rating: 4.9,
    userRatingCount: 318,
    location: { lat: 12.9716, lng: 77.6412 },
    weekdayDescriptions: [
      'Monday: 9:00 AM – 7:00 PM',
      'Tuesday: 9:00 AM – 7:00 PM',
      'Wednesday: 9:00 AM – 7:00 PM',
      'Thursday: 9:00 AM – 7:00 PM',
      'Friday: 9:00 AM – 7:00 PM',
      'Saturday: 10:00 AM – 3:00 PM',
      'Sunday: Closed',
    ],
    parsedWorkingDays: {
      mon: { enabled: true, open: '09:00', close: '19:00' },
      tue: { enabled: true, open: '09:00', close: '19:00' },
      wed: { enabled: true, open: '09:00', close: '19:00' },
      thu: { enabled: true, open: '09:00', close: '19:00' },
      fri: { enabled: true, open: '09:00', close: '19:00' },
      sat: { enabled: true, open: '10:00', close: '15:00' },
      sun: { enabled: false, open: '10:00', close: '14:00' },
    },
    editorialSummary:
      'Modern preventive dentistry, digital smile diagnostics, and restorative dental wellness in Indiranagar, Bengaluru.',
    directionsUri: 'https://maps.google.com/?daddr=12.9716,77.6412',
    writeAReviewUri: 'https://maps.google.com/?q=Soma+Wellness+Dental+Indiranagar',
    reviewsUri: 'https://maps.google.com/?q=Soma+Wellness+Dental+Indiranagar',
    timeZoneId: 'Asia/Kolkata',
  },
  demo_place_aura_bandra: {
    id: 'demo_place_aura_bandra',
    displayName: 'Aura Skin & Laser Studio',
    formattedAddress: '14 Linking Road, Bandra West, Mumbai, Maharashtra 400050',
    primaryTypeDisplayName: 'Skin Care Clinic',
    businessStatus: 'OPERATIONAL',
    internationalPhoneNumber: '+91 98201 44510',
    nationalPhoneNumber: '098201 44510',
    websiteUri: 'https://auraskinstudio.in',
    googleMapsUri: 'https://maps.google.com/?q=19.0607,72.8362',
    rating: 4.8,
    userRatingCount: 214,
    location: { lat: 19.0607, lng: 72.8362 },
    weekdayDescriptions: [
      'Monday: 10:00 AM – 8:00 PM',
      'Tuesday: 10:00 AM – 8:00 PM',
      'Wednesday: 10:00 AM – 8:00 PM',
      'Thursday: 10:00 AM – 8:00 PM',
      'Friday: 10:00 AM – 8:00 PM',
      'Saturday: 10:00 AM – 7:00 PM',
      'Sunday: Closed',
    ],
    parsedWorkingDays: {
      mon: { enabled: true, open: '10:00', close: '20:00' },
      tue: { enabled: true, open: '10:00', close: '20:00' },
      wed: { enabled: true, open: '10:00', close: '20:00' },
      thu: { enabled: true, open: '10:00', close: '20:00' },
      fri: { enabled: true, open: '10:00', close: '20:00' },
      sat: { enabled: true, open: '10:00', close: '19:00' },
      sun: { enabled: false, open: '10:00', close: '16:00' },
    },
    editorialSummary:
      'Dermatologist-led laser rejuvenation, HydraFacial treatments, and personalised skincare memberships in Bandra West.',
    directionsUri: 'https://maps.google.com/?daddr=19.0607,72.8362',
    writeAReviewUri: 'https://maps.google.com/?q=Aura+Skin+Laser+Studio+Bandra',
    reviewsUri: 'https://maps.google.com/?q=Aura+Skin+Laser+Studio+Bandra',
    timeZoneId: 'Asia/Kolkata',
  },
  demo_place_soma_koramangala: {
    id: 'demo_place_soma_koramangala',
    displayName: 'Soma Wellness & Dental — Koramangala Annex',
    formattedAddress: '80 Feet Road, 4th Block Koramangala, Bengaluru, Karnataka 560034',
    primaryTypeDisplayName: 'Dental Clinic',
    businessStatus: 'OPERATIONAL',
    internationalPhoneNumber: '+91 98450 99100',
    nationalPhoneNumber: '098450 99100',
    websiteUri: 'https://somawellness.in',
    googleMapsUri: 'https://maps.google.com/?q=12.9352,77.6245',
    rating: 4.8,
    userRatingCount: 129,
    location: { lat: 12.9352, lng: 77.6245 },
    weekdayDescriptions: [
      'Monday: 9:00 AM – 7:00 PM',
      'Tuesday: 9:00 AM – 7:00 PM',
      'Wednesday: 9:00 AM – 7:00 PM',
      'Thursday: 9:00 AM – 7:00 PM',
      'Friday: 9:00 AM – 7:00 PM',
      'Saturday: 10:00 AM – 6:00 PM',
      'Sunday: Closed',
    ],
    parsedWorkingDays: { ...DEFAULT_WORKING_DAYS },
    editorialSummary: 'Preventive & cosmetic dentistry clinic in Koramangala.',
    directionsUri: 'https://maps.google.com/?daddr=12.9352,77.6245',
    writeAReviewUri: 'https://maps.google.com/?q=Soma+Wellness+Koramangala',
    reviewsUri: 'https://maps.google.com/?q=Soma+Wellness+Koramangala',
    timeZoneId: 'Asia/Kolkata',
  },
};

function normalizeText(v: string): string {
  return String(v || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizePhoneDigits(phone: string): string {
  return String(phone || '').replace(/\D/g, '');
}

function normalizeUrlForCompare(raw: string): string {
  const trimmed = String(raw || '').trim().toLowerCase();
  if (!trimmed) return '';
  return trimmed.replace(/^https?:\/\/(www\.)?/, '').replace(/\/+$/, '');
}

function computeDemoAccuracyAudit(
  master: MasterProfileSnapshot,
  livePlace: LiveGooglePlaceDetails | null
): ProfileAccuracyAudit {
  const checks: ProfileAuditCheck[] = [];

  if (!livePlace) {
    const hasCore = Boolean(master.businessName && master.address && master.phone);
    const hasBooking = Boolean(master.appointmentBookingUrl && master.servicesSummary.length > 0);
    checks.push(
      {
        fieldKey: 'google_link',
        label: 'Google Public Listing Link',
        masterValue: 'Master Profile ready',
        googleValue: 'Not linked yet',
        status: 'needs_setup',
        recommendation:
          'Search and link your Google Public Profile above to compare live Google Search & Maps data.',
      },
      {
        fieldKey: 'business_details',
        label: 'Master Contact & Address',
        masterValue: `${master.businessName} · ${master.address || 'Missing address'} · ${master.phone || 'Missing phone'}`,
        googleValue: 'Pending Google link',
        status: hasCore ? 'matched' : 'needs_setup',
        recommendation: 'Core Name, Address, and Phone are complete in your Master Profile.',
      },
      {
        fieldKey: 'booking_lead_capture',
        label: '24/7 Google Booking Link',
        masterValue: master.appointmentBookingUrl || 'Not configured',
        googleValue: 'Ready to paste into Google Booking URL',
        status: hasBooking ? 'matched' : 'needs_setup',
        recommendation:
          'Add this direct booking URL to your Google Business Profile so visitors convert 24/7.',
      }
    );
    const matchedCount = checks.filter((c) => c.status === 'matched').length;
    return {
      accuracyScore: Math.round((matchedCount / checks.length) * 100),
      matchedCount,
      totalChecks: checks.length,
      checks,
      auditedAt: new Date().toISOString(),
    };
  }

  const nameMatch = normalizeText(master.businessName) === normalizeText(livePlace.displayName);
  checks.push({
    fieldKey: 'businessName',
    label: 'Business Name',
    masterValue: master.businessName,
    googleValue: livePlace.displayName,
    status: nameMatch ? 'matched' : 'mismatch',
    recommendation: nameMatch
      ? 'Exact match on Google Search & Maps.'
      : 'Align your business name between Deskline Master Profile and Google Business Profile.',
  });

  const isOperational = livePlace.businessStatus === 'OPERATIONAL';
  checks.push({
    fieldKey: 'businessStatus',
    label: 'Operational Status',
    masterValue: 'Open & Accepting Bookings',
    googleValue: livePlace.businessStatus,
    status: isOperational ? 'matched' : 'mismatch',
    recommendation: 'Listing is actively marked OPERATIONAL on Google.',
  });

  const mAddr = normalizeText(master.address);
  const gAddr = normalizeText(livePlace.formattedAddress);
  const addrMatch = Boolean(mAddr && gAddr) && (mAddr === gAddr || gAddr.includes(mAddr) || mAddr.includes(gAddr));
  checks.push({
    fieldKey: 'address',
    label: 'Business Address',
    masterValue: master.address,
    googleValue: livePlace.formattedAddress,
    status: addrMatch ? 'matched' : 'mismatch',
    recommendation: addrMatch
      ? 'Address matches your verified Google Maps pin.'
      : 'Copy the verified address so walk-in directions never point to the wrong location.',
  });

  const mDigits = normalizePhoneDigits(master.phone || master.whatsappPhone);
  const gDigits = normalizePhoneDigits(livePlace.internationalPhoneNumber || livePlace.nationalPhoneNumber);
  const phoneMatch =
    Boolean(mDigits && gDigits) &&
    (mDigits === gDigits || mDigits.endsWith(gDigits.slice(-10)) || gDigits.endsWith(mDigits.slice(-10)));
  checks.push({
    fieldKey: 'phone',
    label: 'Phone / WhatsApp Number',
    masterValue: master.phone || master.whatsappPhone,
    googleValue: livePlace.internationalPhoneNumber || livePlace.nationalPhoneNumber,
    status: phoneMatch ? 'matched' : 'mismatch',
    recommendation: phoneMatch
      ? 'Phone number matches across Google & Deskline.'
      : 'Mismatch detected: Google still shows an older landline. Pull Google phone or update GBP using the Bulk Export CSV so call leads never bounce.',
  });

  const mUrl = normalizeUrlForCompare(master.websiteUrl);
  const gUrl = normalizeUrlForCompare(livePlace.websiteUri);
  const urlMatch = Boolean(mUrl && gUrl) && mUrl.split('/')[0] === gUrl.split('/')[0];
  checks.push({
    fieldKey: 'websiteUrl',
    label: 'Website URL',
    masterValue: master.websiteUrl,
    googleValue: livePlace.websiteUri,
    status: urlMatch ? 'matched' : 'mismatch',
    recommendation: urlMatch
      ? 'Website domain is consistent with Google.'
      : 'Ensure your Google website points to your active website or Deskline Master Public Profile.',
  });

  let hoursMatch = false;
  if (livePlace.parsedWorkingDays) {
    let dayMatches = 0;
    for (const { key } of ORDERED_DAYS) {
      const m = master.workingDays?.[key];
      const g = livePlace.parsedWorkingDays[key];
      if (m && g && m.enabled === g.enabled && (!m.enabled || (m.open === g.open && m.close === g.close))) {
        dayMatches++;
      }
    }
    hoursMatch = dayMatches >= 7;
  }
  checks.push({
    fieldKey: 'workingDays',
    label: 'Weekly Operating Hours',
    masterValue: formatWorkingDaysSummary(master.workingDays),
    googleValue: livePlace.weekdayDescriptions.join(' | '),
    status: hoursMatch ? 'matched' : 'mismatch',
    recommendation: hoursMatch
      ? 'Operating hours match your Deskline booking availability.'
      : 'Saturday hours differ (Google shows 3:00 PM close vs Deskline 6:00 PM). Sync hours so Google does not mark you Closed during open slots.',
  });

  const leadCaptureReady = Boolean(master.appointmentBookingUrl) && master.servicesSummary.length > 0 && master.leadCaptureEnabled;
  checks.push({
    fieldKey: 'appointmentBookingUrl',
    label: '24/7 Booking & Lead Capture',
    masterValue: master.appointmentBookingUrl,
    googleValue: `${master.servicesSummary.length} bookable services · ${master.packagesSummary.length} offers ready`,
    status: leadCaptureReady ? 'matched' : 'needs_setup',
    recommendation:
      'Direct 24/7 AI Booking URL & LocalBusiness JSON-LD are active to capture every Google lead.',
  });

  const matchedCount = checks.filter((c) => c.status === 'matched').length;
  return {
    accuracyScore: Math.round((matchedCount / checks.length) * 100),
    matchedCount,
    totalChecks: checks.length,
    checks,
    auditedAt: new Date().toISOString(),
  };
}

function buildDemoJsonLd(slug: string, master: MasterProfileSnapshot): Record<string, unknown> {
  const origin = getAppOrigin();
  const publicUrl = `${origin}/?profile=${encodeURIComponent(slug)}`;
  const bookingUrl =
    master.appointmentBookingUrl || `${origin}/?widget=${encodeURIComponent(slug)}&source=google_profile`;

  return {
    '@context': 'https://schema.org',
    '@type': master.primaryCategory.toLowerCase().includes('dental') ? 'Dentist' : 'MedicalClinic',
    name: master.businessName,
    description: master.description,
    url: master.websiteUrl || publicUrl,
    sameAs: [publicUrl],
    telephone: master.phone || master.whatsappPhone,
    email: master.email,
    address: {
      '@type': 'PostalAddress',
      streetAddress: master.address,
      addressCountry: master.serviceArea || 'India',
    },
    openingHoursSpecification: ORDERED_DAYS.filter(({ key }) => master.workingDays?.[key]?.enabled).map(
      ({ key, schemaDay }) => ({
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: schemaDay,
        opens: master.workingDays[key].open,
        closes: master.workingDays[key].close,
      })
    ),
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      name: `${master.businessName} Services & Packages`,
      itemListElement: master.servicesSummary.map((s) => ({
        '@type': 'Offer',
        itemOffered: {
          '@type': 'Service',
          name: s.name,
          description: s.description,
        },
        price: String(s.price),
        priceCurrency: s.currency || 'INR',
        availability: 'https://schema.org/InStock',
        url: bookingUrl,
      })),
    },
    potentialAction: {
      '@type': 'ReserveAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: bookingUrl,
      },
      result: {
        '@type': 'Reservation',
        name: `Book Appointment at ${master.businessName}`,
      },
    },
  };
}

function createInitialState(): DemoState {
  const origin = getAppOrigin();

  const somaBusiness: BusinessRecord = {
    id: 1,
    ownerUid: DEMO_USER_PROFILE.uid,
    slug: 'soma-wellness',
    businessName: 'Soma Wellness & Dental',
    businessEmail: 'care@somawellness.in',
    contactPerson: 'Dr. Meera Nair',
    country: 'India',
    timezone: 'Asia/Kolkata',
    businessCategory: 'Healthcare',
    websiteUrl: 'https://somawellness.in',
    whatsappPhone: '+91 98450 99100',
    description:
      'Preventive dentistry, digital smile diagnostics, and restorative dental wellness studio in Indiranagar, Bengaluru. Open Mon–Sat with transparent pricing and painless care.',
    address: '42, 100 Feet Road, HAL 2nd Stage, Indiranagar, Bengaluru, Karnataka 560038',
    currency: 'INR',
    subscriptionPlan: 'growth',
    status: 'active',
    isDemoPublic: true,
    agentName: 'Maya',
    agentGreeting:
      'Hi! Welcome to Soma Wellness & Dental. I am Maya, your 24/7 AI receptionist. How can I help you book or explore treatments today?',
    agentPersonality:
      'Warm, calm, clinically reassuring, and concise. Always confirm date, time, and contact info before booking.',
    agentInstructions:
      'Highlight the First-Time Consultation + Cleaning Combo when new visitors ask for both a check-up and scaling.',
    bookingPolicy:
      'Arrive 10 minutes before your scheduled slot. Free cancellation or rescheduling up to 12 hours prior.',
    escalationPolicy:
      'Escalate immediately for dental emergencies, insurance reimbursement paperwork, or requests to speak directly with Dr. Meera Nair.',
    widgetBrandColor: '#0F766E',
    reminder24h: true,
    reminder2h: true,
    onboardingStep: 8,
    tokenUsage: 148200,
    messageCount: 1246,
    createdAt: isoTimestampOffset(-24 * 90),
  };

  const auraBusiness: BusinessRecord = {
    id: 2,
    ownerUid: DEMO_USER_PROFILE.uid,
    slug: 'aura-skin-studio',
    businessName: 'Aura Skin & Laser Studio',
    businessEmail: 'hello@auraskinstudio.in',
    contactPerson: 'Dr. Rohan Kulkarni',
    country: 'India',
    timezone: 'Asia/Kolkata',
    businessCategory: 'Beauty & Wellness',
    websiteUrl: 'https://auraskinstudio.in',
    whatsappPhone: '+91 98201 44510',
    description:
      'Dermatologist-led laser rejuvenation, HydraFacial clinical facials, and personalised skin memberships in Bandra West, Mumbai.',
    address: '14 Linking Road, Bandra West, Mumbai, Maharashtra 400050',
    currency: 'INR',
    subscriptionPlan: 'enterprise',
    status: 'active',
    isDemoPublic: false,
    agentName: 'Aria',
    agentGreeting:
      'Welcome to Aura Skin & Laser Studio! Ask me about skin consultations, HydraFacials, laser packages, or live slots.',
    agentPersonality: 'Refined, warm, consultative, and transparent on downtime and preparation.',
    agentInstructions: 'Recommend a Skin Assessment Consultation before first laser sessions.',
    bookingPolicy: 'Free reschedule up to 24 hours before your treatment.',
    escalationPolicy: 'Transfer medical allergy or post-procedure queries to our nursing desk.',
    widgetBrandColor: '#0F766E',
    reminder24h: true,
    reminder2h: true,
    onboardingStep: 8,
    tokenUsage: 92400,
    messageCount: 834,
    createdAt: isoTimestampOffset(-24 * 60),
  };

  const services: ServiceRecord[] = [
    {
      id: 101,
      businessId: 1,
      name: 'General Consultation',
      description: '30-minute comprehensive oral exam, digital X-ray review, and personalised treatment roadmap.',
      category: 'Consultations',
      durationMinutes: 30,
      price: 500,
      currency: 'INR',
      bufferMinutes: 10,
      staffMember: 'Dr. Meera Nair',
      advancePaymentRequired: false,
      allowDirectBooking: true,
      isActive: true,
    },
    {
      id: 102,
      businessId: 1,
      name: 'Premium Consultation & 3D Scan',
      description: '60-minute deep-dive specialist assessment with intraoral 3D digital scan and smile simulation.',
      category: 'Consultations',
      durationMinutes: 60,
      price: 1000,
      currency: 'INR',
      bufferMinutes: 15,
      staffMember: 'Dr. Meera Nair',
      advancePaymentRequired: false,
      allowDirectBooking: true,
      isActive: true,
    },
    {
      id: 103,
      businessId: 1,
      name: 'Full Preventive Cleaning & Polish',
      description: '90-minute ultrasonic scaling, airflow stain removal, enamel polishing, and gum wellness check.',
      category: 'Preventive Care',
      durationMinutes: 90,
      price: 2500,
      currency: 'INR',
      bufferMinutes: 15,
      staffMember: 'Dr. Karthik Menon',
      advancePaymentRequired: false,
      allowDirectBooking: true,
      isActive: true,
    },
    {
      id: 104,
      businessId: 1,
      name: 'Smile Whitening Therapy',
      description: '60-minute sensitivity-safe LED whitening treatment brightening teeth by 3–5 shades in one visit.',
      category: 'Cosmetic Dentistry',
      durationMinutes: 60,
      price: 3500,
      currency: 'INR',
      bufferMinutes: 15,
      staffMember: 'Dr. Ananya Rao',
      advancePaymentRequired: true,
      allowDirectBooking: true,
      isActive: true,
    },
    // Aura Skin Studio services
    {
      id: 201,
      businessId: 2,
      name: 'Dermatologist Skin Assessment',
      description: '30-minute VISIA digital skin scan and custom regimen plan.',
      category: 'Consultations',
      durationMinutes: 30,
      price: 900,
      currency: 'INR',
      bufferMinutes: 10,
      staffMember: 'Dr. Rohan Kulkarni',
      advancePaymentRequired: false,
      allowDirectBooking: true,
      isActive: true,
    },
    {
      id: 202,
      businessId: 2,
      name: 'Signature Clinical HydraFacial',
      description: '60-minute deep exfoliation, vortex extraction, and peptide infusion.',
      category: 'Clinical Facials',
      durationMinutes: 60,
      price: 4500,
      currency: 'INR',
      bufferMinutes: 15,
      staffMember: 'Dr. Sana Deshmukh',
      advancePaymentRequired: true,
      allowDirectBooking: true,
      isActive: true,
    },
  ];

  const packages: PackageRecord[] = [
    {
      id: 301,
      businessId: 1,
      name: '5-Session Wellness Care Pack',
      description: 'Ideal for ongoing preventive hygiene, follow-ups, and whitening touch-ups.',
      includedServices: '2x Preventive Cleanings, 2x General Consultations, 1x Fluoride Shield',
      sessionCount: 5,
      price: 4200,
      currency: 'INR',
      validityDays: 180,
      conditions: 'Shareable with immediate family members. Book sessions anytime via WhatsApp or web.',
      isActive: true,
    },
    {
      id: 302,
      businessId: 1,
      name: 'First-Time Consultation + Cleaning Combo',
      description: 'Popular starter offer combining full exam, X-ray review, and ultrasonic scaling.',
      includedServices: 'General Consultation + Full Preventive Cleaning & Polish',
      sessionCount: 2,
      price: 2200,
      currency: 'INR',
      validityDays: 45,
      conditions: 'Available for new and returning guests who have not visited in 6+ months.',
      isActive: true,
    },
    {
      id: 303,
      businessId: 1,
      name: 'Annual Family Dental Membership',
      description: 'Complete preventive protection for up to 3 family members all year.',
      includedServices: '6x Consultations, 3x Cleanings, 15% off Cosmetic Treatments',
      sessionCount: 9,
      price: 7500,
      currency: 'INR',
      validityDays: 365,
      conditions: 'Priority weekend booking slots included.',
      isActive: true,
    },
    {
      id: 304,
      businessId: 2,
      name: 'Bridal Glow 4-Session Pack',
      description: '4 monthly HydraFacial + LED phototherapy sessions.',
      includedServices: '4x Clinical HydraFacial + Dermatologist Review',
      sessionCount: 4,
      price: 15500,
      currency: 'INR',
      validityDays: 150,
      conditions: 'Includes complimentary home-care SPF kit.',
      isActive: true,
    },
  ];

  const customers: DemoCustomerRaw[] = [
    { id: 401, businessId: 1, name: 'Rahul Sharma', phone: '+91 98451 10245', email: 'rahul.sharma@example.com', notes: 'Prefers morning slots', preferredService: 'General Consultation', source: 'booking', marketingOptIn: true, createdAt: isoTimestampOffset(-24 * 120) },
    { id: 402, businessId: 1, name: 'Priya Menon', phone: '+91 98802 33412', email: 'priya.menon@example.com', notes: 'Interested in whitening combo', preferredService: 'Smile Whitening Therapy', source: 'booking', marketingOptIn: true, createdAt: isoTimestampOffset(-24 * 110) },
    { id: 403, businessId: 1, name: 'Vikramaditya Rao', phone: '+91 99001 77421', email: 'vikram.rao@example.com', notes: 'Family membership holder', preferredService: 'Full Preventive Cleaning & Polish', source: 'booking', marketingOptIn: true, createdAt: isoTimestampOffset(-24 * 98) },
    { id: 404, businessId: 1, name: 'Neha Kapoor', phone: '+91 97400 55109', email: 'neha.kapoor@example.com', notes: 'Asked about corporate insurance invoice', preferredService: 'Premium Consultation & 3D Scan', source: 'booking', marketingOptIn: true, createdAt: isoTimestampOffset(-24 * 85) },
    { id: 405, businessId: 1, name: 'Arjun Deshpande', phone: '+91 98452 66210', email: 'arjun.d@example.com', notes: 'Found clinic via Google Maps profile', preferredService: 'Full Preventive Cleaning & Polish', source: 'booking', marketingOptIn: true, createdAt: isoTimestampOffset(-24 * 72) },
    { id: 406, businessId: 1, name: 'Sneha Iyer', phone: '+91 96114 88320', email: 'sneha.iyer@example.com', notes: 'Regular 6-month scaling visitor', preferredService: 'Full Preventive Cleaning & Polish', source: 'booking', marketingOptIn: true, createdAt: isoTimestampOffset(-24 * 64) },
    { id: 407, businessId: 1, name: 'Karthik Subramanian', phone: '+91 99805 12904', email: 'karthik.sub@example.com', notes: 'Booked via Google Business booking link', preferredService: 'Smile Whitening Therapy', source: 'booking', marketingOptIn: true, createdAt: isoTimestampOffset(-24 * 50) },
    { id: 408, businessId: 1, name: 'Anjali Verma', phone: '+91 98456 44123', email: 'anjali.verma@example.com', notes: 'Sensitive teeth — warm water rinse', preferredService: 'General Consultation', source: 'booking', marketingOptIn: true, createdAt: isoTimestampOffset(-24 * 40) },
    { id: 409, businessId: 1, name: 'Siddharth Joshi', phone: '+91 99012 90876', email: 'siddharth.j@example.com', notes: 'WhatsApp repeat client', preferredService: 'Premium Consultation & 3D Scan', source: 'booking', marketingOptIn: true, createdAt: isoTimestampOffset(-24 * 25) },
    { id: 410, businessId: 1, name: 'Divya Krishnan', phone: '+91 98861 23451', email: 'divya.krishnan@example.com', notes: 'Google Search lead', preferredService: 'General Consultation', source: 'booking', marketingOptIn: true, createdAt: isoTimestampOffset(-24 * 12) },
    { id: 411, businessId: 1, name: 'Rohan Malhotra', phone: '+91 98459 31204', email: 'rohan.malhotra@example.com', notes: 'Imported from legacy clinic CRM', preferredService: 'Full Preventive Cleaning & Polish', source: 'imported_database', marketingOptIn: true, createdAt: isoTimestampOffset(-24 * 30) },
    { id: 412, businessId: 1, name: 'Meenakshi Sundaram', phone: '+91 97390 11882', email: 'meenakshi.s@example.com', notes: 'Imported from legacy clinic CRM', preferredService: 'General Consultation', source: 'imported_database', marketingOptIn: true, createdAt: isoTimestampOffset(-24 * 30) },
    { id: 413, businessId: 1, name: 'Aakash Kulkarni', phone: '+91 99455 77190', email: 'aakash.k@example.com', notes: 'Imported from legacy clinic CRM', preferredService: 'Smile Whitening Therapy', source: 'imported_database', marketingOptIn: true, createdAt: isoTimestampOffset(-24 * 30) },
    { id: 414, businessId: 1, name: 'Pooja Bhatia', phone: '+91 98450 22719', email: 'pooja.bhatia@example.com', notes: 'Imported from existing patient register', preferredService: 'Full Preventive Cleaning & Polish', source: 'imported_database', marketingOptIn: true, createdAt: isoTimestampOffset(-24 * 29) },
    { id: 415, businessId: 1, name: 'Nikhil Gowda', phone: '+91 99860 66102', email: 'nikhil.gowda@example.com', notes: 'Imported from existing patient register', preferredService: 'Premium Consultation & 3D Scan', source: 'imported_database', marketingOptIn: true, createdAt: isoTimestampOffset(-24 * 29) },
    { id: 416, businessId: 1, name: 'Shruti Hegde', phone: '+91 96320 44812', email: 'shruti.hegde@example.com', notes: 'Imported from existing patient register', preferredService: 'Smile Whitening Therapy', source: 'imported_database', marketingOptIn: true, createdAt: isoTimestampOffset(-24 * 28) },
    { id: 417, businessId: 1, name: 'Deepak Chawla', phone: '+91 98451 90334', email: 'deepak.chawla@example.com', notes: 'Email-only update preference', preferredService: 'General Consultation', source: 'imported_database', marketingOptIn: true, createdAt: isoTimestampOffset(-24 * 28) },
    { id: 418, businessId: 1, name: 'Kavitha Reddy', phone: '+91 99002 55318', email: 'kavitha.reddy@example.com', notes: 'Opted out of promo offers', preferredService: 'General Consultation', source: 'imported_database', marketingOptIn: false, createdAt: isoTimestampOffset(-24 * 27) },
    // Aura Skin Studio customers
    { id: 451, businessId: 2, name: 'Tara Fernandes', phone: '+91 98204 51200', email: 'tara.f@example.com', notes: 'Monthly HydraFacial client', preferredService: 'Signature Clinical HydraFacial', source: 'booking', marketingOptIn: true, createdAt: isoTimestampOffset(-24 * 45) },
    { id: 452, businessId: 2, name: 'Kabir Oberoi', phone: '+91 98211 88420', email: 'kabir.o@example.com', notes: 'Booked from Google Profile', preferredService: 'Dermatologist Skin Assessment', source: 'booking', marketingOptIn: true, createdAt: isoTimestampOffset(-24 * 18) },
  ];

  const findCust = (id: number) => customers.find((c) => c.id === id)!;
  const makeAppt = (
    id: number,
    ref: string,
    custId: number,
    svcId: number,
    daysOffset: number,
    startTime: string,
    status: string,
    paymentStatus: string,
    channel: string,
    notes = ''
  ): AppointmentRecord => {
    const c = findCust(custId);
    const s = services.find((sv) => sv.id === svcId)!;
    const endTime = minutesToTime(timeToMinutes(startTime) + s.durationMinutes);
    return {
      id,
      bookingRef: ref,
      serviceId: s.id,
      serviceName: s.name,
      price: s.price,
      currency: s.currency,
      staffMember: s.staffMember,
      appointmentDate: isoDateOffset(daysOffset),
      startTime,
      endTime,
      bookingStatus: status,
      paymentStatus,
      channel,
      notes,
      createdAt: isoTimestampOffset(daysOffset * 24 - 12),
      customerId: c.id,
      customerName: c.name,
      customerEmail: c.email,
      customerPhone: c.phone,
    };
  };

  // Rich appointment dataset spanning 6 months, 8 weeks, 14 days, today, tomorrow & upcoming!
  const appointments: AppointmentRecord[] = [
    // Tomorrow & Upcoming
    makeAppt(501, 'AP10245', 401, 101, 1, '10:30', 'confirmed', 'unpaid', 'whatsapp', 'Follow-up dental check-up'),
    makeAppt(502, 'AP10246', 402, 104, 1, '14:30', 'confirmed', 'paid', 'website', 'Pre-wedding whitening session'),
    makeAppt(503, 'AP10247', 405, 103, 2, '11:00', 'confirmed', 'unpaid', 'google_profile', 'Booked directly from Google Public Profile'),
    makeAppt(504, 'AP10248', 409, 102, 3, '16:00', 'confirmed', 'pending', 'whatsapp', '3D smile scan requested'),
    makeAppt(505, 'AP10249', 410, 101, 4, '10:00', 'confirmed', 'unpaid', 'google_profile', 'Google Search direct booking'),
    // Today
    makeAppt(506, 'AP10242', 403, 103, 0, '09:30', 'completed', 'paid', 'whatsapp', '6-month preventive polish'),
    makeAppt(507, 'AP10243', 407, 104, 0, '11:30', 'confirmed', 'paid', 'google_profile', 'Booked via Google Maps listing'),
    makeAppt(508, 'AP10244', 408, 101, 0, '15:00', 'confirmed', 'unpaid', 'website', 'Sensitivity check'),
    // Last 14 days (Daily & Weekly MIS richness)
    makeAppt(509, 'AP10239', 406, 103, -1, '10:00', 'completed', 'paid', 'whatsapp', 'Routine cleaning'),
    makeAppt(510, 'AP10238', 404, 102, -2, '15:30', 'completed', 'paid', 'website', '3D diagnostic scan'),
    makeAppt(511, 'AP10237', 402, 101, -3, '11:00', 'rescheduled', 'unpaid', 'whatsapp', 'Moved from morning to afternoon'),
    makeAppt(512, 'AP10236', 405, 104, -5, '16:00', 'completed', 'paid', 'google_profile', 'Whitening session'),
    makeAppt(513, 'AP10235', 401, 103, -6, '10:30', 'cancelled', 'unpaid', 'website', 'Travel conflict — cancelled 18h prior'),
    makeAppt(514, 'AP10234', 409, 103, -9, '14:00', 'completed', 'paid', 'whatsapp', 'Preventive scaling'),
    makeAppt(515, 'AP10233', 403, 102, -12, '11:30', 'completed', 'paid', 'dashboard', 'Walk-in front-desk booking'),
    // Previous 2–8 weeks (Weekly & Monthly MIS)
    makeAppt(516, 'AP10228', 407, 103, -18, '10:00', 'completed', 'paid', 'google_profile', 'Google Maps discovery'),
    makeAppt(517, 'AP10224', 406, 104, -24, '15:00', 'completed', 'paid', 'website', 'LED whitening'),
    makeAppt(518, 'AP10219', 404, 103, -34, '11:00', 'completed', 'paid', 'whatsapp', 'Cleaning & polish'),
    makeAppt(519, 'AP10212', 408, 102, -46, '16:00', 'completed', 'paid', 'website', 'Specialist review'),
    makeAppt(520, 'AP10205', 401, 104, -68, '10:30', 'completed', 'paid', 'whatsapp', 'Whitening package'),
    makeAppt(521, 'AP10198', 402, 103, -95, '14:30', 'completed', 'paid', 'google_profile', 'Preventive visit'),
    makeAppt(522, 'AP10191', 403, 102, -125, '11:00', 'completed', 'paid', 'dashboard', 'Annual review'),
    // Aura Skin Studio appointments
    makeAppt(551, 'AP20101', 451, 202, 1, '12:00', 'confirmed', 'paid', 'whatsapp', 'Monthly glow facial'),
    makeAppt(552, 'AP20102', 452, 201, 0, '15:00', 'confirmed', 'unpaid', 'google_profile', 'Found via Google Search'),
    makeAppt(553, 'AP20103', 451, 202, -14, '11:00', 'completed', 'paid', 'website', 'HydraFacial session'),
  ];

  const conversations: ConversationRecord[] = [
    {
      id: 601,
      businessId: 1,
      customerId: 404,
      sessionKey: 'web_neha_01',
      customerName: 'Neha Kapoor',
      customerPhone: '+91 97400 55109',
      channel: 'website',
      status: 'human_takeover',
      escalationReason: 'Customer requested itemized corporate dental insurance reimbursement letter.',
      assignedTo: 'Front Desk',
      messagesJson: [
        {
          id: 'm1',
          role: 'customer',
          text: 'Hi, I had a Premium Consultation & 3D Scan two days ago. Can you issue a stamped invoice for my corporate insurance claim?',
          timestamp: isoTimestampOffset(-2.2),
        },
        {
          id: 'm2',
          role: 'ai',
          text: 'Hello Neha! I have flagged your request for our front-desk coordinator so they can prepare your stamped itemized invoice and email it to neha.kapoor@example.com shortly.',
          timestamp: isoTimestampOffset(-2.1),
          toolActions: ['Escalated to human receptionist'],
        },
        {
          id: 'm3',
          role: 'customer',
          text: 'Thank you! Please include the clinic GST and DCI registration number as well.',
          timestamp: isoTimestampOffset(-1.8),
        },
      ],
      lastMessageAt: isoTimestampOffset(-1.8),
      createdAt: isoTimestampOffset(-2.2),
    },
    {
      id: 602,
      businessId: 1,
      customerId: 401,
      sessionKey: 'wa_919845110245',
      customerName: 'Rahul Sharma',
      customerPhone: '+91 98451 10245',
      channel: 'whatsapp',
      status: 'resolved',
      escalationReason: '',
      assignedTo: '',
      messagesJson: [
        {
          id: 'm4',
          role: 'customer',
          text: 'Hi, can I book a General Consultation for tomorrow morning?',
          timestamp: isoTimestampOffset(-6),
        },
        {
          id: 'm5',
          role: 'ai',
          text: 'Hi Rahul! Tomorrow morning we have openings at 9:30 AM, 10:30 AM, and 11:30 AM with Dr. Meera Nair (₹500, 30 mins). Which slot works best?',
          timestamp: isoTimestampOffset(-5.95),
          toolActions: ['Checked live slots'],
        },
        {
          id: 'm6',
          role: 'customer',
          text: '10:30 AM works great, please confirm!',
          timestamp: isoTimestampOffset(-5.9),
        },
        {
          id: 'm7',
          role: 'ai',
          text: 'Your General Consultation is confirmed for tomorrow at 10:30 AM with Dr. Meera Nair. Your booking reference is AP10245. We will send a WhatsApp reminder 2 hours before!',
          timestamp: isoTimestampOffset(-5.88),
          toolActions: ['Confirmed booking AP10245'],
        },
      ],
      lastMessageAt: isoTimestampOffset(-5.88),
      createdAt: isoTimestampOffset(-6),
    },
    {
      id: 603,
      businessId: 1,
      customerId: 405,
      sessionKey: 'gp_arjun_01',
      customerName: 'Arjun Deshpande',
      customerPhone: '+91 98452 66210',
      channel: 'google_profile',
      status: 'ai_active',
      escalationReason: '',
      assignedTo: '',
      messagesJson: [
        {
          id: 'm8',
          role: 'customer',
          text: 'Found you on Google Maps! Are you open on Saturdays and how much is teeth cleaning?',
          timestamp: isoTimestampOffset(-4),
        },
        {
          id: 'm9',
          role: 'ai',
          text: 'Welcome Arjun! Yes, we are open Saturdays from 10:00 AM to 6:00 PM. Our Full Preventive Cleaning & Polish is 90 minutes for ₹2,500 (or ₹2,200 with our First-Time Consultation + Cleaning Combo). Would you like me to check Saturday slots?',
          timestamp: isoTimestampOffset(-3.98),
          toolActions: ['Checked service catalog'],
        },
      ],
      lastMessageAt: isoTimestampOffset(-3.98),
      createdAt: isoTimestampOffset(-4),
    },
    {
      id: 604,
      businessId: 1,
      customerId: 402,
      sessionKey: 'web_priya_02',
      customerName: 'Priya Menon',
      customerPhone: '+91 98802 33412',
      channel: 'website',
      status: 'resolved',
      escalationReason: '',
      assignedTo: '',
      messagesJson: [
        {
          id: 'm10',
          role: 'customer',
          text: 'Does Smile Whitening cause sensitivity?',
          timestamp: isoTimestampOffset(-14),
        },
        {
          id: 'm11',
          role: 'ai',
          text: 'We use a desensitizing mineral gel before and after our 60-minute LED whitening session (₹3,500), so over 90% of guests feel zero sensitivity. Would you like to reserve a slot with Dr. Ananya Rao?',
          timestamp: isoTimestampOffset(-13.95),
          toolActions: ['Checked service catalog'],
        },
      ],
      lastMessageAt: isoTimestampOffset(-13.95),
      createdAt: isoTimestampOffset(-14),
    },
    {
      id: 651,
      businessId: 2,
      customerId: 451,
      sessionKey: 'wa_919820451200',
      customerName: 'Tara Fernandes',
      customerPhone: '+91 98204 51200',
      channel: 'whatsapp',
      status: 'resolved',
      escalationReason: '',
      assignedTo: '',
      messagesJson: [
        {
          id: 'm20',
          role: 'customer',
          text: 'Confirming my Signature Clinical HydraFacial for tomorrow at 12 PM!',
          timestamp: isoTimestampOffset(-3),
        },
        {
          id: 'm21',
          role: 'ai',
          text: 'Confirmed, Tara! Your ref is AP20101 with Dr. Sana Deshmukh at 12:00 PM tomorrow.',
          timestamp: isoTimestampOffset(-2.98),
          toolActions: ['Confirmed booking AP20101'],
        },
      ],
      lastMessageAt: isoTimestampOffset(-2.98),
      createdAt: isoTimestampOffset(-3),
    },
  ];

  const knowledge: KnowledgeItemRecord[] = [
    {
      id: 701,
      businessId: 1,
      sourceType: 'faq',
      sourceUrl: 'https://somawellness.in/faq',
      title: 'General vs Premium Consultation Difference',
      content:
        'General Consultation (30 mins, ₹500) covers oral examination and X-ray review. Premium Consultation (60 mins, ₹1,000) adds a full 3D intraoral scan, digital smile simulation, and long-term preventive roadmap.',
      isApproved: true,
      updatedAt: isoTimestampOffset(-24 * 15),
    },
    {
      id: 702,
      businessId: 1,
      sourceType: 'policy',
      sourceUrl: 'https://somawellness.in/policies',
      title: 'Cancellation & Rescheduling Policy',
      content:
        'Free cancellation or rescheduling up to 12 hours before your scheduled appointment. Inside 12 hours, a ₹250 late-change fee may apply.',
      isApproved: true,
      updatedAt: isoTimestampOffset(-24 * 14),
    },
    {
      id: 703,
      businessId: 1,
      sourceType: 'faq',
      sourceUrl: 'https://somawellness.in/visit',
      title: 'Parking & Metro Directions',
      content:
        'Dedicated basement valet parking is available behind 42, 100 Feet Road. Indiranagar Metro Station (Purple Line) is a 4-minute walk.',
      isApproved: true,
      updatedAt: isoTimestampOffset(-24 * 10),
    },
    {
      id: 704,
      businessId: 1,
      sourceType: 'website_crawl',
      sourceUrl: 'https://somawellness.in',
      title: 'Insurance & Digital Invoices',
      content:
        'We provide itemized GST-compliant invoices with DCI registration numbers for corporate dental reimbursement plans.',
      isApproved: true,
      updatedAt: isoTimestampOffset(-24 * 8),
    },
    {
      id: 705,
      businessId: 1,
      sourceType: 'faq',
      sourceUrl: 'https://somawellness.in/whitening',
      title: 'Smile Whitening Sensitivity Safety',
      content:
        'Our LED whitening uses sensitivity-safe pH-balanced gel plus post-care mineral serum. Avoid coffee or dark tea for 24 hours after treatment.',
      isApproved: true,
      updatedAt: isoTimestampOffset(-24 * 6),
    },
    {
      id: 706,
      businessId: 2,
      sourceType: 'faq',
      sourceUrl: 'https://auraskinstudio.in/faq',
      title: 'Pre-HydraFacial Preparation',
      content: 'Pause retinoids and exfoliating acids 48 hours prior to your Signature Clinical HydraFacial.',
      isApproved: true,
      updatedAt: isoTimestampOffset(-24 * 5),
    },
  ];

  const campaigns: CampaignRecord[] = [
    {
      id: 801,
      businessId: 1,
      title: 'Festive Smile Whitening & Scaling Offer',
      campaignType: 'offer',
      channel: 'both',
      subject: 'Returning Patient Perk: ₹800 off Smile Whitening & Cleaning Combo',
      messageBody:
        'Hi {{name}}, thank you for trusting Soma Wellness & Dental! This month, our existing patients enjoy priority slots on our First-Time Consultation + Cleaning Combo (₹2,200) and ₹500 off Smile Whitening. Reply here to reserve your preferred slot.',
      audienceSegment: 'all_existing',
      audienceFilterValue: '',
      attachedPackageId: 302,
      totalTargeted: 17,
      sentEmailCount: 17,
      sentWhatsappCount: 17,
      skippedCount: 0,
      status: 'sent',
      sentAt: isoTimestampOffset(-24 * 5),
      createdAt: isoTimestampOffset(-24 * 5),
    },
    {
      id: 802,
      businessId: 1,
      title: 'Extended Saturday Hours Until 6:00 PM',
      campaignType: 'announcement',
      channel: 'whatsapp',
      subject: 'Now Open Saturdays Until 6:00 PM at Soma Wellness',
      messageBody:
        'Hi {{name}}, quick clinic update from Soma Wellness & Dental — we have extended our Saturday clinic hours until 6:00 PM so weekend check-ups are easier to fit in. Message Maya anytime to grab a Saturday slot!',
      audienceSegment: 'booked_before',
      audienceFilterValue: '',
      attachedPackageId: null,
      totalTargeted: 10,
      sentEmailCount: 0,
      sentWhatsappCount: 10,
      skippedCount: 0,
      status: 'sent',
      sentAt: isoTimestampOffset(-24 * 14),
      createdAt: isoTimestampOffset(-24 * 14),
    },
    {
      id: 803,
      businessId: 1,
      title: '6-Month Preventive Scaling Recall',
      campaignType: 'offer',
      channel: 'email',
      subject: 'Time for your 6-month preventive polish at Soma Wellness',
      messageBody:
        'Hi {{name}}, it has been a few months since your last dental check-up. Lock in our 5-Session Wellness Care Pack (₹4,200, shareable with family) and keep your smile healthy all year.',
      audienceSegment: 'imported_database',
      audienceFilterValue: '',
      attachedPackageId: 301,
      totalTargeted: 7,
      sentEmailCount: 7,
      sentWhatsappCount: 0,
      skippedCount: 0,
      status: 'sent',
      sentAt: isoTimestampOffset(-24 * 22),
      createdAt: isoTimestampOffset(-24 * 22),
    },
  ];

  const somaOptedIn = customers.filter((c) => c.businessId === 1 && c.marketingOptIn);
  const campaignRecipients: CampaignRecipientRecord[] = [
    ...somaOptedIn.map((c, idx) => ({
      id: 8100 + idx,
      campaignId: 801,
      customerId: c.id,
      customerName: c.name,
      email: c.email,
      phone: c.phone,
      emailStatus: 'sent',
      whatsappStatus: 'sent',
      dispatchedAt: isoTimestampOffset(-24 * 5),
    })),
    ...somaOptedIn.slice(0, 10).map((c, idx) => ({
      id: 8200 + idx,
      campaignId: 802,
      customerId: c.id,
      customerName: c.name,
      email: c.email,
      phone: c.phone,
      emailStatus: 'not_applicable',
      whatsappStatus: 'sent',
      dispatchedAt: isoTimestampOffset(-24 * 14),
    })),
    ...somaOptedIn
      .filter((c) => c.source === 'imported_database')
      .map((c, idx) => ({
        id: 8300 + idx,
        campaignId: 803,
        customerId: c.id,
        customerName: c.name,
        email: c.email,
        phone: c.phone,
        emailStatus: 'sent',
        whatsappStatus: 'not_applicable',
        dispatchedAt: isoTimestampOffset(-24 * 22),
      })),
  ];

  const channels: ChannelIntegrationRecord[] = [
    {
      id: 901,
      businessId: 1,
      channelType: 'whatsapp',
      whatsappPhoneNumberId: '104928172635490',
      whatsappBusinessAccountId: '284719204718293',
      metaVerifyToken: 'deskline_soma_demo_verify',
      webhookUrl: '/api/webhooks/whatsapp/soma-wellness',
      connectionStatus: 'connected',
      approvedTemplatesJson: [
        {
          name: 'booking_confirmation',
          category: 'UTILITY',
          status: 'approved',
          body: 'Hi {{1}}, your appointment at Soma Wellness & Dental is confirmed for {{2}} at {{3}}. Ref: {{4}}.',
        },
        {
          name: 'booking_reminder_24h',
          category: 'UTILITY',
          status: 'approved',
          body: 'Reminder: You have an upcoming appointment at Soma Wellness & Dental tomorrow at {{1}}.',
        },
        {
          name: 'existing_customer_offer',
          category: 'MARKETING',
          status: 'approved',
          body: 'Hi {{1}}, as a valued Soma Wellness guest, enjoy our seasonal care offer: {{2}}. Reply BOOK to reserve.',
        },
      ],
      widgetConfigJson: null,
    },
    {
      id: 902,
      businessId: 1,
      channelType: 'website_widget',
      whatsappPhoneNumberId: '',
      whatsappBusinessAccountId: '',
      metaVerifyToken: '',
      webhookUrl: '',
      connectionStatus: 'connected',
      approvedTemplatesJson: [],
      widgetConfigJson: {
        welcomeMessage: somaBusiness.agentGreeting,
        quickPrompts: [
          'Book an appointment',
          'Compare consultations',
          'View packages & offers',
          'Check booking AP10245',
          'Talk to a receptionist',
        ],
        enableWhatsAppHandoff: true,
        position: 'bottom-right',
        brandColor: '#0F766E',
      },
    },
    {
      id: 903,
      businessId: 2,
      channelType: 'whatsapp',
      whatsappPhoneNumberId: '109823746152839',
      whatsappBusinessAccountId: '289174651928374',
      metaVerifyToken: 'deskline_aura_demo_verify',
      webhookUrl: '/api/webhooks/whatsapp/aura-skin-studio',
      connectionStatus: 'connected',
      approvedTemplatesJson: [
        {
          name: 'booking_confirmation',
          category: 'UTILITY',
          status: 'approved',
          body: 'Hi {{1}}, your appointment at Aura Skin & Laser Studio is confirmed for {{2}} at {{3}}. Ref: {{4}}.',
        },
      ],
      widgetConfigJson: null,
    },
    {
      id: 904,
      businessId: 2,
      channelType: 'website_widget',
      whatsappPhoneNumberId: '',
      whatsappBusinessAccountId: '',
      metaVerifyToken: '',
      webhookUrl: '',
      connectionStatus: 'connected',
      approvedTemplatesJson: [],
      widgetConfigJson: {
        welcomeMessage: auraBusiness.agentGreeting,
        quickPrompts: ['Book HydraFacial', 'View skin packages', 'Check tomorrow slots'],
        enableWhatsAppHandoff: true,
        position: 'bottom-right',
        brandColor: '#0F766E',
      },
    },
  ];

  const somaMasterSnapshot: MasterProfileSnapshot = {
    businessName: somaBusiness.businessName,
    primaryCategory: 'Dental Clinic',
    additionalCategories: ['Cosmetic Dentist', 'Preventive Healthcare'],
    description: somaBusiness.description,
    address: somaBusiness.address,
    phone: somaBusiness.whatsappPhone,
    whatsappPhone: somaBusiness.whatsappPhone,
    email: somaBusiness.businessEmail,
    websiteUrl: somaBusiness.websiteUrl,
    appointmentBookingUrl: `${origin}/?widget=soma-wellness&source=google_profile`,
    serviceArea: 'Indiranagar, Koramangala, Bengaluru',
    bookingPolicy: somaBusiness.bookingPolicy,
    workingDays: { ...DEFAULT_WORKING_DAYS },
    holidays: [],
    servicesSummary: services
      .filter((s) => s.businessId === 1)
      .map((s) => ({
        name: s.name,
        category: s.category,
        durationMinutes: s.durationMinutes,
        price: s.price,
        currency: s.currency,
        description: s.description,
      })),
    packagesSummary: packages
      .filter((p) => p.businessId === 1)
      .map((p) => ({
        name: p.name,
        sessionCount: p.sessionCount,
        price: p.price,
        currency: p.currency,
        validityDays: p.validityDays,
        description: p.description,
      })),
    leadCaptureEnabled: true,
    instantWhatsappFallback: true,
  };

  const somaInitialAudit = computeDemoAccuracyAudit(
    somaMasterSnapshot,
    SAMPLE_GOOGLE_PLACES.demo_place_soma_indiranagar
  );

  const auraMasterSnapshot: MasterProfileSnapshot = {
    businessName: auraBusiness.businessName,
    primaryCategory: 'Skin Care Clinic',
    additionalCategories: ['Laser Hair Removal Service', 'Medical Spa'],
    description: auraBusiness.description,
    address: auraBusiness.address,
    phone: auraBusiness.whatsappPhone,
    whatsappPhone: auraBusiness.whatsappPhone,
    email: auraBusiness.businessEmail,
    websiteUrl: auraBusiness.websiteUrl,
    appointmentBookingUrl: `${origin}/?widget=aura-skin-studio&source=google_profile`,
    serviceArea: 'Bandra West, Khar, Mumbai',
    bookingPolicy: auraBusiness.bookingPolicy,
    workingDays: SAMPLE_GOOGLE_PLACES.demo_place_aura_bandra.parsedWorkingDays!,
    holidays: [],
    servicesSummary: services
      .filter((s) => s.businessId === 2)
      .map((s) => ({
        name: s.name,
        category: s.category,
        durationMinutes: s.durationMinutes,
        price: s.price,
        currency: s.currency,
        description: s.description,
      })),
    packagesSummary: packages
      .filter((p) => p.businessId === 2)
      .map((p) => ({
        name: p.name,
        sessionCount: p.sessionCount,
        price: p.price,
        currency: p.currency,
        validityDays: p.validityDays,
        description: p.description,
      })),
    leadCaptureEnabled: true,
    instantWhatsappFallback: true,
  };

  const googleProfiles: Record<number, GoogleProfileRecord> = {
    1: {
      id: 1001,
      businessId: 1,
      googlePlaceId: 'demo_place_soma_indiranagar',
      storeCode: 'SOMA-BLR-01',
      autoSyncFromDeskline: true,
      publicProfileEnabled: true,
      masterProfileJson: somaMasterSnapshot,
      syncHistoryJson: [
        {
          id: 'ev-1',
          timestamp: isoTimestampOffset(-18),
          action: 'live_audit',
          summary:
            'Audited live Google listing — caught 2 mismatches (old landline phone & 3 PM Saturday close on Google).',
          actor: 'meera@somawellness.in',
          accuracyScore: somaInitialAudit.accuracyScore,
        },
        {
          id: 'ev-2',
          timestamp: isoTimestampOffset(-48),
          action: 'copied_deskline_to_master',
          summary:
            'Copied all business details (4 services, 3 packages, Mon–Sat hours & 24/7 Google Booking URL) into Master Profile.',
          actor: 'meera@somawellness.in',
          accuracyScore: somaInitialAudit.accuracyScore,
        },
      ],
      lastCopiedFromDesklineAt: isoTimestampOffset(-48),
      lastAuditedAt: isoTimestampOffset(-18),
      lastAccuracyScore: somaInitialAudit.accuracyScore,
      updatedAt: isoTimestampOffset(-18),
    },
    2: {
      id: 1002,
      businessId: 2,
      googlePlaceId: 'demo_place_aura_bandra',
      storeCode: 'AURA-MUM-01',
      autoSyncFromDeskline: true,
      publicProfileEnabled: true,
      masterProfileJson: auraMasterSnapshot,
      syncHistoryJson: [
        {
          id: 'ev-3',
          timestamp: isoTimestampOffset(-12),
          action: 'copied_google_to_master',
          summary: 'Linked Google Public Profile and verified 100% accuracy across all 7 checks.',
          actor: 'rohan@auraskinstudio.in',
          accuracyScore: 100,
        },
      ],
      lastCopiedFromDesklineAt: isoTimestampOffset(-24),
      lastAuditedAt: isoTimestampOffset(-12),
      lastAccuracyScore: 100,
      updatedAt: isoTimestampOffset(-12),
    },
  };

  const availability: Record<number, AvailabilityRecord> = {
    1: {
      businessId: 1,
      workingDaysJson: { ...DEFAULT_WORKING_DAYS },
      breakStart: '13:00',
      breakEnd: '14:00',
      slotIntervalMinutes: 30,
      minAdvanceHours: 1,
      maxAdvanceDays: 45,
      cancellationWindowHours: 12,
      reschedulingPolicy: 'Free rescheduling up to 12 hours before your appointment.',
      holidaysJson: [],
      blockedSlotsJson: [],
    },
    2: {
      businessId: 2,
      workingDaysJson: SAMPLE_GOOGLE_PLACES.demo_place_aura_bandra.parsedWorkingDays!,
      breakStart: '13:30',
      breakEnd: '14:30',
      slotIntervalMinutes: 30,
      minAdvanceHours: 2,
      maxAdvanceDays: 30,
      cancellationWindowHours: 24,
      reschedulingPolicy: 'Free rescheduling up to 24 hours before your treatment.',
      holidaysJson: [],
      blockedSlotsJson: [],
    },
  };

  const auditLogs: DemoAuditLog[] = [
    {
      id: 1101,
      businessId: 1,
      actorUid: DEMO_USER_PROFILE.uid,
      action: 'google_profile.live_audit',
      entityType: 'google_profile',
      entityId: '1001',
      details: 'Detected 2 field mismatches on Google listing (phone & Saturday closing time)',
      createdAt: isoTimestampOffset(-18),
    },
    {
      id: 1102,
      businessId: 1,
      actorUid: DEMO_USER_PROFILE.uid,
      action: 'campaign.sent',
      entityType: 'campaign',
      entityId: '801',
      details: 'Sent offer "Festive Smile Whitening & Scaling Offer" via both to 17 existing customers',
      createdAt: isoTimestampOffset(-24 * 5),
    },
    {
      id: 1103,
      businessId: 1,
      actorUid: DEMO_USER_PROFILE.uid,
      action: 'customers.imported',
      entityType: 'customer',
      entityId: '1',
      details: 'Imported 8 existing customer contacts from legacy clinic database (cap: 2,000)',
      createdAt: isoTimestampOffset(-24 * 27),
    },
    {
      id: 1104,
      businessId: 2,
      actorUid: DEMO_USER_PROFILE.uid,
      action: 'business.created',
      entityType: 'business',
      entityId: '2',
      details: 'Created tenant Aura Skin & Laser Studio (aura-skin-studio)',
      createdAt: isoTimestampOffset(-24 * 60),
    },
  ];

  return {
    initialized: true,
    nextId: 2000,
    businesses: [somaBusiness, auraBusiness],
    services,
    packages,
    availability,
    channels,
    knowledge,
    customers,
    appointments,
    conversations,
    campaigns,
    campaignRecipients,
    googleProfiles,
    auditLogs,
  };
}

let state: DemoState | null = null;

function getState(): DemoState {
  if (!state) {
    state = createInitialState();
  }
  return state;
}

export function resetDemoStore() {
  state = createInitialState();
}

function nextId(): number {
  const s = getState();
  s.nextId += 1;
  return s.nextId;
}

function addAudit(businessId: number | null, action: string, entityType: string, entityId: string, details: string) {
  const s = getState();
  s.auditLogs.unshift({
    id: nextId(),
    businessId,
    actorUid: DEMO_USER_PROFILE.uid,
    action,
    entityType,
    entityId,
    details,
    createdAt: new Date().toISOString(),
  });
  s.auditLogs = s.auditLogs.slice(0, 40);
}

function getBusinessWorkspace(businessId: number): BusinessWorkspaceData {
  const s = getState();
  const biz = s.businesses.find((b) => b.id === businessId);
  if (!biz) throw new Error('Business not found.');

  const bizServices = s.services.filter((sv) => sv.businessId === businessId);
  const bizPackages = s.packages.filter((p) => p.businessId === businessId);
  const bizChannels = s.channels.filter((c) => c.businessId === businessId);
  const bizKnowledge = s.knowledge.filter((k) => k.businessId === businessId);
  const bizAppts = s.appointments.filter((a) => {
    const cust = s.customers.find((c) => c.id === a.customerId);
    return cust?.businessId === businessId;
  });
  const bizConvs = s.conversations.filter((c) => c.businessId === businessId);
  const bizCustomers = s.customers.filter((c) => c.businessId === businessId);

  const today = isoDateOffset(0);
  const totalAppointments = bizAppts.length;
  const todayAppointments = bizAppts.filter(
    (a) => a.appointmentDate === today && a.bookingStatus !== 'cancelled'
  ).length;
  const upcomingAppointments = bizAppts.filter(
    (a) => a.appointmentDate >= today && a.bookingStatus !== 'cancelled'
  ).length;
  const cancelledAppointments = bizAppts.filter((a) => a.bookingStatus === 'cancelled').length;
  const totalConversations = bizConvs.length;
  const humanEscalations = bizConvs.filter((c) => c.status === 'human_takeover').length;
  const bookedViaChat = bizAppts.filter(
    (a) => a.channel === 'website' || a.channel === 'whatsapp' || a.channel === 'google_profile'
  ).length;
  const conversionRate =
    totalConversations > 0 ? Math.min(94, Math.round((bookedViaChat / Math.max(totalConversations, 1)) * 28 + 42)) : 0;

  return {
    business: biz,
    services: bizServices,
    packages: bizPackages,
    availability: s.availability[businessId] || {
      businessId,
      workingDaysJson: { ...DEFAULT_WORKING_DAYS },
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
    channels: bizChannels,
    knowledge: bizKnowledge,
    metrics: {
      totalAppointments,
      todayAppointments,
      upcomingAppointments,
      cancelledAppointments,
      totalConversations,
      humanEscalations,
      conversionRate,
      totalCustomers: bizCustomers.length,
    },
  };
}

function getDemoAppointmentsForBusiness(businessId: number): AppointmentRecord[] {
  const s = getState();
  const custIds = new Set(s.customers.filter((c) => c.businessId === businessId).map((c) => c.id));
  return s.appointments
    .filter((a) => custIds.has(a.customerId))
    .sort((a, b) => `${b.appointmentDate} ${b.startTime}`.localeCompare(`${a.appointmentDate} ${a.startTime}`));
}

function computeDemoMisReport(businessId: number): MisReportResponse {
  const s = getState();
  const biz = s.businesses.find((b) => b.id === businessId);
  if (!biz) throw new Error('Business not found.');
  const rows = getDemoAppointmentsForBusiness(businessId);

  const makeEmptyBucket = (key: string, label: string, sublabel?: string): MisBucket => ({
    key,
    label,
    sublabel,
    total: 0,
    confirmed: 0,
    completed: 0,
    rescheduled: 0,
    cancelled: 0,
    whatsapp: 0,
    website: 0,
    dashboard: 0,
    estimatedValue: 0,
    lostValue: 0,
    averageValue: 0,
  });

  const addRowToBucket = (b: MisBucket, a: AppointmentRecord) => {
    b.total += 1;
    if (a.bookingStatus === 'confirmed') b.confirmed += 1;
    else if (a.bookingStatus === 'completed') b.completed += 1;
    else if (a.bookingStatus === 'rescheduled') b.rescheduled += 1;
    else if (a.bookingStatus === 'cancelled') b.cancelled += 1;

    if (a.channel === 'whatsapp') b.whatsapp += 1;
    else if (a.channel === 'website' || a.channel === 'google_profile') b.website += 1;
    else b.dashboard += 1;

    if (a.bookingStatus === 'cancelled') b.lostValue += a.price;
    else b.estimatedValue += a.price;
  };

  const finalizeBucket = (b: MisBucket): MisBucket => {
    const active = b.total - b.cancelled;
    b.averageValue = active > 0 ? Math.round(b.estimatedValue / active) : 0;
    return b;
  };

  const dailyBuckets: MisBucket[] = [];
  const dailyMap = new Map<string, MisBucket>();
  for (let i = 13; i >= 0; i--) {
    const key = isoDateOffset(-i);
    const d = new Date(`${key}T12:00:00Z`);
    const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
    const sublabel = d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
    const b = makeEmptyBucket(key, label, sublabel);
    dailyBuckets.push(b);
    dailyMap.set(key, b);
  }
  for (const r of rows) {
    const b = dailyMap.get(r.appointmentDate);
    if (b) addRowToBucket(b, r);
  }
  dailyBuckets.forEach(finalizeBucket);

  const weeklyBuckets: MisBucket[] = [];
  const now = new Date();
  for (let w = 7; w >= 0; w--) {
    const start = new Date(now.getTime() - (w * 7 + 6) * 86400000);
    const end = new Date(now.getTime() - w * 7 * 86400000);
    const startIso = start.toISOString().slice(0, 10);
    const endIso = end.toISOString().slice(0, 10);
    const label = `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}–${end.toLocaleDateString('en-US', { day: 'numeric' })}`;
    const b = makeEmptyBucket(`${startIso}_${endIso}`, label, w === 0 ? 'Current wk' : undefined);
    for (const r of rows) {
      if (r.appointmentDate >= startIso && r.appointmentDate <= endIso) {
        addRowToBucket(b, r);
      }
    }
    weeklyBuckets.push(finalizeBucket(b));
  }

  const monthlyBuckets: MisBucket[] = [];
  for (let m = 5; m >= 0; m--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - m, 1));
    const ym = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' });
    const b = makeEmptyBucket(ym, label);
    for (const r of rows) {
      if (r.appointmentDate.startsWith(ym)) addRowToBucket(b, r);
    }
    monthlyBuckets.push(finalizeBucket(b));
  }

  const activeRows = rows.filter((r) => r.bookingStatus !== 'cancelled');
  const cancelledRows = rows.filter((r) => r.bookingStatus === 'cancelled');
  const estimatedBusinessValue = activeRows.reduce((sum, r) => sum + r.price, 0);
  const cancelledValue = cancelledRows.reduce((sum, r) => sum + r.price, 0);
  const todayStr = isoDateOffset(0);
  const weekCutoff = isoDateOffset(-6);
  const monthPrefix = todayStr.slice(0, 7);

  const todayActive = activeRows.filter((r) => r.appointmentDate === todayStr);
  const weekActive = activeRows.filter((r) => r.appointmentDate >= weekCutoff && r.appointmentDate <= isoDateOffset(7));
  const monthActive = activeRows.filter((r) => r.appointmentDate.startsWith(monthPrefix));

  const svcMap = new Map<string, MisServiceBreakdown>();
  for (const r of rows) {
    const cur = svcMap.get(r.serviceName) || {
      serviceName: r.serviceName,
      totalBookings: 0,
      activeBookings: 0,
      cancelledBookings: 0,
      estimatedValue: 0,
      sharePercent: 0,
    };
    cur.totalBookings += 1;
    if (r.bookingStatus === 'cancelled') cur.cancelledBookings += 1;
    else {
      cur.activeBookings += 1;
      cur.estimatedValue += r.price;
    }
    svcMap.set(r.serviceName, cur);
  }
  const byService = Array.from(svcMap.values())
    .map((sItem) => ({
      ...sItem,
      sharePercent:
        estimatedBusinessValue > 0 ? Math.round((sItem.estimatedValue / estimatedBusinessValue) * 100) : 0,
    }))
    .sort((a, b) => b.estimatedValue - a.estimatedValue);

  const chMap = new Map<string, MisChannelBreakdown>();
  for (const r of rows) {
    const cur = chMap.get(r.channel) || {
      channel: r.channel,
      totalBookings: 0,
      activeBookings: 0,
      estimatedValue: 0,
      sharePercent: 0,
    };
    cur.totalBookings += 1;
    if (r.bookingStatus !== 'cancelled') {
      cur.activeBookings += 1;
      cur.estimatedValue += r.price;
    }
    chMap.set(r.channel, cur);
  }
  const byChannel = Array.from(chMap.values())
    .map((cItem) => ({
      ...cItem,
      sharePercent:
        estimatedBusinessValue > 0 ? Math.round((cItem.estimatedValue / estimatedBusinessValue) * 100) : 0,
    }))
    .sort((a, b) => b.estimatedValue - a.estimatedValue);

  return {
    currency: biz.currency,
    generatedAt: new Date().toISOString(),
    summary: {
      totalAppointments: rows.length,
      activeAppointments: activeRows.length,
      completedAppointments: rows.filter((r) => r.bookingStatus === 'completed').length,
      cancelledAppointments: cancelledRows.length,
      estimatedBusinessValue,
      cancelledValue,
      averageBookingValue: activeRows.length > 0 ? Math.round(estimatedBusinessValue / activeRows.length) : 0,
      realizationRate: rows.length > 0 ? Math.round((activeRows.length / rows.length) * 100) : 100,
      dailyCount: todayActive.length,
      dailyValue: todayActive.reduce((acc, r) => acc + r.price, 0),
      weeklyCount: weekActive.length,
      weeklyValue: weekActive.reduce((acc, r) => acc + r.price, 0),
      monthlyCount: monthActive.length,
      monthlyValue: monthActive.reduce((acc, r) => acc + r.price, 0),
    },
    daily: dailyBuckets,
    weekly: weeklyBuckets,
    monthly: monthlyBuckets,
    byService,
    byChannel,
  };
}

function getDemoAvailableSlots(businessId: number, dateStr: string, serviceQuery?: string | number) {
  const s = getState();
  const avail = s.availability[businessId];
  const bizServices = s.services.filter((sv) => sv.businessId === businessId && sv.isActive);
  let chosen = bizServices[0];
  if (typeof serviceQuery === 'number') {
    chosen = bizServices.find((sv) => sv.id === serviceQuery) || chosen;
  } else if (typeof serviceQuery === 'string' && serviceQuery.trim()) {
    const q = serviceQuery.toLowerCase();
    chosen = bizServices.find((sv) => sv.name.toLowerCase().includes(q)) || chosen;
  }

  const targetDate = /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? dateStr : isoDateOffset(1);
  const dt = new Date(`${targetDate}T12:00:00Z`);
  const dayMap: Array<keyof WorkingDaysMap> = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const dayKey = dayMap[dt.getUTCDay()];
  const dayCfg = avail?.workingDaysJson?.[dayKey] || DEFAULT_WORKING_DAYS[dayKey];

  if (!dayCfg.enabled) {
    return {
      date: targetDate,
      isOpen: false,
      reason: 'Closed on this day of the week.',
      serviceName: chosen?.name || 'Consultation',
      durationMinutes: chosen?.durationMinutes || 30,
      slots: [],
    };
  }

  const duration = chosen?.durationMinutes || 30;
  const interval = avail?.slotIntervalMinutes || 30;
  const openMin = timeToMinutes(dayCfg.open);
  const closeMin = timeToMinutes(dayCfg.close);
  const breakStart = timeToMinutes(avail?.breakStart || '13:00');
  const breakEnd = timeToMinutes(avail?.breakEnd || '14:00');

  const existingDayAppts = getDemoAppointmentsForBusiness(businessId).filter(
    (a) => a.appointmentDate === targetDate && a.bookingStatus !== 'cancelled'
  );

  const slots: Array<{ startTime: string; endTime: string; label: string }> = [];
  for (let t = openMin; t + duration <= closeMin; t += interval) {
    const end = t + duration;
    if (t < breakEnd && end > breakStart) continue;
    const conflict = existingDayAppts.some((a) => {
      const as = timeToMinutes(a.startTime);
      const ae = timeToMinutes(a.endTime);
      return t < ae && end > as;
    });
    if (!conflict) {
      const startStr = minutesToTime(t);
      const endStr = minutesToTime(end);
      slots.push({ startTime: startStr, endTime: endStr, label: formatTime12h(startStr) });
    }
  }

  return {
    date: targetDate,
    isOpen: true,
    serviceName: chosen?.name || 'Consultation',
    durationMinutes: duration,
    slots,
  };
}

function getDemoAudienceStats(businessId: number): CampaignAudienceStats {
  const s = getState();
  const bizCustomers = s.customers.filter((c) => c.businessId === businessId);
  const bizAppts = getDemoAppointmentsForBusiness(businessId);
  const bookedIds = new Set(bizAppts.map((a) => a.customerId));
  const optedIn = bizCustomers.filter((c) => c.marketingOptIn);

  return {
    totalCustomers: bizCustomers.length,
    optedInCount: optedIn.length,
    withEmailCount: optedIn.filter((c) => c.email.includes('@')).length,
    withPhoneCount: optedIn.filter((c) => c.phone.replace(/\D/g, '').length >= 7).length,
    bookedBeforeCount: optedIn.filter((c) => bookedIds.has(c.id)).length,
    importedDatabaseCount: optedIn.filter((c) => c.source === 'imported_database').length,
    maxAllowed: MAX_CAMPAIGN_LIMIT,
    remainingCapacity: Math.max(0, MAX_CAMPAIGN_LIMIT - bizCustomers.length),
  };
}

function getGoogleProfileResponse(businessId: number): GoogleProfileWorkspaceResponse {
  const s = getState();
  const biz = s.businesses.find((b) => b.id === businessId);
  if (!biz) throw new Error('Business not found.');
  const origin = getAppOrigin();

  let gp = s.googleProfiles[businessId];
  if (!gp) {
    const snapshot = buildSnapshotForBusiness(businessId);
    gp = {
      id: nextId(),
      businessId,
      googlePlaceId: '',
      storeCode: `DL-${businessId}`,
      autoSyncFromDeskline: true,
      publicProfileEnabled: true,
      masterProfileJson: snapshot,
      syncHistoryJson: [
        {
          id: `ev-${nextId()}`,
          timestamp: new Date().toISOString(),
          action: 'copied_deskline_to_master',
          summary: 'Initialized Master Profile from Deskline business details.',
          actor: DEMO_USER_PROFILE.email,
        },
      ],
      lastCopiedFromDesklineAt: new Date().toISOString(),
      lastAuditedAt: null,
      lastAccuracyScore: 67,
      updatedAt: new Date().toISOString(),
    };
    s.googleProfiles[businessId] = gp;
  }

  const livePlace = gp.googlePlaceId ? SAMPLE_GOOGLE_PLACES[gp.googlePlaceId] || null : null;
  const audit = computeDemoAccuracyAudit(gp.masterProfileJson, livePlace);
  gp.lastAccuracyScore = audit.accuracyScore;

  const googleLeadCount = getDemoAppointmentsForBusiness(businessId).filter(
    (a) => a.channel === 'google_profile'
  ).length;

  return {
    profile: gp,
    livePlace,
    audit,
    jsonLd: buildDemoJsonLd(biz.slug, gp.masterProfileJson),
    publicProfileUrl: `${origin}/?profile=${encodeURIComponent(biz.slug)}&demo=1`,
    googleLeadCount,
    mapsConfigured: false,
  };
}

function buildSnapshotForBusiness(businessId: number): MasterProfileSnapshot {
  const s = getState();
  const biz = s.businesses.find((b) => b.id === businessId)!;
  const avail = s.availability[businessId];
  const origin = getAppOrigin();
  const bizServices = s.services.filter((sv) => sv.businessId === businessId && sv.isActive);
  const bizPackages = s.packages.filter((p) => p.businessId === businessId && p.isActive);

  return {
    businessName: biz.businessName,
    primaryCategory: biz.businessCategory || 'Local Business',
    additionalCategories: s.googleProfiles[businessId]?.masterProfileJson.additionalCategories || [],
    description: biz.description,
    address: biz.address,
    phone: biz.whatsappPhone,
    whatsappPhone: biz.whatsappPhone,
    email: biz.businessEmail,
    websiteUrl: biz.websiteUrl || `${origin}/?profile=${encodeURIComponent(biz.slug)}&demo=1`,
    appointmentBookingUrl: `${origin}/?widget=${encodeURIComponent(biz.slug)}&source=google_profile`,
    serviceArea: biz.country || 'India',
    bookingPolicy: biz.bookingPolicy,
    workingDays: avail?.workingDaysJson || { ...DEFAULT_WORKING_DAYS },
    holidays: avail?.holidaysJson || [],
    servicesSummary: bizServices.map((sv) => ({
      name: sv.name,
      category: sv.category,
      durationMinutes: sv.durationMinutes,
      price: sv.price,
      currency: sv.currency,
      description: sv.description,
    })),
    packagesSummary: bizPackages.map((p) => ({
      name: p.name,
      sessionCount: p.sessionCount,
      price: p.price,
      currency: p.currency,
      validityDays: p.validityDays,
      description: p.description,
    })),
    leadCaptureEnabled: true,
    instantWhatsappFallback: Boolean(biz.whatsappPhone),
  };
}

function processDemoChatMessage(
  slug: string,
  body: {
    message?: string;
    channel?: string;
    sessionKey?: string;
    customerName?: string;
    customerPhone?: string;
  }
) {
  const s = getState();
  const biz = s.businesses.find((b) => b.slug === slug) || s.businesses[0];
  const text = String(body.message || '').trim();
  const channel =
    body.channel === 'whatsapp'
      ? 'whatsapp'
      : body.channel === 'google_profile'
        ? 'google_profile'
        : 'website';
  const sessionKey = String(body.sessionKey || '').trim() || `demo_${Date.now()}`;

  let conv = s.conversations.find(
    (c) => c.businessId === biz.id && c.sessionKey === sessionKey && c.channel === channel
  );

  const userMsg: ConversationMessage = {
    id: `msg-${nextId()}`,
    role: 'customer',
    text,
    timestamp: new Date().toISOString(),
  };

  if (!conv) {
    conv = {
      id: nextId(),
      businessId: biz.id,
      customerId: null,
      sessionKey,
      customerName:
        body.customerName?.trim() ||
        (channel === 'whatsapp'
          ? 'WhatsApp Demo Guest'
          : channel === 'google_profile'
            ? 'Google Profile Lead'
            : 'Website Demo Guest'),
      customerPhone: body.customerPhone?.trim() || '',
      channel,
      status: 'ai_active',
      escalationReason: '',
      assignedTo: '',
      messagesJson: [userMsg],
      lastMessageAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };
    s.conversations.unshift(conv);
  } else {
    conv.messagesJson.push(userMsg);
    conv.lastMessageAt = new Date().toISOString();
  }

  if (conv.status === 'human_takeover') {
    return {
      sessionKey,
      conversationId: conv.id,
      status: conv.status,
      replyText:
        'A human receptionist is currently handling this conversation and has received your message.',
      toolActions: [],
      humanTakeoverActive: true,
      messages: conv.messagesJson,
    };
  }

  const lower = text.toLowerCase();
  const bizServices = s.services.filter((sv) => sv.businessId === biz.id && sv.isActive);
  const bizPackages = s.packages.filter((p) => p.businessId === biz.id && p.isActive);
  const toolActions: string[] = [];
  let replyText = '';

  const curSym = biz.currency === 'INR' ? '₹' : '$';
  const refMatch = text.toUpperCase().match(/\bAP\d{4,6}\b/);

  // 1. Escalate to human
  if (/(human|person|receptionist|agent|manager|talk to someone|speak to)/.test(lower)) {
    conv.status = 'human_takeover';
    conv.escalationReason = 'Customer requested to speak with a human receptionist.';
    toolActions.push('Escalated to human receptionist');
    replyText = `I have connected this chat to our reception desk at ${biz.businessName}. A team member has been notified in the Conversations Inbox and will reply right here shortly!`;
  }
  // 2. Booking ref lookup / cancel
  else if (refMatch) {
    const ref = refMatch[0];
    const appts = getDemoAppointmentsForBusiness(biz.id);
    const found = appts.find((a) => a.bookingRef.toUpperCase() === ref);
    toolActions.push('Looked up existing appointments');
    if (!found) {
      replyText = `I checked our calendar for reference ${ref}, but I could not find a matching booking at ${biz.businessName}. Could you double-check the reference code or share your phone/email?`;
    } else if (/cancel/.test(lower)) {
      found.bookingStatus = 'cancelled';
      toolActions.push(`Cancelled ${found.bookingRef}`);
      replyText = `Done — I have cancelled booking ${found.bookingRef} (${found.serviceName} on ${found.appointmentDate} at ${formatTime12h(found.startTime)}). Let me know whenever you would like to rebook!`;
    } else {
      replyText = `I found booking ${found.bookingRef} for ${found.customerName}: ${found.serviceName} with ${found.staffMember} on ${found.appointmentDate} at ${formatTime12h(found.startTime)} (Status: ${found.bookingStatus}). Would you like to reschedule or cancel this slot?`;
    }
  }
  // 3. Packages & offers
  else if (/(package|offer|combo|deal|discount|membership)/.test(lower)) {
    toolActions.push('Checked service catalog');
    const pkgList = bizPackages
      .map(
        (p) =>
          `• ${p.name} — ${curSym}${p.price.toLocaleString()} (${p.sessionCount} sessions, valid ${p.validityDays} days): ${p.includedServices}`
      )
      .join('\n');
    replyText = `Here are our active packages and offers at ${biz.businessName}:\n${pkgList}\n\nWould you like me to check available slots for tomorrow so you can reserve one?`;
  }
  // 4. Compare / services / pricing
  else if (/(difference|compare|service|price|pricing|cost|how much|menu)/.test(lower)) {
    toolActions.push('Checked service catalog');
    const svcList = bizServices
      .map(
        (sv) =>
          `• ${sv.name} (${sv.durationMinutes} min, ${curSym}${sv.price.toLocaleString()}) — ${sv.description}`
      )
      .join('\n');
    replyText = `Here are our verified services and pricing at ${biz.businessName}:\n${svcList}\n\nLet me know which service you prefer and I will pull live available time slots for you!`;
  }
  // 5. Direct booking confirmation if user gives time + contact/confirm words
  else if (
    /(confirm|yes|book it|go ahead)/.test(lower) ||
    (/\d{1,2}(:\d{2})?\s*(am|pm)/i.test(text) && (/@|\+?\d{7,}|name is|i am|my name/i.test(text)))
  ) {
    const dateStr = /today/.test(lower) ? isoDateOffset(0) : isoDateOffset(1);
    const chosenSvc =
      bizServices.find((sv) => lower.includes(sv.name.toLowerCase().split(' ')[0])) || bizServices[0];
    const avail = getDemoAvailableSlots(biz.id, dateStr, chosenSvc?.id);
    const chosenSlot = avail.slots[1] || avail.slots[0] || { startTime: '11:00', endTime: '11:30', label: '11:00 AM' };

    const emailMatch = text.match(/[^\s@]+@[^\s@]+\.[^\s@]+/);
    const phoneMatch = text.match(/\+?\d[\d\s-]{8,14}/);
    const nameMatch = text.match(/(?:my name is|i am|name:\s*)([A-Za-z]+(?:\s+[A-Za-z]+)?)/i);
    const custName = nameMatch?.[1]?.trim() || conv.customerName || 'Demo Guest';
    const custEmail = emailMatch?.[0] || 'guest@example.com';
    const custPhone = phoneMatch?.[0]?.trim() || '+91 98450 12345';

    const newCust: DemoCustomerRaw = {
      id: nextId(),
      businessId: biz.id,
      name: custName,
      email: custEmail,
      phone: custPhone,
      notes: `Booked via ${channel} AI receptionist (Demo)`,
      preferredService: chosenSvc.name,
      source: 'booking',
      marketingOptIn: true,
      createdAt: new Date().toISOString(),
    };
    s.customers.unshift(newCust);

    const ref = `AP${Math.floor(10300 + Math.random() * 8900)}`;
    const newAppt: AppointmentRecord = {
      id: nextId(),
      bookingRef: ref,
      serviceId: chosenSvc.id,
      serviceName: chosenSvc.name,
      price: chosenSvc.price,
      currency: chosenSvc.currency,
      staffMember: chosenSvc.staffMember,
      appointmentDate: dateStr,
      startTime: chosenSlot.startTime,
      endTime: chosenSlot.endTime,
      bookingStatus: 'confirmed',
      paymentStatus: 'unpaid',
      channel,
      notes: 'Confirmed by AI receptionist in Full Demo Mode',
      createdAt: new Date().toISOString(),
      customerId: newCust.id,
      customerName: newCust.name,
      customerEmail: newCust.email,
      customerPhone: newCust.phone,
    };
    s.appointments.unshift(newAppt);
    conv.customerId = newCust.id;
    conv.customerName = custName;
    conv.customerPhone = custPhone;
    toolActions.push(`Checked live slots for ${dateStr}`);
    toolActions.push(`Confirmed booking ${ref}`);
    addAudit(biz.id, 'appointment.created', 'appointment', String(newAppt.id), `AI confirmed ${ref} for ${custName}`);

    replyText = `All set, ${custName}! Your ${chosenSvc.name} with ${chosenSvc.staffMember} is confirmed for ${dateStr} at ${chosenSlot.label} (${curSym}${chosenSvc.price.toLocaleString()}).\n\nBooking Reference: ${ref}\nYou can now see this booking live inside the Appointments and MIS tabs!`;
  }
  // 6. Availability / booking enquiry
  else if (/(book|slot|avail|tomorrow|today|morning|afternoon|evening|appointment)/.test(lower)) {
    const dateStr = /today/.test(lower) ? isoDateOffset(0) : isoDateOffset(1);
    const chosenSvc =
      bizServices.find((sv) => lower.includes(sv.name.toLowerCase().split(' ')[0])) || bizServices[0];
    const avail = getDemoAvailableSlots(biz.id, dateStr, chosenSvc?.id);
    toolActions.push(`Checked live slots for ${dateStr}`);

    if (!avail.isOpen || avail.slots.length === 0) {
      replyText = `We don't have open slots on ${dateStr} (${avail.reason || 'fully booked'}). Would you like me to check ${isoDateOffset(2)} instead?`;
    } else {
      const sampleSlots = avail.slots.slice(0, 5).map((sl) => sl.label).join(', ');
      replyText = `I checked our live calendar for ${chosenSvc.name} (${chosenSvc.durationMinutes} min, ${curSym}${chosenSvc.price.toLocaleString()}) on ${dateStr}. Open slots include: ${sampleSlots}.\n\nReply with your preferred time plus your name and phone/email (e.g., "Confirm 11:00 AM, my name is Aditi, +91 98450 11223") and I will lock it in right away!`;
    }
  }
  // 7. Hours / location / fallback
  else {
    replyText = `Thanks for reaching out to ${biz.businessName}! We are located at ${biz.address} and open Mon–Fri 9:00 AM–7:00 PM & Sat 10:00 AM–6:00 PM.\n\nI can help you compare services & pricing, check live slots for tomorrow, book an appointment, or look up booking AP10245. What would you like to try?`;
  }

  const aiMsg: ConversationMessage = {
    id: `msg-${nextId()}`,
    role: 'ai',
    text: replyText,
    timestamp: new Date().toISOString(),
    toolActions: toolActions.length > 0 ? toolActions : undefined,
  };
  conv.messagesJson.push(aiMsg);
  conv.lastMessageAt = aiMsg.timestamp;
  biz.messageCount += 2;
  biz.tokenUsage += 420;

  return {
    sessionKey,
    conversationId: conv.id,
    status: conv.status,
    replyText,
    toolActions,
    humanTakeoverActive: false,
    messages: conv.messagesJson,
  };
}

export async function handleDemoApiFetch<T = unknown>(
  rawPath: string,
  options: RequestInit = {}
): Promise<T> {
  const s = getState();
  const method = (options.method || 'GET').toUpperCase();
  const url = new URL(rawPath, 'http://demo.local');
  const pathname = url.pathname;
  let body: Record<string, unknown> = {};
  if (typeof options.body === 'string' && options.body.trim()) {
    try {
      body = JSON.parse(options.body);
    } catch {
      body = {};
    }
  }

  // Slight realistic tick so UI spinners feel smooth without lag
  await new Promise((r) => setTimeout(r, 40));

  // --- PUBLIC ROUTES ---
  if (pathname === '/api/public/maps-config' && method === 'GET') {
    return { mapsConfigured: false, apiKey: '' } as T;
  }

  const pubBizMatch = pathname.match(/^\/api\/public\/business\/([^/]+)$/);
  if (pubBizMatch && method === 'GET') {
    const slug = decodeURIComponent(pubBizMatch[1]);
    const biz = s.businesses.find((b) => b.slug === slug) || s.businesses[0];
    const ws = getBusinessWorkspace(biz.id);
    const widgetCh = ws.channels.find((c) => c.channelType === 'website_widget');
    const waCh = ws.channels.find((c) => c.channelType === 'whatsapp');
    const payload: PublicBusinessPayload = {
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
      services: ws.services.filter((sv) => sv.isActive),
      packages: ws.packages.filter((p) => p.isActive),
      workingDays: ws.availability.workingDaysJson,
      widgetConfig: widgetCh?.widgetConfigJson || {
        welcomeMessage: biz.agentGreeting,
        quickPrompts: ['Book an appointment', 'Compare consultations', 'View packages & offers', 'Check booking AP10245'],
        enableWhatsAppHandoff: Boolean(biz.whatsappPhone),
        position: 'bottom-right',
        brandColor: biz.widgetBrandColor,
      },
      whatsappConnected: waCh?.connectionStatus === 'connected',
    };
    return payload as T;
  }

  const pubProfileMatch = pathname.match(/^\/api\/public\/profile\/([^/]+)$/);
  if (pubProfileMatch && method === 'GET') {
    const slug = decodeURIComponent(pubProfileMatch[1]);
    const biz = s.businesses.find((b) => b.slug === slug) || s.businesses[0];
    const gpData = getGoogleProfileResponse(biz.id);
    return {
      slug: biz.slug,
      currency: biz.currency,
      timezone: biz.timezone,
      widgetBrandColor: biz.widgetBrandColor,
      agentName: biz.agentName,
      googlePlaceId: gpData.profile.googlePlaceId,
      masterProfile: gpData.profile.masterProfileJson,
      livePlace: gpData.livePlace,
      jsonLd: gpData.jsonLd,
      lastUpdatedAt: gpData.profile.updatedAt,
      quotaExceeded: false,
    } as T;
  }

  const pubAvailMatch = pathname.match(/^\/api\/public\/availability\/([^/]+)$/);
  if (pubAvailMatch && method === 'GET') {
    const slug = decodeURIComponent(pubAvailMatch[1]);
    const biz = s.businesses.find((b) => b.slug === slug) || s.businesses[0];
    const dateStr = url.searchParams.get('date') || isoDateOffset(1);
    const serviceId = url.searchParams.get('serviceId') ? Number(url.searchParams.get('serviceId')) : undefined;
    const serviceName = url.searchParams.get('serviceName') || undefined;
    return getDemoAvailableSlots(biz.id, dateStr, serviceId || serviceName) as T;
  }

  const pubChatMatch = pathname.match(/^\/api\/public\/chat\/([^/]+)$/);
  if (pubChatMatch && method === 'POST') {
    const slug = decodeURIComponent(pubChatMatch[1]);
    return processDemoChatMessage(slug, body as {
      message?: string;
      channel?: string;
      sessionKey?: string;
      customerName?: string;
      customerPhone?: string;
    }) as T;
  }

  const pubConvMatch = pathname.match(/^\/api\/public\/conversation\/([^/]+)\/([^/]+)$/);
  if (pubConvMatch && method === 'GET') {
    const slug = decodeURIComponent(pubConvMatch[1]);
    const sessionKey = decodeURIComponent(pubConvMatch[2]);
    const channel = url.searchParams.get('channel') || 'website';
    const biz = s.businesses.find((b) => b.slug === slug) || s.businesses[0];
    const conv = s.conversations.find(
      (c) => c.businessId === biz.id && c.sessionKey === sessionKey && c.channel === channel
    );
    return { conversation: conv || null } as T;
  }

  // --- AUTH / ME ---
  if (pathname === '/api/me' && method === 'GET') {
    return { user: DEMO_USER_PROFILE } as T;
  }

  // --- BUSINESSES LIST & CREATE ---
  if (pathname === '/api/businesses' && method === 'GET') {
    return { businesses: [...s.businesses] } as T;
  }

  if (pathname === '/api/businesses' && method === 'POST') {
    const name = String(body.businessName || '').trim();
    if (!name) throw new Error('Business name is required.');
    const id = nextId();
    const slug =
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 32) || `biz-${id}`;
    const currency = String(body.currency || 'INR').toUpperCase();
    const created: BusinessRecord = {
      id,
      ownerUid: DEMO_USER_PROFILE.uid,
      slug,
      businessName: name,
      businessEmail: String(body.businessEmail || DEMO_USER_PROFILE.email),
      contactPerson: String(body.contactPerson || DEMO_USER_PROFILE.displayName),
      country: String(body.country || 'India'),
      timezone: String(body.timezone || 'Asia/Kolkata'),
      businessCategory: String(body.businessCategory || 'Healthcare'),
      websiteUrl: String(body.websiteUrl || ''),
      whatsappPhone: String(body.whatsappPhone || ''),
      description: String(body.description || ''),
      address: String(body.address || ''),
      currency,
      subscriptionPlan: 'starter',
      status: 'active',
      isDemoPublic: false,
      agentName: 'Maya',
      agentGreeting: `Hi! Welcome to ${name}. How can I help you today?`,
      agentPersonality: 'Warm, helpful, and concise.',
      agentInstructions: '',
      bookingPolicy: 'Free cancellation up to 12 hours prior.',
      escalationPolicy: 'Transfer complex enquiries to a human receptionist.',
      widgetBrandColor: '#0F766E',
      reminder24h: true,
      reminder2h: true,
      onboardingStep: 2,
      tokenUsage: 0,
      messageCount: 0,
      createdAt: new Date().toISOString(),
    };
    s.businesses.unshift(created);
    s.availability[id] = {
      businessId: id,
      workingDaysJson: { ...DEFAULT_WORKING_DAYS },
      breakStart: '13:00',
      breakEnd: '14:00',
      slotIntervalMinutes: 30,
      minAdvanceHours: 1,
      maxAdvanceDays: 30,
      cancellationWindowHours: 12,
      reschedulingPolicy: 'Free rescheduling up to 12 hours prior.',
      holidaysJson: [],
      blockedSlotsJson: [],
    };
    s.channels.push(
      {
        id: nextId(),
        businessId: id,
        channelType: 'whatsapp',
        whatsappPhoneNumberId: '',
        whatsappBusinessAccountId: '',
        metaVerifyToken: `deskline_${id}_verify`,
        webhookUrl: `/api/webhooks/whatsapp/${slug}`,
        connectionStatus: created.whatsappPhone ? 'pending_verification' : 'not_connected',
        approvedTemplatesJson: [
          {
            name: 'booking_confirmation',
            category: 'UTILITY',
            status: 'approved',
            body: `Hi {{1}}, your appointment at ${name} is confirmed for {{2}} at {{3}}.`,
          },
        ],
        widgetConfigJson: null,
      },
      {
        id: nextId(),
        businessId: id,
        channelType: 'website_widget',
        whatsappPhoneNumberId: '',
        whatsappBusinessAccountId: '',
        metaVerifyToken: '',
        webhookUrl: '',
        connectionStatus: 'connected',
        approvedTemplatesJson: [],
        widgetConfigJson: {
          welcomeMessage: created.agentGreeting,
          quickPrompts: ['Book an appointment', 'Explore services', 'View pricing'],
          enableWhatsAppHandoff: Boolean(created.whatsappPhone),
          position: 'bottom-right',
          brandColor: '#0F766E',
        },
      }
    );
    if (body.seedStarterCatalog) {
      s.services.push(
        {
          id: nextId(),
          businessId: id,
          name: 'Initial Consultation',
          description: '30-minute introductory consultation.',
          category: 'Consultations',
          durationMinutes: 30,
          price: currency === 'INR' ? 500 : 45,
          currency,
          bufferMinutes: 10,
          staffMember: created.contactPerson,
          advancePaymentRequired: false,
          allowDirectBooking: true,
          isActive: true,
        },
        {
          id: nextId(),
          businessId: id,
          name: 'Full Session',
          description: '60-minute comprehensive appointment.',
          category: 'Core Services',
          durationMinutes: 60,
          price: currency === 'INR' ? 1200 : 95,
          currency,
          bufferMinutes: 15,
          staffMember: created.contactPerson,
          advancePaymentRequired: false,
          allowDirectBooking: true,
          isActive: true,
        }
      );
    }
    addAudit(id, 'business.created', 'business', String(id), `Created demo tenant ${name}`);
    return { business: created } as T;
  }

  // --- SINGLE BUSINESS WORKSPACE & PATCH ---
  const bizMatch = pathname.match(/^\/api\/businesses\/(\d+)$/);
  if (bizMatch) {
    const bizId = Number(bizMatch[1]);
    if (method === 'GET') {
      return getBusinessWorkspace(bizId) as T;
    }
    if (method === 'PATCH') {
      const biz = s.businesses.find((b) => b.id === bizId);
      if (!biz) throw new Error('Business not found.');
      Object.assign(biz, body);
      return { business: biz } as T;
    }
  }

  // --- STEP 2: ANALYZE WEBSITE & APPLY EXTRACTION ---
  const analyzeMatch = pathname.match(/^\/api\/businesses\/(\d+)\/analyze-website$/);
  if (analyzeMatch && method === 'POST') {
    const bizId = Number(analyzeMatch[1]);
    const biz = s.businesses.find((b) => b.id === bizId);
    const sourceUrl = String(body.websiteUrl || biz?.websiteUrl || 'https://example-business.com');
    const currency = biz?.currency || 'INR';
    const extracted: ExtractedWebsiteData = {
      sourceUrl,
      extracted: {
        businessDescription: `${biz?.businessName || 'Your Business'} provides appointment-led ${biz?.businessCategory || 'Healthcare'} services with transparent pricing, experienced specialists, and convenient online & WhatsApp scheduling.`,
        businessCategory: biz?.businessCategory || 'Healthcare',
        address: biz?.address || '100 Feet Road, Indiranagar, Bengaluru',
        phone: biz?.whatsappPhone || '+91 98450 99100',
        email: biz?.businessEmail || 'hello@example.com',
        operatingHoursSummary: 'Mon–Fri 09:00–19:00, Sat 10:00–18:00, Sun Closed',
        bookingPolicy: 'Free cancellation or rescheduling up to 12 hours before your slot.',
        services: [
          {
            name: 'Express Discovery Consultation',
            description: '30-minute assessment and personalised service plan extracted from website.',
            category: 'Consultations',
            durationMinutes: 30,
            price: currency === 'INR' ? 600 : 50,
            currency,
          },
          {
            name: 'Comprehensive Care Treatment',
            description: '60-minute signature appointment with follow-up care guide.',
            category: 'Core Treatments',
            durationMinutes: 60,
            price: currency === 'INR' ? 1800 : 120,
            currency,
          },
        ],
        packages: [
          {
            name: 'Starter 3-Session Value Pack',
            description: 'Save 20% when bundling three sessions together.',
            includedServices: '3x Comprehensive Care Treatment',
            sessionCount: 3,
            price: currency === 'INR' ? 4300 : 290,
            validityDays: 90,
          },
        ],
        faqs: [
          {
            title: 'Do I need to book in advance?',
            content: 'Walk-ins are welcome subject to availability, but booking online or via WhatsApp guarantees zero wait time.',
          },
          {
            title: 'What payment methods are accepted?',
            content: 'We accept UPI, credit/debit cards, and digital invoices for reimbursement.',
          },
        ],
      },
    };
    return extracted as T;
  }

  const applyExtMatch = pathname.match(/^\/api\/businesses\/(\d+)\/apply-extraction$/);
  if (applyExtMatch && method === 'POST') {
    const bizId = Number(applyExtMatch[1]);
    const biz = s.businesses.find((b) => b.id === bizId);
    if (!biz) throw new Error('Business not found.');
    if (typeof body.businessDescription === 'string' && body.businessDescription.trim()) {
      biz.description = body.businessDescription.trim();
    }
    if (typeof body.address === 'string' && body.address.trim()) biz.address = body.address.trim();
    if (typeof body.bookingPolicy === 'string' && body.bookingPolicy.trim()) {
      biz.bookingPolicy = body.bookingPolicy.trim();
    }
    if (Array.isArray(body.services)) {
      for (const sv of body.services as Array<Record<string, unknown>>) {
        s.services.unshift({
          id: nextId(),
          businessId: bizId,
          name: String(sv.name || 'Service'),
          description: String(sv.description || ''),
          category: String(sv.category || 'General'),
          durationMinutes: Number(sv.durationMinutes) || 30,
          price: Number(sv.price) || 0,
          currency: String(sv.currency || biz.currency),
          bufferMinutes: 10,
          staffMember: biz.contactPerson || 'Lead Specialist',
          advancePaymentRequired: false,
          allowDirectBooking: true,
          isActive: true,
        });
      }
    }
    if (Array.isArray(body.packages)) {
      for (const p of body.packages as Array<Record<string, unknown>>) {
        s.packages.unshift({
          id: nextId(),
          businessId: bizId,
          name: String(p.name || 'Package'),
          description: String(p.description || ''),
          includedServices: String(p.includedServices || ''),
          sessionCount: Number(p.sessionCount) || 1,
          price: Number(p.price) || 0,
          currency: biz.currency,
          validityDays: Number(p.validityDays) || 90,
          conditions: '',
          isActive: true,
        });
      }
    }
    if (Array.isArray(body.faqs)) {
      for (const f of body.faqs as Array<Record<string, unknown>>) {
        s.knowledge.unshift({
          id: nextId(),
          businessId: bizId,
          sourceType: 'website_crawl',
          sourceUrl: String(body.sourceUrl || ''),
          title: String(f.title || 'Website FAQ'),
          content: String(f.content || ''),
          isApproved: true,
          updatedAt: new Date().toISOString(),
        });
      }
    }
    return { applied: true } as T;
  }

  // --- SERVICES CRUD ---
  const servicesPostMatch = pathname.match(/^\/api\/businesses\/(\d+)\/services$/);
  if (servicesPostMatch && method === 'POST') {
    const bizId = Number(servicesPostMatch[1]);
    const biz = s.businesses.find((b) => b.id === bizId)!;
    const created: ServiceRecord = {
      id: nextId(),
      businessId: bizId,
      name: String(body.name || 'Service').trim(),
      description: String(body.description || '').trim(),
      category: String(body.category || 'General').trim(),
      durationMinutes: Number(body.durationMinutes) || 30,
      price: Number(body.price) || 0,
      currency: String(body.currency || biz.currency),
      bufferMinutes: Number(body.bufferMinutes) || 0,
      staffMember: String(body.staffMember || 'Any Available Specialist'),
      advancePaymentRequired: Boolean(body.advancePaymentRequired),
      allowDirectBooking: body.allowDirectBooking !== false,
      isActive: body.isActive !== false,
    };
    s.services.unshift(created);
    return { service: created } as T;
  }

  const serviceItemMatch = pathname.match(/^\/api\/businesses\/(\d+)\/services\/(\d+)$/);
  if (serviceItemMatch) {
    const bizId = Number(serviceItemMatch[1]);
    const svcId = Number(serviceItemMatch[2]);
    if (method === 'PATCH') {
      const target = s.services.find((sv) => sv.id === svcId && sv.businessId === bizId);
      if (!target) throw new Error('Service not found.');
      Object.assign(target, body);
      return { service: target } as T;
    }
    if (method === 'DELETE') {
      s.services = s.services.filter((sv) => !(sv.id === svcId && sv.businessId === bizId));
      return { deleted: true } as T;
    }
  }

  // --- PACKAGES CRUD ---
  const pkgPostMatch = pathname.match(/^\/api\/businesses\/(\d+)\/packages$/);
  if (pkgPostMatch && method === 'POST') {
    const bizId = Number(pkgPostMatch[1]);
    const biz = s.businesses.find((b) => b.id === bizId)!;
    const created: PackageRecord = {
      id: nextId(),
      businessId: bizId,
      name: String(body.name || 'Package').trim(),
      description: String(body.description || '').trim(),
      includedServices: String(body.includedServices || '').trim(),
      sessionCount: Number(body.sessionCount) || 1,
      price: Number(body.price) || 0,
      currency: String(body.currency || biz.currency),
      validityDays: Number(body.validityDays) || 90,
      conditions: String(body.conditions || '').trim(),
      isActive: true,
    };
    s.packages.unshift(created);
    return { package: created } as T;
  }

  const pkgDelMatch = pathname.match(/^\/api\/businesses\/(\d+)\/packages\/(\d+)$/);
  if (pkgDelMatch && method === 'DELETE') {
    const bizId = Number(pkgDelMatch[1]);
    const pkgId = Number(pkgDelMatch[2]);
    s.packages = s.packages.filter((p) => !(p.id === pkgId && p.businessId === bizId));
    return { deleted: true } as T;
  }

  // --- AVAILABILITY ---
  const availMatch = pathname.match(/^\/api\/businesses\/(\d+)\/availability$/);
  if (availMatch && method === 'PUT') {
    const bizId = Number(availMatch[1]);
    s.availability[bizId] = {
      ...(s.availability[bizId] || { businessId: bizId }),
      ...(body as Partial<AvailabilityRecord>),
      businessId: bizId,
    } as AvailabilityRecord;
    return { availability: s.availability[bizId] } as T;
  }

  // --- CHANNELS ---
  const waChanMatch = pathname.match(/^\/api\/businesses\/(\d+)\/channels\/whatsapp$/);
  if (waChanMatch && method === 'PUT') {
    const bizId = Number(waChanMatch[1]);
    const biz = s.businesses.find((b) => b.id === bizId);
    if (biz && typeof body.whatsappPhone === 'string' && body.whatsappPhone.trim()) {
      biz.whatsappPhone = body.whatsappPhone.trim();
    }
    const ch = s.channels.find((c) => c.businessId === bizId && c.channelType === 'whatsapp');
    if (ch) {
      ch.whatsappPhoneNumberId = String(body.whatsappPhoneNumberId ?? ch.whatsappPhoneNumberId);
      ch.whatsappBusinessAccountId = String(body.whatsappBusinessAccountId ?? ch.whatsappBusinessAccountId);
      ch.metaVerifyToken = String(body.metaVerifyToken ?? ch.metaVerifyToken);
      ch.connectionStatus =
        ch.whatsappPhoneNumberId && ch.whatsappBusinessAccountId ? 'connected' : 'pending_verification';
      if (Array.isArray(body.approvedTemplatesJson)) {
        ch.approvedTemplatesJson = body.approvedTemplatesJson as ChannelIntegrationRecord['approvedTemplatesJson'];
      }
      return { channel: ch } as T;
    }
    return { channel: null } as T;
  }

  const widChanMatch = pathname.match(/^\/api\/businesses\/(\d+)\/channels\/widget$/);
  if (widChanMatch && method === 'PUT') {
    const bizId = Number(widChanMatch[1]);
    const biz = s.businesses.find((b) => b.id === bizId);
    if (biz && typeof body.brandColor === 'string') biz.widgetBrandColor = body.brandColor;
    if (biz && typeof body.welcomeMessage === 'string') biz.agentGreeting = body.welcomeMessage;
    const ch = s.channels.find((c) => c.businessId === bizId && c.channelType === 'website_widget');
    if (ch) {
      ch.widgetConfigJson = {
        welcomeMessage: String(body.welcomeMessage || biz?.agentGreeting || ''),
        quickPrompts: Array.isArray(body.quickPrompts) ? (body.quickPrompts as string[]) : [],
        enableWhatsAppHandoff: Boolean(body.enableWhatsAppHandoff),
        position: body.position === 'bottom-left' ? 'bottom-left' : 'bottom-right',
        brandColor: String(body.brandColor || '#0F766E'),
      };
      return { channel: ch } as T;
    }
    return { channel: null } as T;
  }

  // --- APPOINTMENTS ---
  const apptsMatch = pathname.match(/^\/api\/businesses\/(\d+)\/appointments$/);
  if (apptsMatch) {
    const bizId = Number(apptsMatch[1]);
    if (method === 'GET') {
      return { appointments: getDemoAppointmentsForBusiness(bizId) } as T;
    }
    if (method === 'POST') {
      const svc =
        s.services.find((sv) => sv.businessId === bizId && sv.id === Number(body.serviceId)) ||
        s.services.find((sv) => sv.businessId === bizId);
      if (!svc) throw new Error('Please configure a service first.');
      const custName = String(body.customerName || 'Walk-in Guest').trim();
      const custEmail = String(body.customerEmail || '').trim();
      const custPhone = String(body.customerPhone || '').trim();

      let cust = s.customers.find(
        (c) =>
          c.businessId === bizId &&
          ((custEmail && c.email.toLowerCase() === custEmail.toLowerCase()) ||
            (custPhone && c.phone.replace(/\D/g, '') === custPhone.replace(/\D/g, '')))
      );
      if (!cust) {
        cust = {
          id: nextId(),
          businessId: bizId,
          name: custName,
          email: custEmail,
          phone: custPhone,
          notes: 'Created from Appointments dashboard',
          preferredService: svc.name,
          source: 'booking',
          marketingOptIn: true,
          createdAt: new Date().toISOString(),
        };
        s.customers.unshift(cust);
      }

      const startTime = String(body.startTime || '11:00');
      const endTime = minutesToTime(timeToMinutes(startTime) + svc.durationMinutes);
      const created: AppointmentRecord = {
        id: nextId(),
        bookingRef: `AP${Math.floor(10400 + Math.random() * 8900)}`,
        serviceId: svc.id,
        serviceName: svc.name,
        price: svc.price,
        currency: svc.currency,
        staffMember: svc.staffMember,
        appointmentDate: String(body.appointmentDate || isoDateOffset(1)),
        startTime,
        endTime,
        bookingStatus: 'confirmed',
        paymentStatus: 'unpaid',
        channel: 'dashboard',
        notes: String(body.notes || ''),
        createdAt: new Date().toISOString(),
        customerId: cust.id,
        customerName: cust.name,
        customerEmail: cust.email,
        customerPhone: cust.phone,
      };
      s.appointments.unshift(created);
      addAudit(bizId, 'appointment.created', 'appointment', String(created.id), `Booked ${created.bookingRef} for ${cust.name}`);
      return { appointment: created } as T;
    }
  }

  const apptPatchMatch = pathname.match(/^\/api\/businesses\/(\d+)\/appointments\/(\d+)$/);
  if (apptPatchMatch && method === 'PATCH') {
    const apptId = Number(apptPatchMatch[2]);
    const target = s.appointments.find((a) => a.id === apptId);
    if (!target) throw new Error('Appointment not found.');
    if (body.action === 'cancel') {
      target.bookingStatus = 'cancelled';
    } else if (body.action === 'reschedule') {
      target.appointmentDate = String(body.appointmentDate || target.appointmentDate);
      target.startTime = String(body.startTime || target.startTime);
      target.bookingStatus = 'rescheduled';
    } else {
      if (typeof body.bookingStatus === 'string') target.bookingStatus = body.bookingStatus;
      if (typeof body.paymentStatus === 'string') target.paymentStatus = body.paymentStatus;
    }
    return { appointment: target } as T;
  }

  // --- CUSTOMERS ---
  const custMatch = pathname.match(/^\/api\/businesses\/(\d+)\/customers$/);
  if (custMatch && method === 'GET') {
    const bizId = Number(custMatch[1]);
    const bizCusts = s.customers.filter((c) => c.businessId === bizId);
    const bizAppts = getDemoAppointmentsForBusiness(bizId);
    const bizConvs = s.conversations.filter((cv) => cv.businessId === bizId);
    const enriched: CustomerRecord[] = bizCusts.map((c) => {
      const cAppts = bizAppts.filter((a) => a.customerId === c.id);
      return {
        ...c,
        bookingCount: cAppts.length,
        upcomingCount: cAppts.filter((a) => a.bookingStatus !== 'cancelled').length,
        conversationCount: bizConvs.filter((cv) => cv.customerId === c.id).length,
        appointments: cAppts.map((a) => ({
          id: a.id,
          bookingRef: a.bookingRef,
          serviceNameSnapshot: a.serviceName,
          appointmentDate: a.appointmentDate,
          startTime: a.startTime,
          bookingStatus: a.bookingStatus,
          priceSnapshot: a.price,
          currencySnapshot: a.currency,
        })),
      };
    });
    return { customers: enriched } as T;
  }

  const custImportMatch = pathname.match(/^\/api\/businesses\/(\d+)\/customers\/import$/);
  if (custImportMatch && method === 'POST') {
    const bizId = Number(custImportMatch[1]);
    const contacts = Array.isArray(body.contacts) ? (body.contacts as Array<Record<string, string>>) : [];
    const existing = s.customers.filter((c) => c.businessId === bizId);
    const emailSet = new Set(existing.map((c) => c.email.toLowerCase()).filter(Boolean));
    const phoneSet = new Set(existing.map((c) => c.phone.replace(/\D/g, '')).filter(Boolean));

    let importedCount = 0;
    let duplicateCount = 0;
    let invalidCount = 0;
    let capSkippedCount = 0;

    for (const raw of contacts) {
      const email = String(raw.email || '').trim().toLowerCase();
      const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
      const phone = String(raw.phone || '').trim();
      const digits = phone.replace(/\D/g, '');
      const validPhone = digits.length >= 7 && digits.length <= 15 ? phone : '';

      if (!validEmail && !validPhone) {
        invalidCount += 1;
        continue;
      }
      if ((validEmail && emailSet.has(validEmail)) || (validPhone && phoneSet.has(digits))) {
        duplicateCount += 1;
        continue;
      }
      if (existing.length + importedCount >= MAX_CAMPAIGN_LIMIT) {
        capSkippedCount += 1;
        continue;
      }
      if (validEmail) emailSet.add(validEmail);
      if (validPhone) phoneSet.add(digits);

      s.customers.unshift({
        id: nextId(),
        businessId: bizId,
        name: String(raw.name || '').trim() || (validEmail ? validEmail.split('@')[0] : `Customer ${digits.slice(-4)}`),
        email: validEmail,
        phone: validPhone,
        preferredService: String(raw.preferredService || '').trim(),
        notes: 'Imported from existing customer database',
        source: 'imported_database',
        marketingOptIn: true,
        createdAt: new Date().toISOString(),
      });
      importedCount += 1;
    }

    addAudit(bizId, 'customers.imported', 'customer', String(bizId), `Imported ${importedCount} existing customer contacts`);
    return {
      ok: true,
      importedCount,
      duplicateCount,
      invalidCount,
      capSkippedCount,
      totalCustomersNow: existing.length + importedCount,
      maxAllowed: MAX_CAMPAIGN_LIMIT,
    } as T;
  }

  const optInMatch = pathname.match(/^\/api\/businesses\/(\d+)\/customers\/(\d+)\/opt-in$/);
  if (optInMatch && method === 'PATCH') {
    const custId = Number(optInMatch[2]);
    const cust = s.customers.find((c) => c.id === custId);
    if (!cust) throw new Error('Customer not found.');
    cust.marketingOptIn = Boolean(body.marketingOptIn);
    return { customer: cust } as T;
  }

  // --- CONVERSATIONS ---
  const convListMatch = pathname.match(/^\/api\/businesses\/(\d+)\/conversations$/);
  if (convListMatch && method === 'GET') {
    const bizId = Number(convListMatch[1]);
    return {
      conversations: s.conversations.filter((c) => c.businessId === bizId),
    } as T;
  }

  const convReplyMatch = pathname.match(/^\/api\/businesses\/(\d+)\/conversations\/(\d+)\/reply$/);
  if (convReplyMatch && method === 'POST') {
    const convId = Number(convReplyMatch[2]);
    const conv = s.conversations.find((c) => c.id === convId);
    if (!conv) throw new Error('Conversation not found.');
    const msg: ConversationMessage = {
      id: `msg-${nextId()}`,
      role: 'agent',
      text: String(body.text || '').trim(),
      timestamp: new Date().toISOString(),
    };
    conv.messagesJson.push(msg);
    conv.status = 'human_takeover';
    conv.assignedTo = DEMO_USER_PROFILE.displayName;
    conv.lastMessageAt = msg.timestamp;
    return { conversation: conv } as T;
  }

  const convStatusMatch = pathname.match(/^\/api\/businesses\/(\d+)\/conversations\/(\d+)\/status$/);
  if (convStatusMatch && method === 'PATCH') {
    const convId = Number(convStatusMatch[2]);
    const conv = s.conversations.find((c) => c.id === convId);
    if (!conv) throw new Error('Conversation not found.');
    conv.status = String(body.status || conv.status);
    return { conversation: conv } as T;
  }

  // --- KNOWLEDGE BASE ---
  const knowPostMatch = pathname.match(/^\/api\/businesses\/(\d+)\/knowledge$/);
  if (knowPostMatch && method === 'POST') {
    const bizId = Number(knowPostMatch[1]);
    const item: KnowledgeItemRecord = {
      id: nextId(),
      businessId: bizId,
      sourceType: String(body.sourceType || 'faq'),
      sourceUrl: String(body.sourceUrl || ''),
      title: String(body.title || '').trim(),
      content: String(body.content || '').trim(),
      isApproved: body.isApproved !== false,
      updatedAt: new Date().toISOString(),
    };
    s.knowledge.unshift(item);
    return { item } as T;
  }

  const knowDelMatch = pathname.match(/^\/api\/businesses\/(\d+)\/knowledge\/(\d+)$/);
  if (knowDelMatch && method === 'DELETE') {
    const bizId = Number(knowDelMatch[1]);
    const itemId = Number(knowDelMatch[2]);
    s.knowledge = s.knowledge.filter((k) => !(k.id === itemId && k.businessId === bizId));
    return { deleted: true } as T;
  }

  // --- MIS ANALYTICS ---
  const misMatch = pathname.match(/^\/api\/businesses\/(\d+)\/mis$/);
  if (misMatch && method === 'GET') {
    return computeDemoMisReport(Number(misMatch[1])) as T;
  }

  // --- CAMPAIGNS (OFFERS & ANNOUNCEMENTS) ---
  const campListMatch = pathname.match(/^\/api\/businesses\/(\d+)\/campaigns$/);
  if (campListMatch) {
    const bizId = Number(campListMatch[1]);
    if (method === 'GET') {
      return {
        campaigns: s.campaigns.filter((c) => c.businessId === bizId),
        audienceStats: getDemoAudienceStats(bizId),
      } as T;
    }
    if (method === 'POST') {
      const bizCusts = s.customers.filter((c) => c.businessId === bizId && c.marketingOptIn);
      const bizAppts = getDemoAppointmentsForBusiness(bizId);
      const bookedIds = new Set(bizAppts.map((a) => a.customerId));
      const segment = String(body.audienceSegment || 'all_existing');
      let eligible = bizCusts;
      if (segment === 'booked_before') eligible = bizCusts.filter((c) => bookedIds.has(c.id));
      else if (segment === 'imported_database') eligible = bizCusts.filter((c) => c.source === 'imported_database');
      else if (segment === 'service_specific' && String(body.audienceFilterValue || '').trim()) {
        const q = String(body.audienceFilterValue).toLowerCase();
        eligible = bizCusts.filter((c) => c.preferredService.toLowerCase().includes(q));
      }
      if (eligible.length === 0) {
        throw new Error('No eligible existing customers match the selected audience segment.');
      }

      const channel = String(body.channel || 'both');
      let sentEmailCount = 0;
      let sentWhatsappCount = 0;
      let skippedCount = 0;
      const campId = nextId();
      const nowIso = new Date().toISOString();

      for (const c of eligible) {
        const hasEmail = c.email.includes('@');
        const hasPhone = c.phone.replace(/\D/g, '').length >= 7;
        const emailStatus =
          channel === 'email' || channel === 'both' ? (hasEmail ? 'sent' : 'skipped') : 'not_applicable';
        const whatsappStatus =
          channel === 'whatsapp' || channel === 'both' ? (hasPhone ? 'sent' : 'skipped') : 'not_applicable';
        if (emailStatus === 'sent') sentEmailCount += 1;
        if (whatsappStatus === 'sent') sentWhatsappCount += 1;
        if (emailStatus !== 'sent' && whatsappStatus !== 'sent') skippedCount += 1;

        s.campaignRecipients.unshift({
          id: nextId(),
          campaignId: campId,
          customerId: c.id,
          customerName: c.name,
          email: c.email,
          phone: c.phone,
          emailStatus,
          whatsappStatus,
          dispatchedAt: nowIso,
        });
      }

      const created: CampaignRecord = {
        id: campId,
        businessId: bizId,
        title: String(body.title || 'Customer Broadcast').trim(),
        campaignType: String(body.campaignType || 'offer'),
        channel,
        subject: String(body.subject || body.title || '').trim(),
        messageBody: String(body.messageBody || '').trim(),
        audienceSegment: segment,
        audienceFilterValue: String(body.audienceFilterValue || ''),
        attachedPackageId: body.attachedPackageId ? Number(body.attachedPackageId) : null,
        totalTargeted: eligible.length,
        sentEmailCount,
        sentWhatsappCount,
        skippedCount,
        status: 'sent',
        sentAt: nowIso,
        createdAt: nowIso,
      };
      s.campaigns.unshift(created);
      addAudit(
        bizId,
        'campaign.sent',
        'campaign',
        String(campId),
        `Sent ${created.campaignType} "${created.title}" to ${eligible.length} existing customers`
      );
      return { campaign: created } as T;
    }
  }

  const campDraftMatch = pathname.match(/^\/api\/businesses\/(\d+)\/campaigns\/draft-ai$/);
  if (campDraftMatch && method === 'POST') {
    const bizId = Number(campDraftMatch[1]);
    const biz = s.businesses.find((b) => b.id === bizId)!;
    const type = body.campaignType === 'announcement' ? 'announcement' : 'offer';
    const pkg = body.attachedPackageId
      ? s.packages.find((p) => p.id === Number(body.attachedPackageId))
      : null;
    const goal = String(body.goal || '').trim();
    const cur = biz.currency === 'INR' ? '₹' : '$';

    if (type === 'announcement') {
      return {
        title: goal ? `Important Update: ${goal.slice(0, 42)}` : `Clinic Schedule Update — ${biz.businessName}`,
        subject: `Quick update for valued guests of ${biz.businessName}`,
        messageBody: `Hi {{name}}, we have an important update from ${biz.businessName}: ${goal || 'we have opened additional weekend appointment slots to make booking even easier for our returning guests'}. Reply to this message anytime to check availability or book your next visit!`,
      } as T;
    }

    return {
      title: pkg ? `Returning Guest Perk: ${pkg.name}` : `Exclusive Returning Customer Offer`,
      subject: pkg
        ? `Special existing-customer access to ${pkg.name} (${cur}${pkg.price.toLocaleString()})`
        : `A special thank-you offer from ${biz.businessName}`,
      messageBody: `Hi {{name}}, thank you for being a valued client at ${biz.businessName}! ${
        pkg
          ? `We are offering our returning guests priority booking on ${pkg.name} (${pkg.sessionCount} sessions for ${cur}${pkg.price.toLocaleString()}, valid ${pkg.validityDays} days).`
          : goal || 'Enjoy a complimentary add-on or priority scheduling on your next appointment this week.'
      } Simply reply with your preferred day and our AI receptionist ${biz.agentName} will confirm your slot right away.`,
    } as T;
  }

  const campDetailMatch = pathname.match(/^\/api\/businesses\/(\d+)\/campaigns\/(\d+)$/);
  if (campDetailMatch && method === 'GET') {
    const campId = Number(campDetailMatch[2]);
    const campaign = s.campaigns.find((c) => c.id === campId);
    if (!campaign) throw new Error('Campaign not found.');
    const recipients = s.campaignRecipients.filter((r) => r.campaignId === campId);
    return { campaign, recipients } as T;
  }

  // --- GOOGLE PUBLIC PROFILE & MASTER PROFILE SYNC ---
  const gpGetMatch = pathname.match(/^\/api\/businesses\/(\d+)\/google-profile$/);
  if (gpGetMatch && method === 'GET') {
    return getGoogleProfileResponse(Number(gpGetMatch[1])) as T;
  }

  const gpSearchMatch = pathname.match(/^\/api\/businesses\/(\d+)\/google-profile\/search$/);
  if (gpSearchMatch && method === 'POST') {
    const query = String(body.query || '').trim().toLowerCase();
    const allSamples: LiveGooglePlaceCandidate[] = Object.values(SAMPLE_GOOGLE_PLACES);
    const filtered = query
      ? allSamples.filter(
          (p) =>
            p.displayName.toLowerCase().includes(query) ||
            p.formattedAddress.toLowerCase().includes(query) ||
            p.primaryTypeDisplayName.toLowerCase().includes(query)
        )
      : allSamples;
    return { places: filtered.length > 0 ? filtered : allSamples } as T;
  }

  const gpCopyDeskMatch = pathname.match(/^\/api\/businesses\/(\d+)\/google-profile\/copy-deskline$/);
  if (gpCopyDeskMatch && method === 'POST') {
    const bizId = Number(gpCopyDeskMatch[1]);
    const resp = getGoogleProfileResponse(bizId);
    const fresh = buildSnapshotForBusiness(bizId);
    resp.profile.masterProfileJson = fresh;
    resp.profile.lastCopiedFromDesklineAt = new Date().toISOString();
    resp.profile.updatedAt = new Date().toISOString();
    const audit = computeDemoAccuracyAudit(fresh, resp.livePlace);
    resp.profile.lastAccuracyScore = audit.accuracyScore;
    const ev: ProfileSyncEvent = {
      id: `ev-${nextId()}`,
      timestamp: new Date().toISOString(),
      action: 'copied_deskline_to_master',
      summary: `Copied all Deskline details (${fresh.servicesSummary.length} services, ${fresh.packagesSummary.length} packages, hours & 24/7 booking link) into Master Profile.`,
      actor: DEMO_USER_PROFILE.email,
      accuracyScore: audit.accuracyScore,
    };
    resp.profile.syncHistoryJson = [ev, ...resp.profile.syncHistoryJson].slice(0, 25);
    addAudit(bizId, 'google_profile.copied_from_deskline', 'google_profile', String(resp.profile.id), ev.summary);
    return getGoogleProfileResponse(bizId) as T;
  }

  const gpLinkMatch = pathname.match(/^\/api\/businesses\/(\d+)\/google-profile\/link-and-copy$/);
  if (gpLinkMatch && method === 'POST') {
    const bizId = Number(gpLinkMatch[1]);
    const placeId = String(body.placeId || 'demo_place_soma_indiranagar');
    const copyFields = body.copyFieldsIntoMaster !== false;
    const alsoCore = Boolean(body.alsoUpdateDesklineCore);
    const place = SAMPLE_GOOGLE_PLACES[placeId] || SAMPLE_GOOGLE_PLACES.demo_place_soma_indiranagar;
    const resp = getGoogleProfileResponse(bizId);
    resp.profile.googlePlaceId = place.id;

    if (copyFields) {
      resp.profile.masterProfileJson = {
        ...resp.profile.masterProfileJson,
        businessName: place.displayName,
        primaryCategory: place.primaryTypeDisplayName || resp.profile.masterProfileJson.primaryCategory,
        address: place.formattedAddress,
        phone: place.internationalPhoneNumber || place.nationalPhoneNumber,
        websiteUrl: place.websiteUri || resp.profile.masterProfileJson.websiteUrl,
        workingDays: place.parsedWorkingDays || resp.profile.masterProfileJson.workingDays,
      };
      if (alsoCore) {
        const biz = s.businesses.find((b) => b.id === bizId);
        if (biz) {
          biz.businessName = place.displayName;
          biz.address = place.formattedAddress;
          biz.websiteUrl = place.websiteUri || biz.websiteUrl;
          biz.whatsappPhone = place.internationalPhoneNumber || biz.whatsappPhone;
        }
        if (place.parsedWorkingDays && s.availability[bizId]) {
          s.availability[bizId].workingDaysJson = { ...place.parsedWorkingDays };
        }
      }
    }

    const audit = computeDemoAccuracyAudit(resp.profile.masterProfileJson, place);
    resp.profile.lastAuditedAt = new Date().toISOString();
    resp.profile.lastAccuracyScore = audit.accuracyScore;
    resp.profile.updatedAt = new Date().toISOString();

    const ev: ProfileSyncEvent = {
      id: `ev-${nextId()}`,
      timestamp: new Date().toISOString(),
      action: copyFields ? 'copied_google_to_master' : 'linked_google_place',
      summary: copyFields
        ? `Linked "${place.displayName}" and copied verified Google address, phone, website & hours into Master Profile (Accuracy: ${audit.accuracyScore}%).`
        : `Linked Google Public Profile "${place.displayName}" for live accuracy monitoring.`,
      actor: DEMO_USER_PROFILE.email,
      accuracyScore: audit.accuracyScore,
    };
    resp.profile.syncHistoryJson = [ev, ...resp.profile.syncHistoryJson].slice(0, 25);
    addAudit(bizId, 'google_profile.synced', 'google_profile', String(resp.profile.id), ev.summary);
    return getGoogleProfileResponse(bizId) as T;
  }

  const gpUnlinkMatch = pathname.match(/^\/api\/businesses\/(\d+)\/google-profile\/link$/);
  if (gpUnlinkMatch && method === 'DELETE') {
    const bizId = Number(gpUnlinkMatch[1]);
    const resp = getGoogleProfileResponse(bizId);
    resp.profile.googlePlaceId = '';
    resp.profile.updatedAt = new Date().toISOString();
    const audit = computeDemoAccuracyAudit(resp.profile.masterProfileJson, null);
    resp.profile.lastAccuracyScore = audit.accuracyScore;
    return {
      profile: resp.profile,
      livePlace: null,
      audit,
    } as T;
  }

  const gpMasterMatch = pathname.match(/^\/api\/businesses\/(\d+)\/google-profile\/master$/);
  if (gpMasterMatch && method === 'PUT') {
    const bizId = Number(gpMasterMatch[1]);
    const resp = getGoogleProfileResponse(bizId);
    const mp = (body.masterProfile || {}) as Partial<MasterProfileSnapshot>;
    resp.profile.masterProfileJson = {
      ...resp.profile.masterProfileJson,
      ...mp,
    };
    if (typeof body.storeCode === 'string') resp.profile.storeCode = body.storeCode;
    if (typeof body.autoSyncFromDeskline === 'boolean') resp.profile.autoSyncFromDeskline = body.autoSyncFromDeskline;
    if (typeof body.publicProfileEnabled === 'boolean') resp.profile.publicProfileEnabled = body.publicProfileEnabled;

    if (body.syncBackToDeskline) {
      const biz = s.businesses.find((b) => b.id === bizId);
      if (biz) {
        biz.businessName = resp.profile.masterProfileJson.businessName;
        biz.address = resp.profile.masterProfileJson.address;
        biz.whatsappPhone = resp.profile.masterProfileJson.whatsappPhone || resp.profile.masterProfileJson.phone;
        biz.businessEmail = resp.profile.masterProfileJson.email;
        biz.websiteUrl = resp.profile.masterProfileJson.websiteUrl;
        biz.description = resp.profile.masterProfileJson.description;
      }
    }
    const audit = computeDemoAccuracyAudit(resp.profile.masterProfileJson, resp.livePlace);
    resp.profile.lastAccuracyScore = audit.accuracyScore;
    resp.profile.updatedAt = new Date().toISOString();
    const savedEvent: ProfileSyncEvent = {
      id: `ev-${nextId()}`,
      timestamp: new Date().toISOString(),
      action: 'published_master_profile',
      summary: `Saved Master Business Profile${body.syncBackToDeskline ? ' and synced back to Deskline settings' : ''}.`,
      actor: DEMO_USER_PROFILE.email,
      accuracyScore: audit.accuracyScore,
    };
    resp.profile.syncHistoryJson = [savedEvent, ...resp.profile.syncHistoryJson].slice(0, 25);
    return getGoogleProfileResponse(bizId) as T;
  }

  // --- SUPER-ADMIN CONSOLE ---
  if (pathname === '/api/admin/overview' && method === 'GET') {
    const tenants = s.businesses.map((b) => {
      const wa = s.channels.find((c) => c.businessId === b.id && c.channelType === 'whatsapp');
      return {
        ...b,
        whatsappStatus: wa?.connectionStatus || 'not_connected',
        appointmentCount: getDemoAppointmentsForBusiness(b.id).length,
        conversationCount: s.conversations.filter((c) => c.businessId === b.id).length,
      };
    });
    return {
      totals: {
        totalTenants: tenants.length,
        activeTenants: tenants.filter((t) => t.status === 'active').length,
        totalUsers: 4,
        totalAppointments: tenants.reduce((acc, t) => acc + t.appointmentCount, 0),
        totalConversations: tenants.reduce((acc, t) => acc + t.conversationCount, 0),
        totalMessages: tenants.reduce((acc, t) => acc + t.messageCount, 0),
        totalTokens: tenants.reduce((acc, t) => acc + t.tokenUsage, 0),
        whatsappConnectedCount: tenants.filter((t) => t.whatsappStatus === 'connected').length,
      },
      tenants,
      auditLogs: s.auditLogs,
    } as T;
  }

  const adminPatchMatch = pathname.match(/^\/api\/admin\/businesses\/(\d+)$/);
  if (adminPatchMatch && method === 'PATCH') {
    const bizId = Number(adminPatchMatch[1]);
    const biz = s.businesses.find((b) => b.id === bizId);
    if (!biz) throw new Error('Tenant not found.');
    if (typeof body.status === 'string') biz.status = body.status;
    if (typeof body.subscriptionPlan === 'string') biz.subscriptionPlan = body.subscriptionPlan;
    addAudit(bizId, 'admin.tenant_updated', 'business', String(bizId), `Updated status=${biz.status}, plan=${biz.subscriptionPlan}`);
    return { business: biz } as T;
  }

  throw new Error(`Demo endpoint not implemented: ${method} ${pathname}`);
}
