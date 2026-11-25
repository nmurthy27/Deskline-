import React, { useCallback, useEffect, useState } from 'react';
import { Download, Loader2, RefreshCw } from 'lucide-react';
import { apiFetch } from '../lib/api';
import {
  csvCell,
  formatCurrency,
  type MisBucket,
  type MisReportResponse,
} from '../types';

interface MisAnalyticsPanelProps {
  businessId: number;
  businessName: string;
}

type MisGranularity = 'daily' | 'weekly' | 'monthly';

export function MisAnalyticsPanel({
  businessId,
  businessName,
}: MisAnalyticsPanelProps) {
  const [report, setReport] = useState<MisReportResponse | null>(null);
  const [granularity, setGranularity] = useState<MisGranularity>('monthly');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  const loadMis = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<MisReportResponse>(`/api/businesses/${businessId}/mis`);
      setReport(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to load MIS report.');
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => {
    loadMis();
  }, [loadMis]);

  const exportCsv = () => {
    if (!report) return;
    const rows: MisBucket[] = report[granularity];
    const header = [
      'Period',
      'Total Appointments',
      'Confirmed',
      'Completed',
      'Rescheduled',
      'Cancelled',
      'WhatsApp',
      'Website',
      'Dashboard',
      `Estimated Business Value (${report.currency})`,
      `Cancelled Value (${report.currency})`,
      `Avg Booking Value (${report.currency})`,
    ];
    const lines = [
      header.map(csvCell).join(','),
      ...rows.map((r) =>
        [
          r.label,
          r.total,
          r.confirmed,
          r.completed,
          r.rescheduled,
          r.cancelled,
          r.whatsapp,
          r.website,
          r.dashboard,
          r.estimatedValue,
          r.lostValue,
          r.averageValue,
        ]
          .map(csvCell)
          .join(',')
      ),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${businessName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-mis-${granularity}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading && !report) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
        {error || 'MIS analytics are currently unavailable.'}
      </div>
    );
  }

  const buckets = report[granularity];
  const maxVal = Math.max(1, ...buckets.map((b) => b.estimatedValue));
  const maxCount = Math.max(1, ...buckets.map((b) => b.total));
  const periodTotals = buckets.reduce(
    (acc, b) => ({
      total: acc.total + b.total,
      active: acc.active + (b.total - b.cancelled),
      cancelled: acc.cancelled + b.cancelled,
      whatsapp: acc.whatsapp + b.whatsapp,
      website: acc.website + b.website,
      dashboard: acc.dashboard + b.dashboard,
      estimatedValue: acc.estimatedValue + b.estimatedValue,
      lostValue: acc.lostValue + b.lostValue,
    }),
    {
      total: 0,
      active: 0,
      cancelled: 0,
      whatsapp: 0,
      website: 0,
      dashboard: 0,
      estimatedValue: 0,
      lostValue: 0,
    }
  );

  const hoveredBucket = buckets.find((b) => b.key === hoveredKey) || null;

  return (
    <div className="space-y-6">
      {/* Top Executive KPI Strip — Daily / Weekly / Monthly / Overall Value */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 bg-white border border-slate-200 rounded-xl divide-y sm:divide-y-0 sm:divide-x divide-slate-200">
        <div className="p-5">
          <div className="text-xs text-slate-500">Daily Appointments (Today)</div>
          <div className="mt-1 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {report.summary.dailyCount}
          </div>
          <div className="mt-1 text-xs text-slate-600 font-mono tabular-nums">
            Est. Value: {formatCurrency(report.summary.dailyValue, report.currency)}
          </div>
        </div>

        <div className="p-5">
          <div className="text-xs text-slate-500">Weekly Appointments (This Week)</div>
          <div className="mt-1 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {report.summary.weeklyCount}
          </div>
          <div className="mt-1 text-xs text-slate-600 font-mono tabular-nums">
            Est. Value: {formatCurrency(report.summary.weeklyValue, report.currency)}
          </div>
        </div>

        <div className="p-5">
          <div className="text-xs text-slate-500">Monthly Appointments (This Month)</div>
          <div className="mt-1 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {report.summary.monthlyCount}
          </div>
          <div className="mt-1 text-xs text-slate-600 font-mono tabular-nums">
            Est. Value: {formatCurrency(report.summary.monthlyValue, report.currency)}
          </div>
        </div>

        <div className="p-5">
          <div className="text-xs text-slate-500">Overall Estimated Business Value</div>
          <div className="mt-1 font-mono text-2xl font-semibold text-[#0F766E] tabular-nums">
            {formatCurrency(report.summary.estimatedBusinessValue, report.currency)}
          </div>
          <div className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
            {report.summary.activeAppointments} active · Avg{' '}
            {formatCurrency(report.summary.averageBookingValue, report.currency)} ·{' '}
            {report.summary.realizationRate}% realized
          </div>
        </div>
      </div>

      {/* Granularity Controls & Interactive Chart */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="font-display text-base font-semibold text-slate-900">
              Appointments & Estimated Business Value Trend
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {granularity === 'daily' &&
                'Daily appointment volume and confirmed business value across the 14-day window.'}
              {granularity === 'weekly' &&
                'Week-over-week appointment volume and estimated revenue across the last 8 weeks.'}
              {granularity === 'monthly' &&
                'Month-over-month appointment volume and estimated business value across the last 6 months.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              {(
                [
                  ['daily', 'Daily'],
                  ['weekly', 'Weekly'],
                  ['monthly', 'Monthly'],
                ] as const
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => {
                    setGranularity(mode);
                    setHoveredKey(null);
                  }}
                  className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                    granularity === mode
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={loadMis}
              aria-label="Refresh MIS report"
              className="p-2 text-slate-500 hover:text-slate-900 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={exportCsv}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg whitespace-nowrap cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Export MIS CSV
            </button>
          </div>
        </div>

        {/* Hover Summary Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 py-2.5 px-4 bg-slate-50 border border-slate-100 rounded-lg text-xs">
          {hoveredBucket ? (
            <>
              <div className="font-medium text-slate-900">
                {hoveredBucket.label}
                {hoveredBucket.sublabel ? ` (${hoveredBucket.sublabel})` : ''}
              </div>
              <div className="flex flex-wrap items-center gap-4 font-mono tabular-nums text-slate-700">
                <span>
                  Appointments: <strong className="text-slate-900">{hoveredBucket.total}</strong>
                </span>
                <span>
                  Est. Value:{' '}
                  <strong className="text-[#0F766E]">
                    {formatCurrency(hoveredBucket.estimatedValue, report.currency)}
                  </strong>
                </span>
                <span>
                  Cancelled:{' '}
                  <strong className="text-red-600">{hoveredBucket.cancelled}</strong>
                </span>
              </div>
            </>
          ) : (
            <>
              <div className="text-slate-600">
                Window Total ({buckets.length}{' '}
                {granularity === 'daily'
                  ? 'days'
                  : granularity === 'weekly'
                    ? 'weeks'
                    : 'months'}
                )
              </div>
              <div className="flex flex-wrap items-center gap-4 font-mono tabular-nums text-slate-700">
                <span>
                  Bookings: <strong className="text-slate-900">{periodTotals.total}</strong>
                </span>
                <span>
                  Est. Value:{' '}
                  <strong className="text-[#0F766E]">
                    {formatCurrency(periodTotals.estimatedValue, report.currency)}
                  </strong>
                </span>
                <span>
                  Lost (Cancelled):{' '}
                  <strong className="text-slate-600">
                    {formatCurrency(periodTotals.lostValue, report.currency)}
                  </strong>
                </span>
              </div>
            </>
          )}
        </div>

        {/* Dual-Metric Bar Chart */}
        <div className="pt-2 overflow-x-auto">
          <div className="min-w-[640px]">
            <div className="h-56 flex items-end gap-2 px-1 border-b border-slate-200 pb-2">
              {buckets.map((bucket) => {
                const valuePct = Math.round((bucket.estimatedValue / maxVal) * 100);
                const countPct = Math.round((bucket.total / maxCount) * 100);
                const isHovered = hoveredKey === bucket.key;
                return (
                  <div
                    key={bucket.key}
                    onMouseEnter={() => setHoveredKey(bucket.key)}
                    onMouseLeave={() => setHoveredKey(null)}
                    className={`flex-1 flex flex-col items-center justify-end h-full group cursor-pointer rounded-t-md transition-colors px-1 ${
                      isHovered ? 'bg-slate-50' : ''
                    }`}
                  >
                    <div className="text-[10px] font-mono tabular-nums text-slate-500 mb-1.5">
                      {bucket.total > 0 ? bucket.total : ''}
                    </div>
                    <div className="w-full flex items-end justify-center gap-1 h-40">
                      {/* Estimated Value Bar */}
                      <div
                        className="w-3/5 max-w-[28px] bg-[#0F766E] rounded-t transition-all"
                        style={{
                          height: `${bucket.estimatedValue > 0 ? Math.max(8, valuePct) : 2}%`,
                          opacity: bucket.estimatedValue > 0 ? (isHovered ? 1 : 0.88) : 0.15,
                        }}
                        title={`${bucket.label}: ${formatCurrency(bucket.estimatedValue, report.currency)}`}
                      />
                      {/* Appointment Count Bar */}
                      <div
                        className="w-2/5 max-w-[16px] bg-slate-400 rounded-t transition-all"
                        style={{
                          height: `${bucket.total > 0 ? Math.max(8, countPct) : 2}%`,
                          opacity: bucket.total > 0 ? (isHovered ? 0.9 : 0.55) : 0.12,
                        }}
                        title={`${bucket.label}: ${bucket.total} appointments`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-start gap-2 px-1 pt-2">
              {buckets.map((bucket) => (
                <div
                  key={bucket.key}
                  className="flex-1 text-center text-[11px] text-slate-500 leading-tight truncate"
                  title={bucket.label}
                >
                  <div className="font-medium text-slate-700 truncate">
                    {granularity === 'weekly'
                      ? bucket.label.split('–')[0].trim()
                      : bucket.label}
                  </div>
                  {bucket.sublabel && granularity === 'daily' && (
                    <div className="text-[10px] text-slate-400">{bucket.sublabel}</div>
                  )}
                </div>
              ))}
            </div>

            <div className="mt-4 flex items-center gap-6 text-xs text-slate-500">
              <div className="flex items-center gap-2">
                <span className="inline-block w-3 h-3 rounded-xs bg-[#0F766E]" />
                <span>Estimated Business Value ({report.currency})</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-block w-3 h-3 rounded-xs bg-slate-400" />
                <span>Appointment Volume (count shown above bar)</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Detailed Period MIS Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="font-display text-sm font-semibold text-slate-900 capitalize">
            {granularity} MIS Breakdown Table
          </h3>
          <span className="text-xs text-slate-500 font-mono tabular-nums">
            Currency: {report.currency}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
              <tr>
                <th className="py-2.5 px-4 font-medium">Period</th>
                <th className="py-2.5 px-4 font-medium text-right">Total</th>
                <th className="py-2.5 px-4 font-medium text-right">Active / Done</th>
                <th className="py-2.5 px-4 font-medium text-right">Cancelled</th>
                <th className="py-2.5 px-4 font-medium text-right">WhatsApp</th>
                <th className="py-2.5 px-4 font-medium text-right">Website</th>
                <th className="py-2.5 px-4 font-medium text-right">Avg Ticket</th>
                <th className="py-2.5 px-4 font-medium text-right">Est. Business Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {[...buckets].reverse().map((row) => (
                <tr key={row.key} className="hover:bg-slate-50/70">
                  <td className="py-2.5 px-4 text-xs font-medium text-slate-900">
                    {row.label}
                    {row.sublabel && granularity === 'daily' && (
                      <span className="text-slate-400 font-normal ml-1.5">
                        · {row.sublabel}
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono text-xs tabular-nums text-slate-900">
                    {row.total}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono text-xs tabular-nums text-emerald-700">
                    {row.total - row.cancelled}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono text-xs tabular-nums text-red-600">
                    {row.cancelled}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono text-xs tabular-nums text-slate-600">
                    {row.whatsapp}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono text-xs tabular-nums text-slate-600">
                    {row.website}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono text-xs tabular-nums text-slate-600">
                    {formatCurrency(row.averageValue, report.currency)}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono text-xs font-semibold tabular-nums text-slate-900">
                    {formatCurrency(row.estimatedValue, report.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-50 border-t border-slate-200 font-mono text-xs font-semibold text-slate-900">
              <tr>
                <td className="py-3 px-4 font-sans">Window Total</td>
                <td className="py-3 px-4 text-right tabular-nums">{periodTotals.total}</td>
                <td className="py-3 px-4 text-right tabular-nums text-emerald-700">
                  {periodTotals.active}
                </td>
                <td className="py-3 px-4 text-right tabular-nums text-red-600">
                  {periodTotals.cancelled}
                </td>
                <td className="py-3 px-4 text-right tabular-nums">
                  {periodTotals.whatsapp}
                </td>
                <td className="py-3 px-4 text-right tabular-nums">
                  {periodTotals.website}
                </td>
                <td className="py-3 px-4 text-right tabular-nums">
                  {formatCurrency(
                    periodTotals.active > 0
                      ? Math.round(periodTotals.estimatedValue / periodTotals.active)
                      : 0,
                    report.currency
                  )}
                </td>
                <td className="py-3 px-4 text-right tabular-nums text-[#0F766E]">
                  {formatCurrency(periodTotals.estimatedValue, report.currency)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Service-Wise & Channel-Wise Estimated Value Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="font-display text-sm font-semibold text-slate-900">
              Estimated Business Value by Service
            </h3>
            <span className="text-xs text-slate-400">All-time confirmed & completed</span>
          </div>
          {report.byService.length === 0 ? (
            <p className="text-xs text-slate-500 py-4">
              No appointment value data recorded yet.
            </p>
          ) : (
            <div className="space-y-3.5">
              {report.byService.map((svc) => (
                <div key={svc.serviceName} className="space-y-1.5">
                  <div className="flex items-baseline justify-between gap-4 text-xs">
                    <div className="font-medium text-slate-900 truncate">
                      {svc.serviceName}
                      <span className="text-slate-400 font-normal ml-1.5">
                        · {svc.activeBookings} active
                        {svc.cancelledBookings > 0
                          ? ` / ${svc.cancelledBookings} cancelled`
                          : ''}
                      </span>
                    </div>
                    <div className="font-mono font-semibold text-slate-900 tabular-nums shrink-0">
                      {formatCurrency(svc.estimatedValue, report.currency)}{' '}
                      <span className="text-slate-400 font-normal">
                        ({svc.sharePercent}%)
                      </span>
                    </div>
                  </div>
                  <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#0F766E] rounded-full"
                      style={{ width: `${Math.max(2, svc.sharePercent)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="font-display text-sm font-semibold text-slate-900">
              Channel Contribution
            </h3>
            <span className="text-xs text-slate-400">WhatsApp · Website · Google · Desk</span>
          </div>
          {report.byChannel.length === 0 ? (
            <p className="text-xs text-slate-500 py-4">No channel data yet.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {report.byChannel.map((ch) => (
                <div
                  key={ch.channel}
                  className="py-3 flex items-center justify-between gap-4"
                >
                  <div>
                    <div className="text-sm font-medium text-slate-900 capitalize">
                      {ch.channel === 'dashboard'
                        ? 'Manual / Reception Desk'
                        : ch.channel === 'google_profile'
                          ? 'Google Public Profile'
                          : ch.channel}
                    </div>
                    <div className="text-xs text-slate-500 font-mono tabular-nums">
                      {ch.activeBookings} active bookings · {ch.sharePercent}% of value
                    </div>
                  </div>
                  <div className="font-mono text-sm font-semibold text-slate-900 tabular-nums">
                    {formatCurrency(ch.estimatedValue, report.currency)}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="pt-3 border-t border-slate-100 text-xs text-slate-500 flex items-center justify-between">
            <span>Cancelled / Lost Pipeline Value</span>
            <span className="font-mono text-red-600 font-medium tabular-nums">
              {formatCurrency(report.summary.cancelledValue, report.currency)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
