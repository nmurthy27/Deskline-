import React, { useState } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Globe,
  Loader2,
  Plus,
  Trash2,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import {
  formatCurrency,
  type BusinessWorkspaceData,
  type ExtractedWebsiteData,
  type WorkingDaysMap,
} from '../types';

const STEPS = [
  { num: 1, label: 'Registration' },
  { num: 2, label: 'Website AI' },
  { num: 3, label: 'Services' },
  { num: 4, label: 'Packages' },
  { num: 5, label: 'Availability' },
  { num: 6, label: 'WhatsApp API' },
  { num: 7, label: 'AI Agent' },
  { num: 8, label: 'Website Widget' },
];

const CATEGORIES = [
  'Healthcare',
  'Beauty & Wellness',
  'Fitness',
  'Professional Services',
  'Automotive',
  'Education',
  'Hospitality',
  'Home Services',
  'Pet Care',
];

const DAY_LABELS: Array<{ key: keyof WorkingDaysMap; label: string }> = [
  { key: 'mon', label: 'Monday' },
  { key: 'tue', label: 'Tuesday' },
  { key: 'wed', label: 'Wednesday' },
  { key: 'thu', label: 'Thursday' },
  { key: 'fri', label: 'Friday' },
  { key: 'sat', label: 'Saturday' },
  { key: 'sun', label: 'Sunday' },
];

interface OnboardingWizardProps {
  workspace: BusinessWorkspaceData;
  onRefresh: () => Promise<void>;
  onFinishToTestLab: () => void;
}

export function OnboardingWizard({
  workspace,
  onRefresh,
  onFinishToTestLab,
}: OnboardingWizardProps) {
  const biz = workspace.business;
  const waChannel = workspace.channels.find((c) => c.channelType === 'whatsapp');
  const widgetChannel = workspace.channels.find(
    (c) => c.channelType === 'website_widget'
  );

  const [step, setStep] = useState<number>(Math.min(8, Math.max(1, biz.onboardingStep || 1)));
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Step 1 state
  const [regForm, setRegForm] = useState({
    businessName: biz.businessName,
    businessEmail: biz.businessEmail,
    contactPerson: biz.contactPerson,
    country: biz.country,
    timezone: biz.timezone,
    businessCategory: biz.businessCategory,
    currency: biz.currency,
    websiteUrl: biz.websiteUrl,
    whatsappPhone: biz.whatsappPhone,
    address: biz.address,
    description: biz.description,
  });

  // Step 2 website analysis state
  const [crawlUrl, setCrawlUrl] = useState(biz.websiteUrl || '');
  const [pastedText, setPastedText] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [extracted, setExtracted] = useState<ExtractedWebsiteData | null>(null);
  const [selectedServiceIdx, setSelectedServiceIdx] = useState<number[]>([]);
  const [selectedPkgIdx, setSelectedPkgIdx] = useState<number[]>([]);
  const [selectedFaqIdx, setSelectedFaqIdx] = useState<number[]>([]);

  // Step 3 add service form
  const [newSvc, setNewSvc] = useState({
    name: '',
    description: '',
    category: 'Consultations',
    durationMinutes: 30,
    price: 500,
    bufferMinutes: 0,
    staffMember: biz.contactPerson || 'Lead Specialist',
    advancePaymentRequired: false,
    allowDirectBooking: true,
  });

  // Step 4 add package form
  const [newPkg, setNewPkg] = useState({
    name: '',
    description: '',
    includedServices: '',
    sessionCount: 5,
    price: 2000,
    validityDays: 90,
    conditions: '',
  });

  // Step 5 availability state
  const [availForm, setAvailForm] = useState({
    workingDaysJson: workspace.availability.workingDaysJson,
    breakStart: workspace.availability.breakStart,
    breakEnd: workspace.availability.breakEnd,
    slotIntervalMinutes: workspace.availability.slotIntervalMinutes,
    minAdvanceHours: workspace.availability.minAdvanceHours,
    maxAdvanceDays: workspace.availability.maxAdvanceDays,
    cancellationWindowHours: workspace.availability.cancellationWindowHours,
    reschedulingPolicy: workspace.availability.reschedulingPolicy,
    holidaysText: (workspace.availability.holidaysJson || []).join(', '),
  });

  // Step 6 WhatsApp state
  const [waForm, setWaForm] = useState({
    whatsappPhone: biz.whatsappPhone || '',
    whatsappPhoneNumberId: waChannel?.whatsappPhoneNumberId || '',
    whatsappBusinessAccountId: waChannel?.whatsappBusinessAccountId || '',
    metaVerifyToken: waChannel?.metaVerifyToken || '',
  });

  // Step 7 AI Agent state
  const [agentForm, setAgentForm] = useState({
    agentName: biz.agentName,
    agentGreeting: biz.agentGreeting,
    agentPersonality: biz.agentPersonality,
    agentInstructions: biz.agentInstructions,
    bookingPolicy: biz.bookingPolicy,
    escalationPolicy: biz.escalationPolicy,
    reminder24h: biz.reminder24h,
    reminder2h: biz.reminder2h,
  });

  // Step 8 Widget state
  const [widgetForm, setWidgetForm] = useState({
    welcomeMessage:
      widgetChannel?.widgetConfigJson?.welcomeMessage || biz.agentGreeting,
    quickPromptsText: (
      widgetChannel?.widgetConfigJson?.quickPrompts || [
        'Book an appointment',
        'Explore services',
        'View pricing',
        'View packages',
        'Talk to someone',
      ]
    ).join('\n'),
    enableWhatsAppHandoff:
      widgetChannel?.widgetConfigJson?.enableWhatsAppHandoff ?? true,
    position: widgetChannel?.widgetConfigJson?.position || 'bottom-right',
    brandColor: widgetChannel?.widgetConfigJson?.brandColor || biz.widgetBrandColor || '#0F766E',
  });

  const [embedTab, setEmbedTab] = useState<'html' | 'wordpress' | 'shopify' | 'webflow'>('html');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const webhookFullUrl = `${origin}/api/webhooks/whatsapp/${biz.slug}`;
  const embedSnippet = `<script src="${origin}/widget.js?business=${biz.slug}" async></script>`;

  const copyText = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      // clipboard unavailable
    }
  };

  const flashSuccess = (msg: string) => {
    setError(null);
    setNotice(msg);
    setTimeout(() => setNotice(null), 3500);
  };

  const saveStep1 = async () => {
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/api/businesses/${biz.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ ...regForm, onboardingStep: Math.max(biz.onboardingStep, 2) }),
      });
      await onRefresh();
      flashSuccess('Business registration saved.');
      setStep(2);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  const runWebsiteAnalysis = async () => {
    setAnalyzing(true);
    setError(null);
    setExtracted(null);
    try {
      const res = await apiFetch<ExtractedWebsiteData>(
        `/api/businesses/${biz.id}/analyze-website`,
        {
          method: 'POST',
          body: JSON.stringify({
            websiteUrl: crawlUrl,
            pastedContent: pastedText,
          }),
        }
      );
      setExtracted(res);
      setSelectedServiceIdx(res.extracted.services.map((_, i) => i));
      setSelectedPkgIdx(res.extracted.packages.map((_, i) => i));
      setSelectedFaqIdx(res.extracted.faqs.map((_, i) => i));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Website analysis failed.');
    } finally {
      setAnalyzing(false);
    }
  };

  const applyExtractedData = async () => {
    if (!extracted) return;
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/api/businesses/${biz.id}/apply-extraction`, {
        method: 'POST',
        body: JSON.stringify({
          sourceUrl: extracted.sourceUrl,
          businessDescription: extracted.extracted.businessDescription,
          address: extracted.extracted.address,
          bookingPolicy: extracted.extracted.bookingPolicy,
          services: extracted.extracted.services.filter((_, i) =>
            selectedServiceIdx.includes(i)
          ),
          packages: extracted.extracted.packages.filter((_, i) =>
            selectedPkgIdx.includes(i)
          ),
          faqs: extracted.extracted.faqs.filter((_, i) => selectedFaqIdx.includes(i)),
        }),
      });
      await onRefresh();
      flashSuccess('Approved website details imported into your AI knowledge base.');
      setExtracted(null);
      setStep(3);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to import details.');
    } finally {
      setSaving(false);
    }
  };

  const addService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSvc.name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/api/businesses/${biz.id}/services`, {
        method: 'POST',
        body: JSON.stringify({ ...newSvc, currency: biz.currency }),
      });
      setNewSvc({
        ...newSvc,
        name: '',
        description: '',
      });
      await onRefresh();
      flashSuccess('Service added.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to add service.');
    } finally {
      setSaving(false);
    }
  };

  const deleteService = async (serviceId: number) => {
    setSaving(true);
    try {
      await apiFetch(`/api/businesses/${biz.id}/services/${serviceId}`, {
        method: 'DELETE',
      });
      await onRefresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to remove service.');
    } finally {
      setSaving(false);
    }
  };

  const addPackage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPkg.name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/api/businesses/${biz.id}/packages`, {
        method: 'POST',
        body: JSON.stringify({ ...newPkg, currency: biz.currency }),
      });
      setNewPkg({
        ...newPkg,
        name: '',
        description: '',
        includedServices: '',
        conditions: '',
      });
      await onRefresh();
      flashSuccess('Package added.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to add package.');
    } finally {
      setSaving(false);
    }
  };

  const deletePackage = async (pkgId: number) => {
    setSaving(true);
    try {
      await apiFetch(`/api/businesses/${biz.id}/packages/${pkgId}`, {
        method: 'DELETE',
      });
      await onRefresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete package.');
    } finally {
      setSaving(false);
    }
  };

  const saveAvailability = async () => {
    setSaving(true);
    setError(null);
    try {
      const holidaysJson = availForm.holidaysText
        .split(',')
        .map((s) => s.trim())
        .filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s));
      await apiFetch(`/api/businesses/${biz.id}/availability`, {
        method: 'PUT',
        body: JSON.stringify({
          workingDaysJson: availForm.workingDaysJson,
          breakStart: availForm.breakStart,
          breakEnd: availForm.breakEnd,
          slotIntervalMinutes: Number(availForm.slotIntervalMinutes),
          minAdvanceHours: Number(availForm.minAdvanceHours),
          maxAdvanceDays: Number(availForm.maxAdvanceDays),
          cancellationWindowHours: Number(availForm.cancellationWindowHours),
          reschedulingPolicy: availForm.reschedulingPolicy,
          holidaysJson,
        }),
      });
      await apiFetch(`/api/businesses/${biz.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ onboardingStep: Math.max(biz.onboardingStep, 6) }),
      });
      await onRefresh();
      flashSuccess('Availability rules saved.');
      setStep(6);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save availability.');
    } finally {
      setSaving(false);
    }
  };

  const saveWhatsApp = async () => {
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/api/businesses/${biz.id}/channels/whatsapp`, {
        method: 'PUT',
        body: JSON.stringify(waForm),
      });
      await apiFetch(`/api/businesses/${biz.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ onboardingStep: Math.max(biz.onboardingStep, 7) }),
      });
      await onRefresh();
      flashSuccess('WhatsApp Business Cloud API configuration saved.');
      setStep(7);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save WhatsApp config.');
    } finally {
      setSaving(false);
    }
  };

  const saveAgentConfig = async () => {
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/api/businesses/${biz.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ ...agentForm, onboardingStep: 8 }),
      });
      await onRefresh();
      flashSuccess('AI Receptionist configuration updated.');
      setStep(8);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save AI config.');
    } finally {
      setSaving(false);
    }
  };

  const saveWidgetConfig = async () => {
    setSaving(true);
    setError(null);
    try {
      const quickPrompts = widgetForm.quickPromptsText
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
      await apiFetch(`/api/businesses/${biz.id}/channels/widget`, {
        method: 'PUT',
        body: JSON.stringify({
          welcomeMessage: widgetForm.welcomeMessage,
          quickPrompts,
          enableWhatsAppHandoff: widgetForm.enableWhatsAppHandoff,
          position: widgetForm.position,
          brandColor: widgetForm.brandColor,
        }),
      });
      await onRefresh();
      flashSuccess('Website chat widget published and ready.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save widget settings.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Stepper */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 overflow-x-auto">
        <div className="flex items-center justify-between gap-2 min-w-[720px]">
          {STEPS.map((s) => {
            const active = step === s.num;
            const completed = biz.onboardingStep > s.num;
            return (
              <button
                key={s.num}
                type="button"
                onClick={() => setStep(s.num)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  active
                    ? 'bg-slate-900 text-white'
                    : completed
                      ? 'text-teal-800 bg-teal-50/70 hover:bg-teal-50'
                      : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <span className="font-mono tabular-nums">
                  {completed && !active ? <Check className="w-3.5 h-3.5" /> : `0${s.num}`}
                </span>
                <span>{s.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {notice && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {notice}
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Step Panels */}
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        {step === 1 && (
          <div className="space-y-5">
            <div>
              <h2 className="font-display text-lg font-semibold text-slate-900">
                01. Business Registration
              </h2>
              <p className="text-sm text-slate-500 mt-0.5">
                Core business details used across your AI receptionist, booking
                confirmations, and WhatsApp profile.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Business Name
                </label>
                <input
                  type="text"
                  value={regForm.businessName}
                  onChange={(e) =>
                    setRegForm({ ...regForm, businessName: e.target.value })
                  }
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-teal-700 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Business Email
                </label>
                <input
                  type="email"
                  value={regForm.businessEmail}
                  onChange={(e) =>
                    setRegForm({ ...regForm, businessEmail: e.target.value })
                  }
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-teal-700 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Contact Person
                </label>
                <input
                  type="text"
                  value={regForm.contactPerson}
                  onChange={(e) =>
                    setRegForm({ ...regForm, contactPerson: e.target.value })
                  }
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-teal-700 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Business Category
                </label>
                <select
                  value={regForm.businessCategory}
                  onChange={(e) =>
                    setRegForm({ ...regForm, businessCategory: e.target.value })
                  }
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white focus:border-teal-700 focus:outline-none"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Country
                </label>
                <input
                  type="text"
                  value={regForm.country}
                  onChange={(e) => setRegForm({ ...regForm, country: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-teal-700 focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Time Zone
                  </label>
                  <input
                    type="text"
                    value={regForm.timezone}
                    onChange={(e) =>
                      setRegForm({ ...regForm, timezone: e.target.value })
                    }
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-teal-700 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Currency
                  </label>
                  <select
                    value={regForm.currency}
                    onChange={(e) =>
                      setRegForm({ ...regForm, currency: e.target.value })
                    }
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white focus:border-teal-700 focus:outline-none"
                  >
                    <option value="INR">INR (₹)</option>
                    <option value="USD">USD ($)</option>
                    <option value="EUR">EUR (€)</option>
                    <option value="GBP">GBP (£)</option>
                    <option value="SGD">SGD (S$)</option>
                    <option value="AED">AED</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Company Website URL
                </label>
                <input
                  type="url"
                  placeholder="https://yourbusiness.com"
                  value={regForm.websiteUrl}
                  onChange={(e) => {
                    setRegForm({ ...regForm, websiteUrl: e.target.value });
                    setCrawlUrl(e.target.value);
                  }}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-teal-700 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  WhatsApp-Enabled Business Phone
                </label>
                <input
                  type="text"
                  placeholder="+91 98450 00000"
                  value={regForm.whatsappPhone}
                  onChange={(e) =>
                    setRegForm({ ...regForm, whatsappPhone: e.target.value })
                  }
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono focus:border-teal-700 focus:outline-none"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Business Address & Directions
                </label>
                <input
                  type="text"
                  value={regForm.address}
                  onChange={(e) => setRegForm({ ...regForm, address: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-teal-700 focus:outline-none"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Business Description
                </label>
                <textarea
                  rows={3}
                  value={regForm.description}
                  onChange={(e) =>
                    setRegForm({ ...regForm, description: e.target.value })
                  }
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-teal-700 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end pt-4 border-t border-slate-100">
              <button
                type="button"
                disabled={saving}
                onClick={saveStep1}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-[#0F766E] hover:bg-[#0D625B] rounded-lg transition-colors cursor-pointer disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Save & Continue to Website Analysis
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <div>
              <h2 className="font-display text-lg font-semibold text-slate-900">
                02. AI Website Analysis & Review
              </h2>
              <p className="text-sm text-slate-500 mt-0.5">
                Enter your public website URL or paste your services page text. Our AI
                extracts services, pricing, packages, and FAQs for your explicit review
                and approval before publishing.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
              <div className="md:col-span-9">
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Public Website URL
                </label>
                <div className="relative">
                  <Globe className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="url"
                    placeholder="https://example-clinic.com"
                    value={crawlUrl}
                    onChange={(e) => setCrawlUrl(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 pl-9 pr-3 py-2 text-sm focus:border-teal-700 focus:outline-none"
                  />
                </div>
              </div>
              <div className="md:col-span-3 flex items-end">
                <button
                  type="button"
                  disabled={analyzing || (!crawlUrl.trim() && !pastedText.trim())}
                  onClick={runWebsiteAnalysis}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                >
                  {analyzing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : null}
                  {analyzing ? 'Analyzing...' : 'Extract Info'}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Or Paste Website Copy / Service Menu (optional fallback if site blocks crawlers)
              </label>
              <textarea
                rows={4}
                placeholder="Paste your About page, services, pricing table, hours, or FAQs here..."
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-teal-700 focus:outline-none"
              />
            </div>

            {extracted && (
              <div className="border-t border-slate-200 pt-6 space-y-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-display text-base font-semibold text-slate-900">
                      Review Extracted Information Before Approving
                    </h3>
                    <p className="text-xs text-slate-500">
                      Uncheck any outdated items. Only approved items will be added to
                      your verified AI knowledge base.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={applyExtractedData}
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-[#0F766E] hover:bg-[#0D625B] rounded-lg cursor-pointer"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    Approve & Import Selected
                  </button>
                </div>

                {extracted.extracted.businessDescription && (
                  <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 text-sm text-slate-700">
                    <div className="text-xs font-semibold text-slate-500 mb-1">
                      Extracted Description
                    </div>
                    {extracted.extracted.businessDescription}
                  </div>
                )}

                {extracted.extracted.services.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-slate-600 mb-2">
                      Extracted Services ({selectedServiceIdx.length} selected)
                    </h4>
                    <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg">
                      {extracted.extracted.services.map((svc, idx) => (
                        <label
                          key={`${svc.name}-${idx}`}
                          className="flex items-start gap-3 p-3 hover:bg-slate-50 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={selectedServiceIdx.includes(idx)}
                            onChange={(e) =>
                              setSelectedServiceIdx((prev) =>
                                e.target.checked
                                  ? [...prev, idx]
                                  : prev.filter((i) => i !== idx)
                              )
                            }
                            className="mt-1"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline justify-between gap-4">
                              <span className="text-sm font-medium text-slate-900">
                                {svc.name}
                              </span>
                              <span className="font-mono text-xs text-slate-700 tabular-nums">
                                {svc.durationMinutes} min ·{' '}
                                {formatCurrency(svc.price, svc.currency || biz.currency)}
                              </span>
                            </div>
                            <p className="text-xs text-slate-500 mt-0.5">
                              {svc.description}
                            </p>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {extracted.extracted.faqs.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-slate-600 mb-2">
                      Extracted FAQs & Policies ({selectedFaqIdx.length} selected)
                    </h4>
                    <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg">
                      {extracted.extracted.faqs.map((faq, idx) => (
                        <label
                          key={`${faq.title}-${idx}`}
                          className="flex items-start gap-3 p-3 hover:bg-slate-50 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={selectedFaqIdx.includes(idx)}
                            onChange={(e) =>
                              setSelectedFaqIdx((prev) =>
                                e.target.checked
                                  ? [...prev, idx]
                                  : prev.filter((i) => i !== idx)
                              )
                            }
                            className="mt-1"
                          />
                          <div className="text-xs">
                            <div className="font-semibold text-slate-900">
                              {faq.title}
                            </div>
                            <div className="text-slate-600 mt-0.5">{faq.content}</div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center justify-between pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
                Back
              </button>
              <button
                type="button"
                onClick={() => setStep(3)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-slate-900 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
              >
                Continue to Services
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6">
            <div>
              <h2 className="font-display text-lg font-semibold text-slate-900">
                03. Services & Pricing Configuration
              </h2>
              <p className="text-sm text-slate-500 mt-0.5">
                Define every bookable service, duration, price, buffer time, and assigned
                specialist.
              </p>
            </div>

            <form
              onSubmit={addService}
              className="grid grid-cols-1 md:grid-cols-6 gap-3 p-4 bg-slate-50 border border-slate-200 rounded-lg"
            >
              <input
                type="text"
                required
                placeholder="Service name (e.g. Consultation)"
                value={newSvc.name}
                onChange={(e) => setNewSvc({ ...newSvc, name: e.target.value })}
                className="md:col-span-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              />
              <input
                type="text"
                placeholder="Category"
                value={newSvc.category}
                onChange={(e) => setNewSvc({ ...newSvc, category: e.target.value })}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              />
              <input
                type="number"
                min={10}
                placeholder="Minutes"
                value={newSvc.durationMinutes}
                onChange={(e) =>
                  setNewSvc({ ...newSvc, durationMinutes: Number(e.target.value) })
                }
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-mono tabular-nums"
              />
              <input
                type="number"
                min={0}
                placeholder={`Price (${biz.currency})`}
                value={newSvc.price}
                onChange={(e) =>
                  setNewSvc({ ...newSvc, price: Number(e.target.value) })
                }
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-mono tabular-nums"
              />
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-slate-900 text-white px-3 py-2 text-sm font-medium hover:bg-slate-800 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Add
              </button>
              <input
                type="text"
                placeholder="Description"
                value={newSvc.description}
                onChange={(e) => setNewSvc({ ...newSvc, description: e.target.value })}
                className="md:col-span-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              />
              <input
                type="text"
                placeholder="Assigned staff member"
                value={newSvc.staffMember}
                onChange={(e) => setNewSvc({ ...newSvc, staffMember: e.target.value })}
                className="md:col-span-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              />
              <label className="flex items-center gap-2 text-xs text-slate-600 px-1">
                <input
                  type="checkbox"
                  checked={newSvc.advancePaymentRequired}
                  onChange={(e) =>
                    setNewSvc({ ...newSvc, advancePaymentRequired: e.target.checked })
                  }
                />
                Advance payment
              </label>
            </form>

            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
                  <tr>
                    <th className="py-2.5 px-4 font-medium">Service</th>
                    <th className="py-2.5 px-4 font-medium">Category</th>
                    <th className="py-2.5 px-4 font-medium text-right">Duration</th>
                    <th className="py-2.5 px-4 font-medium text-right">Price</th>
                    <th className="py-2.5 px-4 font-medium">Staff</th>
                    <th className="py-2.5 px-4 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {workspace.services.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-xs text-slate-500">
                        No services added yet. Add your first service above.
                      </td>
                    </tr>
                  ) : (
                    workspace.services.map((svc) => (
                      <tr key={svc.id} className="hover:bg-slate-50/70">
                        <td className="py-3 px-4">
                          <div className="font-medium text-slate-900">{svc.name}</div>
                          {svc.description && (
                            <div className="text-xs text-slate-500">{svc.description}</div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-600">{svc.category}</td>
                        <td className="py-3 px-4 text-right font-mono text-xs tabular-nums">
                          {svc.durationMinutes} min
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-xs font-medium tabular-nums">
                          {formatCurrency(svc.price, svc.currency)}
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-600">
                          {svc.staffMember}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => deleteService(svc.id)}
                            aria-label={`Delete ${svc.name}`}
                            className="p-1.5 text-slate-400 hover:text-red-600 cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
                Back
              </button>
              <button
                type="button"
                onClick={() => setStep(4)}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 text-sm font-semibold text-white bg-[#0F766E] hover:bg-[#0D625B] rounded-lg cursor-pointer"
              >
                Continue to Packages
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-6">
            <div>
              <h2 className="font-display text-lg font-semibold text-slate-900">
                04. Packages, Memberships & Promotional Offers
              </h2>
              <p className="text-sm text-slate-500 mt-0.5">
                Configure multi-session bundles or introductory deals. The AI recommends
                them naturally when relevant.
              </p>
            </div>

            <form
              onSubmit={addPackage}
              className="grid grid-cols-1 md:grid-cols-6 gap-3 p-4 bg-slate-50 border border-slate-200 rounded-lg"
            >
              <input
                type="text"
                required
                placeholder="Package name (e.g. 5-Session Pack)"
                value={newPkg.name}
                onChange={(e) => setNewPkg({ ...newPkg, name: e.target.value })}
                className="md:col-span-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              />
              <input
                type="text"
                placeholder="Included services"
                value={newPkg.includedServices}
                onChange={(e) =>
                  setNewPkg({ ...newPkg, includedServices: e.target.value })
                }
                className="md:col-span-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              />
              <input
                type="number"
                min={1}
                placeholder="Sessions"
                value={newPkg.sessionCount}
                onChange={(e) =>
                  setNewPkg({ ...newPkg, sessionCount: Number(e.target.value) })
                }
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-mono tabular-nums"
              />
              <input
                type="number"
                min={0}
                placeholder="Price"
                value={newPkg.price}
                onChange={(e) =>
                  setNewPkg({ ...newPkg, price: Number(e.target.value) })
                }
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-mono tabular-nums"
              />
              <input
                type="text"
                placeholder="Description"
                value={newPkg.description}
                onChange={(e) => setNewPkg({ ...newPkg, description: e.target.value })}
                className="md:col-span-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              />
              <input
                type="number"
                min={1}
                placeholder="Validity (days)"
                value={newPkg.validityDays}
                onChange={(e) =>
                  setNewPkg({ ...newPkg, validityDays: Number(e.target.value) })
                }
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-mono tabular-nums"
              />
              <input
                type="text"
                placeholder="Conditions"
                value={newPkg.conditions}
                onChange={(e) => setNewPkg({ ...newPkg, conditions: e.target.value })}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              />
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-slate-900 text-white px-3 py-2 text-sm font-medium hover:bg-slate-800 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Add
              </button>
            </form>

            <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg">
              {workspace.packages.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-500">
                  No packages configured yet. Packages are optional—you can continue
                  anytime.
                </div>
              ) : (
                workspace.packages.map((pkg) => (
                  <div
                    key={pkg.id}
                    className="p-4 flex items-center justify-between gap-4"
                  >
                    <div>
                      <div className="text-sm font-semibold text-slate-900">
                        {pkg.name}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {pkg.sessionCount} sessions · Valid {pkg.validityDays} days ·
                        Includes: {pkg.includedServices || 'Custom'}
                      </div>
                      {pkg.description && (
                        <p className="text-xs text-slate-600 mt-1">{pkg.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                      <span className="font-mono text-sm font-semibold tabular-nums">
                        {formatCurrency(pkg.price, pkg.currency)}
                      </span>
                      <button
                        type="button"
                        onClick={() => deletePackage(pkg.id)}
                        className="p-1.5 text-slate-400 hover:text-red-600 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setStep(3)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
                Back
              </button>
              <button
                type="button"
                onClick={() => setStep(5)}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 text-sm font-semibold text-white bg-[#0F766E] hover:bg-[#0D625B] rounded-lg cursor-pointer"
              >
                Continue to Availability
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-6">
            <div>
              <h2 className="font-display text-lg font-semibold text-slate-900">
                05. Business Availability & Booking Policies
              </h2>
              <p className="text-sm text-slate-500 mt-0.5">
                These rules directly power real-time slot calculations and double-booking
                prevention.
              </p>
            </div>

            <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
              {DAY_LABELS.map(({ key, label }) => {
                const cfg = availForm.workingDaysJson[key];
                return (
                  <div
                    key={key}
                    className="flex flex-wrap items-center justify-between gap-4 px-4 py-2.5"
                  >
                    <label className="flex items-center gap-2.5 text-sm font-medium text-slate-800 w-32">
                      <input
                        type="checkbox"
                        checked={cfg.enabled}
                        onChange={(e) =>
                          setAvailForm({
                            ...availForm,
                            workingDaysJson: {
                              ...availForm.workingDaysJson,
                              [key]: { ...cfg, enabled: e.target.checked },
                            },
                          })
                        }
                      />
                      {label}
                    </label>
                    {cfg.enabled ? (
                      <div className="flex items-center gap-2 text-xs">
                        <input
                          type="time"
                          value={cfg.open}
                          onChange={(e) =>
                            setAvailForm({
                              ...availForm,
                              workingDaysJson: {
                                ...availForm.workingDaysJson,
                                [key]: { ...cfg, open: e.target.value },
                              },
                            })
                          }
                          className="rounded border border-slate-200 px-2 py-1 font-mono"
                        />
                        <span className="text-slate-400">to</span>
                        <input
                          type="time"
                          value={cfg.close}
                          onChange={(e) =>
                            setAvailForm({
                              ...availForm,
                              workingDaysJson: {
                                ...availForm.workingDaysJson,
                                [key]: { ...cfg, close: e.target.value },
                              },
                            })
                          }
                          className="rounded border border-slate-200 px-2 py-1 font-mono"
                        />
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">Closed</span>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Daily Break Window
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="time"
                    value={availForm.breakStart}
                    onChange={(e) =>
                      setAvailForm({ ...availForm, breakStart: e.target.value })
                    }
                    className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-mono"
                  />
                  <span className="text-xs text-slate-400">–</span>
                  <input
                    type="time"
                    value={availForm.breakEnd}
                    onChange={(e) =>
                      setAvailForm({ ...availForm, breakEnd: e.target.value })
                    }
                    className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Booking Slot Interval (min)
                </label>
                <select
                  value={availForm.slotIntervalMinutes}
                  onChange={(e) =>
                    setAvailForm({
                      ...availForm,
                      slotIntervalMinutes: Number(e.target.value),
                    })
                  }
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white"
                >
                  <option value={15}>15 minutes</option>
                  <option value={30}>30 minutes</option>
                  <option value={45}>45 minutes</option>
                  <option value={60}>60 minutes</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Cancellation Window (hours)
                </label>
                <input
                  type="number"
                  min={0}
                  value={availForm.cancellationWindowHours}
                  onChange={(e) =>
                    setAvailForm({
                      ...availForm,
                      cancellationWindowHours: Number(e.target.value),
                    })
                  }
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono tabular-nums"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Rescheduling Policy
                </label>
                <input
                  type="text"
                  value={availForm.reschedulingPolicy}
                  onChange={(e) =>
                    setAvailForm({ ...availForm, reschedulingPolicy: e.target.value })
                  }
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Holidays (YYYY-MM-DD, comma separated)
                </label>
                <input
                  type="text"
                  placeholder="2026-12-25, 2027-01-01"
                  value={availForm.holidaysText}
                  onChange={(e) =>
                    setAvailForm({ ...availForm, holidaysText: e.target.value })
                  }
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setStep(4)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
                Back
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={saveAvailability}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-[#0F766E] hover:bg-[#0D625B] rounded-lg cursor-pointer"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Save Availability & Continue
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {step === 6 && (
          <div className="space-y-6">
            <div>
              <h2 className="font-display text-lg font-semibold text-slate-900">
                06. WhatsApp Business Platform / Cloud API Setup
              </h2>
              <p className="text-sm text-slate-500 mt-0.5">
                Connect your eligible WhatsApp Business number through Meta’s official
                Cloud API. Ordinary personal WhatsApp accounts must be upgraded in Meta
                Business Portfolio first.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    WhatsApp Business Phone Number
                  </label>
                  <input
                    type="text"
                    placeholder="+91 98450 22190"
                    value={waForm.whatsappPhone}
                    onChange={(e) =>
                      setWaForm({ ...waForm, whatsappPhone: e.target.value })
                    }
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Meta Phone Number ID
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 384920184756102"
                    value={waForm.whatsappPhoneNumberId}
                    onChange={(e) =>
                      setWaForm({ ...waForm, whatsappPhoneNumberId: e.target.value })
                    }
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    WhatsApp Business Account (WABA) ID
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 109283746519283"
                    value={waForm.whatsappBusinessAccountId}
                    onChange={(e) =>
                      setWaForm({
                        ...waForm,
                        whatsappBusinessAccountId: e.target.value,
                      })
                    }
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Webhook Callback URL (paste in Meta App Dashboard)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={webhookFullUrl}
                      className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-mono text-slate-700"
                    />
                    <button
                      type="button"
                      onClick={() => copyText('webhook', webhookFullUrl)}
                      className="px-3 py-2 text-xs font-medium border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
                    >
                      {copiedKey === 'webhook' ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Webhook Verify Token
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={waForm.metaVerifyToken}
                      onChange={(e) =>
                        setWaForm({ ...waForm, metaVerifyToken: e.target.value })
                      }
                      className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => copyText('verify', waForm.metaVerifyToken)}
                      className="px-3 py-2 text-xs font-medium border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
                    >
                      {copiedKey === 'verify' ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-lg p-5 space-y-4">
                <h3 className="font-display text-sm font-semibold text-slate-900">
                  Meta Verification Checklist
                </h3>
                <ol className="space-y-2.5 text-xs text-slate-600 list-decimal pl-4">
                  <li>
                    Verify your business entity inside Meta Business Suite and create a
                    WhatsApp Business Account (WABA).
                  </li>
                  <li>
                    Register your business phone number via OTP/Voice verification in the
                    WhatsApp Cloud API console.
                  </li>
                  <li>
                    Paste the Webhook Callback URL and Verify Token on the left, then
                    subscribe to the <span className="font-mono">messages</span> webhook
                    field.
                  </li>
                  <li>
                    Use approved utility templates for business-initiated appointment
                    confirmations and 24-hour reminders.
                  </li>
                </ol>

                <div className="pt-3 border-t border-slate-200">
                  <div className="text-xs font-semibold text-slate-700 mb-2">
                    Configured Notification Templates
                  </div>
                  <div className="space-y-2">
                    {(waChannel?.approvedTemplatesJson || []).map((tpl) => (
                      <div
                        key={tpl.name}
                        className="p-2.5 bg-white border border-slate-200 rounded text-xs"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-medium text-slate-900">
                            {tpl.name}
                          </span>
                          <span className="text-emerald-700 font-medium">
                            {tpl.status === 'approved' ? 'Approved' : 'Pending'}
                          </span>
                        </div>
                        <p className="text-slate-500 mt-1">{tpl.body}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setStep(5)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
                Back
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={saveWhatsApp}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-[#0F766E] hover:bg-[#0D625B] rounded-lg cursor-pointer"
              >
                Save WhatsApp Setup & Continue
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {step === 7 && (
          <div className="space-y-5">
            <div>
              <h2 className="font-display text-lg font-semibold text-slate-900">
                07. AI Receptionist Configuration
              </h2>
              <p className="text-sm text-slate-500 mt-0.5">
                Customize how your virtual receptionist greets customers, answers
                questions, enforces booking policies, and escalates to humans.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Agent Name
                </label>
                <input
                  type="text"
                  value={agentForm.agentName}
                  onChange={(e) =>
                    setAgentForm({ ...agentForm, agentName: e.target.value })
                  }
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Personality & Communication Style
                </label>
                <input
                  type="text"
                  value={agentForm.agentPersonality}
                  onChange={(e) =>
                    setAgentForm({ ...agentForm, agentPersonality: e.target.value })
                  }
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Greeting Message
                </label>
                <input
                  type="text"
                  value={agentForm.agentGreeting}
                  onChange={(e) =>
                    setAgentForm({ ...agentForm, agentGreeting: e.target.value })
                  }
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Business-Specific Instructions
                </label>
                <textarea
                  rows={3}
                  value={agentForm.agentInstructions}
                  onChange={(e) =>
                    setAgentForm({ ...agentForm, agentInstructions: e.target.value })
                  }
                  placeholder="E.g. Mention complimentary parking, suggest introductory packages gently when customers ask about multi-visit discounts..."
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Booking Policy
                </label>
                <textarea
                  rows={2}
                  value={agentForm.bookingPolicy}
                  onChange={(e) =>
                    setAgentForm({ ...agentForm, bookingPolicy: e.target.value })
                  }
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Human Escalation Policy
                </label>
                <textarea
                  rows={2}
                  value={agentForm.escalationPolicy}
                  onChange={(e) =>
                    setAgentForm({ ...agentForm, escalationPolicy: e.target.value })
                  }
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-6 pt-2 text-sm text-slate-700">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={agentForm.reminder24h}
                  onChange={(e) =>
                    setAgentForm({ ...agentForm, reminder24h: e.target.checked })
                  }
                />
                Send automated 24-hour reminder
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={agentForm.reminder2h}
                  onChange={(e) =>
                    setAgentForm({ ...agentForm, reminder2h: e.target.checked })
                  }
                />
                Send automated 2-hour reminder
              </label>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setStep(6)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
                Back
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={saveAgentConfig}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-[#0F766E] hover:bg-[#0D625B] rounded-lg cursor-pointer"
              >
                Save AI Agent & Continue
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {step === 8 && (
          <div className="space-y-6">
            <div>
              <h2 className="font-display text-lg font-semibold text-slate-900">
                08. Website Chat Widget & Launch
              </h2>
              <p className="text-sm text-slate-500 mt-0.5">
                Configure your floating website widget and copy the embed snippet for
                WordPress, Shopify, Webflow, Wix, or custom sites.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Welcome Message
                  </label>
                  <input
                    type="text"
                    value={widgetForm.welcomeMessage}
                    onChange={(e) =>
                      setWidgetForm({ ...widgetForm, welcomeMessage: e.target.value })
                    }
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Quick Prompts (one per line)
                  </label>
                  <textarea
                    rows={5}
                    value={widgetForm.quickPromptsText}
                    onChange={(e) =>
                      setWidgetForm({ ...widgetForm, quickPromptsText: e.target.value })
                    }
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">
                      Brand Color
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={widgetForm.brandColor}
                        onChange={(e) =>
                          setWidgetForm({ ...widgetForm, brandColor: e.target.value })
                        }
                        className="h-9 w-12 rounded border border-slate-200 cursor-pointer"
                      />
                      <input
                        type="text"
                        value={widgetForm.brandColor}
                        onChange={(e) =>
                          setWidgetForm({ ...widgetForm, brandColor: e.target.value })
                        }
                        className="flex-1 rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-mono"
                      />
                    </div>
                  </div>
                  <div className="flex items-end pb-2">
                    <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={widgetForm.enableWhatsAppHandoff}
                        onChange={(e) =>
                          setWidgetForm({
                            ...widgetForm,
                            enableWhatsAppHandoff: e.target.checked,
                          })
                        }
                      />
                      Enable WhatsApp handoff
                    </label>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={saving}
                  onClick={saveWidgetConfig}
                  className="px-4 py-2 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg cursor-pointer"
                >
                  Save Widget Branding
                </button>
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg w-fit">
                  {(['html', 'wordpress', 'shopify', 'webflow'] as const).map((plat) => (
                    <button
                      key={plat}
                      type="button"
                      onClick={() => setEmbedTab(plat)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md capitalize cursor-pointer ${
                        embedTab === plat
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {plat === 'html' ? 'Custom HTML' : plat}
                    </button>
                  ))}
                </div>

                <div className="bg-slate-900 text-slate-100 rounded-xl p-4 font-mono text-xs overflow-x-auto">
                  <div className="flex items-center justify-between mb-2 text-slate-400">
                    <span>Embeddable Snippet</span>
                    <button
                      type="button"
                      onClick={() => copyText('embed', embedSnippet)}
                      className="inline-flex items-center gap-1 text-slate-200 hover:text-white cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      {copiedKey === 'embed' ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                  <code className="break-all">{embedSnippet}</code>
                </div>

                <p className="text-xs text-slate-600 leading-relaxed">
                  {embedTab === 'html' &&
                    'Paste this script tag right before the closing </body> tag on your website.'}
                  {embedTab === 'wordpress' &&
                    'In WordPress Admin, open Appearance → Theme File Editor → footer.php (or WPCode plugin) and paste before </body>.'}
                  {embedTab === 'shopify' &&
                    'In Shopify Admin, go to Online Store → Themes → Edit Code → theme.liquid and paste right before </body>.'}
                  {embedTab === 'webflow' &&
                    'In Webflow Site Settings → Custom Code → Footer Code, paste the snippet and publish your site.'}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setStep(7)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
                Back
              </button>
              <button
                type="button"
                onClick={onFinishToTestLab}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-[#0F766E] hover:bg-[#0D625B] rounded-lg cursor-pointer"
              >
                <Check className="w-4 h-4" />
                Launch & Test AI Receptionist
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
