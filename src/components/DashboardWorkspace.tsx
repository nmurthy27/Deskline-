import React, { useCallback, useEffect, useState } from 'react';
import {
  BookOpen,
  Building2,
  Calendar,
  Compass,
  Copy,
  ExternalLink,
  LayoutDashboard,
  Loader2,
  LogOut,
  MapPin,
  Megaphone,
  MessageSquare,
  Plus,
  Radio,
  Shield,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../lib/api';
import { resetDemoStore } from '../lib/demoStore';
import {
  formatCurrency,
  formatTimeDisplay,
  type AppointmentRecord,
  type BusinessRecord,
  type BusinessWorkspaceData,
  type ConversationRecord,
  type CustomerRecord,
} from '../types';
import { AdminConsolePanel } from './AdminConsolePanel';
import { AppointmentsPanel } from './AppointmentsPanel';
import { CampaignsPanel } from './CampaignsPanel';
import { ConversationsPanel } from './ConversationsPanel';
import { CustomersPanel } from './CustomersPanel';
import { GooglePublicProfilePanel } from './GooglePublicProfilePanel';
import { KnowledgeAndTestLab } from './KnowledgeAndTestLab';
import { LiveAgentChat } from './LiveAgentChat';
import { MisAnalyticsPanel } from './MisAnalyticsPanel';
import { OnboardingWizard } from './OnboardingWizard';

const PREVIEW_BACKDROP =
  '/src/assets/images/reception_clinic_preview_1795599722689.jpg';

type NavSection =
  | 'overview'
  | 'campaigns'
  | 'google_profile'
  | 'onboarding'
  | 'appointments'
  | 'conversations'
  | 'customers'
  | 'knowledge'
  | 'channels'
  | 'admin';

export function DashboardWorkspace() {
  const { profile, demoMode, signInWithGoogle, signOut, exitDemoMode } = useAuth();
  const [section, setSection] = useState<NavSection>('overview');
  const [businesses, setBusinesses] = useState<BusinessRecord[]>([]);
  const [activeBusinessId, setActiveBusinessId] = useState<number | null>(null);
  const [workspace, setWorkspace] = useState<BusinessWorkspaceData | null>(null);
  const [appointments, setAppointments] = useState<AppointmentRecord[]>([]);
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [conversations, setConversations] = useState<ConversationRecord[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingWorkspace, setLoadingWorkspace] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Create business modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creatingBiz, setCreatingBiz] = useState(false);
  const [newBizForm, setNewBizForm] = useState({
    businessName: '',
    businessCategory: 'Healthcare',
    websiteUrl: '',
    whatsappPhone: '',
    currency: 'INR',
    country: 'India',
    timezone: 'Asia/Kolkata',
    seedStarterCatalog: true,
  });

  // Channels live preview
  const [copiedSnippet, setCopiedSnippet] = useState(false);
  const [previewChannel, setPreviewChannel] = useState<'website' | 'whatsapp'>('website');

  const loadBusinesses = useCallback(async () => {
    setLoadingList(true);
    setError(null);
    try {
      const res = await apiFetch<{ businesses: BusinessRecord[] }>('/api/businesses');
      setBusinesses(res.businesses);
      if (res.businesses.length > 0) {
        setActiveBusinessId((prev) =>
          prev && res.businesses.some((b) => b.id === prev)
            ? prev
            : res.businesses[0].id
        );
      } else {
        setActiveBusinessId(null);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to load businesses.');
    } finally {
      setLoadingList(false);
    }
  }, []);

  const loadWorkspaceData = useCallback(async (businessId: number) => {
    setLoadingWorkspace(true);
    setError(null);
    try {
      const [ws, apptsRes, custRes, convRes] = await Promise.all([
        apiFetch<BusinessWorkspaceData>(`/api/businesses/${businessId}`),
        apiFetch<{ appointments: AppointmentRecord[] }>(
          `/api/businesses/${businessId}/appointments`
        ),
        apiFetch<{ customers: CustomerRecord[] }>(
          `/api/businesses/${businessId}/customers`
        ),
        apiFetch<{ conversations: ConversationRecord[] }>(
          `/api/businesses/${businessId}/conversations`
        ),
      ]);
      setWorkspace(ws);
      setAppointments(apptsRes.appointments);
      setCustomers(custRes.customers);
      setConversations(convRes.conversations);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to load workspace.');
    } finally {
      setLoadingWorkspace(false);
    }
  }, []);

  useEffect(() => {
    loadBusinesses();
  }, [loadBusinesses]);

  useEffect(() => {
    if (activeBusinessId) {
      loadWorkspaceData(activeBusinessId);
    }
  }, [activeBusinessId, loadWorkspaceData]);

  const refreshActiveWorkspace = useCallback(async () => {
    if (activeBusinessId) {
      await loadWorkspaceData(activeBusinessId);
    }
  }, [activeBusinessId, loadWorkspaceData]);

  const handleCreateBusiness = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBizForm.businessName.trim()) return;
    setCreatingBiz(true);
    setError(null);
    try {
      const res = await apiFetch<{ business: BusinessRecord }>('/api/businesses', {
        method: 'POST',
        body: JSON.stringify(newBizForm),
      });
      setShowCreateModal(false);
      setNewBizForm({
        businessName: '',
        businessCategory: 'Healthcare',
        websiteUrl: '',
        whatsappPhone: '',
        currency: 'INR',
        country: 'India',
        timezone: 'Asia/Kolkata',
        seedStarterCatalog: true,
      });
      await loadBusinesses();
      setActiveBusinessId(res.business.id);
      setSection('onboarding');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create business.');
    } finally {
      setCreatingBiz(false);
    }
  };

  const navItems: Array<{
    id: NavSection;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number;
  }> = [
    { id: 'overview', label: 'Overview & MIS', icon: LayoutDashboard },
    { id: 'campaigns', label: 'Offers & Broadcasts', icon: Megaphone },
    { id: 'google_profile', label: 'Google Public Profile', icon: MapPin },
    { id: 'onboarding', label: 'Setup & Onboarding', icon: Compass },
    {
      id: 'appointments',
      label: 'Appointments',
      icon: Calendar,
      badge: workspace?.metrics.upcomingAppointments || undefined,
    },
    {
      id: 'conversations',
      label: 'Conversations',
      icon: MessageSquare,
      badge: workspace?.metrics.humanEscalations || undefined,
    },
    { id: 'customers', label: 'Customers', icon: Users },
    { id: 'knowledge', label: 'AI Knowledge & Lab', icon: BookOpen },
    { id: 'channels', label: 'Channels & Widget', icon: Radio },
  ];

  if (profile?.role === 'super_admin') {
    navItems.push({ id: 'admin', label: 'Platform Admin', icon: Shield });
  }

  const sectionTitleMap: Record<NavSection, string> = {
    overview: 'Overview & Appointment MIS',
    campaigns: 'Existing Customer Offers & Announcements',
    google_profile: 'Google Public Profile & Master Profile Sync',
    onboarding: '8-Step Business Onboarding',
    appointments: 'Appointments & Schedule',
    conversations: 'Unified Conversations Inbox',
    customers: 'Customer Database',
    knowledge: 'AI Knowledge Base & Live Test Lab',
    channels: 'WhatsApp & Website Widget Channels',
    admin: 'Super-Admin SaaS Management',
  };

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const activeBiz = workspace?.business;
  const waChannel = workspace?.channels.find((c) => c.channelType === 'whatsapp');

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex">
      {/* Left Sidebar (256px) */}
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col shrink-0">
        <div className="h-16 px-5 flex items-center justify-between border-b border-slate-200">
          <span className="font-display text-lg font-bold tracking-tight text-slate-900">
            Deskline
          </span>
          <span className="text-[11px] text-slate-400 font-medium">
            {profile?.role === 'super_admin' ? 'Admin' : 'Portal'}
          </span>
        </div>

        {/* Tenant Switcher */}
        <div className="p-4 border-b border-slate-100">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-medium text-slate-500">
              Active Business
            </span>
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#0F766E] hover:text-[#0D625B] cursor-pointer"
            >
              <Plus className="w-3 h-3" />
              New
            </button>
          </div>

          {businesses.length > 0 ? (
            <select
              value={activeBusinessId ?? ''}
              onChange={(e) => setActiveBusinessId(Number(e.target.value))}
              aria-label="Select business tenant"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs font-medium text-slate-900 focus:bg-white focus:border-teal-700 focus:outline-none"
            >
              {businesses.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.businessName}
                </option>
              ))}
            </select>
          ) : (
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="w-full py-2 px-3 rounded-lg border border-dashed border-slate-300 text-xs font-medium text-slate-600 hover:border-teal-700 hover:text-teal-800 cursor-pointer"
            >
              + Register Your Business
            </button>
          )}
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = section === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSection(item.id)}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                  active
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </span>
                {item.badge !== undefined && item.badge > 0 && (
                  <span
                    className={`font-mono text-xs tabular-nums ${
                      active ? 'text-white/80' : 'text-slate-400'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Account Footer */}
        <div className="p-4 border-t border-slate-200 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-xs font-semibold text-slate-900 truncate">
              {profile?.displayName || 'Business Owner'}
            </div>
            <div className="text-[11px] text-slate-500 truncate">
              {profile?.email}
            </div>
          </div>
          <button
            type="button"
            onClick={signOut}
            title="Sign out"
            className="p-2 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100 cursor-pointer shrink-0"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {demoMode && (
          <div className="bg-slate-900 text-white px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-semibold text-teal-300">Full Demo Mode</span>
              <span className="text-slate-400">·</span>
              <span className="text-slate-200 truncate">
                All features are pre-loaded with interactive sample data. Add API keys &amp; sign in anytime.
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={async () => {
                  resetDemoStore();
                  await loadBusinesses();
                  if (activeBusinessId) {
                    await loadWorkspaceData(activeBusinessId);
                  }
                }}
                className="px-2.5 py-1 rounded-md border border-slate-700 text-slate-200 hover:bg-slate-800 cursor-pointer"
              >
                Reset Sample Data
              </button>
              <button
                type="button"
                onClick={signInWithGoogle}
                className="px-2.5 py-1 rounded-md bg-[#0F766E] hover:bg-[#0D625B] text-white font-semibold cursor-pointer"
              >
                Sign in with Google
              </button>
              <button
                type="button"
                onClick={exitDemoMode}
                className="px-2.5 py-1 rounded-md text-slate-300 hover:text-white cursor-pointer"
              >
                Exit Demo
              </button>
            </div>
          </div>
        )}
        {/* Contextual Top Bar */}
        <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between gap-4 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span>{activeBiz?.businessName || 'Deskline'}</span>
              <span>/</span>
              <span className="text-slate-900 font-medium">
                {sectionTitleMap[section]}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {activeBiz && (
              <button
                type="button"
                onClick={() => setSection('knowledge')}
                className="px-3.5 py-2 text-xs font-medium text-slate-700 border border-slate-200 hover:bg-slate-50 rounded-lg whitespace-nowrap cursor-pointer"
              >
                Test AI Agent
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#0F766E] hover:bg-[#0D625B] rounded-lg whitespace-nowrap cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Business
            </button>
          </div>
        </header>

        {/* Main Viewport */}
        <main className="flex-1 p-6 max-w-7xl w-full mx-auto space-y-6">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {section === 'admin' && profile?.role === 'super_admin' ? (
            <AdminConsolePanel />
          ) : loadingList ? (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
            </div>
          ) : businesses.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-10 text-center max-w-lg mx-auto mt-12 space-y-4">
              <Building2 className="w-10 h-10 text-[#0F766E] mx-auto" />
              <h2 className="font-display text-xl font-bold text-slate-900">
                Create Your First Business Workspace
              </h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                Register your business to run AI website extraction, configure services
                and availability, connect WhatsApp Business, and launch your 24/7 AI
                receptionist.
              </p>
              <button
                type="button"
                onClick={() => setShowCreateModal(true)}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-[#0F766E] hover:bg-[#0D625B] rounded-lg cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Register Business Now
              </button>
            </div>
          ) : loadingWorkspace && !workspace ? (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
            </div>
          ) : workspace && activeBiz ? (
            <>
              {section === 'overview' && (
                <div className="space-y-6">
                  {/* KPI Strip */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 bg-white border border-slate-200 rounded-xl divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
                    <div className="p-5">
                      <div className="text-xs text-slate-500">Total Appointments</div>
                      <div className="mt-1 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
                        {workspace.metrics.totalAppointments}
                      </div>
                      <div className="mt-0.5 text-xs text-slate-500">
                        {workspace.metrics.todayAppointments} today ·{' '}
                        {workspace.metrics.upcomingAppointments} upcoming
                      </div>
                    </div>
                    <div className="p-5">
                      <div className="text-xs text-slate-500">Booking Conversion</div>
                      <div className="mt-1 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
                        {workspace.metrics.conversionRate}%
                      </div>
                      <div className="mt-0.5 text-xs text-slate-500">
                        {workspace.metrics.cancelledAppointments} cancelled
                      </div>
                    </div>
                    <div className="p-5">
                      <div className="text-xs text-slate-500">Customer Conversations</div>
                      <div className="mt-1 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
                        {workspace.metrics.totalConversations}
                      </div>
                      <div className="mt-0.5 text-xs text-slate-500">
                        {workspace.metrics.totalCustomers} total customers
                      </div>
                    </div>
                    <div className="p-5">
                      <div className="text-xs text-slate-500">Human Escalations</div>
                      <div className="mt-1 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
                        {workspace.metrics.humanEscalations}
                      </div>
                      <div className="mt-0.5 text-xs text-slate-500">
                        {workspace.metrics.humanEscalations > 0
                          ? 'Needs receptionist follow-up'
                          : 'All threads handled cleanly'}
                      </div>
                    </div>
                  </div>

                  {/* Quick Summary Split */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden">
                      <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
                        <h3 className="font-display text-sm font-semibold text-slate-900">
                          Upcoming Appointments
                        </h3>
                        <button
                          type="button"
                          onClick={() => setSection('appointments')}
                          className="text-xs font-medium text-[#0F766E] hover:underline cursor-pointer"
                        >
                          Manage all
                        </button>
                      </div>
                      <div className="divide-y divide-slate-100">
                        {appointments.slice(0, 6).length === 0 ? (
                          <div className="p-8 text-center text-xs text-slate-500">
                            No appointments yet. Test your AI agent in the Lab to book
                            your first slot.
                          </div>
                        ) : (
                          appointments.slice(0, 6).map((a) => (
                            <div
                              key={a.id}
                              className="px-5 py-3 flex items-center justify-between gap-4 text-sm"
                            >
                              <div className="min-w-0">
                                <div className="font-medium text-slate-900 truncate">
                                  {a.customerName}{' '}
                                  <span className="font-mono text-xs text-slate-400 ml-1">
                                    {a.bookingRef}
                                  </span>
                                </div>
                                <div className="text-xs text-slate-500">
                                  {a.serviceName} · {a.channel}
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <div className="font-mono text-xs font-medium text-slate-900 tabular-nums">
                                  {a.appointmentDate} · {formatTimeDisplay(a.startTime)}
                                </div>
                                <div className="text-xs text-slate-500 font-mono tabular-nums">
                                  {formatCurrency(a.price, a.currency)} · {a.bookingStatus}
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl overflow-hidden">
                      <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
                        <h3 className="font-display text-sm font-semibold text-slate-900">
                          Recent Conversations
                        </h3>
                        <button
                          type="button"
                          onClick={() => setSection('conversations')}
                          className="text-xs font-medium text-[#0F766E] hover:underline cursor-pointer"
                        >
                          Open inbox
                        </button>
                      </div>
                      <div className="divide-y divide-slate-100">
                        {conversations.slice(0, 5).length === 0 ? (
                          <div className="p-8 text-center text-xs text-slate-500">
                            Conversations from WhatsApp and your website widget appear
                            here in real time.
                          </div>
                        ) : (
                          conversations.slice(0, 5).map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => setSection('conversations')}
                              className="w-full text-left px-5 py-3 hover:bg-slate-50 cursor-pointer"
                            >
                              <div className="flex items-baseline justify-between gap-2">
                                <span className="text-sm font-medium text-slate-900 truncate">
                                  {c.customerName}
                                </span>
                                <span
                                  className={`text-xs font-medium ${
                                    c.status === 'human_takeover'
                                      ? 'text-amber-700'
                                      : c.status === 'resolved'
                                        ? 'text-emerald-700'
                                        : 'text-slate-500'
                                  }`}
                                >
                                  {c.status.replace('_', ' ')}
                                </span>
                              </div>
                              <p className="text-xs text-slate-500 truncate mt-0.5">
                                {c.messagesJson?.[c.messagesJson.length - 1]?.text || ''}
                              </p>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Merged Appointment MIS & Estimated Business Value */}
                  <div className="pt-2 border-t border-slate-200">
                    <div className="mb-4">
                      <h2 className="font-display text-base font-semibold text-slate-900">
                        Appointment MIS &amp; Estimated Business Value
                      </h2>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Daily, weekly, and monthly appointment performance, revenue attribution, and CSV exports.
                      </p>
                    </div>
                    <MisAnalyticsPanel
                      businessId={activeBiz.id}
                      businessName={activeBiz.businessName}
                    />
                  </div>
                </div>
              )}

              {section === 'campaigns' && (
                <CampaignsPanel
                  workspace={workspace}
                  onRefreshWorkspace={refreshActiveWorkspace}
                />
              )}

              {section === 'google_profile' && (
                <GooglePublicProfilePanel
                  workspace={workspace}
                  onRefreshWorkspace={refreshActiveWorkspace}
                />
              )}

              {section === 'onboarding' && (
                <OnboardingWizard
                  workspace={workspace}
                  onRefresh={refreshActiveWorkspace}
                  onFinishToTestLab={() => setSection('knowledge')}
                />
              )}

              {section === 'appointments' && (
                <AppointmentsPanel
                  workspace={workspace}
                  appointments={appointments}
                  onRefreshAll={refreshActiveWorkspace}
                />
              )}

              {section === 'conversations' && (
                <ConversationsPanel
                  businessId={activeBiz.id}
                  conversations={conversations}
                  onRefreshAll={refreshActiveWorkspace}
                />
              )}

              {section === 'customers' && (
                <CustomersPanel
                  businessId={activeBiz.id}
                  businessName={activeBiz.businessName}
                  customers={customers}
                  onRefreshWorkspace={refreshActiveWorkspace}
                />
              )}

              {section === 'knowledge' && (
                <KnowledgeAndTestLab
                  workspace={workspace}
                  onRefreshAll={refreshActiveWorkspace}
                />
              )}

              {section === 'channels' && (
                <div className="space-y-6">
                  {/* Channel Status Summary */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="font-display text-base font-semibold text-slate-900">
                          WhatsApp Business Cloud API
                        </h3>
                        <span
                          className={`text-xs font-medium ${
                            waChannel?.connectionStatus === 'connected'
                              ? 'text-emerald-700'
                              : 'text-amber-700'
                          }`}
                        >
                          {(waChannel?.connectionStatus || 'not_connected').replace('_', ' ')}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600">
                        Business Number:{' '}
                        <span className="font-mono text-slate-900">
                          {activeBiz.whatsappPhone || 'Not configured'}
                        </span>
                      </p>
                      <p className="text-xs text-slate-500 font-mono break-all">
                        Webhook: {origin}/api/webhooks/whatsapp/{activeBiz.slug}
                      </p>
                      <button
                        type="button"
                        onClick={() => setSection('onboarding')}
                        className="text-xs font-semibold text-[#0F766E] hover:underline cursor-pointer"
                      >
                        Configure Meta WABA credentials & templates
                      </button>
                    </div>

                    <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="font-display text-base font-semibold text-slate-900">
                          Website Chat Widget Embed
                        </h3>
                        <span className="text-xs font-medium text-emerald-700">
                          Published
                        </span>
                      </div>
                      <div className="bg-slate-900 text-slate-100 rounded-lg p-3 font-mono text-[11px] flex items-center justify-between gap-2">
                        <code className="truncate">
                          {`<script src="${origin}/widget.js?business=${activeBiz.slug}" async></script>`}
                        </code>
                        <button
                          type="button"
                          onClick={async () => {
                            await navigator.clipboard.writeText(
                              `<script src="${origin}/widget.js?business=${activeBiz.slug}" async></script>`
                            );
                            setCopiedSnippet(true);
                            setTimeout(() => setCopiedSnippet(false), 2000);
                          }}
                          className="inline-flex items-center gap-1 text-white shrink-0 cursor-pointer"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          {copiedSnippet ? 'Copied' : 'Copy'}
                        </button>
                      </div>
                      <a
                        href={`/?widget=${encodeURIComponent(activeBiz.slug)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-semibold text-[#0F766E] hover:underline"
                      >
                        Open standalone widget URL
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </div>

                  {/* Interactive Channel Preview */}
                  <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h3 className="font-display text-base font-semibold text-slate-900">
                          Live Customer Experience Preview
                        </h3>
                        <p className="text-xs text-slate-500">
                          Preview exactly how {activeBiz.businessName} customers book on
                          your website or via WhatsApp.
                        </p>
                      </div>
                      <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                        <button
                          type="button"
                          onClick={() => setPreviewChannel('website')}
                          className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                            previewChannel === 'website'
                              ? 'bg-white text-slate-900 shadow-xs'
                              : 'text-slate-600'
                          }`}
                        >
                          Website Widget
                        </button>
                        <button
                          type="button"
                          onClick={() => setPreviewChannel('whatsapp')}
                          className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                            previewChannel === 'whatsapp'
                              ? 'bg-white text-slate-900 shadow-xs'
                              : 'text-slate-600'
                          }`}
                        >
                          WhatsApp Channel
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
                      <div className="lg:col-span-6 relative rounded-xl overflow-hidden border border-slate-200 min-h-[360px] bg-slate-100">
                        <img
                          src={PREVIEW_BACKDROP}
                          alt={`${activeBiz.businessName} website hero preview`}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/20 to-transparent" />
                        <div className="absolute bottom-5 left-5 right-5 text-white">
                          <div className="text-xs text-white/75">
                            {activeBiz.websiteUrl || 'yourbusiness.com'}
                          </div>
                          <div className="font-display text-xl font-bold mt-0.5">
                            {activeBiz.businessName}
                          </div>
                          <p className="text-xs text-white/85 mt-1 line-clamp-2">
                            {activeBiz.description ||
                              'Book your appointment 24/7 through our AI receptionist.'}
                          </p>
                        </div>
                      </div>
                      <div className="lg:col-span-6">
                        <LiveAgentChat
                          slug={activeBiz.slug}
                          channel={previewChannel}
                          onBookingActivity={refreshActiveWorkspace}
                          onSwitchToWhatsApp={() => setPreviewChannel('whatsapp')}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : null}
        </main>
      </div>

      {/* Create New Business Tenant Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/40 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-semibold text-slate-900">
                Register New Business Tenant
              </h3>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreateBusiness} className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Business Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Aura Skin & Laser Clinic"
                  value={newBizForm.businessName}
                  onChange={(e) =>
                    setNewBizForm({ ...newBizForm, businessName: e.target.value })
                  }
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Category
                  </label>
                  <select
                    value={newBizForm.businessCategory}
                    onChange={(e) =>
                      setNewBizForm({ ...newBizForm, businessCategory: e.target.value })
                    }
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white"
                  >
                    <option value="Healthcare">Healthcare</option>
                    <option value="Beauty & Wellness">Beauty & Wellness</option>
                    <option value="Fitness">Fitness</option>
                    <option value="Professional Services">Professional Services</option>
                    <option value="Automotive">Automotive</option>
                    <option value="Education">Education</option>
                    <option value="Hospitality">Hospitality</option>
                    <option value="Home Services">Home Services</option>
                    <option value="Pet Care">Pet Care</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Currency
                  </label>
                  <select
                    value={newBizForm.currency}
                    onChange={(e) =>
                      setNewBizForm({ ...newBizForm, currency: e.target.value })
                    }
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white"
                  >
                    <option value="INR">INR (₹)</option>
                    <option value="USD">USD ($)</option>
                    <option value="EUR">EUR (€)</option>
                    <option value="GBP">GBP (£)</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Website URL (optional)
                </label>
                <input
                  type="url"
                  placeholder="https://yourbusiness.com"
                  value={newBizForm.websiteUrl}
                  onChange={(e) =>
                    setNewBizForm({ ...newBizForm, websiteUrl: e.target.value })
                  }
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  WhatsApp Business Phone (optional)
                </label>
                <input
                  type="text"
                  placeholder="+91 98450 00000"
                  value={newBizForm.whatsappPhone}
                  onChange={(e) =>
                    setNewBizForm({ ...newBizForm, whatsappPhone: e.target.value })
                  }
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono"
                />
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={newBizForm.seedStarterCatalog}
                  onChange={(e) =>
                    setNewBizForm({
                      ...newBizForm,
                      seedStarterCatalog: e.target.checked,
                    })
                  }
                />
                Pre-populate two starter services so I can test right away
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingBiz}
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#0F766E] hover:bg-[#0D625B] rounded-lg cursor-pointer"
                >
                  {creatingBiz ? 'Creating...' : 'Create & Start Onboarding'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
