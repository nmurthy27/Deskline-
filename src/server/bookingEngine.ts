import crypto from 'node:crypto';
import { and, eq, ne } from 'drizzle-orm';
import { db } from '../db/index.ts';
import {
  appointments,
  auditLogs,
  availabilityRules,
  businesses,
  customers,
  services,
  type WorkingDaysMap,
} from '../db/schema.ts';

export const DEFAULT_WORKING_DAYS: WorkingDaysMap = {
  mon: { enabled: true, open: '09:00', close: '18:00' },
  tue: { enabled: true, open: '09:00', close: '18:00' },
  wed: { enabled: true, open: '09:00', close: '18:00' },
  thu: { enabled: true, open: '09:00', close: '18:00' },
  fri: { enabled: true, open: '09:00', close: '18:00' },
  sat: { enabled: true, open: '10:00', close: '16:00' },
  sun: { enabled: false, open: '10:00', close: '14:00' },
};

const DAY_KEYS: (keyof WorkingDaysMap)[] = [
  'sun',
  'mon',
  'tue',
  'wed',
  'thu',
  'fri',
  'sat',
];

export function timeToMinutes(hhmm: string): number {
  const [hStr, mStr] = hhmm.split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return h * 60 + m;
}

export function minutesToTime(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function formatTime12h(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${suffix}`;
}

export function parseDateParts(dateStr: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export function generateBookingRef(): string {
  const num = crypto.randomInt(10000, 99999);
  return `AP${num}`;
}

export interface AvailableSlot {
  startTime: string;
  endTime: string;
  label: string;
}

export interface AvailabilityResult {
  date: string;
  isOpen: boolean;
  reason?: string;
  serviceName: string;
  durationMinutes: number;
  slots: AvailableSlot[];
}

export async function getAvailableSlots(
  businessId: number,
  dateStr: string,
  serviceIdOrName?: number | string
): Promise<AvailabilityResult> {
  try {
    const parsedDate = parseDateParts(dateStr);
    if (!parsedDate) {
      return {
        date: dateStr,
        isOpen: false,
        reason: 'Please provide a valid date in YYYY-MM-DD format.',
        serviceName: '',
        durationMinutes: 30,
        slots: [],
      };
    }

    const [rulesRow] = await db
      .select()
      .from(availabilityRules)
      .where(eq(availabilityRules.businessId, businessId))
      .limit(1);

    const activeServices = await db
      .select()
      .from(services)
      .where(and(eq(services.businessId, businessId), eq(services.isActive, true)));

    let selectedService = activeServices[0] || null;
    if (typeof serviceIdOrName === 'number') {
      selectedService =
        activeServices.find((s) => s.id === serviceIdOrName) || selectedService;
    } else if (typeof serviceIdOrName === 'string' && serviceIdOrName.trim()) {
      const needle = serviceIdOrName.trim().toLowerCase();
      selectedService =
        activeServices.find((s) => s.name.toLowerCase() === needle) ||
        activeServices.find((s) => s.name.toLowerCase().includes(needle)) ||
        selectedService;
    }

    const durationMinutes = selectedService?.durationMinutes ?? 30;
    const bufferMinutes = selectedService?.bufferMinutes ?? 0;
    const totalNeeded = durationMinutes + bufferMinutes;
    const serviceName = selectedService?.name ?? 'Standard Appointment';

    const workingDays = rulesRow?.workingDaysJson ?? DEFAULT_WORKING_DAYS;
    const dayKey = DAY_KEYS[parsedDate.getUTCDay()];
    const dayConfig = workingDays[dayKey];

    if (!dayConfig || !dayConfig.enabled) {
      return {
        date: dateStr,
        isOpen: false,
        reason: `Closed on ${dayKey.toUpperCase()}.`,
        serviceName,
        durationMinutes,
        slots: [],
      };
    }

    const holidays = rulesRow?.holidaysJson ?? [];
    if (holidays.includes(dateStr)) {
      return {
        date: dateStr,
        isOpen: false,
        reason: 'The business is closed for a holiday on this date.',
        serviceName,
        durationMinutes,
        slots: [],
      };
    }

    const existingBookings = await db
      .select()
      .from(appointments)
      .where(
        and(
          eq(appointments.businessId, businessId),
          eq(appointments.appointmentDate, dateStr),
          ne(appointments.bookingStatus, 'cancelled')
        )
      );

    const openMin = timeToMinutes(dayConfig.open);
    const closeMin = timeToMinutes(dayConfig.close);
    const interval = Math.max(15, rulesRow?.slotIntervalMinutes ?? 30);

    const breakStart = rulesRow?.breakStart ? timeToMinutes(rulesRow.breakStart) : -1;
    const breakEnd = rulesRow?.breakEnd ? timeToMinutes(rulesRow.breakEnd) : -1;

    const blockedSlots = (rulesRow?.blockedSlotsJson ?? []).filter(
      (b) => b.date === dateStr
    );

    const slots: AvailableSlot[] = [];
    for (let cursor = openMin; cursor + durationMinutes <= closeMin; cursor += interval) {
      const slotStart = cursor;
      const slotEnd = cursor + durationMinutes;
      const slotEndWithBuffer = cursor + totalNeeded;

      // Skip break overlap
      if (
        breakStart >= 0 &&
        breakEnd > breakStart &&
        rangesOverlap(slotStart, slotEnd, breakStart, breakEnd)
      ) {
        continue;
      }

      // Skip manual blocked slots
      const hitsBlock = blockedSlots.some((b) =>
        rangesOverlap(
          slotStart,
          slotEnd,
          timeToMinutes(b.startTime),
          timeToMinutes(b.endTime)
        )
      );
      if (hitsBlock) continue;

      // Skip overlapping existing bookings (double-booking prevention)
      const hitsBooking = existingBookings.some((appt) =>
        rangesOverlap(
          slotStart,
          slotEndWithBuffer,
          timeToMinutes(appt.startTime),
          timeToMinutes(appt.endTime)
        )
      );
      if (hitsBooking) continue;

      const startStr = minutesToTime(slotStart);
      const endStr = minutesToTime(slotEnd);
      slots.push({
        startTime: startStr,
        endTime: endStr,
        label: formatTime12h(startStr),
      });
    }

    return {
      date: dateStr,
      isOpen: true,
      serviceName,
      durationMinutes,
      slots,
    };
  } catch (error) {
    console.error('Database query failed in getAvailableSlots:', error);
    throw new Error('Failed to check appointment availability.', { cause: error });
  }
}

export interface CreateBookingInput {
  businessId: number;
  serviceId?: number;
  serviceName?: string;
  date: string;
  startTime: string;
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  channel: 'website' | 'whatsapp' | 'dashboard' | 'google_profile';
  notes?: string;
  actorUid?: string;
}

export async function createAppointmentAtomic(input: CreateBookingInput) {
  try {
    const normalizedStart = normalizeTimeInput(input.startTime);
    if (!normalizedStart) {
      return {
        ok: false as const,
        error: 'Invalid time format. Please use HH:MM (e.g., 11:30 or 14:00).',
      };
    }

    const activeServices = await db
      .select()
      .from(services)
      .where(and(eq(services.businessId, input.businessId), eq(services.isActive, true)));

    let matchedService = activeServices[0] || null;
    if (input.serviceId) {
      matchedService =
        activeServices.find((s) => s.id === input.serviceId) || matchedService;
    } else if (input.serviceName) {
      const needle = input.serviceName.trim().toLowerCase();
      matchedService =
        activeServices.find((s) => s.name.toLowerCase() === needle) ||
        activeServices.find((s) => s.name.toLowerCase().includes(needle)) ||
        matchedService;
    }

    if (!matchedService) {
      return {
        ok: false as const,
        error: 'No active service found to book.',
      };
    }

    // Verify slot availability right before creating inside a DB transaction
    const availability = await getAvailableSlots(
      input.businessId,
      input.date,
      matchedService.id
    );
    const matchingSlot = availability.slots.find(
      (s) => s.startTime === normalizedStart
    );

    if (!matchingSlot) {
      const alternatives = availability.slots.slice(0, 4).map((s) => s.label);
      return {
        ok: false as const,
        error:
          alternatives.length > 0
            ? `That slot (${formatTime12h(normalizedStart)}) is no longer available on ${input.date}. Available times include: ${alternatives.join(', ')}.`
            : `No available slots on ${input.date}. ${availability.reason || 'Please try another date.'}`,
      };
    }

    const result = await db.transaction(async (tx) => {
      // Re-verify overlap inside transaction to prevent concurrent double bookings
      const sameDayBookings = await tx
        .select()
        .from(appointments)
        .where(
          and(
            eq(appointments.businessId, input.businessId),
            eq(appointments.appointmentDate, input.date),
            ne(appointments.bookingStatus, 'cancelled')
          )
        );

      const newStartMin = timeToMinutes(matchingSlot.startTime);
      const newEndMin = timeToMinutes(matchingSlot.endTime);

      const conflict = sameDayBookings.some((appt) =>
        rangesOverlap(
          newStartMin,
          newEndMin,
          timeToMinutes(appt.startTime),
          timeToMinutes(appt.endTime)
        )
      );

      if (conflict) {
        throw new Error('SLOT_CONFLICT');
      }

      // Find or create customer for this tenant
      const cleanEmail = (input.customerEmail || '').trim().toLowerCase();
      const cleanPhone = (input.customerPhone || '').trim();
      const cleanName = input.customerName.trim() || 'Guest Customer';

      let existingCustomer = null;
      if (cleanEmail) {
        const found = await tx
          .select()
          .from(customers)
          .where(
            and(
              eq(customers.businessId, input.businessId),
              eq(customers.email, cleanEmail)
            )
          )
          .limit(1);
        existingCustomer = found[0] || null;
      }
      if (!existingCustomer && cleanPhone) {
        const found = await tx
          .select()
          .from(customers)
          .where(
            and(
              eq(customers.businessId, input.businessId),
              eq(customers.phone, cleanPhone)
            )
          )
          .limit(1);
        existingCustomer = found[0] || null;
      }

      let customerId: number;
      if (existingCustomer) {
        customerId = existingCustomer.id;
        await tx
          .update(customers)
          .set({
            name: cleanName || existingCustomer.name,
            email: cleanEmail || existingCustomer.email,
            phone: cleanPhone || existingCustomer.phone,
            preferredService: matchedService.name,
            updatedAt: new Date(),
          })
          .where(eq(customers.id, customerId));
      } else {
        const [insertedCustomer] = await tx
          .insert(customers)
          .values({
            businessId: input.businessId,
            name: cleanName,
            email: cleanEmail,
            phone: cleanPhone,
            preferredService: matchedService.name,
          })
          .returning();
        customerId = insertedCustomer.id;
      }

      const bookingRef = generateBookingRef();
      const [created] = await tx
        .insert(appointments)
        .values({
          bookingRef,
          businessId: input.businessId,
          customerId,
          serviceId: matchedService.id,
          serviceNameSnapshot: matchedService.name,
          priceSnapshot: matchedService.price,
          currencySnapshot: matchedService.currency,
          staffMember: matchedService.staffMember,
          appointmentDate: input.date,
          startTime: matchingSlot.startTime,
          endTime: matchingSlot.endTime,
          bookingStatus: 'confirmed',
          paymentStatus: matchedService.advancePaymentRequired ? 'pending' : 'unpaid',
          channel: input.channel,
          notes: input.notes?.trim() || '',
        })
        .returning();

      await tx.insert(auditLogs).values({
        businessId: input.businessId,
        actorUid: input.actorUid || 'ai_agent',
        action: 'appointment.created',
        entityType: 'appointment',
        entityId: bookingRef,
        details: `${cleanName} booked ${matchedService.name} on ${input.date} at ${matchingSlot.startTime} via ${input.channel}`,
      });

      return created;
    });

    return {
      ok: true as const,
      appointment: result,
      formattedTime: formatTime12h(result.startTime),
    };
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'SLOT_CONFLICT') {
      return {
        ok: false as const,
        error: 'That time slot was just booked by someone else. Please pick another time.',
      };
    }
    console.error('Database query failed in createAppointmentAtomic:', error);
    throw new Error('Unable to create appointment right now.', { cause: error });
  }
}

export async function rescheduleAppointmentAtomic(params: {
  businessId: number;
  bookingRef: string;
  customerVerification?: string;
  newDate: string;
  newStartTime: string;
  actorUid?: string;
  bypassCustomerCheck?: boolean;
}) {
  try {
    const normalizedStart = normalizeTimeInput(params.newStartTime);
    if (!normalizedStart) {
      return { ok: false as const, error: 'Invalid time format. Use HH:MM.' };
    }

    const [existing] = await db
      .select({
        appointment: appointments,
        customer: customers,
      })
      .from(appointments)
      .innerJoin(customers, eq(appointments.customerId, customers.id))
      .where(
        and(
          eq(appointments.businessId, params.businessId),
          eq(appointments.bookingRef, params.bookingRef.trim().toUpperCase())
        )
      )
      .limit(1);

    if (!existing) {
      return {
        ok: false as const,
        error: `No booking found with reference ${params.bookingRef}.`,
      };
    }

    if (existing.appointment.bookingStatus === 'cancelled') {
      return {
        ok: false as const,
        error: 'Cancelled appointments cannot be rescheduled. Please book a new appointment.',
      };
    }

    if (!params.bypassCustomerCheck) {
      const verification = (params.customerVerification || '').trim().toLowerCase();
      const matchesEmail =
        existing.customer.email &&
        verification.includes(existing.customer.email.toLowerCase());
      const matchesPhone =
        existing.customer.phone &&
        verification.replace(/\D/g, '').length >= 4 &&
        existing.customer.phone
          .replace(/\D/g, '')
          .includes(verification.replace(/\D/g, ''));
      const matchesName =
        existing.customer.name &&
        verification.length >= 2 &&
        existing.customer.name.toLowerCase().includes(verification);

      if (!matchesEmail && !matchesPhone && !matchesName) {
        return {
          ok: false as const,
          error:
            'Please verify the customer name, email, or phone number associated with this booking before rescheduling.',
        };
      }
    }

    const availability = await getAvailableSlots(
      params.businessId,
      params.newDate,
      existing.appointment.serviceId ?? existing.appointment.serviceNameSnapshot
    );
    const matchingSlot = availability.slots.find(
      (s) => s.startTime === normalizedStart
    );
    if (!matchingSlot) {
      const alternatives = availability.slots.slice(0, 4).map((s) => s.label);
      return {
        ok: false as const,
        error:
          alternatives.length > 0
            ? `${formatTime12h(normalizedStart)} is unavailable on ${params.newDate}. Try: ${alternatives.join(', ')}.`
            : `No available slots on ${params.newDate}.`,
      };
    }

    const [updated] = await db
      .update(appointments)
      .set({
        appointmentDate: params.newDate,
        startTime: matchingSlot.startTime,
        endTime: matchingSlot.endTime,
        bookingStatus: 'rescheduled',
        updatedAt: new Date(),
      })
      .where(eq(appointments.id, existing.appointment.id))
      .returning();

    await db.insert(auditLogs).values({
      businessId: params.businessId,
      actorUid: params.actorUid || 'ai_agent',
      action: 'appointment.rescheduled',
      entityType: 'appointment',
      entityId: updated.bookingRef,
      details: `Moved from ${existing.appointment.appointmentDate} ${existing.appointment.startTime} to ${params.newDate} ${matchingSlot.startTime}`,
    });

    return {
      ok: true as const,
      appointment: updated,
      formattedTime: formatTime12h(updated.startTime),
    };
  } catch (error) {
    console.error('Database query failed in rescheduleAppointmentAtomic:', error);
    throw new Error('Unable to reschedule appointment right now.', { cause: error });
  }
}

export async function cancelAppointmentAtomic(params: {
  businessId: number;
  bookingRef: string;
  customerVerification?: string;
  reason?: string;
  actorUid?: string;
  bypassCustomerCheck?: boolean;
}) {
  try {
    const [existing] = await db
      .select({
        appointment: appointments,
        customer: customers,
      })
      .from(appointments)
      .innerJoin(customers, eq(appointments.customerId, customers.id))
      .where(
        and(
          eq(appointments.businessId, params.businessId),
          eq(appointments.bookingRef, params.bookingRef.trim().toUpperCase())
        )
      )
      .limit(1);

    if (!existing) {
      return {
        ok: false as const,
        error: `No booking found with reference ${params.bookingRef}.`,
      };
    }

    if (!params.bypassCustomerCheck) {
      const verification = (params.customerVerification || '').trim().toLowerCase();
      const matchesEmail =
        existing.customer.email &&
        verification.includes(existing.customer.email.toLowerCase());
      const matchesPhone =
        existing.customer.phone &&
        verification.replace(/\D/g, '').length >= 4 &&
        existing.customer.phone
          .replace(/\D/g, '')
          .includes(verification.replace(/\D/g, ''));
      const matchesName =
        existing.customer.name &&
        verification.length >= 2 &&
        existing.customer.name.toLowerCase().includes(verification);

      if (!matchesEmail && !matchesPhone && !matchesName) {
        return {
          ok: false as const,
          error:
            'Please confirm the customer name, email, or phone number associated with this booking before cancelling.',
        };
      }
    }

    const [updated] = await db
      .update(appointments)
      .set({
        bookingStatus: 'cancelled',
        notes: params.reason
          ? `${existing.appointment.notes ? existing.appointment.notes + ' | ' : ''}Cancelled: ${params.reason}`
          : existing.appointment.notes,
        updatedAt: new Date(),
      })
      .where(eq(appointments.id, existing.appointment.id))
      .returning();

    await db.insert(auditLogs).values({
      businessId: params.businessId,
      actorUid: params.actorUid || 'ai_agent',
      action: 'appointment.cancelled',
      entityType: 'appointment',
      entityId: updated.bookingRef,
      details: params.reason || 'Cancelled by request',
    });

    return { ok: true as const, appointment: updated };
  } catch (error) {
    console.error('Database query failed in cancelAppointmentAtomic:', error);
    throw new Error('Unable to cancel appointment right now.', { cause: error });
  }
}

export function normalizeTimeInput(raw: string): string | null {
  const cleaned = raw.trim().toUpperCase();
  const match24 = cleaned.match(/^(\d{1,2}):(\d{2})$/);
  if (match24) {
    const h = Number(match24[1]);
    const m = Number(match24[2]);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
  }
  const match12 = cleaned.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/);
  if (match12) {
    let h = Number(match12[1]);
    const m = Number(match12[2] || '0');
    const period = match12[3];
    if (h >= 1 && h <= 12 && m >= 0 && m <= 59) {
      if (period === 'PM' && h !== 12) h += 12;
      if (period === 'AM' && h === 12) h = 0;
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
  }
  return null;
}

export async function getBusinessBySlug(slug: string) {
  try {
    const [biz] = await db
      .select()
      .from(businesses)
      .where(eq(businesses.slug, slug))
      .limit(1);
    return biz || null;
  } catch (error) {
    console.error('Database query failed in getBusinessBySlug:', error);
    throw new Error('Failed to load business profile.', { cause: error });
  }
}
