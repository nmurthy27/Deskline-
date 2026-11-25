import crypto from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/index.ts';
import {
  auditLogs,
  availabilityRules,
  businesses,
  googleProfiles,
  packages,
  services,
  type MasterProfileSnapshot,
  type ProfileSyncEvent,
  type WorkingDaysMap,
} from '../db/schema.ts';
import { DEFAULT_WORKING_DAYS } from './bookingEngine.ts';

const GMP_SOLUTION_ID = 'gmp_mcp_codeassist_v1_aistudio';
const PLACE_ID_REGEX = /^[A-Za-z0-9_-]{8,160}$/;

export interface LiveGooglePlaceCandidate {
  id: string;
  displayName: string;
  formattedAddress: string;
  primaryTypeDisplayName: string;
  businessStatus: string;
  internationalPhoneNumber: string;
  nationalPhoneNumber: string;
  websiteUri: string;
  googleMapsUri: string;
  rating: number | null;
  userRatingCount: number | null;
  location: { lat: number; lng: number } | null;
}

export interface LiveGooglePlaceDetails extends LiveGooglePlaceCandidate {
  weekdayDescriptions: string[];
  parsedWorkingDays: WorkingDaysMap | null;
  editorialSummary: string;
  directionsUri: string;
  writeAReviewUri: string;
  reviewsUri: string;
  timeZoneId: string;
}

export interface ProfileAuditCheck {
  fieldKey: string;
  label: string;
  masterValue: string;
  googleValue: string;
  status: 'matched' | 'mismatch' | 'missing_on_google' | 'needs_setup';
  recommendation: string;
}

export interface ProfileAccuracyAudit {
  accuracyScore: number;
  matchedCount: number;
  totalChecks: number;
  checks: ProfileAuditCheck[];
  auditedAt: string;
}

export function getGoogleMapsApiKey(): string {
  return (
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.VITE_GOOGLE_MAPS_API_KEY ||
    ''
  ).trim();
}

function normalizeOrigin(rawOrigin?: string): string {
  const candidate = (rawOrigin || process.env.APP_URL || 'http://localhost:3000').trim();
  return candidate.replace(/\/+$/, '');
}

function normalizePhoneDigits(phone: string): string {
  return String(phone || '').replace(/\D/g, '');
}

function normalizeUrlForCompare(raw: string): string {
  const trimmed = String(raw || '').trim().toLowerCase();
  if (!trimmed) return '';
  try {
    const parsed = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    const host = parsed.hostname.replace(/^www\./, '');
    const path = parsed.pathname.replace(/\/+$/, '');
    return `${host}${path}`;
  } catch {
    return trimmed.replace(/^https?:\/\/(www\.)?/, '').replace(/\/+$/, '');
  }
}

function normalizeText(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function pad2(n: number): string {
  return String(Math.max(0, Math.min(23, Math.floor(n)))).padStart(2, '0');
}

function padMin(n: number): string {
  return String(Math.max(0, Math.min(59, Math.floor(n)))).padStart(2, '0');
}

const DAY_KEYS: Array<keyof WorkingDaysMap> = [
  'sun',
  'mon',
  'tue',
  'wed',
  'thu',
  'fri',
  'sat',
];

const ORDERED_DAY_KEYS: Array<{ key: keyof WorkingDaysMap; label: string; schemaDay: string }> = [
  { key: 'mon', label: 'Mon', schemaDay: 'Monday' },
  { key: 'tue', label: 'Tue', schemaDay: 'Tuesday' },
  { key: 'wed', label: 'Wed', schemaDay: 'Wednesday' },
  { key: 'thu', label: 'Thu', schemaDay: 'Thursday' },
  { key: 'fri', label: 'Fri', schemaDay: 'Friday' },
  { key: 'sat', label: 'Sat', schemaDay: 'Saturday' },
  { key: 'sun', label: 'Sun', schemaDay: 'Sunday' },
];

function parseGoogleOpeningHoursToWorkingDays(
  regularOpeningHours: unknown
): WorkingDaysMap | null {
  if (!regularOpeningHours || typeof regularOpeningHours !== 'object') return null;
  const periods = (regularOpeningHours as { periods?: unknown[] }).periods;
  if (!Array.isArray(periods) || periods.length === 0) return null;

  const result: WorkingDaysMap = {
    mon: { enabled: false, open: '09:00', close: '18:00' },
    tue: { enabled: false, open: '09:00', close: '18:00' },
    wed: { enabled: false, open: '09:00', close: '18:00' },
    thu: { enabled: false, open: '09:00', close: '18:00' },
    fri: { enabled: false, open: '09:00', close: '18:00' },
    sat: { enabled: false, open: '09:00', close: '18:00' },
    sun: { enabled: false, open: '09:00', close: '18:00' },
  };

  for (const period of periods) {
    if (!period || typeof period !== 'object') continue;
    const p = period as {
      open?: { day?: number; hour?: number; minute?: number };
      close?: { day?: number; hour?: number; minute?: number };
    };
    if (typeof p.open?.day !== 'number') continue;
    const dayKey = DAY_KEYS[p.open.day];
    if (!dayKey) continue;

    const openHour = typeof p.open.hour === 'number' ? p.open.hour : 9;
    const openMinute = typeof p.open.minute === 'number' ? p.open.minute : 0;
    const closeHour = typeof p.close?.hour === 'number' ? p.close.hour : 18;
    const closeMinute = typeof p.close?.minute === 'number' ? p.close.minute : 0;

    // If open 24h (day 0, hour 0, minute 0 without close), enable all days 00:00 - 23:59
    if (!p.close && p.open.day === 0 && openHour === 0 && openMinute === 0) {
      for (const dk of DAY_KEYS) {
        result[dk] = { enabled: true, open: '00:00', close: '23:59' };
      }
      return result;
    }

    result[dayKey] = {
      enabled: true,
      open: `${pad2(openHour)}:${padMin(openMinute)}`,
      close: `${pad2(closeHour)}:${padMin(closeMinute)}`,
    };
  }

  return result;
}

export function formatWorkingDaysSummary(days: WorkingDaysMap): string {
  return ORDERED_DAY_KEYS.map(({ key, label }) => {
    const cfg = days[key];
    if (!cfg || !cfg.enabled) return `${label}: Closed`;
    return `${label}: ${cfg.open}–${cfg.close}`;
  }).join(' | ');
}

function isQuotaError(status: number, bodyText: string): boolean {
  if (status === 429) return true;
  const upper = bodyText.toUpperCase();
  return upper.includes('RESOURCE_EXHAUSTED') || upper.includes('OVER_QUERY_LIMIT');
}

function mapRawPlaceToCandidate(raw: Record<string, unknown>): LiveGooglePlaceCandidate {
  const displayNameObj = raw.displayName as { text?: string } | undefined;
  const primaryTypeObj = raw.primaryTypeDisplayName as { text?: string } | undefined;
  const locObj = raw.location as { latitude?: number; longitude?: number } | undefined;

  return {
    id: String(raw.id || ''),
    displayName: String(displayNameObj?.text || ''),
    formattedAddress: String(raw.formattedAddress || ''),
    primaryTypeDisplayName: String(primaryTypeObj?.text || ''),
    businessStatus: String(raw.businessStatus || 'OPERATIONAL'),
    internationalPhoneNumber: String(raw.internationalPhoneNumber || ''),
    nationalPhoneNumber: String(raw.nationalPhoneNumber || ''),
    websiteUri: String(raw.websiteUri || ''),
    googleMapsUri: String(raw.googleMapsUri || ''),
    rating: typeof raw.rating === 'number' ? raw.rating : null,
    userRatingCount: typeof raw.userRatingCount === 'number' ? raw.userRatingCount : null,
    location:
      typeof locObj?.latitude === 'number' && typeof locObj?.longitude === 'number'
        ? { lat: locObj.latitude, lng: locObj.longitude }
        : null,
  };
}

const DEMO_FALLBACK_PLACES: Record<string, LiveGooglePlaceDetails> = {
  demo_place_soma_indiranagar: {
    id: 'demo_place_soma_indiranagar',
    displayName: 'Soma Wellness & Dental',
    formattedAddress: '42, 100 Feet Road, HAL 2nd Stage, Indiranagar, Bengaluru, Karnataka 560038',
    primaryTypeDisplayName: 'Dental Clinic (Sample Demo Listing)',
    businessStatus: 'OPERATIONAL',
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
    editorialSummary: 'Sample demo clinic profile for previewing Google Master Profile Sync before adding an API key.',
    directionsUri: 'https://maps.google.com/?daddr=12.9716,77.6412',
    writeAReviewUri: 'https://maps.google.com/?q=Soma+Wellness+Dental+Indiranagar',
    reviewsUri: 'https://maps.google.com/?q=Soma+Wellness+Dental+Indiranagar',
    timeZoneId: 'Asia/Kolkata',
  },
};

/**
 * Search Google Public Profiles via Places API (New) Text Search (server-side proxy to avoid CORS).
 */
export async function searchGooglePublicProfiles(
  query: string,
  regionCode?: string
): Promise<
  | { ok: true; places: LiveGooglePlaceCandidate[] }
  | { ok: false; error: string; quotaExceeded?: boolean; statusCode?: number }
> {
  const apiKey = getGoogleMapsApiKey();
  if (!apiKey) {
    return {
      ok: true,
      places: Object.values(DEMO_FALLBACK_PLACES),
    };
  }

  const cleanQuery = String(query || '').trim();
  if (!cleanQuery || cleanQuery.length < 2) {
    return { ok: false, error: 'Enter a business name or address to search Google.' };
  }

  const fieldMask = [
    'places.id',
    'places.displayName',
    'places.formattedAddress',
    'places.location',
    'places.businessStatus',
    'places.primaryTypeDisplayName',
    'places.internationalPhoneNumber',
    'places.nationalPhoneNumber',
    'places.websiteUri',
    'places.googleMapsUri',
    'places.rating',
    'places.userRatingCount',
  ].join(',');

  const body: Record<string, unknown> = {
    textQuery: cleanQuery.slice(0, 200),
    pageSize: 6,
    languageCode: 'en',
  };
  if (regionCode && /^[A-Za-z]{2}$/.test(regionCode)) {
    body.regionCode = regionCode.toUpperCase();
  }

  try {
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': fieldMask,
        'X-Goog-Maps-Solution-ID': GMP_SOLUTION_ID,
      },
      body: JSON.stringify(body),
    });

    const rawText = await res.text();
    if (!res.ok) {
      if (isQuotaError(res.status, rawText)) {
        return {
          ok: false,
          quotaExceeded: true,
          statusCode: 429,
          error: 'Google Maps Platform quota limit reached.',
        };
      }
      console.error('Places Text Search error:', res.status, rawText.slice(0, 300));
      return {
        ok: false,
        statusCode: res.status,
        error: 'Unable to search Google Public Profiles right now. Please try a more specific business name and city.',
      };
    }

    const data = JSON.parse(rawText) as { places?: Record<string, unknown>[] };
    const candidates = Array.isArray(data.places)
      ? data.places.map(mapRawPlaceToCandidate).filter((p) => Boolean(p.id))
      : [];

    return { ok: true, places: candidates };
  } catch (err) {
    console.error('Places Text Search network failure:', err);
    return {
      ok: false,
      error: 'Network error contacting Google Places API.',
      statusCode: 502,
    };
  }
}

/**
 * Fetch live Google Public Profile details on-demand via Places API (New) using a verified Place ID.
 */
export async function fetchLiveGooglePlaceDetails(
  placeId: string
): Promise<
  | { ok: true; place: LiveGooglePlaceDetails }
  | { ok: false; error: string; quotaExceeded?: boolean; statusCode?: number }
> {
  const cleanId = String(placeId || '').trim();
  if (cleanId.startsWith('demo_place_') && DEMO_FALLBACK_PLACES[cleanId]) {
    return { ok: true, place: DEMO_FALLBACK_PLACES[cleanId] };
  }

  const apiKey = getGoogleMapsApiKey();
  if (!apiKey) {
    return { ok: true, place: DEMO_FALLBACK_PLACES.demo_place_soma_indiranagar };
  }

  if (!PLACE_ID_REGEX.test(cleanId)) {
    return { ok: false, error: 'Invalid Google Place ID format.', statusCode: 400 };
  }

  const fieldMask = [
    'id',
    'displayName',
    'formattedAddress',
    'location',
    'businessStatus',
    'primaryTypeDisplayName',
    'internationalPhoneNumber',
    'nationalPhoneNumber',
    'websiteUri',
    'googleMapsUri',
    'googleMapsLinks',
    'rating',
    'userRatingCount',
    'regularOpeningHours',
    'editorialSummary',
    'timeZone',
  ].join(',');

  try {
    const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(cleanId)}?languageCode=en`;
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': fieldMask,
        'X-Goog-Maps-Solution-ID': GMP_SOLUTION_ID,
      },
    });

    const rawText = await res.text();
    if (!res.ok) {
      if (isQuotaError(res.status, rawText)) {
        return {
          ok: false,
          quotaExceeded: true,
          statusCode: 429,
          error: 'Google Maps Platform quota limit reached.',
        };
      }
      console.error('Place Details error:', res.status, rawText.slice(0, 300));
      return {
        ok: false,
        statusCode: res.status,
        error: 'Unable to retrieve live Google listing details for this Place ID.',
      };
    }

    const raw = JSON.parse(rawText) as Record<string, unknown>;
    const base = mapRawPlaceToCandidate(raw);
    const hoursObj = raw.regularOpeningHours as
      | { weekdayDescriptions?: string[] }
      | undefined;
    const linksObj = raw.googleMapsLinks as
      | { directionsUri?: string; writeAReviewUri?: string; reviewsUri?: string }
      | undefined;
    const summaryObj = raw.editorialSummary as { text?: string } | undefined;
    const tzObj = raw.timeZone as { id?: string } | undefined;

    const place: LiveGooglePlaceDetails = {
      ...base,
      weekdayDescriptions: Array.isArray(hoursObj?.weekdayDescriptions)
        ? hoursObj.weekdayDescriptions.map(String)
        : [],
      parsedWorkingDays: parseGoogleOpeningHoursToWorkingDays(raw.regularOpeningHours),
      editorialSummary: String(summaryObj?.text || ''),
      directionsUri: String(linksObj?.directionsUri || base.googleMapsUri || ''),
      writeAReviewUri: String(linksObj?.writeAReviewUri || ''),
      reviewsUri: String(linksObj?.reviewsUri || ''),
      timeZoneId: String(tzObj?.id || ''),
    };

    return { ok: true, place };
  } catch (err) {
    console.error('Place Details network failure:', err);
    return {
      ok: false,
      error: 'Network error fetching live Google Place details.',
      statusCode: 502,
    };
  }
}

/**
 * Compile all Deskline business details (registration, hours, services, packages, booking link)
 * into a canonical Master Business Profile snapshot.
 */
export async function buildMasterProfileFromDeskline(
  businessId: number,
  appOrigin?: string
): Promise<MasterProfileSnapshot> {
  const origin = normalizeOrigin(appOrigin);
  const [[biz], activeServices, activePackages, [avail]] = await Promise.all([
    db.select().from(businesses).where(eq(businesses.id, businessId)).limit(1),
    db
      .select()
      .from(services)
      .where(and(eq(services.businessId, businessId), eq(services.isActive, true))),
    db
      .select()
      .from(packages)
      .where(and(eq(packages.businessId, businessId), eq(packages.isActive, true))),
    db
      .select()
      .from(availabilityRules)
      .where(eq(availabilityRules.businessId, businessId))
      .limit(1),
  ]);

  if (!biz) {
    throw new Error('Business not found.');
  }

  const bookingUrl = `${origin}/?widget=${encodeURIComponent(biz.slug)}&source=google_profile`;

  return {
    businessName: biz.businessName,
    primaryCategory: biz.businessCategory || 'Local Business',
    additionalCategories: [],
    description: biz.description || '',
    address: biz.address || '',
    phone: biz.whatsappPhone || '',
    whatsappPhone: biz.whatsappPhone || '',
    email: biz.businessEmail || '',
    websiteUrl: biz.websiteUrl || `${origin}/?profile=${encodeURIComponent(biz.slug)}`,
    appointmentBookingUrl: bookingUrl,
    serviceArea: biz.country || '',
    bookingPolicy: biz.bookingPolicy || '',
    workingDays: avail?.workingDaysJson ?? DEFAULT_WORKING_DAYS,
    holidays: avail?.holidaysJson ?? [],
    servicesSummary: activeServices.map((s) => ({
      name: s.name,
      category: s.category,
      durationMinutes: s.durationMinutes,
      price: s.price,
      currency: s.currency,
      description: s.description,
    })),
    packagesSummary: activePackages.map((p) => ({
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

/**
 * Load existing Google Profile row or initialize it automatically from Deskline business details.
 */
export async function getOrInitGoogleProfile(businessId: number, appOrigin?: string) {
  const [existing] = await db
    .select()
    .from(googleProfiles)
    .where(eq(googleProfiles.businessId, businessId))
    .limit(1);

  if (existing) {
    return existing;
  }

  const snapshot = await buildMasterProfileFromDeskline(businessId, appOrigin);
  const initEvent: ProfileSyncEvent = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    action: 'copied_deskline_to_master',
    summary: `Initialized Master Profile with ${snapshot.servicesSummary.length} services, ${snapshot.packagesSummary.length} packages, and operating hours from Deskline.`,
    actor: 'system',
  };

  const [created] = await db
    .insert(googleProfiles)
    .values({
      businessId,
      googlePlaceId: '',
      storeCode: `DL-${businessId}`,
      autoSyncFromDeskline: true,
      publicProfileEnabled: true,
      masterProfileJson: snapshot,
      syncHistoryJson: [initEvent],
      lastCopiedFromDesklineAt: new Date(),
      lastAccuracyScore: 100,
    })
    .returning();

  return created;
}

/**
 * Field-by-field live accuracy audit between Deskline's Master Profile and the live Google Public Profile.
 */
export function computeFieldAccuracyAudit(
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
        recommendation: hasCore
          ? 'Core NAP (Name, Address, Phone) is complete in your Master Profile.'
          : 'Complete your business address and phone in Master Profile so Google leads can reach you.',
      },
      {
        fieldKey: 'booking_lead_capture',
        label: '24/7 Google Booking Link',
        masterValue: master.appointmentBookingUrl || 'Not configured',
        googleValue: 'Ready to paste into Google Booking URL',
        status: hasBooking ? 'matched' : 'needs_setup',
        recommendation:
          'Add this direct booking URL to your Google Business Profile Booking section so visitors convert 24/7.',
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

  // 1. Business Name
  const nameMatch =
    normalizeText(master.businessName) !== '' &&
    normalizeText(master.businessName) === normalizeText(livePlace.displayName);
  checks.push({
    fieldKey: 'businessName',
    label: 'Business Name',
    masterValue: master.businessName || '—',
    googleValue: livePlace.displayName || '—',
    status: !livePlace.displayName
      ? 'missing_on_google'
      : nameMatch
        ? 'matched'
        : 'mismatch',
    recommendation: nameMatch
      ? 'Exact match on Google Search & Maps.'
      : 'Align your business name between Deskline Master Profile and Google Business Profile.',
  });

  // 2. Operational Status
  const isOperational = livePlace.businessStatus === 'OPERATIONAL';
  checks.push({
    fieldKey: 'businessStatus',
    label: 'Operational Status',
    masterValue: 'Open & Accepting Bookings',
    googleValue: livePlace.businessStatus || 'UNKNOWN',
    status: isOperational ? 'matched' : 'mismatch',
    recommendation: isOperational
      ? 'Listing is actively marked OPERATIONAL on Google.'
      : 'Urgent: Your Google listing is not marked OPERATIONAL — leads may assume you are closed.',
  });

  // 3. Street Address
  const masterAddrNorm = normalizeText(master.address);
  const googleAddrNorm = normalizeText(livePlace.formattedAddress);
  const addrMatch =
    Boolean(masterAddrNorm && googleAddrNorm) &&
    (masterAddrNorm === googleAddrNorm ||
      googleAddrNorm.includes(masterAddrNorm) ||
      masterAddrNorm.includes(googleAddrNorm));
  checks.push({
    fieldKey: 'address',
    label: 'Business Address',
    masterValue: master.address || 'Not set',
    googleValue: livePlace.formattedAddress || 'Missing on Google',
    status: !livePlace.formattedAddress
      ? 'missing_on_google'
      : addrMatch
        ? 'matched'
        : 'mismatch',
    recommendation: addrMatch
      ? 'Address matches your live Google Maps pin.'
      : 'Copy the verified address so walk-in customers and directions never point to the wrong location.',
  });

  // 4. Phone Number
  const masterDigits = normalizePhoneDigits(master.phone || master.whatsappPhone);
  const googleDigits = normalizePhoneDigits(
    livePlace.internationalPhoneNumber || livePlace.nationalPhoneNumber
  );
  const phoneMatch =
    Boolean(masterDigits && googleDigits) &&
    (masterDigits === googleDigits ||
      masterDigits.endsWith(googleDigits.slice(-10)) ||
      googleDigits.endsWith(masterDigits.slice(-10)));
  checks.push({
    fieldKey: 'phone',
    label: 'Phone / WhatsApp Number',
    masterValue: master.phone || master.whatsappPhone || 'Not set',
    googleValue:
      livePlace.internationalPhoneNumber ||
      livePlace.nationalPhoneNumber ||
      'Missing on Google',
    status: !googleDigits
      ? 'missing_on_google'
      : phoneMatch
        ? 'matched'
        : 'mismatch',
    recommendation: phoneMatch
      ? 'Phone number matches across Google & Deskline.'
      : 'Update your phone number on Google or import Google’s primary phone so call leads never bounce.',
  });

  // 5. Website URL
  const masterUrlNorm = normalizeUrlForCompare(master.websiteUrl);
  const googleUrlNorm = normalizeUrlForCompare(livePlace.websiteUri);
  const urlMatch =
    Boolean(masterUrlNorm && googleUrlNorm) &&
    (masterUrlNorm === googleUrlNorm ||
      masterUrlNorm.split('/')[0] === googleUrlNorm.split('/')[0]);
  checks.push({
    fieldKey: 'websiteUrl',
    label: 'Website URL',
    masterValue: master.websiteUrl || 'Not set',
    googleValue: livePlace.websiteUri || 'Missing on Google',
    status: !googleUrlNorm
      ? 'missing_on_google'
      : urlMatch
        ? 'matched'
        : 'mismatch',
    recommendation: urlMatch
      ? 'Website domain is consistent with Google.'
      : 'Ensure your Google website points to your active website or Deskline Master Public Profile.',
  });

  // 6. Operating Hours
  let hoursMatch = false;
  if (livePlace.parsedWorkingDays) {
    let dayMatches = 0;
    for (const { key } of ORDERED_DAY_KEYS) {
      const m = master.workingDays?.[key];
      const g = livePlace.parsedWorkingDays[key];
      if (!m && !g) {
        dayMatches++;
      } else if (m && g && m.enabled === g.enabled) {
        if (!m.enabled || (m.open === g.open && m.close === g.close)) {
          dayMatches++;
        }
      }
    }
    hoursMatch = dayMatches >= 6;
  }
  checks.push({
    fieldKey: 'workingDays',
    label: 'Weekly Operating Hours',
    masterValue: formatWorkingDaysSummary(master.workingDays),
    googleValue:
      livePlace.weekdayDescriptions.length > 0
        ? livePlace.weekdayDescriptions.join(' | ')
        : 'Not listed on Google',
    status:
      livePlace.weekdayDescriptions.length === 0
        ? 'missing_on_google'
        : hoursMatch
          ? 'matched'
          : 'mismatch',
    recommendation: hoursMatch
      ? 'Operating hours match your Deskline booking availability.'
      : 'Sync opening hours so Google never shows "Closed" when your AI receptionist is accepting bookings.',
  });

  // 7. 24/7 AI Booking & Lead Capture Readiness
  const leadCaptureReady =
    Boolean(master.appointmentBookingUrl) &&
    master.servicesSummary.length > 0 &&
    master.leadCaptureEnabled;
  checks.push({
    fieldKey: 'appointmentBookingUrl',
    label: '24/7 Booking & Lead Capture',
    masterValue: master.appointmentBookingUrl || 'Not configured',
    googleValue: `${master.servicesSummary.length} bookable services · ${master.packagesSummary.length} offers ready`,
    status: leadCaptureReady ? 'matched' : 'needs_setup',
    recommendation: leadCaptureReady
      ? 'Direct 24/7 AI Booking URL & LocalBusiness JSON-LD are active to capture every Google lead.'
      : 'Add at least one active service and enable 24/7 booking link to capture Google Search leads.',
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

/**
 * Copy ALL Deskline business details (info, services, packages, availability, policies, booking URL)
 * into the Master Profile stored in PostgreSQL.
 */
export async function copyDesklineToMasterProfile(
  businessId: number,
  appOrigin: string,
  actorUid: string
) {
  const existing = await getOrInitGoogleProfile(businessId, appOrigin);
  const freshSnapshot = await buildMasterProfileFromDeskline(businessId, appOrigin);

  // Preserve custom additionalCategories & leadCapture toggles if already customized
  const merged: MasterProfileSnapshot = {
    ...freshSnapshot,
    additionalCategories: existing.masterProfileJson?.additionalCategories ?? [],
    serviceArea:
      freshSnapshot.serviceArea || existing.masterProfileJson?.serviceArea || '',
    leadCaptureEnabled: existing.masterProfileJson?.leadCaptureEnabled ?? true,
    instantWhatsappFallback:
      freshSnapshot.whatsappPhone.length > 0
        ? (existing.masterProfileJson?.instantWhatsappFallback ?? true)
        : false,
  };

  let livePlace: LiveGooglePlaceDetails | null = null;
  if (existing.googlePlaceId) {
    const liveRes = await fetchLiveGooglePlaceDetails(existing.googlePlaceId);
    if (liveRes.ok) livePlace = liveRes.place;
  }

  const audit = computeFieldAccuracyAudit(merged, livePlace);
  const newEvent: ProfileSyncEvent = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    action: 'copied_deskline_to_master',
    summary: `Copied all business details (${merged.servicesSummary.length} services, ${merged.packagesSummary.length} packages, hours & 24/7 booking link) into Master Profile.`,
    actor: actorUid,
    accuracyScore: audit.accuracyScore,
  };

  const nextHistory = [newEvent, ...(existing.syncHistoryJson || [])].slice(0, 25);

  const [updated] = await db
    .update(googleProfiles)
    .set({
      masterProfileJson: merged,
      syncHistoryJson: nextHistory,
      lastCopiedFromDesklineAt: new Date(),
      lastAuditedAt: livePlace ? new Date() : existing.lastAuditedAt,
      lastAccuracyScore: audit.accuracyScore,
      updatedAt: new Date(),
    })
    .where(eq(googleProfiles.businessId, businessId))
    .returning();

  await db.insert(auditLogs).values({
    businessId,
    actorUid,
    action: 'google_profile.copied_from_deskline',
    entityType: 'google_profile',
    entityId: String(updated.id),
    details: newEvent.summary,
  });

  return { profile: updated, livePlace, audit };
}

/**
 * Link a real Google Place ID and optionally copy its live verified Google Public Profile details
 * into Deskline's Master Profile (and optionally back into Deskline's core business record & hours).
 */
export async function copyGooglePlaceToMasterProfile(params: {
  businessId: number;
  placeId: string;
  copyFieldsIntoMaster: boolean;
  alsoUpdateDesklineCore: boolean;
  appOrigin: string;
  actorUid: string;
}) {
  const {
    businessId,
    placeId,
    copyFieldsIntoMaster,
    alsoUpdateDesklineCore,
    appOrigin,
    actorUid,
  } = params;

  const liveRes = await fetchLiveGooglePlaceDetails(placeId);
  if (!liveRes.ok) {
    return liveRes;
  }

  const livePlace = liveRes.place;
  const existing = await getOrInitGoogleProfile(businessId, appOrigin);
  const currentMaster = existing.masterProfileJson;

  let nextMaster: MasterProfileSnapshot = { ...currentMaster };
  if (copyFieldsIntoMaster) {
    nextMaster = {
      ...currentMaster,
      businessName: livePlace.displayName || currentMaster.businessName,
      primaryCategory:
        livePlace.primaryTypeDisplayName || currentMaster.primaryCategory,
      address: livePlace.formattedAddress || currentMaster.address,
      phone:
        livePlace.internationalPhoneNumber ||
        livePlace.nationalPhoneNumber ||
        currentMaster.phone,
      websiteUrl: livePlace.websiteUri || currentMaster.websiteUrl,
      description:
        currentMaster.description || livePlace.editorialSummary || '',
      workingDays: livePlace.parsedWorkingDays || currentMaster.workingDays,
    };

    if (alsoUpdateDesklineCore) {
      await db
        .update(businesses)
        .set({
          businessName: nextMaster.businessName,
          address: nextMaster.address,
          websiteUrl: nextMaster.websiteUrl,
          whatsappPhone: nextMaster.whatsappPhone || nextMaster.phone,
          description: nextMaster.description,
          updatedAt: new Date(),
        })
        .where(eq(businesses.id, businessId));

      if (livePlace.parsedWorkingDays) {
        await db
          .insert(availabilityRules)
          .values({
            businessId,
            workingDaysJson: livePlace.parsedWorkingDays,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: availabilityRules.businessId,
            set: {
              workingDaysJson: livePlace.parsedWorkingDays,
              updatedAt: new Date(),
            },
          });
      }
    }
  }

  const audit = computeFieldAccuracyAudit(nextMaster, livePlace);
  const actionType: ProfileSyncEvent['action'] = copyFieldsIntoMaster
    ? 'copied_google_to_master'
    : 'linked_google_place';
  const summary = copyFieldsIntoMaster
    ? `Linked Google Place (${livePlace.displayName}) and copied live address, phone, website, and hours into Master Profile${alsoUpdateDesklineCore ? ' + Deskline core settings' : ''}.`
    : `Linked Google Public Profile "${livePlace.displayName}" (${livePlace.id}) for live accuracy monitoring.`;

  const newEvent: ProfileSyncEvent = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    action: actionType,
    summary,
    actor: actorUid,
    accuracyScore: audit.accuracyScore,
  };

  const nextHistory = [newEvent, ...(existing.syncHistoryJson || [])].slice(0, 25);

  const [updated] = await db
    .update(googleProfiles)
    .set({
      googlePlaceId: livePlace.id,
      masterProfileJson: nextMaster,
      syncHistoryJson: nextHistory,
      lastAuditedAt: new Date(),
      lastAccuracyScore: audit.accuracyScore,
      updatedAt: new Date(),
    })
    .where(eq(googleProfiles.businessId, businessId))
    .returning();

  await db.insert(auditLogs).values({
    businessId,
    actorUid,
    action: copyFieldsIntoMaster
      ? 'google_profile.copied_from_google'
      : 'google_profile.linked_place',
    entityType: 'google_profile',
    entityId: String(updated.id),
    details: summary,
  });

  return { ok: true as const, profile: updated, livePlace, audit };
}

/**
 * Save manual edits to the Master Business Profile, optionally pushing canonical edits
 * back to Deskline's core business table so there is never drift.
 */
export async function saveMasterProfileEdits(params: {
  businessId: number;
  masterProfile: Partial<MasterProfileSnapshot>;
  storeCode?: string;
  autoSyncFromDeskline?: boolean;
  publicProfileEnabled?: boolean;
  syncBackToDeskline?: boolean;
  appOrigin: string;
  actorUid: string;
}) {
  const {
    businessId,
    masterProfile,
    storeCode,
    autoSyncFromDeskline,
    publicProfileEnabled,
    syncBackToDeskline,
    appOrigin,
    actorUid,
  } = params;

  const existing = await getOrInitGoogleProfile(businessId, appOrigin);
  const merged: MasterProfileSnapshot = {
    ...existing.masterProfileJson,
    businessName: String(
      masterProfile.businessName ?? existing.masterProfileJson.businessName
    ).trim(),
    primaryCategory: String(
      masterProfile.primaryCategory ?? existing.masterProfileJson.primaryCategory
    ).trim(),
    additionalCategories: Array.isArray(masterProfile.additionalCategories)
      ? masterProfile.additionalCategories.map((c) => String(c).trim()).filter(Boolean)
      : existing.masterProfileJson.additionalCategories,
    description: String(
      masterProfile.description ?? existing.masterProfileJson.description
    ).trim(),
    address: String(masterProfile.address ?? existing.masterProfileJson.address).trim(),
    phone: String(masterProfile.phone ?? existing.masterProfileJson.phone).trim(),
    whatsappPhone: String(
      masterProfile.whatsappPhone ?? existing.masterProfileJson.whatsappPhone
    ).trim(),
    email: String(masterProfile.email ?? existing.masterProfileJson.email).trim(),
    websiteUrl: String(
      masterProfile.websiteUrl ?? existing.masterProfileJson.websiteUrl
    ).trim(),
    appointmentBookingUrl: String(
      masterProfile.appointmentBookingUrl ??
        existing.masterProfileJson.appointmentBookingUrl
    ).trim(),
    serviceArea: String(
      masterProfile.serviceArea ?? existing.masterProfileJson.serviceArea
    ).trim(),
    bookingPolicy: String(
      masterProfile.bookingPolicy ?? existing.masterProfileJson.bookingPolicy
    ).trim(),
    leadCaptureEnabled:
      typeof masterProfile.leadCaptureEnabled === 'boolean'
        ? masterProfile.leadCaptureEnabled
        : existing.masterProfileJson.leadCaptureEnabled,
    instantWhatsappFallback:
      typeof masterProfile.instantWhatsappFallback === 'boolean'
        ? masterProfile.instantWhatsappFallback
        : existing.masterProfileJson.instantWhatsappFallback,
  };

  if (syncBackToDeskline) {
    await db
      .update(businesses)
      .set({
        businessName: merged.businessName || undefined,
        businessCategory: merged.primaryCategory || undefined,
        description: merged.description,
        address: merged.address,
        whatsappPhone: merged.whatsappPhone || merged.phone,
        businessEmail: merged.email || undefined,
        websiteUrl: merged.websiteUrl,
        bookingPolicy: merged.bookingPolicy,
        updatedAt: new Date(),
      })
      .where(eq(businesses.id, businessId));
  }

  let livePlace: LiveGooglePlaceDetails | null = null;
  if (existing.googlePlaceId) {
    const liveRes = await fetchLiveGooglePlaceDetails(existing.googlePlaceId);
    if (liveRes.ok) livePlace = liveRes.place;
  }

  const audit = computeFieldAccuracyAudit(merged, livePlace);
  const newEvent: ProfileSyncEvent = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    action: 'published_master_profile',
    summary: `Updated Master Business Profile${syncBackToDeskline ? ' and synced back to Deskline core profile' : ''}.`,
    actor: actorUid,
    accuracyScore: audit.accuracyScore,
  };

  const nextHistory = [newEvent, ...(existing.syncHistoryJson || [])].slice(0, 25);

  const [updated] = await db
    .update(googleProfiles)
    .set({
      storeCode:
        typeof storeCode === 'string' ? storeCode.trim().slice(0, 60) : existing.storeCode,
      autoSyncFromDeskline:
        typeof autoSyncFromDeskline === 'boolean'
          ? autoSyncFromDeskline
          : existing.autoSyncFromDeskline,
      publicProfileEnabled:
        typeof publicProfileEnabled === 'boolean'
          ? publicProfileEnabled
          : existing.publicProfileEnabled,
      masterProfileJson: merged,
      syncHistoryJson: nextHistory,
      lastAccuracyScore: audit.accuracyScore,
      updatedAt: new Date(),
    })
    .where(eq(googleProfiles.businessId, businessId))
    .returning();

  return { profile: updated, livePlace, audit };
}

/**
 * Automatically refresh Master Profile whenever Deskline core details change (if autoSync is enabled).
 */
export async function syncMasterIfAutoEnabled(businessId: number, appOrigin?: string) {
  try {
    const [existing] = await db
      .select()
      .from(googleProfiles)
      .where(eq(googleProfiles.businessId, businessId))
      .limit(1);

    if (!existing || !existing.autoSyncFromDeskline) return;

    const freshSnapshot = await buildMasterProfileFromDeskline(businessId, appOrigin);
    await db
      .update(googleProfiles)
      .set({
        masterProfileJson: {
          ...freshSnapshot,
          additionalCategories: existing.masterProfileJson?.additionalCategories ?? [],
          leadCaptureEnabled: existing.masterProfileJson?.leadCaptureEnabled ?? true,
        },
        lastCopiedFromDesklineAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(googleProfiles.businessId, businessId));
  } catch (err) {
    console.error('Background auto-sync to master profile skipped:', err);
  }
}

function mapCategoryToSchemaType(category: string): string {
  const lower = category.toLowerCase();
  if (lower.includes('dental') || lower.includes('dentist')) return 'Dentist';
  if (lower.includes('health') || lower.includes('clinic') || lower.includes('medical'))
    return 'MedicalClinic';
  if (lower.includes('beauty') || lower.includes('salon') || lower.includes('spa'))
    return 'BeautySalon';
  if (lower.includes('fitness') || lower.includes('gym') || lower.includes('yoga'))
    return 'HealthClub';
  if (lower.includes('auto') || lower.includes('car')) return 'AutoRepair';
  if (lower.includes('pet') || lower.includes('vet')) return 'VeterinaryCare';
  if (lower.includes('restaurant') || lower.includes('hospitality')) return 'Restaurant';
  if (lower.includes('professional') || lower.includes('legal') || lower.includes('consult'))
    return 'ProfessionalService';
  return 'LocalBusiness';
}

/**
 * Generate Schema.org LocalBusiness JSON-LD with ReserveAction so Google Search & Knowledge Panel
 * always stay aligned with Deskline's Master Business Profile.
 */
export function generateLocalBusinessJsonLd(
  slug: string,
  master: MasterProfileSnapshot,
  appOrigin?: string
) {
  const origin = normalizeOrigin(appOrigin);
  const publicProfileUrl = `${origin}/?profile=${encodeURIComponent(slug)}`;
  const bookingUrl =
    master.appointmentBookingUrl ||
    `${origin}/?widget=${encodeURIComponent(slug)}&source=google_profile`;

  const openingHoursSpecification = ORDERED_DAY_KEYS.filter(
    ({ key }) => master.workingDays?.[key]?.enabled
  ).map(({ key, schemaDay }) => ({
    '@type': 'OpeningHoursSpecification',
    dayOfWeek: schemaDay,
    opens: master.workingDays[key].open,
    closes: master.workingDays[key].close,
  }));

  const offers = [
    ...master.servicesSummary.map((s) => ({
      '@type': 'Offer',
      itemOffered: {
        '@type': 'Service',
        name: s.name,
        description: s.description || `${s.durationMinutes}-minute ${s.category} appointment`,
      },
      price: String(s.price),
      priceCurrency: s.currency || 'INR',
      availability: 'https://schema.org/InStock',
      url: bookingUrl,
    })),
    ...master.packagesSummary.map((p) => ({
      '@type': 'Offer',
      itemOffered: {
        '@type': 'Service',
        name: `${p.name} (${p.sessionCount} sessions)`,
        description: p.description || `Valid for ${p.validityDays} days`,
      },
      price: String(p.price),
      priceCurrency: p.currency || 'INR',
      availability: 'https://schema.org/InStock',
      url: bookingUrl,
    })),
  ];

  return {
    '@context': 'https://schema.org',
    '@type': mapCategoryToSchemaType(master.primaryCategory),
    name: master.businessName,
    description: master.description,
    url: master.websiteUrl || publicProfileUrl,
    sameAs: [publicProfileUrl],
    telephone: master.phone || master.whatsappPhone,
    email: master.email || undefined,
    address: {
      '@type': 'PostalAddress',
      streetAddress: master.address,
      addressCountry: master.serviceArea || undefined,
    },
    openingHoursSpecification,
    hasOfferCatalog:
      offers.length > 0
        ? {
            '@type': 'OfferCatalog',
            name: `${master.businessName} Services & Packages`,
            itemListElement: offers,
          }
        : undefined,
    potentialAction: {
      '@type': 'ReserveAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: bookingUrl,
        actionPlatform: [
          'http://schema.org/DesktopWebPlatform',
          'http://schema.org/MobileWebPlatform',
        ],
      },
      result: {
        '@type': 'Reservation',
        name: `Book Appointment at ${master.businessName}`,
      },
    },
  };
}
