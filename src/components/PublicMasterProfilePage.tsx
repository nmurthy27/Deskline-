import React, { useEffect, useState } from 'react';
import {
  Clock,
  ExternalLink,
  Globe,
  Loader2,
  MapPin,
  MessageCircle,
  Phone,
  ShieldCheck,
  Star,
} from 'lucide-react';
import { publicFetch } from '../lib/api';
import {
  formatCurrency,
  formatTimeDisplay,
  type LiveGooglePlaceDetails,
  type MasterProfileSnapshot,
  type WorkingDaysMap,
} from '../types';
import { GooglePlaceMapPreview } from './GooglePlaceMapPreview';
import { LiveAgentChat } from './LiveAgentChat';

interface PublicProfileResponse {
  slug: string;
  currency: string;
  timezone: string;
  widgetBrandColor: string;
  agentName: string;
  googlePlaceId: string;
  masterProfile: MasterProfileSnapshot;
  livePlace: LiveGooglePlaceDetails | null;
  jsonLd: Record<string, unknown>;
  lastUpdatedAt: string;
  quotaExceeded?: boolean;
}

const DAYS: Array<{ key: keyof WorkingDaysMap; label: string }> = [
  { key: 'mon', label: 'Monday' },
  { key: 'tue', label: 'Tuesday' },
  { key: 'wed', label: 'Wednesday' },
  { key: 'thu', label: 'Thursday' },
  { key: 'fri', label: 'Friday' },
  { key: 'sat', label: 'Saturday' },
  { key: 'sun', label: 'Sunday' },
];

export function PublicMasterProfilePage({ slug }: { slug: string }) {
  const [data, setData] = useState<PublicProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    publicFetch<PublicProfileResponse>(`/api/public/profile/${encodeURIComponent(slug)}`)
      .then((res) => {
        if (!cancelled) {
          setData(res);
          setError(null);
          if (res.quotaExceeded) {
            window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
          }
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : 'Unable to load business profile.'
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  // Inject live Schema.org LocalBusiness JSON-LD into document <head>
  useEffect(() => {
    if (!data?.jsonLd) return;
    const scriptId = 'deskline-localbusiness-jsonld';
    let script = document.getElementById(scriptId) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement('script');
      script.id = scriptId;
      script.type = 'application/ld+json';
      document.head.appendChild(script);
    }
    script.textContent = JSON.stringify(data.jsonLd);
    document.title = `${data.masterProfile.businessName} — Verified Business Profile & Online Booking`;

    return () => {
      script?.remove();
    };
  }, [data]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <Loader2 className="w-4 h-4 animate-spin text-[#0F766E]" />
          <span>Loading verified business profile...</span>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-6">
        <div className="bg-white border border-slate-200 rounded-xl p-8 max-w-md text-center space-y-2">
          <h1 className="font-display text-lg font-bold text-slate-900">
            Business Profile Unavailable
          </h1>
          <p className="text-sm text-slate-600">
            {error || 'This public profile is not currently available.'}
          </p>
        </div>
      </div>
    );
  }

  const { masterProfile, livePlace } = data;
  const waDigits = (masterProfile.whatsappPhone || masterProfile.phone).replace(/\D/g, '');
  const whatsappUrl = waDigits ? `https://wa.me/${waDigits}` : '';

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900">
      {/* Top Verified Bar */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-6 py-5 flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs text-[#0F766E] font-semibold">
              <ShieldCheck className="w-4 h-4" />
              <span>Verified Master Business Profile</span>
              {livePlace?.rating && (
                <span className="inline-flex items-center gap-1 text-slate-700 font-mono ml-2 tabular-nums">
                  <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                  {livePlace.rating.toFixed(1)} ({livePlace.userRatingCount ?? 0} Google
                  reviews)
                </span>
              )}
            </div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
              {masterProfile.businessName}
            </h1>
            <div className="text-sm text-slate-600">
              {masterProfile.primaryCategory}
              {masterProfile.address ? ` · ${masterProfile.address}` : ''}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {masterProfile.phone && (
              <a
                href={`tel:${masterProfile.phone}`}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg"
              >
                <Phone className="w-3.5 h-3.5 text-[#0F766E]" />
                {masterProfile.phone}
              </a>
            )}
            {whatsappUrl && (
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#0F766E] hover:bg-[#0D625B] rounded-lg"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                WhatsApp Direct
              </a>
            )}
            {(livePlace?.directionsUri || livePlace?.googleMapsUri) && (
              <a
                href={livePlace.directionsUri || livePlace.googleMapsUri}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg"
              >
                <MapPin className="w-3.5 h-3.5 text-[#0F766E]" />
                Directions
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Split: Master Details & Map on Left, 24/7 AI Booking Agent on Right */}
      <main className="max-w-6xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-7 space-y-6">
          {/* About & Contact */}
          <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h2 className="font-display text-base font-semibold text-slate-900">
              About {masterProfile.businessName}
            </h2>
            {masterProfile.description && (
              <p className="text-sm text-slate-600 leading-relaxed">
                {masterProfile.description}
              </p>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 text-xs text-slate-600">
              {masterProfile.address && (
                <div className="flex items-start gap-2">
                  <MapPin className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                  <span>{masterProfile.address}</span>
                </div>
              )}
              {masterProfile.websiteUrl && (
                <div className="flex items-start gap-2">
                  <Globe className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                  <a
                    href={masterProfile.websiteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#0F766E] hover:underline truncate"
                  >
                    {masterProfile.websiteUrl}
                  </a>
                </div>
              )}
            </div>
          </section>

          {/* Interactive Google Map */}
          {livePlace?.location && (
            <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-sm font-semibold text-slate-900">
                  Location on Google Maps
                </h2>
                {livePlace.googleMapsUri && (
                  <a
                    href={livePlace.googleMapsUri}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[#0F766E] hover:underline"
                  >
                    Open Google Maps
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
              <GooglePlaceMapPreview
                location={livePlace.location}
                businessName={masterProfile.businessName}
                address={masterProfile.address}
                googleMapsUri={livePlace.googleMapsUri}
                directionsUri={livePlace.directionsUri}
                heightClass="h-[280px]"
              />
            </section>
          )}

          {/* Services & Pricing */}
          {masterProfile.servicesSummary.length > 0 && (
            <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200">
                <h2 className="font-display text-base font-semibold text-slate-900">
                  Services & Transparent Pricing
                </h2>
              </div>
              <div className="divide-y divide-slate-100">
                {masterProfile.servicesSummary.map((svc, idx) => (
                  <div
                    key={`${svc.name}-${idx}`}
                    className="px-6 py-3.5 flex items-start justify-between gap-4"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-900">
                        {svc.name}
                      </div>
                      {svc.description && (
                        <p className="text-xs text-slate-500 mt-0.5">{svc.description}</p>
                      )}
                      <div className="text-[11px] text-slate-400 mt-1 font-mono tabular-nums">
                        {svc.durationMinutes} min · {svc.category}
                      </div>
                    </div>
                    <div className="font-mono text-sm font-semibold text-slate-900 shrink-0 tabular-nums">
                      {formatCurrency(svc.price, svc.currency)}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Packages & Offers */}
          {masterProfile.packagesSummary.length > 0 && (
            <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200">
                <h2 className="font-display text-base font-semibold text-slate-900">
                  Packages & Promotional Offers
                </h2>
              </div>
              <div className="divide-y divide-slate-100">
                {masterProfile.packagesSummary.map((pkg, idx) => (
                  <div
                    key={`${pkg.name}-${idx}`}
                    className="px-6 py-3.5 flex items-start justify-between gap-4"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-900">
                        {pkg.name}
                      </div>
                      {pkg.description && (
                        <p className="text-xs text-slate-500 mt-0.5">{pkg.description}</p>
                      )}
                      <div className="text-[11px] text-slate-400 mt-1 font-mono tabular-nums">
                        {pkg.sessionCount} sessions · Valid {pkg.validityDays} days
                      </div>
                    </div>
                    <div className="font-mono text-sm font-semibold text-[#0F766E] shrink-0 tabular-nums">
                      {formatCurrency(pkg.price, pkg.currency)}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Operating Hours */}
          <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#0F766E]" />
              <h2 className="font-display text-base font-semibold text-slate-900">
                Operating Hours
              </h2>
            </div>
            <div className="divide-y divide-slate-100 text-xs">
              {DAYS.map(({ key, label }) => {
                const cfg = masterProfile.workingDays?.[key];
                return (
                  <div key={key} className="py-2 flex items-center justify-between">
                    <span className="font-medium text-slate-700">{label}</span>
                    <span className="font-mono text-slate-600 tabular-nums">
                      {cfg?.enabled
                        ? `${formatTimeDisplay(cfg.open)} – ${formatTimeDisplay(cfg.close)}`
                        : 'Closed'}
                    </span>
                  </div>
                );
              })}
            </div>
            {masterProfile.bookingPolicy && (
              <p className="text-xs text-slate-500 pt-2 border-t border-slate-100">
                {masterProfile.bookingPolicy}
              </p>
            )}
          </section>
        </div>

        {/* Sticky 24/7 AI Booking Agent (Captures Google Profile Leads Directly) */}
        <aside className="lg:col-span-5 lg:sticky lg:top-6 space-y-3">
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="text-xs font-semibold text-[#0F766E]">
              Instant 24/7 Appointment Booking
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Ask about services, check real-time availability, or book your appointment
              immediately with {data.agentName}.
            </p>
          </div>
          <LiveAgentChat slug={slug} channel="google_profile" />
        </aside>
      </main>
    </div>
  );
}
