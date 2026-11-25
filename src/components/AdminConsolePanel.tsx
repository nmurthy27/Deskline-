import React, { useEffect, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { apiFetch } from '../lib/api';

interface AdminTenant {
  id: number;
  slug: string;
  businessName: string;
  businessEmail: string;
  businessCategory: string;
  subscriptionPlan: string;
  status: string;
  whatsappStatus: string;
  appointmentCount: number;
  conversationCount: number;
  messageCount: number;
  tokenUsage: number;
}

interface AuditLogRow {
  id: number;
  businessId: number | null;
  actorUid: string;
  action: string;
  entityType: string;
  entityId: string;
  details: string;
  createdAt: string;
}

interface AdminOverviewData {
  totals: {
    totalTenants: number;
    activeTenants: number;
    totalUsers: number;
    totalAppointments: number;
    totalConversations: number;
    totalMessages: number;
    totalTokens: number;
    whatsappConnectedCount: number;
  };
  tenants: AdminTenant[];
  auditLogs: AuditLogRow[];
}

export function AdminConsolePanel() {
  const [data, setData] = useState<AdminOverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<AdminOverviewData>('/api/admin/overview');
      setData(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to load admin console.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const updateTenant = async (
    tenantId: number,
    patch: { status?: string; subscriptionPlan?: string }
  ) => {
    setUpdatingId(tenantId);
    try {
      await apiFetch(`/api/admin/businesses/${tenantId}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Update failed.');
    } finally {
      setUpdatingId(null);
    }
  };

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
        {error || 'Admin data unavailable.'}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Platform Metrics Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 bg-white border border-slate-200 rounded-xl divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
        <div className="p-5">
          <div className="text-xs text-slate-500">Isolated Tenants</div>
          <div className="mt-1 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {data.totals.activeTenants} / {data.totals.totalTenants}
          </div>
          <div className="mt-0.5 text-xs text-slate-400">
            {data.totals.whatsappConnectedCount} WhatsApp connected
          </div>
        </div>
        <div className="p-5">
          <div className="text-xs text-slate-500">Platform Appointments</div>
          <div className="mt-1 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {data.totals.totalAppointments.toLocaleString()}
          </div>
          <div className="mt-0.5 text-xs text-slate-400">
            {data.totals.totalConversations.toLocaleString()} conversations
          </div>
        </div>
        <div className="p-5">
          <div className="text-xs text-slate-500">Message Consumption</div>
          <div className="mt-1 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {data.totals.totalMessages.toLocaleString()}
          </div>
          <div className="mt-0.5 text-xs text-slate-400">Across WhatsApp & Web</div>
        </div>
        <div className="p-5">
          <div className="text-xs text-slate-500">AI Token Consumption</div>
          <div className="mt-1 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {data.totals.totalTokens.toLocaleString()}
          </div>
          <div className="mt-0.5 text-xs text-slate-400">
            {data.totals.totalUsers} registered owners
          </div>
        </div>
      </div>

      {/* Tenant Directory */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 className="font-display text-base font-semibold text-slate-900">
              Tenant Accounts & Usage
            </h3>
            <p className="text-xs text-slate-500">
              Each business runs in strict tenant isolation with independent knowledge
              bases and calendars.
            </p>
          </div>
          <button
            type="button"
            onClick={loadData}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
              <tr>
                <th className="py-3 px-4 font-medium">Business</th>
                <th className="py-3 px-4 font-medium">WhatsApp Health</th>
                <th className="py-3 px-4 font-medium text-right">Bookings</th>
                <th className="py-3 px-4 font-medium text-right">Messages</th>
                <th className="py-3 px-4 font-medium text-right">AI Tokens</th>
                <th className="py-3 px-4 font-medium">Plan</th>
                <th className="py-3 px-4 font-medium text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.tenants.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50/70">
                  <td className="py-3 px-4">
                    <div className="font-medium text-slate-900">{t.businessName}</div>
                    <div className="text-xs text-slate-500">
                      {t.businessCategory} · <span className="font-mono">{t.slug}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-xs">
                    <span
                      className={
                        t.whatsappStatus === 'connected'
                          ? 'text-emerald-700 font-medium'
                          : t.whatsappStatus === 'pending_verification'
                            ? 'text-amber-700 font-medium'
                            : 'text-slate-500'
                      }
                    >
                      {t.whatsappStatus.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-xs tabular-nums">
                    {t.appointmentCount}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-xs tabular-nums">
                    {t.messageCount.toLocaleString()}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-xs tabular-nums">
                    {t.tokenUsage.toLocaleString()}
                  </td>
                  <td className="py-3 px-4">
                    <select
                      value={t.subscriptionPlan}
                      disabled={updatingId === t.id}
                      onChange={(e) =>
                        updateTenant(t.id, { subscriptionPlan: e.target.value })
                      }
                      aria-label={`Subscription plan for ${t.businessName}`}
                      className="rounded border border-slate-200 bg-white px-2 py-1 text-xs capitalize"
                    >
                      <option value="starter">Starter</option>
                      <option value="growth">Growth</option>
                      <option value="enterprise">Enterprise</option>
                    </select>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button
                      type="button"
                      disabled={updatingId === t.id}
                      onClick={() =>
                        updateTenant(t.id, {
                          status: t.status === 'suspended' ? 'active' : 'suspended',
                        })
                      }
                      className={`px-3 py-1 text-xs font-medium rounded-md border cursor-pointer ${
                        t.status === 'suspended'
                          ? 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
                          : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {t.status === 'suspended' ? 'Suspended (Reactivate)' : 'Active (Suspend)'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Audit Logs */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200">
          <h3 className="font-display text-sm font-semibold text-slate-900">
            Recent Platform Audit Logs
          </h3>
        </div>
        <div className="divide-y divide-slate-100">
          {data.auditLogs.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500">
              No audit events recorded yet.
            </div>
          ) : (
            data.auditLogs.map((log) => (
              <div
                key={log.id}
                className="px-5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs"
              >
                <div className="min-w-0">
                  <span className="font-mono font-medium text-slate-900">
                    {log.action}
                  </span>
                  <span className="mx-2 text-slate-300">·</span>
                  <span className="text-slate-600">{log.details}</span>
                </div>
                <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                  {new Date(log.createdAt).toLocaleString()}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
