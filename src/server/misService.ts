import { eq } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { appointments, businesses } from '../db/schema.ts';

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

function toIsoDate(dt: Date): string {
  return dt.toISOString().slice(0, 10);
}

function getMondayOfWeek(dt: Date): Date {
  const copy = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate()));
  const day = copy.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setUTCDate(copy.getUTCDate() + diff);
  return copy;
}

function makeEmptyBucket(key: string, label: string, sublabel?: string): MisBucket {
  return {
    key,
    label,
    sublabel,
    total: 0,
    confirmed: 0,
    completed: 0,
    rescheduled: 0,
    cancelled: 0,
    whatsapp: 0,
    website: 0,
    dashboard: 0,
    estimatedValue: 0,
    lostValue: 0,
    averageValue: 0,
  };
}

function accumulate(
  bucket: MisBucket,
  row: {
    bookingStatus: string;
    channel: string;
    priceSnapshot: number;
  }
) {
  bucket.total += 1;
  const price = Math.max(0, Number(row.priceSnapshot) || 0);

  if (row.bookingStatus === 'cancelled') {
    bucket.cancelled += 1;
    bucket.lostValue += price;
  } else {
    if (row.bookingStatus === 'completed') bucket.completed += 1;
    else if (row.bookingStatus === 'rescheduled') bucket.rescheduled += 1;
    else bucket.confirmed += 1;
    bucket.estimatedValue += price;
  }

  if (row.channel === 'whatsapp') bucket.whatsapp += 1;
  else if (row.channel === 'website') bucket.website += 1;
  else bucket.dashboard += 1;
}

function finalizeBucket(bucket: MisBucket): MisBucket {
  const active = bucket.total - bucket.cancelled;
  bucket.averageValue = active > 0 ? Math.round(bucket.estimatedValue / active) : 0;
  return bucket;
}

export async function generateMisReport(businessId: number): Promise<MisReportResponse> {
  try {
    const [[biz], rows] = await Promise.all([
      db.select().from(businesses).where(eq(businesses.id, businessId)).limit(1),
      db
        .select()
        .from(appointments)
        .where(eq(appointments.businessId, businessId)),
    ]);

    const currency = biz?.currency || 'INR';
    const now = new Date();
    const todayUtc = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    );
    const todayIso = toIsoDate(todayUtc);
    const currentWeekMonday = getMondayOfWeek(todayUtc);
    const currentWeekStartIso = toIsoDate(currentWeekMonday);
    const currentWeekEnd = new Date(currentWeekMonday);
    currentWeekEnd.setUTCDate(currentWeekEnd.getUTCDate() + 6);
    const currentWeekEndIso = toIsoDate(currentWeekEnd);
    const currentMonthKey = todayIso.slice(0, 7);

    // 1. Daily buckets: last 11 days + today + next 2 days (14 days window capturing live upcoming & historical)
    const dailyMap = new Map<string, MisBucket>();
    for (let offset = -11; offset <= 2; offset++) {
      const dt = new Date(todayUtc);
      dt.setUTCDate(dt.getUTCDate() + offset);
      const iso = toIsoDate(dt);
      const label = dt.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
      });
      const sublabel = dt.toLocaleDateString('en-US', {
        weekday: 'short',
        timeZone: 'UTC',
      });
      dailyMap.set(iso, makeEmptyBucket(iso, label, sublabel));
    }

    // 2. Weekly buckets: last 7 weeks + current week (8 weeks)
    const weeklyMap = new Map<string, MisBucket>();
    for (let w = -7; w <= 0; w++) {
      const start = new Date(currentWeekMonday);
      start.setUTCDate(start.getUTCDate() + w * 7);
      const end = new Date(start);
      end.setUTCDate(end.getUTCDate() + 6);
      const startIso = toIsoDate(start);
      const endIso = toIsoDate(end);
      const label = `${start.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
      })} – ${end.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
      })}`;
      weeklyMap.set(startIso, makeEmptyBucket(startIso, label, `${startIso} to ${endIso}`));
    }

    // 3. Monthly buckets: last 5 months + current month (6 months)
    const monthlyMap = new Map<string, MisBucket>();
    for (let m = -5; m <= 0; m++) {
      const dt = new Date(
        Date.UTC(todayUtc.getUTCFullYear(), todayUtc.getUTCMonth() + m, 1)
      );
      const monthKey = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(
        2,
        '0'
      )}`;
      const label = dt.toLocaleDateString('en-US', {
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      });
      monthlyMap.set(monthKey, makeEmptyBucket(monthKey, label));
    }

    // Overall summary & breakdowns
    let totalAppointments = 0;
    let activeAppointments = 0;
    let completedAppointments = 0;
    let cancelledAppointments = 0;
    let estimatedBusinessValue = 0;
    let cancelledValue = 0;
    let dailyCount = 0;
    let dailyValue = 0;
    let weeklyCount = 0;
    let weeklyValue = 0;
    let monthlyCount = 0;
    let monthlyValue = 0;

    const serviceMap = new Map<
      string,
      { total: number; active: number; cancelled: number; value: number }
    >();
    const channelMap = new Map<
      string,
      { total: number; active: number; value: number }
    >();

    for (const row of rows) {
      const dateStr = row.appointmentDate;
      const price = Math.max(0, Number(row.priceSnapshot) || 0);
      const isCancelled = row.bookingStatus === 'cancelled';

      totalAppointments += 1;
      if (isCancelled) {
        cancelledAppointments += 1;
        cancelledValue += price;
      } else {
        activeAppointments += 1;
        if (row.bookingStatus === 'completed') completedAppointments += 1;
        estimatedBusinessValue += price;
      }

      if (dateStr === todayIso) {
        dailyCount += 1;
        if (!isCancelled) dailyValue += price;
      }
      if (dateStr >= currentWeekStartIso && dateStr <= currentWeekEndIso) {
        weeklyCount += 1;
        if (!isCancelled) weeklyValue += price;
      }
      if (dateStr.slice(0, 7) === currentMonthKey) {
        monthlyCount += 1;
        if (!isCancelled) monthlyValue += price;
      }

      // Daily bucket
      const dBucket = dailyMap.get(dateStr);
      if (dBucket) accumulate(dBucket, row);

      // Weekly bucket
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        const [y, mo, da] = dateStr.split('-').map(Number);
        const rowUtc = new Date(Date.UTC(y, mo - 1, da));
        const mondayKey = toIsoDate(getMondayOfWeek(rowUtc));
        const wBucket = weeklyMap.get(mondayKey);
        if (wBucket) accumulate(wBucket, row);
      }

      // Monthly bucket
      const mBucket = monthlyMap.get(dateStr.slice(0, 7));
      if (mBucket) accumulate(mBucket, row);

      // Service breakdown
      const svcKey = row.serviceNameSnapshot || 'General Service';
      const svcAcc = serviceMap.get(svcKey) || {
        total: 0,
        active: 0,
        cancelled: 0,
        value: 0,
      };
      svcAcc.total += 1;
      if (isCancelled) {
        svcAcc.cancelled += 1;
      } else {
        svcAcc.active += 1;
        svcAcc.value += price;
      }
      serviceMap.set(svcKey, svcAcc);

      // Channel breakdown
      const chKey = row.channel || 'website';
      const chAcc = channelMap.get(chKey) || { total: 0, active: 0, value: 0 };
      chAcc.total += 1;
      if (!isCancelled) {
        chAcc.active += 1;
        chAcc.value += price;
      }
      channelMap.set(chKey, chAcc);
    }

    const byService: MisServiceBreakdown[] = Array.from(serviceMap.entries())
      .map(([serviceName, s]) => ({
        serviceName,
        totalBookings: s.total,
        activeBookings: s.active,
        cancelledBookings: s.cancelled,
        estimatedValue: s.value,
        sharePercent:
          estimatedBusinessValue > 0
            ? Math.round((s.value / estimatedBusinessValue) * 100)
            : 0,
      }))
      .sort((a, b) => b.estimatedValue - a.estimatedValue);

    const byChannel: MisChannelBreakdown[] = Array.from(channelMap.entries())
      .map(([channel, c]) => ({
        channel,
        totalBookings: c.total,
        activeBookings: c.active,
        estimatedValue: c.value,
        sharePercent:
          estimatedBusinessValue > 0
            ? Math.round((c.value / estimatedBusinessValue) * 100)
            : 0,
      }))
      .sort((a, b) => b.estimatedValue - a.estimatedValue);

    return {
      currency,
      generatedAt: new Date().toISOString(),
      summary: {
        totalAppointments,
        activeAppointments,
        completedAppointments,
        cancelledAppointments,
        estimatedBusinessValue,
        cancelledValue,
        averageBookingValue:
          activeAppointments > 0
            ? Math.round(estimatedBusinessValue / activeAppointments)
            : 0,
        realizationRate:
          totalAppointments > 0
            ? Math.round((activeAppointments / totalAppointments) * 100)
            : 0,
        dailyCount,
        dailyValue,
        weeklyCount,
        weeklyValue,
        monthlyCount,
        monthlyValue,
      },
      daily: Array.from(dailyMap.values()).map(finalizeBucket),
      weekly: Array.from(weeklyMap.values()).map(finalizeBucket),
      monthly: Array.from(monthlyMap.values()).map(finalizeBucket),
      byService,
      byChannel,
    };
  } catch (error) {
    console.error('Failed to generate MIS report:', error);
    throw new Error('Unable to generate appointment MIS analytics right now.', {
      cause: error,
    });
  }
}
