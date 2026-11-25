import { relations } from 'drizzle-orm';
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

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

export interface ConversationMessage {
  id: string;
  role: 'customer' | 'ai' | 'agent';
  text: string;
  timestamp: string;
  toolActions?: string[];
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

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  displayName: text('display_name').notNull().default(''),
  role: text('role').notNull().default('owner'), // 'owner' | 'super_admin'
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const businesses = pgTable('businesses', {
  id: serial('id').primaryKey(),
  ownerUid: text('owner_uid')
    .references(() => users.uid, { onDelete: 'cascade' })
    .notNull(),
  slug: text('slug').notNull().unique(),
  businessName: text('business_name').notNull(),
  businessEmail: text('business_email').notNull(),
  contactPerson: text('contact_person').notNull().default(''),
  country: text('country').notNull().default('India'),
  timezone: text('timezone').notNull().default('Asia/Kolkata'),
  businessCategory: text('business_category').notNull().default('Healthcare'),
  websiteUrl: text('website_url').notNull().default(''),
  whatsappPhone: text('whatsapp_phone').notNull().default(''),
  description: text('description').notNull().default(''),
  address: text('address').notNull().default(''),
  currency: text('currency').notNull().default('INR'),
  subscriptionPlan: text('subscription_plan').notNull().default('growth'), // 'starter' | 'growth' | 'enterprise'
  status: text('status').notNull().default('active'), // 'active' | 'suspended' | 'onboarding'
  isDemoPublic: boolean('is_demo_public').notNull().default(false),
  agentName: text('agent_name').notNull().default('Maya'),
  agentGreeting: text('agent_greeting')
    .notNull()
    .default('Hi! How can we help you today?'),
  agentPersonality: text('agent_personality')
    .notNull()
    .default('Friendly, professional, helpful, conversational, and concise.'),
  agentInstructions: text('agent_instructions').notNull().default(''),
  bookingPolicy: text('booking_policy')
    .notNull()
    .default('Please arrive 10 minutes before your scheduled appointment.'),
  escalationPolicy: text('escalation_policy')
    .notNull()
    .default('Connect to a human receptionist for billing disputes, medical emergencies, or custom group requests.'),
  widgetBrandColor: text('widget_brand_color').notNull().default('#0F766E'),
  reminder24h: boolean('reminder_24h').notNull().default(true),
  reminder2h: boolean('reminder_2h').notNull().default(true),
  onboardingStep: integer('onboarding_step').notNull().default(1),
  tokenUsage: integer('token_usage').notNull().default(0),
  messageCount: integer('message_count').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const channelIntegrations = pgTable('channel_integrations', {
  id: serial('id').primaryKey(),
  businessId: integer('business_id')
    .references(() => businesses.id, { onDelete: 'cascade' })
    .notNull(),
  channelType: text('channel_type').notNull(), // 'whatsapp' | 'website_widget'
  whatsappPhoneNumberId: text('whatsapp_phone_number_id').notNull().default(''),
  whatsappBusinessAccountId: text('whatsapp_business_account_id').notNull().default(''),
  metaVerifyToken: text('meta_verify_token').notNull().default(''),
  webhookUrl: text('webhook_url').notNull().default(''),
  connectionStatus: text('connection_status').notNull().default('not_connected'), // 'not_connected' | 'pending_verification' | 'connected'
  approvedTemplatesJson: jsonb('approved_templates_json')
    .$type<WhatsAppTemplate[]>()
    .notNull()
    .default([]),
  widgetConfigJson: jsonb('widget_config_json')
    .$type<WidgetConfig | null>()
    .default(null),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const services = pgTable('services', {
  id: serial('id').primaryKey(),
  businessId: integer('business_id')
    .references(() => businesses.id, { onDelete: 'cascade' })
    .notNull(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  category: text('category').notNull().default('General'),
  durationMinutes: integer('duration_minutes').notNull().default(30),
  price: integer('price').notNull().default(0),
  currency: text('currency').notNull().default('INR'),
  bufferMinutes: integer('buffer_minutes').notNull().default(0),
  staffMember: text('staff_member').notNull().default('Any Available Specialist'),
  advancePaymentRequired: boolean('advance_payment_required').notNull().default(false),
  allowDirectBooking: boolean('allow_direct_booking').notNull().default(true),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const packages = pgTable('packages', {
  id: serial('id').primaryKey(),
  businessId: integer('business_id')
    .references(() => businesses.id, { onDelete: 'cascade' })
    .notNull(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  includedServices: text('included_services').notNull().default(''),
  sessionCount: integer('session_count').notNull().default(1),
  price: integer('price').notNull().default(0),
  currency: text('currency').notNull().default('INR'),
  validityDays: integer('validity_days').notNull().default(90),
  conditions: text('conditions').notNull().default(''),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const availabilityRules = pgTable('availability_rules', {
  id: serial('id').primaryKey(),
  businessId: integer('business_id')
    .references(() => businesses.id, { onDelete: 'cascade' })
    .notNull()
    .unique(),
  workingDaysJson: jsonb('working_days_json').$type<WorkingDaysMap>().notNull(),
  breakStart: text('break_start').notNull().default('13:00'),
  breakEnd: text('break_end').notNull().default('14:00'),
  slotIntervalMinutes: integer('slot_interval_minutes').notNull().default(30),
  minAdvanceHours: integer('min_advance_hours').notNull().default(1),
  maxAdvanceDays: integer('max_advance_days').notNull().default(30),
  cancellationWindowHours: integer('cancellation_window_hours').notNull().default(12),
  reschedulingPolicy: text('rescheduling_policy')
    .notNull()
    .default('Free rescheduling up to 12 hours before the appointment.'),
  holidaysJson: jsonb('holidays_json').$type<string[]>().notNull().default([]),
  blockedSlotsJson: jsonb('blocked_slots_json').$type<BlockedSlot[]>().notNull().default([]),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const customers = pgTable('customers', {
  id: serial('id').primaryKey(),
  businessId: integer('business_id')
    .references(() => businesses.id, { onDelete: 'cascade' })
    .notNull(),
  name: text('name').notNull(),
  phone: text('phone').notNull().default(''),
  email: text('email').notNull().default(''),
  notes: text('notes').notNull().default(''),
  preferredService: text('preferred_service').notNull().default(''),
  source: text('source').notNull().default('booking'), // 'booking' | 'imported_database' | 'manual'
  marketingOptIn: boolean('marketing_opt_in').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const appointments = pgTable('appointments', {
  id: serial('id').primaryKey(),
  bookingRef: text('booking_ref').notNull().unique(),
  businessId: integer('business_id')
    .references(() => businesses.id, { onDelete: 'cascade' })
    .notNull(),
  customerId: integer('customer_id')
    .references(() => customers.id, { onDelete: 'cascade' })
    .notNull(),
  serviceId: integer('service_id').references(() => services.id, {
    onDelete: 'set null',
  }),
  serviceNameSnapshot: text('service_name_snapshot').notNull(),
  priceSnapshot: integer('price_snapshot').notNull().default(0),
  currencySnapshot: text('currency_snapshot').notNull().default('INR'),
  staffMember: text('staff_member').notNull().default('Any Available Specialist'),
  appointmentDate: text('appointment_date').notNull(), // YYYY-MM-DD
  startTime: text('start_time').notNull(), // HH:MM (24h)
  endTime: text('end_time').notNull(), // HH:MM (24h)
  bookingStatus: text('booking_status').notNull().default('confirmed'), // 'confirmed' | 'rescheduled' | 'cancelled' | 'completed'
  paymentStatus: text('payment_status').notNull().default('unpaid'), // 'unpaid' | 'pending' | 'paid'
  channel: text('channel').notNull().default('website'), // 'website' | 'whatsapp' | 'dashboard'
  notes: text('notes').notNull().default(''),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const conversations = pgTable('conversations', {
  id: serial('id').primaryKey(),
  businessId: integer('business_id')
    .references(() => businesses.id, { onDelete: 'cascade' })
    .notNull(),
  customerId: integer('customer_id').references(() => customers.id, {
    onDelete: 'set null',
  }),
  sessionKey: text('session_key').notNull(),
  customerName: text('customer_name').notNull().default('Website Visitor'),
  customerPhone: text('customer_phone').notNull().default(''),
  channel: text('channel').notNull().default('website'), // 'website' | 'whatsapp'
  status: text('status').notNull().default('ai_active'), // 'ai_active' | 'human_takeover' | 'resolved'
  escalationReason: text('escalation_reason').notNull().default(''),
  assignedTo: text('assigned_to').notNull().default(''),
  messagesJson: jsonb('messages_json')
    .$type<ConversationMessage[]>()
    .notNull()
    .default([]),
  lastMessageAt: timestamp('last_message_at').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const knowledgeItems = pgTable('knowledge_items', {
  id: serial('id').primaryKey(),
  businessId: integer('business_id')
    .references(() => businesses.id, { onDelete: 'cascade' })
    .notNull(),
  sourceType: text('source_type').notNull().default('faq'), // 'website_crawl' | 'faq' | 'policy' | 'document'
  sourceUrl: text('source_url').notNull().default(''),
  title: text('title').notNull(),
  content: text('content').notNull(),
  isApproved: boolean('is_approved').notNull().default(true),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const campaigns = pgTable('campaigns', {
  id: serial('id').primaryKey(),
  businessId: integer('business_id')
    .references(() => businesses.id, { onDelete: 'cascade' })
    .notNull(),
  title: text('title').notNull(),
  campaignType: text('campaign_type').notNull().default('offer'), // 'offer' | 'announcement'
  channel: text('channel').notNull().default('both'), // 'email' | 'whatsapp' | 'both'
  subject: text('subject').notNull().default(''),
  messageBody: text('message_body').notNull(),
  audienceSegment: text('audience_segment').notNull().default('all_existing'), // 'all_existing' | 'booked_before' | 'imported_database' | 'service_specific'
  audienceFilterValue: text('audience_filter_value').notNull().default(''),
  attachedPackageId: integer('attached_package_id').references(() => packages.id, {
    onDelete: 'set null',
  }),
  totalTargeted: integer('total_targeted').notNull().default(0),
  sentEmailCount: integer('sent_email_count').notNull().default(0),
  sentWhatsappCount: integer('sent_whatsapp_count').notNull().default(0),
  skippedCount: integer('skipped_count').notNull().default(0),
  status: text('status').notNull().default('sent'), // 'draft' | 'sent'
  createdByUid: text('created_by_uid').notNull().default(''),
  sentAt: timestamp('sent_at').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const campaignRecipients = pgTable('campaign_recipients', {
  id: serial('id').primaryKey(),
  campaignId: integer('campaign_id')
    .references(() => campaigns.id, { onDelete: 'cascade' })
    .notNull(),
  businessId: integer('business_id')
    .references(() => businesses.id, { onDelete: 'cascade' })
    .notNull(),
  customerId: integer('customer_id')
    .references(() => customers.id, { onDelete: 'cascade' })
    .notNull(),
  customerName: text('customer_name').notNull(),
  email: text('email').notNull().default(''),
  phone: text('phone').notNull().default(''),
  emailStatus: text('email_status').notNull().default('not_applicable'), // 'sent' | 'skipped' | 'not_applicable'
  whatsappStatus: text('whatsapp_status').notNull().default('not_applicable'), // 'sent' | 'skipped' | 'not_applicable'
  dispatchedAt: timestamp('dispatched_at').defaultNow().notNull(),
});

export const googleProfiles = pgTable('google_profiles', {
  id: serial('id').primaryKey(),
  businessId: integer('business_id')
    .references(() => businesses.id, { onDelete: 'cascade' })
    .notNull()
    .unique(),
  googlePlaceId: text('google_place_id').notNull().default(''),
  storeCode: text('store_code').notNull().default(''),
  autoSyncFromDeskline: boolean('auto_sync_from_deskline').notNull().default(true),
  publicProfileEnabled: boolean('public_profile_enabled').notNull().default(true),
  masterProfileJson: jsonb('master_profile_json')
    .$type<MasterProfileSnapshot>()
    .notNull(),
  syncHistoryJson: jsonb('sync_history_json')
    .$type<ProfileSyncEvent[]>()
    .notNull()
    .default([]),
  lastCopiedFromDesklineAt: timestamp('last_copied_from_deskline_at'),
  lastAuditedAt: timestamp('last_audited_at'),
  lastAccuracyScore: integer('last_accuracy_score').notNull().default(100),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const auditLogs = pgTable('audit_logs', {
  id: serial('id').primaryKey(),
  businessId: integer('business_id').references(() => businesses.id, {
    onDelete: 'set null',
  }),
  actorUid: text('actor_uid').notNull().default('system'),
  action: text('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull().default(''),
  details: text('details').notNull().default(''),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const usersRelations = relations(users, ({ many }) => ({
  businesses: many(businesses),
}));

export const businessesRelations = relations(businesses, ({ one, many }) => ({
  owner: one(users, {
    fields: [businesses.ownerUid],
    references: [users.uid],
  }),
  services: many(services),
  packages: many(packages),
  customers: many(customers),
  appointments: many(appointments),
  conversations: many(conversations),
  knowledgeItems: many(knowledgeItems),
  channelIntegrations: many(channelIntegrations),
  campaigns: many(campaigns),
  googleProfile: one(googleProfiles, {
    fields: [businesses.id],
    references: [googleProfiles.businessId],
  }),
}));
