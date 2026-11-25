import React, { useMemo, useState } from 'react';
import { Calendar, CheckCircle2, Clock, Plus, X, XCircle } from 'lucide-react';
import { apiFetch } from '../lib/api';
import {
  formatCurrency,
  formatTimeDisplay,
  type AppointmentRecord,
  type BusinessWorkspaceData,
} from '../types';

interface AppointmentsPanelProps {
  workspace: BusinessWorkspaceData;
  appointments: AppointmentRecord[];
  onRefreshAll: () => Promise<void>;
}

function getIsoOffset(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function AppointmentsPanel({
  workspace,
  appointments,
  onRefreshAll,
}: AppointmentsPanelProps) {
  const biz = workspace.business;
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'tomorrow' | 'week'>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [serviceFilter, setServiceFilter] = useState<string>('all');
  const [showNewModal, setShowNewModal] = useState(false);
  const [rescheduleTarget, setRescheduleTarget] = useState<AppointmentRecord | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleTime, setRescheduleTime] = useState('10:00');
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [newBooking, setNewBooking] = useState({
    serviceId: workspace.services[0]?.id ? String(workspace.services[0].id) : '',
    appointmentDate: getIsoOffset(1),
    startTime: '10:00',
    customerName: '',
    customerEmail: '',
    customerPhone: '',
    notes: '',
  });
  const [creating, setCreating] = useState(false);

  const today = getIsoOffset(0);
  const tomorrow = getIsoOffset(1);
  const weekEnd = getIsoOffset(7);

  const filtered = useMemo(() => {
    return appointments.filter((a) => {
      if (dateFilter === 'today' && a.appointmentDate !== today) return false;
      if (dateFilter === 'tomorrow' && a.appointmentDate !== tomorrow) return false;
      if (
        dateFilter === 'week' &&
        (a.appointmentDate < today || a.appointmentDate > weekEnd)
      ) {
        return false;
      }
      if (statusFilter !== 'all' && a.bookingStatus !== statusFilter) return false;
      if (serviceFilter !== 'all' && a.serviceName !== serviceFilter) return false;
      return true;
    });
  }, [appointments, dateFilter, statusFilter, serviceFilter, today, tomorrow, weekEnd]);

  const calendarDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const iso = getIsoOffset(i);
      const dt = new Date(`${iso}T12:00:00Z`);
      return {
        iso,
        weekday: dt.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }),
        dayNum: dt.toLocaleDateString('en-US', { day: 'numeric', month: 'short', timeZone: 'UTC' }),
        items: filtered.filter((a) => a.appointmentDate === iso),
      };
    });
  }, [filtered]);

  const handleCreateManual = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      await apiFetch(`/api/businesses/${biz.id}/appointments`, {
        method: 'POST',
        body: JSON.stringify({
          serviceId: newBooking.serviceId ? Number(newBooking.serviceId) : undefined,
          appointmentDate: newBooking.appointmentDate,
          startTime: newBooking.startTime,
          customerName: newBooking.customerName,
          customerEmail: newBooking.customerEmail,
          customerPhone: newBooking.customerPhone,
          notes: newBooking.notes,
        }),
      });
      setShowNewModal(false);
      setNewBooking({
        ...newBooking,
        customerName: '',
        customerEmail: '',
        customerPhone: '',
        notes: '',
      });
      await onRefreshAll();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to book slot.');
    } finally {
      setCreating(false);
    }
  };

  const handleAction = async (
    apptId: number,
    body: Record<string, unknown>
  ) => {
    setBusyId(apptId);
    setError(null);
    try {
      await apiFetch(`/api/businesses/${biz.id}/appointments/${apptId}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      setRescheduleTarget(null);
      await onRefreshAll();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Action failed.');
    } finally {
      setBusyId(null);
    }
  };

  const statusColor = (status: string) => {
    if (status === 'confirmed') return 'text-emerald-700';
    if (status === 'rescheduled') return 'text-amber-700';
    if (status === 'cancelled') return 'text-red-600';
    return 'text-slate-600';
  };

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white border border-slate-200 rounded-xl p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {(['all', 'today', 'tomorrow', 'week'] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setDateFilter(key)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md capitalize whitespace-nowrap cursor-pointer ${
                  dateFilter === key
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {key === 'week' ? 'Next 7 Days' : key}
              </button>
            ))}
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter by status"
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700"
          >
            <option value="all">All Statuses</option>
            <option value="confirmed">Confirmed</option>
            <option value="rescheduled">Rescheduled</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>

          <select
            value={serviceFilter}
            onChange={(e) => setServiceFilter(e.target.value)}
            aria-label="Filter by service"
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700"
          >
            <option value="all">All Services</option>
            {workspace.services.map((s) => (
              <option key={s.id} value={s.name}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                viewMode === 'list' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              List
            </button>
            <button
              type="button"
              onClick={() => setViewMode('calendar')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                viewMode === 'calendar'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600'
              }`}
            >
              7-Day Calendar
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              setError(null);
              setShowNewModal(true);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#0F766E] hover:bg-[#0D625B] rounded-lg whitespace-nowrap cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            New Appointment
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {viewMode === 'list' ? (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
                <tr>
                  <th className="py-3 px-4 font-medium">Reference</th>
                  <th className="py-3 px-4 font-medium">Customer</th>
                  <th className="py-3 px-4 font-medium">Service & Staff</th>
                  <th className="py-3 px-4 font-medium">Date & Time</th>
                  <th className="py-3 px-4 font-medium text-right">Fee</th>
                  <th className="py-3 px-4 font-medium">Channel · Status</th>
                  <th className="py-3 px-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-sm text-slate-500">
                      No appointments match your current filter.
                    </td>
                  </tr>
                ) : (
                  filtered.map((appt) => (
                    <tr key={appt.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4 font-mono text-xs font-semibold text-slate-900 tabular-nums">
                        {appt.bookingRef}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-900">
                          {appt.customerName}
                        </div>
                        <div className="text-xs text-slate-500">
                          {appt.customerPhone || appt.customerEmail || 'No contact'}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-slate-900">{appt.serviceName}</div>
                        <div className="text-xs text-slate-500">{appt.staffMember}</div>
                      </td>
                      <td className="py-3 px-4 font-mono text-xs tabular-nums text-slate-700">
                        <div>{appt.appointmentDate}</div>
                        <div className="text-slate-500">
                          {formatTimeDisplay(appt.startTime)} –{' '}
                          {formatTimeDisplay(appt.endTime)}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs font-medium tabular-nums text-slate-900">
                        {formatCurrency(appt.price, appt.currency)}
                      </td>
                      <td className="py-3 px-4 text-xs">
                        <span className="capitalize text-slate-500">{appt.channel}</span>
                        <span className="mx-1.5 text-slate-300">·</span>
                        <span className={`font-medium capitalize ${statusColor(appt.bookingStatus)}`}>
                          {appt.bookingStatus}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        {appt.bookingStatus !== 'cancelled' && (
                          <div className="inline-flex items-center gap-2 text-xs">
                            <button
                              type="button"
                              disabled={busyId === appt.id}
                              onClick={() => {
                                setRescheduleTarget(appt);
                                setRescheduleDate(appt.appointmentDate);
                                setRescheduleTime(appt.startTime);
                              }}
                              className="text-slate-600 hover:text-slate-900 font-medium cursor-pointer"
                            >
                              Reschedule
                            </button>
                            {appt.bookingStatus !== 'completed' && (
                              <button
                                type="button"
                                disabled={busyId === appt.id}
                                onClick={() =>
                                  handleAction(appt.id, { bookingStatus: 'completed' })
                                }
                                title="Mark completed"
                                className="text-emerald-700 hover:text-emerald-800 cursor-pointer"
                              >
                                <CheckCircle2 className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={busyId === appt.id}
                              onClick={() =>
                                handleAction(appt.id, {
                                  action: 'cancel',
                                  reason: 'Cancelled from business dashboard',
                                })
                              }
                              title="Cancel appointment"
                              className="text-slate-400 hover:text-red-600 cursor-pointer"
                            >
                              <XCircle className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
          {calendarDays.map((day) => (
            <div
              key={day.iso}
              className="bg-white border border-slate-200 rounded-xl p-3 min-h-[260px] flex flex-col"
            >
              <div className="pb-2 mb-2 border-b border-slate-100">
                <div className="text-xs text-slate-500">{day.weekday}</div>
                <div className="font-display text-sm font-semibold text-slate-900 tabular-nums">
                  {day.dayNum}
                </div>
              </div>
              <div className="space-y-2 flex-1">
                {day.items.length === 0 ? (
                  <p className="text-[11px] text-slate-400 pt-2">Open schedule</p>
                ) : (
                  day.items.map((item) => (
                    <div
                      key={item.id}
                      className="p-2 rounded-lg border border-slate-200 bg-slate-50 text-xs"
                    >
                      <div className="font-mono text-[11px] font-semibold text-teal-800 tabular-nums">
                        {formatTimeDisplay(item.startTime)}
                      </div>
                      <div className="font-medium text-slate-900 truncate mt-0.5">
                        {item.customerName}
                      </div>
                      <div className="text-[11px] text-slate-500 truncate">
                        {item.serviceName}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Automated Reminders Status Footer */}
      <div className="bg-white border border-slate-200 rounded-xl px-5 py-3.5 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-600">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-slate-400" />
          <span>
            Automated Notifications: 24h Reminder ({biz.reminder24h ? 'Enabled' : 'Off'}) · 2h Reminder ({biz.reminder2h ? 'Enabled' : 'Off'})
          </span>
        </div>
        <span className="text-slate-400">
          Double-booking protection enforced atomically in PostgreSQL
        </span>
      </div>

      {/* New Appointment Modal */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/40 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-semibold text-slate-900">
                Book New Appointment
              </h3>
              <button
                type="button"
                onClick={() => setShowNewModal(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreateManual} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Service
                </label>
                <select
                  value={newBooking.serviceId}
                  onChange={(e) =>
                    setNewBooking({ ...newBooking, serviceId: e.target.value })
                  }
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white"
                >
                  {workspace.services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.durationMinutes} min ·{' '}
                      {formatCurrency(s.price, s.currency)})
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Date
                  </label>
                  <input
                    type="date"
                    required
                    value={newBooking.appointmentDate}
                    onChange={(e) =>
                      setNewBooking({ ...newBooking, appointmentDate: e.target.value })
                    }
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Start Time (24h)
                  </label>
                  <input
                    type="time"
                    required
                    value={newBooking.startTime}
                    onChange={(e) =>
                      setNewBooking({ ...newBooking, startTime: e.target.value })
                    }
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Customer Name
                </label>
                <input
                  type="text"
                  required
                  value={newBooking.customerName}
                  onChange={(e) =>
                    setNewBooking({ ...newBooking, customerName: e.target.value })
                  }
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Phone
                  </label>
                  <input
                    type="text"
                    value={newBooking.customerPhone}
                    onChange={(e) =>
                      setNewBooking({ ...newBooking, customerPhone: e.target.value })
                    }
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={newBooking.customerEmail}
                    onChange={(e) =>
                      setNewBooking({ ...newBooking, customerEmail: e.target.value })
                    }
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#0F766E] hover:bg-[#0D625B] rounded-lg cursor-pointer"
                >
                  {creating ? 'Checking slot...' : 'Confirm Booking'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reschedule Modal */}
      {rescheduleTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/40 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-sm w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-teal-700" />
                <h3 className="font-display text-base font-semibold text-slate-900">
                  Reschedule {rescheduleTarget.bookingRef}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setRescheduleTarget(null)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-600">
              {rescheduleTarget.customerName} · {rescheduleTarget.serviceName}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  New Date
                </label>
                <input
                  type="date"
                  value={rescheduleDate}
                  onChange={(e) => setRescheduleDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  New Time
                </label>
                <input
                  type="time"
                  value={rescheduleTime}
                  onChange={(e) => setRescheduleTime(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRescheduleTarget(null)}
                className="px-4 py-2 text-xs font-medium text-slate-600 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busyId === rescheduleTarget.id}
                onClick={() =>
                  handleAction(rescheduleTarget.id, {
                    action: 'reschedule',
                    appointmentDate: rescheduleDate,
                    startTime: rescheduleTime,
                  })
                }
                className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg cursor-pointer"
              >
                Save New Time
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
