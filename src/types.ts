export interface UserProfile {
  id: number;
  uid: string;
  email: string;
  displayName: string;
  role: 'owner' | 'super_admin' | string;
}

export interface WorkingDayConfig {
  enabled: boolean;
  open: string;
  close: string;
}

export interface WorkingDaysMap {
  mon: WorkingDayConfig;
  tue: WorkingDayConfig;
  wed: WorkingDayConfig;
  thu: WorkingDayConfig;
  fri: WorkingDayConfig;
  sat: WorkingDayConfig;
  sun: WorkingDayConfig;
}

export interface BlockedSlot {
  date: string;
  startTime: string;
  endTime: string;
  reason?: string;
}

export interface BusinessRecord {
  id: number;
  ownerUid: string;
  slug: string;
  businessName: string;
  businessEmail: string;
  contactPerson: string;
  country: string;
  timezone: string;
  businessCategory: string;
  websiteUrl: string;
  whatsappPhone: string;
  description: string;
  address: string;
  currency: string;
  subscriptionPlan: string;
  status: string;
  isDemoPublic: boolean;
  agentName: string;
  agentGreeting: string;
  agentPersonality: string;
  agentInstructions: string;
  bookingPolicy: string;
  escalationPolicy: string;
  widgetBrandColor: string;
  reminder24h: boolean;
  reminder2h: boolean;
  onboardingStep: number;
  tokenUsage: number;
  messageCount: number;
  createdAt: string;
}

export interface ServiceRecord {
  id: number;
  businessId: number;
  name: string;
  description: string;
  category: string;
  durationMinutes: number;
  price: number;
  currency: string;
  bufferMinutes: number;
  staffMember: string;
  advancePaymentRequired: boolean;
  allowDirectBooking: boolean;
  isActive: boolean;
}

export interface PackageRecord {
  id: number;
  businessId: number;
  name: string;
  description: string;
  includedServices: string;
  sessionCount: number;
  price: number;
  currency: string;
  validityDays: number;
  conditions: string;
  isActive: boolean;
}

export interface AvailabilityRecord {
  businessId: number;
  workingDaysJson: WorkingDaysMap;
  breakStart: string;
  breakEnd: string;
  slotIntervalMinutes: number;
  minAdvanceHours: number;
  maxAdvanceDays: number;
  cancellationWindowHours: number;
  reschedulingPolicy: string;
  holidaysJson: string[];
  blockedSlotsJson: BlockedSlot[];
}

export interface WhatsAppTemplate {
  name: string;
  category: string;
  status: 'approved' | 'pending';
  body: string;
}

export interface WidgetConfig {
  welcomeMessage: string;
  quickPrompts: string[];
  enableWhatsAppHandoff: boolean;
  position: 'bottom-right' | 'bottom-left';
  brandColor: string;
}

export interface ChannelIntegrationRecord {
  id: number;
  businessId: number;
  channelType: 'whatsapp' | 'website_widget' | string;
  whatsappPhoneNumberId: string;
  whatsappBusinessAccountId: string;
  metaVerifyToken: string;
  webhookUrl: string;
  connectionStatus: string;
  approvedTemplatesJson: WhatsAppTemplate[];
  widgetConfigJson: WidgetConfig | null;
}

export interface KnowledgeItemRecord {
  id: number;
  businessId: number;
  sourceType: 'website_crawl' | 'faq' | 'policy' | 'document' | string;
  sourceUrl: string;
  title: string;
  content: string;
  isApproved: boolean;
  updatedAt: string;
}

export interface AppointmentRecord {
  id: number;
  bookingRef: string;
  serviceId: number | null;
  serviceName: string;
  price: number;
  currency: string;
  staffMember: string;
  appointmentDate: string;
  startTime: string;
  endTime: string;
  bookingStatus: 'confirmed' | 'rescheduled' | 'cancelled' | 'completed' | string;
  paymentStatus: 'unpaid' | 'pending' | 'paid' | string;
  channel: 'website' | 'whatsapp' | 'dashboard' | string;
  notes: string;
  createdAt: string;
  customerId: number;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
}

export interface CustomerRecord {
  id: number;
  businessId: number;
  name: string;
  phone: string;
  email: string;
  notes: string;
  preferredService: string;
  source?: string;
  marketingOptIn?: boolean;
  createdAt: string;
  bookingCount: number;
  upcomingCount: number;
  conversationCount: number;
  appointments: Array<{
    id: number;
    bookingRef: string;
    serviceNameSnapshot: string;
    appointmentDate: string;
    startTime: string;
    bookingStatus: string;
    priceSnapshot: number;
    currencySnapshot: string;
  }>;
}

export interface ConversationMessage {
  id: string;
  role: 'customer' | 'ai' | 'agent';
  text: string;
  timestamp: string;
  toolActions?: string[];
}

export interface ConversationRecord {
  id: number;
  businessId: number;
  customerId: number | null;
  sessionKey: string;
  customerName: string;
  customerPhone: string;
  channel: 'website' | 'whatsapp' | string;
  status: 'ai_active' | 'human_takeover' | 'resolved' | string;
  escalationReason: string;
  assignedTo: string;
  messagesJson: ConversationMessage[];
  lastMessageAt: string;
  createdAt: string;
}

export interface WorkspaceMetrics {
  totalAppointments: number;
  todayAppointments: number;
  upcomingAppointments: number;
  cancelledAppointments: number;
  totalConversations: number;
  humanEscalations: number;
  conversionRate: number;
  totalCustomers: number;
}

export interface BusinessWorkspaceData {
  business: BusinessRecord;
  services: ServiceRecord[];
  packages: PackageRecord[];
  availability: AvailabilityRecord;
  channels: ChannelIntegrationRecord[];
  knowledge: KnowledgeItemRecord[];
  metrics: WorkspaceMetrics;
}

export interface PublicBusinessPayload {
  business: {
    id: number;
    slug: string;
    businessName: string;
    businessCategory: string;
    description: string;
    address: string;
    timezone: string;
    currency: string;
    websiteUrl: string;
    whatsappPhone: string;
    agentName: string;
    agentGreeting: string;
    widgetBrandColor: string;
    bookingPolicy: string;
  };
  services: ServiceRecord[];
  packages: PackageRecord[];
  workingDays: WorkingDaysMap;
  widgetConfig: WidgetConfig;
  whatsappConnected: boolean;
}

export interface ExtractedWebsiteData {
  sourceUrl: string;
  extracted: {
    businessDescription: string;
    businessCategory: string;
    address: string;
    phone: string;
    email: string;
    operatingHoursSummary: string;
    bookingPolicy: string;
    services: Array<{
      name: string;
      description: string;
      category: string;
      durationMinutes: number;
      price: number;
      currency: string;
    }>;
    packages: Array<{
      name: string;
      description: string;
      includedServices: string;
      sessionCount: number;
      price: number;
      validityDays: number;
    }>;
    faqs: Array<{
      title: string;
      content: string;
    }>;
  };
}

export interface MisBucket {
  key: string;
  label: string;
  sublabel?: string;
  total: number;
  confirmed: number;
  completed: number;
  rescheduled: number;
  cancelled: number;
  whatsapp: number;
  website: number;
  dashboard: number;
  estimatedValue: number;
  lostValue: number;
  averageValue: number;
}

export interface MisServiceBreakdown {
  serviceName: string;
  totalBookings: number;
  activeBookings: number;
  cancelledBookings: number;
  estimatedValue: number;
  sharePercent: number;
}

export interface MisChannelBreakdown {
  channel: string;
  totalBookings: number;
  activeBookings: number;
  estimatedValue: number;
  sharePercent: number;
}

export interface MisReportResponse {
  currency: string;
  generatedAt: string;
  summary: {
    totalAppointments: number;
    activeAppointments: number;
    completedAppointments: number;
    cancelledAppointments: number;
    estimatedBusinessValue: number;
    cancelledValue: number;
    averageBookingValue: number;
    realizationRate: number;
    dailyCount: number;
    dailyValue: number;
    weeklyCount: number;
    weeklyValue: number;
    monthlyCount: number;
    monthlyValue: number;
  };
  daily: MisBucket[];
  weekly: MisBucket[];
  monthly: MisBucket[];
  byService: MisServiceBreakdown[];
  byChannel: MisChannelBreakdown[];
}

export interface CampaignRecord {
  id: number;
  businessId: number;
  title: string;
  campaignType: 'offer' | 'announcement' | string;
  channel: 'email' | 'whatsapp' | 'both' | string;
  subject: string;
  messageBody: string;
  audienceSegment: string;
  audienceFilterValue: string;
  attachedPackageId: number | null;
  totalTargeted: number;
  sentEmailCount: number;
  sentWhatsappCount: number;
  skippedCount: number;
  status: string;
  sentAt: string;
  createdAt: string;
}

export interface CampaignRecipientRecord {
  id: number;
  campaignId: number;
  customerId: number;
  customerName: string;
  email: string;
  phone: string;
  emailStatus: string;
  whatsappStatus: string;
  dispatchedAt: string;
}

export interface CampaignAudienceStats {
  totalCustomers: number;
  optedInCount: number;
  withEmailCount: number;
  withPhoneCount: number;
  bookedBeforeCount: number;
  importedDatabaseCount: number;
  maxAllowed: number;
  remainingCapacity: number;
}

export interface MasterProfileSnapshot {
  businessName: string;
  primaryCategory: string;
  additionalCategories: string[];
  description: string;
  address: string;
  phone: string;
  whatsappPhone: string;
  email: string;
  websiteUrl: string;
  appointmentBookingUrl: string;
  serviceArea: string;
  bookingPolicy: string;
  workingDays: WorkingDaysMap;
  holidays: string[];
  servicesSummary: Array<{
    name: string;
    category: string;
    durationMinutes: number;
    price: number;
    currency: string;
    description: string;
  }>;
  packagesSummary: Array<{
    name: string;
    sessionCount: number;
    price: number;
    currency: string;
    validityDays: number;
    description: string;
  }>;
  leadCaptureEnabled: boolean;
  instantWhatsappFallback: boolean;
}

export interface ProfileSyncEvent {
  id: string;
  timestamp: string;
  action:
    | 'copied_deskline_to_master'
    | 'copied_google_to_master'
    | 'linked_google_place'
    | 'live_audit'
    | 'published_master_profile';
  summary: string;
  actor: string;
  accuracyScore?: number;
}

export interface GoogleProfileRecord {
  id: number;
  businessId: number;
  googlePlaceId: string;
  storeCode: string;
  autoSyncFromDeskline: boolean;
  publicProfileEnabled: boolean;
  masterProfileJson: MasterProfileSnapshot;
  syncHistoryJson: ProfileSyncEvent[];
  lastCopiedFromDesklineAt: string | null;
  lastAuditedAt: string | null;
  lastAccuracyScore: number;
  updatedAt: string;
}

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

export interface GoogleProfileWorkspaceResponse {
  profile: GoogleProfileRecord;
  livePlace: LiveGooglePlaceDetails | null;
  audit: ProfileAccuracyAudit;
  jsonLd: Record<string, unknown>;
  publicProfileUrl: string;
  googleLeadCount: number;
  mapsConfigured: boolean;
  quotaExceeded?: boolean;
}

export function formatCurrency(amount: number, currency = 'INR'): string {
  const symbol =
    currency === 'INR'
      ? '₹'
      : currency === 'USD'
        ? '$'
        : currency === 'EUR'
          ? '€'
          : currency === 'GBP'
            ? '£'
            : `${currency} `;
  return `${symbol}${amount.toLocaleString()}`;
}

export function formatTimeDisplay(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

export function csvCell(value: string | number | null | undefined): string {
  const str = String(value ?? '');
  const safe = /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
  return `"${safe.replace(/"/g, '""')}"`;
}
