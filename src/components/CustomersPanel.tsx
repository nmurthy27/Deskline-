import React, { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileText,
  Loader2,
  Mail,
  Phone,
  Search,
  Upload,
  Users,
  X,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import {
  buildSampleImportBatch,
  MAX_EXISTING_CUSTOMER_CAP,
  parseExistingCustomerFile,
  type FileParseSummary,
} from '../lib/customerFileParser';
import {
  csvCell,
  formatCurrency,
  formatTimeDisplay,
  type CustomerRecord,
} from '../types';

interface CustomersPanelProps {
  businessId: number;
  businessName: string;
  customers: CustomerRecord[];
  onRefreshWorkspace: () => Promise<void>;
}

interface ImportApiResponse {
  ok: boolean;
  importedCount: number;
  duplicateCount: number;
  invalidCount: number;
  capSkippedCount: number;
  totalCustomersNow: number;
  maxAllowed: number;
}

export function CustomersPanel({
  businessId,
  businessName,
  customers,
  onRefreshWorkspace,
}: CustomersPanelProps) {
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'booking' | 'imported_database'>('all');
  const [selected, setSelected] = useState<CustomerRecord | null>(null);

  // Existing Data Connector (Excel / CSV / PDF) state
  const [showConnector, setShowConnector] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [togglingOptIn, setTogglingOptIn] = useState(false);
  const [parseSummary, setParseSummary] = useState<FileParseSummary | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const totalCount = customers.length;
  const remainingCapacity = Math.max(0, MAX_EXISTING_CUSTOMER_CAP - totalCount);
  const capacityPct = Math.min(100, Math.round((totalCount / MAX_EXISTING_CUSTOMER_CAP) * 100));
  const importedCount = useMemo(
    () => customers.filter((c) => c.source === 'imported_database').length,
    [customers]
  );
  const optedInCount = useMemo(
    () => customers.filter((c) => c.marketingOptIn !== false).length,
    [customers]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return customers.filter((c) => {
      if (sourceFilter === 'booking' && c.source === 'imported_database') return false;
      if (sourceFilter === 'imported_database' && c.source !== 'imported_database') return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q) ||
        c.preferredService.toLowerCase().includes(q)
      );
    });
  }, [customers, search, sourceFilter]);

  // Keep selected drawer fresh after workspace refresh
  const activeSelected = useMemo(() => {
    if (!selected) return null;
    return customers.find((c) => c.id === selected.id) || null;
  }, [customers, selected]);

  // Compute how many parsed contacts are new vs duplicate against current DB and capped at remainingCapacity
  const previewAnalysis = useMemo(() => {
    if (!parseSummary) return null;
    const existingEmails = new Set(customers.map((c) => c.email.toLowerCase()).filter(Boolean));
    const existingPhones = new Set(
      customers.map((c) => c.phone.replace(/\D/g, '')).filter(Boolean)
    );

    const newContacts = [];
    let existingDuplicates = 0;

    for (const c of parseSummary.contacts) {
      const digits = c.phone.replace(/\D/g, '');
      if ((c.email && existingEmails.has(c.email)) || (digits && existingPhones.has(digits))) {
        existingDuplicates += 1;
        continue;
      }
      newContacts.push(c);
    }

    const allowedContacts = newContacts.slice(0, remainingCapacity);
    const capOverflow = Math.max(0, newContacts.length - remainingCapacity);

    return {
      newContactsCount: newContacts.length,
      existingDuplicates,
      allowedContacts,
      capOverflow: capOverflow + parseSummary.truncatedByCap,
    };
  }, [parseSummary, customers, remainingCapacity]);

  const handleFilePicked = async (file: File | null | undefined) => {
    if (!file) return;
    setImportError(null);
    setImportSuccess(null);
    setParsing(true);
    try {
      const summary = await parseExistingCustomerFile(file);
      if (summary.contacts.length === 0) {
        setParseSummary(null);
        setImportError(
          `No valid email addresses or phone numbers were found in "${file.name}". Ensure the file has contact columns or readable text.`
        );
      } else {
        setParseSummary(summary);
      }
    } catch (err: unknown) {
      setParseSummary(null);
      setImportError(err instanceof Error ? err.message : 'Unable to parse the selected file.');
    } finally {
      setParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleCommitImport = async () => {
    if (!previewAnalysis || previewAnalysis.allowedContacts.length === 0) return;
    setImporting(true);
    setImportError(null);
    setImportSuccess(null);
    try {
      const res = await apiFetch<ImportApiResponse>(
        `/api/businesses/${businessId}/customers/import`,
        {
          method: 'POST',
          body: JSON.stringify({
            contacts: previewAnalysis.allowedContacts,
          }),
        }
      );
      await onRefreshWorkspace();
      setParseSummary(null);
      setImportSuccess(
        `Connected ${res.importedCount} existing customer${res.importedCount === 1 ? '' : 's'} (${res.totalCustomersNow.toLocaleString()} / ${res.maxAllowed.toLocaleString()} cap used).${
          res.duplicateCount > 0 ? ` ${res.duplicateCount} duplicates skipped.` : ''
        }${res.capSkippedCount > 0 ? ` ${res.capSkippedCount} skipped due to 2,000-user cap.` : ''}`
      );
    } catch (err: unknown) {
      setImportError(err instanceof Error ? err.message : 'Failed to import customer file.');
    } finally {
      setImporting(false);
    }
  };

  const handleToggleOptIn = async (customer: CustomerRecord) => {
    setTogglingOptIn(true);
    try {
      await apiFetch(`/api/businesses/${businessId}/customers/${customer.id}/opt-in`, {
        method: 'PATCH',
        body: JSON.stringify({ marketingOptIn: customer.marketingOptIn === false }),
      });
      await onRefreshWorkspace();
    } catch (err: unknown) {
      setImportError(err instanceof Error ? err.message : 'Unable to update opt-in preference.');
    } finally {
      setTogglingOptIn(false);
    }
  };

  const handleDownloadCsvTemplate = () => {
    const headers = ['Name', 'Phone', 'Email', 'Preferred Service', 'Notes'];
    const sampleRows = [
      ['Ananya Sharma', '+91 98450 11223', 'ananya@example.com', 'General Consultation', 'Existing client'],
      ['Rohan Verma', '+91 98801 44556', 'rohan@example.com', 'Full Treatment', 'Prefers weekend slots'],
    ];
    const csv = [
      headers.map(csvCell).join(','),
      ...sampleRows.map((r) => r.map(csvCell).join(',')),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${businessName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-customer-import-template.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      {/* Existing Customer Base Cap Strip (2,000 User Limit) */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900">
              Existing Customer Database
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Connect your existing customer records from Excel (.xlsx / .xls), CSV, or PDF—strictly capped at{' '}
              <span className="font-mono font-semibold text-slate-700">2,000</span> existing users per business.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadCsvTemplate}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              CSV Template
            </button>
            <button
              type="button"
              onClick={() => {
                setShowConnector((prev) => !prev);
                setImportError(null);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#0F766E] hover:bg-[#0D625B] rounded-lg cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              {showConnector ? 'Hide Data Importer' : 'Connect Excel / CSV / PDF'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-3 border-t border-slate-100">
          <div>
            <div className="flex items-baseline justify-between text-xs">
              <span className="text-slate-500">Existing Customer Cap</span>
              <span className="font-mono font-semibold text-slate-900 tabular-nums">
                {totalCount.toLocaleString()} / {MAX_EXISTING_CUSTOMER_CAP.toLocaleString()}
              </span>
            </div>
            <div className="mt-1.5 h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  capacityPct >= 95 ? 'bg-amber-600' : 'bg-[#0F766E]'
                }`}
                style={{ width: `${Math.max(2, capacityPct)}%` }}
              />
            </div>
            <div className="mt-1 text-[11px] text-slate-500 font-mono tabular-nums">
              {remainingCapacity.toLocaleString()} slots remaining
            </div>
          </div>

          <div className="sm:border-l sm:border-slate-100 sm:pl-4">
            <div className="text-xs text-slate-500">Connected Sources</div>
            <div className="mt-1 font-mono text-sm font-semibold text-slate-900 tabular-nums">
              {totalCount - importedCount} bookings · {importedCount} imported
            </div>
            <div className="mt-0.5 text-[11px] text-slate-500">
              Automatically deduplicated by phone &amp; email
            </div>
          </div>

          <div className="sm:border-l sm:border-slate-100 sm:pl-4">
            <div className="text-xs text-slate-500">Broadcast-Ready (Opted-In)</div>
            <div className="mt-1 font-mono text-sm font-semibold text-[#0F766E] tabular-nums">
              {optedInCount.toLocaleString()} customers
            </div>
            <div className="mt-0.5 text-[11px] text-slate-500">
              Available immediately in Offers &amp; Broadcasts
            </div>
          </div>
        </div>
      </div>

      {/* Status Alerts */}
      {importError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{importError}</span>
          </div>
          <button
            type="button"
            onClick={() => setImportError(null)}
            className="font-semibold underline cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {importSuccess && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{importSuccess}</span>
          </div>
          <button
            type="button"
            onClick={() => setImportSuccess(null)}
            className="font-semibold underline cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Multi-Format File Importer Drawer (Excel / CSV / PDF) */}
      {showConnector && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-display text-sm font-semibold text-slate-900">
                Upload Existing Customer File (Excel, CSV, or PDF)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Supports <span className="font-mono">.xlsx</span>,{' '}
                <span className="font-mono">.xls</span>,{' '}
                <span className="font-mono">.csv</span>, and text-based{' '}
                <span className="font-mono">.pdf</span> customer lists. Maximum{' '}
                <span className="font-mono font-semibold">2,000</span> total existing users per business.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setImportError(null);
                setImportSuccess(null);
                setParseSummary(buildSampleImportBatch());
              }}
              className="text-xs font-semibold text-[#0F766E] hover:underline cursor-pointer"
            >
              Load Sample Excel Batch (6 Contacts)
            </button>
          </div>

          {remainingCapacity === 0 ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900 flex items-center gap-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-700" />
              <span>
                Your business has reached the maximum cap of{' '}
                <strong>2,000 existing customer users</strong>. No additional records can be imported.
              </span>
            </div>
          ) : (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const dropped = e.dataTransfer.files?.[0];
                void handleFilePicked(dropped);
              }}
              className={`rounded-xl border-2 border-dashed p-7 text-center transition-colors ${
                dragOver
                  ? 'border-[#0F766E] bg-teal-50/40'
                  : 'border-slate-200 bg-slate-50/60 hover:border-slate-300'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv,.tsv,.pdf,application/pdf,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                onChange={(e) => void handleFilePicked(e.target.files?.[0])}
                className="hidden"
              />
              {parsing ? (
                <div className="flex flex-col items-center gap-2 py-2">
                  <Loader2 className="w-6 h-6 text-[#0F766E] animate-spin" />
                  <p className="text-xs font-medium text-slate-700">
                    Parsing customer names, phone numbers, and emails...
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2.5">
                  <div className="flex items-center gap-3 text-slate-400">
                    <FileSpreadsheet className="w-5 h-5 text-emerald-700" />
                    <FileText className="w-5 h-5 text-slate-700" />
                    <Users className="w-5 h-5 text-[#0F766E]" />
                  </div>
                  <div className="text-sm font-medium text-slate-800">
                    Drop your Excel, CSV, or PDF customer database here
                  </div>
                  <p className="text-xs text-slate-500 max-w-md">
                    We automatically map Name, Phone/WhatsApp, Email, and Preferred Service columns, deduplicate existing contacts, and enforce the 2,000-user cap.
                  </p>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="mt-1 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-900 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    Choose Excel, CSV, or PDF File
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Parsed File Verification Preview */}
          {parseSummary && previewAnalysis && (
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs">
                  <span className="font-semibold text-slate-900">{parseSummary.fileName}</span>
                  <span className="mx-2 text-slate-300">·</span>
                  <span className="uppercase font-mono text-[11px] font-semibold text-[#0F766E]">
                    {parseSummary.fileFormat}
                  </span>
                  <span className="mx-2 text-slate-300">·</span>
                  <span className="font-mono text-slate-600 tabular-nums">
                    {previewAnalysis.allowedContacts.length} ready to import
                  </span>
                  {previewAnalysis.existingDuplicates + parseSummary.inFileDuplicates > 0 && (
                    <span className="text-slate-500 ml-2">
                      ({previewAnalysis.existingDuplicates + parseSummary.inFileDuplicates} duplicates skipped)
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setParseSummary(null)}
                    className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
                  >
                    Clear
                  </button>
                  <button
                    type="button"
                    disabled={importing || previewAnalysis.allowedContacts.length === 0}
                    onClick={handleCommitImport}
                    className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-[#0F766E] hover:bg-[#0D625B] disabled:opacity-50 rounded-lg cursor-pointer"
                  >
                    {importing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    Import {previewAnalysis.allowedContacts.length} Existing Customer
                    {previewAnalysis.allowedContacts.length === 1 ? '' : 's'}
                  </button>
                </div>
              </div>

              {previewAnalysis.capOverflow > 0 && (
                <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-200 text-xs text-amber-900 flex items-center gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-700" />
                  <span>
                    2,000-user cap enforced: {previewAnalysis.capOverflow.toLocaleString()} extra record
                    {previewAnalysis.capOverflow === 1 ? '' : 's'} exceed your remaining capacity of{' '}
                    {remainingCapacity.toLocaleString()} and will not be imported.
                  </span>
                </div>
              )}

              <div className="overflow-x-auto max-h-64">
                <table className="w-full text-left text-xs">
                  <thead className="bg-white border-b border-slate-200 text-slate-500 sticky top-0">
                    <tr>
                      <th className="py-2 px-4 font-medium">Name</th>
                      <th className="py-2 px-4 font-medium">Phone</th>
                      <th className="py-2 px-4 font-medium">Email</th>
                      <th className="py-2 px-4 font-medium">Preferred Service</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {previewAnalysis.allowedContacts.slice(0, 12).map((c, idx) => (
                      <tr key={`${c.email}-${c.phone}-${idx}`}>
                        <td className="py-2 px-4 font-medium text-slate-900">{c.name}</td>
                        <td className="py-2 px-4 font-mono text-slate-600">{c.phone || '—'}</td>
                        <td className="py-2 px-4 text-slate-600">{c.email || '—'}</td>
                        <td className="py-2 px-4 text-slate-500">{c.preferredService || 'General'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {previewAnalysis.allowedContacts.length > 12 && (
                <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 text-[11px] text-slate-500 font-mono">
                  Showing first 12 of {previewAnalysis.allowedContacts.length.toLocaleString()} contacts ready to import.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Existing Customers CRM Table & Detail Drawer */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div
          className={`${
            activeSelected ? 'lg:col-span-8' : 'lg:col-span-12'
          } bg-white border border-slate-200 rounded-xl overflow-hidden`}
        >
          <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div className="relative flex-1 min-w-[220px] max-w-sm">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search customers by name, email, phone..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 py-2 text-xs focus:bg-white focus:border-teal-700 focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-3">
              <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                {(
                  [
                    ['all', 'All'],
                    ['booking', 'Bookings'],
                    ['imported_database', 'Imported File'],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSourceFilter(key)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md cursor-pointer ${
                      sourceFilter === key
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <span className="text-xs text-slate-500 font-mono tabular-nums">
                {filtered.length} shown
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
                <tr>
                  <th className="py-3 px-4 font-medium">Customer</th>
                  <th className="py-3 px-4 font-medium">Contact</th>
                  <th className="py-3 px-4 font-medium">Source</th>
                  <th className="py-3 px-4 font-medium">Preferred Service</th>
                  <th className="py-3 px-4 font-medium text-right">Bookings</th>
                  <th className="py-3 px-4 font-medium text-right">Chats</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-sm text-slate-500">
                      No matching customers found. Connect an Excel, CSV, or PDF list above or wait for new bookings.
                    </td>
                  </tr>
                ) : (
                  filtered.map((cust) => (
                    <tr
                      key={cust.id}
                      onClick={() => setSelected(cust)}
                      className={`cursor-pointer transition-colors ${
                        activeSelected?.id === cust.id ? 'bg-slate-50' : 'hover:bg-slate-50/70'
                      }`}
                    >
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-900">{cust.name}</div>
                        {cust.marketingOptIn === false && (
                          <div className="text-[11px] text-slate-400">Opted out of broadcasts</div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600">
                        <div className="font-mono">{cust.phone || '—'}</div>
                        <div className="text-slate-400">{cust.email || '—'}</div>
                      </td>
                      <td className="py-3 px-4 text-xs">
                        <span
                          className={
                            cust.source === 'imported_database'
                              ? 'text-[#0F766E] font-medium'
                              : 'text-slate-600'
                          }
                        >
                          {cust.source === 'imported_database' ? 'Imported Data' : 'Booking'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-700">
                        {cust.preferredService || 'General'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs tabular-nums text-slate-900">
                        {cust.bookingCount}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs tabular-nums text-slate-600">
                        {cust.conversationCount}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {activeSelected && (
          <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-5 space-y-5 self-start">
            <div className="flex items-start justify-between gap-2 pb-4 border-b border-slate-100">
              <div>
                <h3 className="font-display text-base font-semibold text-slate-900">
                  {activeSelected.name}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {activeSelected.source === 'imported_database'
                    ? 'Imported from Existing Customer File'
                    : 'Direct Booking Customer'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 text-xs text-slate-600">
              <div className="flex items-center gap-2">
                <Phone className="w-3.5 h-3.5 text-slate-400" />
                <span className="font-mono">{activeSelected.phone || 'No phone on file'}</span>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="w-3.5 h-3.5 text-slate-400" />
                <span>{activeSelected.email || 'No email on file'}</span>
              </div>
              {activeSelected.notes && (
                <div className="pt-2 text-slate-500 border-t border-slate-100">
                  {activeSelected.notes}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-100 text-xs">
              <span className="text-slate-600">Offers &amp; Announcements Opt-In</span>
              <button
                type="button"
                disabled={togglingOptIn}
                onClick={() => handleToggleOptIn(activeSelected)}
                className={`px-2.5 py-1 rounded-md font-medium border cursor-pointer ${
                  activeSelected.marketingOptIn !== false
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                    : 'border-slate-200 bg-slate-50 text-slate-600'
                }`}
              >
                {activeSelected.marketingOptIn !== false ? 'Opted In' : 'Opted Out'}
              </button>
            </div>

            <div>
              <h4 className="text-xs font-semibold text-slate-500 mb-2.5">
                Booking History ({activeSelected.appointments.length})
              </h4>
              <div className="space-y-2">
                {activeSelected.appointments.length === 0 ? (
                  <p className="text-xs text-slate-400">No bookings recorded yet.</p>
                ) : (
                  activeSelected.appointments.map((a) => (
                    <div
                      key={a.id}
                      className="p-3 rounded-lg border border-slate-200 bg-slate-50 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-semibold text-slate-900">
                          {a.bookingRef}
                        </span>
                        <span className="capitalize text-slate-600">
                          {a.bookingStatus}
                        </span>
                      </div>
                      <div className="mt-1 font-medium text-slate-800">
                        {a.serviceNameSnapshot}
                      </div>
                      <div className="mt-0.5 text-slate-500 font-mono tabular-nums">
                        {a.appointmentDate} · {formatTimeDisplay(a.startTime)} ·{' '}
                        {formatCurrency(a.priceSnapshot, a.currencySnapshot)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
