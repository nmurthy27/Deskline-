import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Download,
  Loader2,
  Mail,
  MessageSquare,
  Send,
  Sparkles,
  Upload,
  Users,
  X,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import {
  csvCell,
  formatCurrency,
  type BusinessWorkspaceData,
  type CampaignAudienceStats,
  type CampaignRecipientRecord,
  type CampaignRecord,
} from '../types';

const MAX_EXISTING_BASE = 2000;

interface CampaignsPanelProps {
  workspace: BusinessWorkspaceData;
  onRefreshWorkspace: () => Promise<void>;
}

interface ParsedContactRow {
  name: string;
  email: string;
  phone: string;
  preferredService: string;
}

function parseContactsText(rawText: string): ParsedContactRow[] {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];

  const parsed: ParsedContactRow[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip header row if detected
    if (
      i === 0 &&
      /(email|phone|mobile|name)/i.test(line) &&
      !line.includes('@') &&
      !/\d{7,}/.test(line)
    ) {
      continue;
    }

    const parts = line
      .split(/[,\t;]+/)
      .map((p) => p.replace(/^["']|["']$/g, '').trim())
      .filter(Boolean);

    let name = '';
    let email = '';
    let phone = '';
    let preferredService = '';

    for (const part of parts) {
      if (!email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(part)) {
        email = part;
      } else if (!phone && part.replace(/\D/g, '').length >= 7 && /^[\d+\-() ]+$/.test(part)) {
        phone = part;
      } else if (!name) {
        name = part;
      } else if (!preferredService) {
        preferredService = part;
      }
    }

    if (email || phone) {
      parsed.push({ name, email, phone, preferredService });
    }
  }
  return parsed;
}

export function CampaignsPanel({
  workspace,
  onRefreshWorkspace,
}: CampaignsPanelProps) {
  const biz = workspace.business;
  const [campaigns, setCampaigns] = useState<CampaignRecord[]>([]);
  const [stats, setStats] = useState<CampaignAudienceStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Import existing customer database modal/panel
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');
  const [confirmExistingBase, setConfirmExistingBase] = useState(false);
  const [importing, setImporting] = useState(false);

  // Composer state
  const [campaignType, setCampaignType] = useState<'offer' | 'announcement'>('offer');
  const [channel, setChannel] = useState<'both' | 'whatsapp' | 'email'>('both');
  const [audienceSegment, setAudienceSegment] = useState<
    'all_existing' | 'booked_before' | 'imported_database' | 'service_specific'
  >('all_existing');
  const [audienceFilterValue, setAudienceFilterValue] = useState(
    workspace.services[0]?.name || ''
  );
  const [attachedPackageId, setAttachedPackageId] = useState<string>('');
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [messageBody, setMessageBody] = useState('');
  const [aiGoal, setAiGoal] = useState('');
  const [drafting, setDrafting] = useState(false);
  const [sending, setSending] = useState(false);

  // Delivery detail inspector
  const [inspectedCampaign, setInspectedCampaign] = useState<{
    campaign: CampaignRecord;
    recipients: CampaignRecipientRecord[];
  } | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const loadCampaigns = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{
        campaigns: CampaignRecord[];
        audienceStats: CampaignAudienceStats;
      }>(`/api/businesses/${biz.id}/campaigns`);
      setCampaigns(res.campaigns);
      setStats(res.audienceStats);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to load campaigns.');
    } finally {
      setLoading(false);
    }
  }, [biz.id]);

  useEffect(() => {
    loadCampaigns();
  }, [loadCampaigns]);

  const parsedImportPreview = useMemo(
    () => parseContactsText(importText),
    [importText]
  );

  const estimatedAudienceCount = useMemo(() => {
    if (!stats) return 0;
    if (audienceSegment === 'all_existing') return stats.optedInCount;
    if (audienceSegment === 'booked_before') return stats.bookedBeforeCount;
    if (audienceSegment === 'imported_database') return stats.importedDatabaseCount;
    return stats.optedInCount;
  }, [stats, audienceSegment]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const content = typeof reader.result === 'string' ? reader.result : '';
      setImportText(content);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmExistingBase || parsedImportPreview.length === 0) return;

    if (parsedImportPreview.length > MAX_EXISTING_BASE) {
      setError(
        `Upload contains ${parsedImportPreview.length.toLocaleString()} contacts, which exceeds the ${MAX_EXISTING_BASE.toLocaleString()}-user existing customer cap.`
      );
      return;
    }

    setImporting(true);
    setError(null);
    try {
      const res = await apiFetch<{
        importedCount: number;
        duplicateCount: number;
        invalidCount: number;
        capSkippedCount: number;
        totalCustomersNow: number;
      }>(`/api/businesses/${biz.id}/customers/import`, {
        method: 'POST',
        body: JSON.stringify({ contacts: parsedImportPreview }),
      });

      setNotice(
        `Imported ${res.importedCount} existing customers (${res.duplicateCount} duplicates skipped${res.capSkippedCount > 0 ? `, ${res.capSkippedCount} capped at 2,000 limit` : ''}). Total customer base: ${res.totalCustomersNow.toLocaleString()} / 2,000.`
      );
      setImportText('');
      setConfirmExistingBase(false);
      setShowImport(false);
      await Promise.all([loadCampaigns(), onRefreshWorkspace()]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Customer import failed.');
    } finally {
      setImporting(false);
    }
  };

  const handleDraftWithAI = async () => {
    setDrafting(true);
    setError(null);
    try {
      const res = await apiFetch<{
        title: string;
        subject: string;
        messageBody: string;
      }>(`/api/businesses/${biz.id}/campaigns/draft-ai`, {
        method: 'POST',
        body: JSON.stringify({
          campaignType,
          channel,
          goal: aiGoal,
          attachedPackageId: attachedPackageId ? Number(attachedPackageId) : null,
        }),
      });
      setTitle(res.title);
      setSubject(res.subject);
      setMessageBody(res.messageBody);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'AI draft failed.');
    } finally {
      setDrafting(false);
    }
  };

  const handleSendCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !messageBody.trim()) return;
    setSending(true);
    setError(null);
    setNotice(null);
    try {
      const res = await apiFetch<{ campaign: CampaignRecord }>(
        `/api/businesses/${biz.id}/campaigns`,
        {
          method: 'POST',
          body: JSON.stringify({
            title,
            subject: subject || title,
            messageBody,
            campaignType,
            channel,
            audienceSegment,
            audienceFilterValue,
            attachedPackageId: attachedPackageId ? Number(attachedPackageId) : null,
          }),
        }
      );
      setNotice(
        `Broadcast "${res.campaign.title}" sent to ${res.campaign.totalTargeted} existing customers (${res.campaign.sentWhatsappCount} WhatsApp, ${res.campaign.sentEmailCount} Email).`
      );
      setTitle('');
      setSubject('');
      setMessageBody('');
      setAiGoal('');
      await loadCampaigns();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Broadcast dispatch failed.');
    } finally {
      setSending(false);
    }
  };

  const inspectCampaign = async (campaignId: number) => {
    setLoadingDetail(true);
    try {
      const res = await apiFetch<{
        campaign: CampaignRecord;
        recipients: CampaignRecipientRecord[];
      }>(`/api/businesses/${biz.id}/campaigns/${campaignId}`);
      setInspectedCampaign(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not load delivery log.');
    } finally {
      setLoadingDetail(false);
    }
  };

  const exportDeliveryCsv = () => {
    if (!inspectedCampaign) return;
    const header = [
      'Customer Name',
      'Email',
      'Phone',
      'Email Status',
      'WhatsApp Status',
      'Dispatched At',
    ];
    const lines = [
      header.map(csvCell).join(','),
      ...inspectedCampaign.recipients.map((r) =>
        [
          r.customerName,
          r.email,
          r.phone,
          r.emailStatus,
          r.whatsappStatus,
          r.dispatchedAt,
        ]
          .map(csvCell)
          .join(',')
      ),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `campaign-${inspectedCampaign.campaign.id}-delivery.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading && !stats) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
      </div>
    );
  }

  const usedPct = stats
    ? Math.min(100, Math.round((stats.totalCustomers / stats.maxAllowed) * 100))
    : 0;

  return (
    <div className="space-y-6">
      {/* Existing Customer Base Quota & Import Strip */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900">
              Existing Customer Base Broadcasts
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Send promotional offers and service announcements strictly to your existing
              customer email & phone database (capped at 2,000 users per business).
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setShowImport((v) => !v);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg whitespace-nowrap cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
            Import Existing Email / Phone List
          </button>
        </div>

        {stats && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 pt-3 border-t border-slate-100">
            <div>
              <div className="text-xs text-slate-500">Customer Base Capacity</div>
              <div className="mt-1 font-mono text-lg font-semibold text-slate-900 tabular-nums">
                {stats.totalCustomers.toLocaleString()}{' '}
                <span className="text-xs font-normal text-slate-400">
                  / {stats.maxAllowed.toLocaleString()} max
                </span>
              </div>
              <div className="mt-1.5 w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${
                    usedPct >= 95 ? 'bg-amber-600' : 'bg-[#0F766E]'
                  }`}
                  style={{ width: `${Math.max(2, usedPct)}%` }}
                />
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">WhatsApp Reachable</div>
              <div className="mt-1 font-mono text-lg font-semibold text-slate-900 tabular-nums">
                {stats.withPhoneCount.toLocaleString()}
              </div>
              <div className="text-[11px] text-slate-400">Valid phone numbers</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Email Reachable</div>
              <div className="mt-1 font-mono text-lg font-semibold text-slate-900 tabular-nums">
                {stats.withEmailCount.toLocaleString()}
              </div>
              <div className="text-[11px] text-slate-400">Valid email addresses</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Database Breakdown</div>
              <div className="mt-1 font-mono text-sm font-medium text-slate-900 tabular-nums">
                {stats.bookedBeforeCount} booked · {stats.importedDatabaseCount} imported
              </div>
              <div className="text-[11px] text-slate-400">
                {stats.remainingCapacity.toLocaleString()} slots remaining
              </div>
            </div>
          </div>
        )}
      </div>

      {notice && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Existing Customer Database Import Drawer */}
      {showImport && (
        <form
          onSubmit={handleImportSubmit}
          className="bg-white border border-slate-200 rounded-xl p-6 space-y-4"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="font-display text-sm font-semibold text-slate-900">
                Import Existing Customer Database (CSV or Paste Rows)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Format: <span className="font-mono">Name, Email, Phone, Preferred Service</span>{' '}
                (one customer per line). Duplicates by email or phone are merged
                automatically, up to the 2,000-customer ceiling.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowImport(false)}
              className="text-slate-400 hover:text-slate-700 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 hover:bg-slate-100 rounded-lg cursor-pointer">
              <Upload className="w-3.5 h-3.5" />
              Choose CSV / TXT File
              <input
                type="file"
                accept=".csv,.txt"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
            <button
              type="button"
              onClick={() =>
                setImportText(
                  [
                    'Name, Email, Phone, Preferred Service',
                    'Priya Nair, priya.nair@example.com, +91 98450 31022, General Consultation',
                    'Karthik Hegde, karthik.h@example.com, +91 99801 44519, Scaling & Polishing',
                    'Sneha Kapoor, sneha.kapoor@example.com, +91 98860 77214, Premium Consultation',
                    'Arjun Verma, arjun.verma@example.com, +91 97400 88211, Full Restorative Treatment',
                  ].join('\n')
                )
              }
              className="text-xs font-medium text-[#0F766E] hover:underline cursor-pointer"
            >
              Load sample existing customer CSV
            </button>
            <span className="text-xs text-slate-500 font-mono tabular-nums ml-auto">
              Detected: {parsedImportPreview.length.toLocaleString()} valid contacts
            </span>
          </div>

          <textarea
            rows={5}
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder="Priya Nair, priya@example.com, +91 98450 31022, General Consultation"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-mono focus:border-teal-700 focus:outline-none"
          />

          <label className="flex items-start gap-2.5 text-xs text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={confirmExistingBase}
              onChange={(e) => setConfirmExistingBase(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              I confirm every email and phone number in this list belongs to our
              business’s existing customer base with permission to receive offers and
              service announcements (strict 2,000-user limit).
            </span>
          </label>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowImport(false)}
              className="px-4 py-2 text-xs font-medium text-slate-600 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={
                importing || !confirmExistingBase || parsedImportPreview.length === 0
              }
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#0F766E] hover:bg-[#0D625B] rounded-lg disabled:opacity-40 cursor-pointer"
            >
              {importing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              Import {parsedImportPreview.length} Contacts
            </button>
          </div>
        </form>
      )}

      {/* Main Two-Column Grid: Composer + Sent History */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Broadcast Composer */}
        <form
          onSubmit={handleSendCampaign}
          className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <h3 className="font-display text-base font-semibold text-slate-900">
                Compose Offer or Announcement
              </h3>
              <p className="text-xs text-slate-500">
                Broadcast via WhatsApp Business templates and/or Email to your existing
                clients.
              </p>
            </div>
            <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              {(['offer', 'announcement'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setCampaignType(t)}
                  className={`px-3 py-1 text-xs font-medium rounded-md capitalize cursor-pointer ${
                    campaignType === t
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Delivery Channel
              </label>
              <select
                value={channel}
                onChange={(e) =>
                  setChannel(e.target.value as 'both' | 'whatsapp' | 'email')
                }
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                <option value="both">WhatsApp + Email (Recommended)</option>
                <option value="whatsapp">WhatsApp Business Only</option>
                <option value="email">Email Only</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Existing Customer Segment (Max 2,000)
              </label>
              <select
                value={audienceSegment}
                onChange={(e) =>
                  setAudienceSegment(
                    e.target.value as
                      | 'all_existing'
                      | 'booked_before'
                      | 'imported_database'
                      | 'service_specific'
                  )
                }
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                <option value="all_existing">
                  All Existing Customers ({stats?.optedInCount ?? 0})
                </option>
                <option value="booked_before">
                  Past Appointment Customers ({stats?.bookedBeforeCount ?? 0})
                </option>
                <option value="imported_database">
                  Imported Contact Database ({stats?.importedDatabaseCount ?? 0})
                </option>
                <option value="service_specific">By Preferred Service</option>
              </select>
            </div>

            {audienceSegment === 'service_specific' && (
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Target Preferred Service
                </label>
                <select
                  value={audienceFilterValue}
                  onChange={(e) => setAudienceFilterValue(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                >
                  {workspace.services.map((s) => (
                    <option key={s.id} value={s.name}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {workspace.packages.length > 0 && (
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Attach Active Package / Offer (Optional)
                </label>
                <select
                  value={attachedPackageId}
                  onChange={(e) => setAttachedPackageId(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                >
                  <option value="">None (Custom announcement)</option>
                  {workspace.packages.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {formatCurrency(p.price, p.currency)} ({p.sessionCount}{' '}
                      sessions)
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* AI Copywriter Helper */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-2.5">
            <div className="text-xs font-medium text-slate-700">
              AI Offer & Announcement Drafter
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={aiGoal}
                onChange={(e) => setAiGoal(e.target.value)}
                placeholder="e.g. 20% off winter dental scaling for returning patients this week"
                className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs focus:border-teal-700 focus:outline-none"
              />
              <button
                type="button"
                disabled={drafting}
                onClick={handleDraftWithAI}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-900 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg whitespace-nowrap cursor-pointer disabled:opacity-50"
              >
                {drafting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5 text-[#0F766E]" />
                )}
                Draft Copy
              </button>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Campaign Name
              </label>
              <input
                type="text"
                required
                placeholder="e.g. November Returning Client Offer"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </div>

            {(channel === 'email' || channel === 'both') && (
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Email Subject Line
                </label>
                <input
                  type="text"
                  placeholder="e.g. Exclusive 20% Returning Member Offer at Soma Wellness"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Message Content (use <span className="font-mono">{'{{name}}'}</span> to
                personalize)
              </label>
              <textarea
                rows={5}
                required
                placeholder="Hi {{name}}, as an existing patient of Soma Wellness & Dental, enjoy priority booking and 15% off our Preventive Wellness Pack this month. Reply BOOK to reserve your slot."
                value={messageBody}
                onChange={(e) => setMessageBody(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm leading-relaxed"
              />
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-slate-500 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-slate-400" />
              <span>
                Est. audience:{' '}
                <strong className="font-mono text-slate-900 tabular-nums">
                  {estimatedAudienceCount.toLocaleString()}
                </strong>{' '}
                existing customers (cap: 2,000)
              </span>
            </div>

            <button
              type="submit"
              disabled={sending || !title.trim() || !messageBody.trim()}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-[#0F766E] hover:bg-[#0D625B] rounded-lg disabled:opacity-40 cursor-pointer"
            >
              {sending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              Send Broadcast
            </button>
          </div>
        </form>

        {/* Right: Sent Campaigns History & Delivery Log */}
        <div className="lg:col-span-5 space-y-5">
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-display text-sm font-semibold text-slate-900">
                Sent Offers & Announcements
              </h3>
              <span className="font-mono text-xs text-slate-400 tabular-nums">
                {campaigns.length} total
              </span>
            </div>

            <div className="divide-y divide-slate-100 max-h-[420px] overflow-y-auto">
              {campaigns.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  No broadcasts sent yet. Import your existing customer list or send your
                  first offer on the left.
                </div>
              ) : (
                campaigns.map((camp) => (
                  <button
                    key={camp.id}
                    type="button"
                    onClick={() => inspectCampaign(camp.id)}
                    className={`w-full text-left px-5 py-3.5 hover:bg-slate-50 transition-colors cursor-pointer ${
                      inspectedCampaign?.campaign.id === camp.id ? 'bg-slate-50' : ''
                    }`}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-semibold text-slate-900 truncate">
                        {camp.title}
                      </span>
                      <span className="text-[11px] text-slate-400 font-mono tabular-nums shrink-0">
                        {new Date(camp.sentAt).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-slate-500 flex flex-wrap items-center gap-2">
                      <span className="capitalize">{camp.campaignType}</span>
                      <span>·</span>
                      <span className="font-mono tabular-nums text-slate-700">
                        {camp.totalTargeted} targeted
                      </span>
                      <span>·</span>
                      <span className="inline-flex items-center gap-1 font-mono tabular-nums text-emerald-700">
                        <MessageSquare className="w-3 h-3" />
                        {camp.sentWhatsappCount}
                      </span>
                      <span className="inline-flex items-center gap-1 font-mono tabular-nums text-slate-700">
                        <Mail className="w-3 h-3" />
                        {camp.sentEmailCount}
                      </span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Delivery Inspector */}
          {loadingDetail && (
            <div className="bg-white border border-slate-200 rounded-xl p-6 flex justify-center">
              <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
            </div>
          )}

          {inspectedCampaign && !loadingDetail && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-slate-900 truncate">
                    Delivery Log: {inspectedCampaign.campaign.title}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {inspectedCampaign.recipients.length} recipient records
                  </div>
                </div>
                <button
                  type="button"
                  onClick={exportDeliveryCsv}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer shrink-0"
                >
                  <Download className="w-3.5 h-3.5" />
                  CSV
                </button>
              </div>
              <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
                {inspectedCampaign.recipients.map((r) => (
                  <div
                    key={r.id}
                    className="px-5 py-2.5 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="font-medium text-slate-900 truncate">
                        {r.customerName}
                      </div>
                      <div className="text-[11px] text-slate-400 truncate font-mono">
                        {r.phone || r.email || 'No contact'}
                      </div>
                    </div>
                    <div className="text-[11px] text-right shrink-0">
                      {r.whatsappStatus !== 'not_applicable' && (
                        <div
                          className={
                            r.whatsappStatus === 'sent'
                              ? 'text-emerald-700'
                              : 'text-amber-700'
                          }
                        >
                          WA: {r.whatsappStatus}
                        </div>
                      )}
                      {r.emailStatus !== 'not_applicable' && (
                        <div
                          className={
                            r.emailStatus === 'sent'
                              ? 'text-slate-700'
                              : 'text-amber-700'
                          }
                        >
                          Email: {r.emailStatus}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
