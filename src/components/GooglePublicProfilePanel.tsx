import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  Check,
  CheckCircle2,
  Code2,
  Copy,
  Download,
  ExternalLink,
  Globe,
  Link2,
  Loader2,
  MapPin,
  RefreshCw,
  Save,
  Search,
  Star,
  Unlink,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import {
  csvCell,
  formatCurrency,
  type BusinessWorkspaceData,
  type GoogleProfileWorkspaceResponse,
  type LiveGooglePlaceCandidate,
  type MasterProfileSnapshot,
  type WorkingDaysMap,
} from '../types';
import { GooglePlaceMapPreview } from './GooglePlaceMapPreview';

interface GooglePublicProfilePanelProps {
  workspace: BusinessWorkspaceData;
  onRefreshWorkspace: () => Promise<void>;
}

const ORDERED_DAYS: Array<{ key: keyof WorkingDaysMap; label: string; gbpColumn: string }> = [
  { key: 'sun', label: 'Sun', gbpColumn: 'Sunday hours' },
  { key: 'mon', label: 'Mon', gbpColumn: 'Monday hours' },
  { key: 'tue', label: 'Tue', gbpColumn: 'Tuesday hours' },
  { key: 'wed', label: 'Wed', gbpColumn: 'Wednesday hours' },
  { key: 'thu', label: 'Thu', gbpColumn: 'Thursday hours' },
  { key: 'fri', label: 'Fri', gbpColumn: 'Friday hours' },
  { key: 'sat', label: 'Sat', gbpColumn: 'Saturday hours' },
];

export function GooglePublicProfilePanel({
  workspace,
  onRefreshWorkspace,
}: GooglePublicProfilePanelProps) {
  const { business } = workspace;
  const [data, setData] = useState<GoogleProfileWorkspaceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Google Search state
  const [searchQuery, setSearchQuery] = useState(
    `${business.businessName}${business.address ? ` ${business.address}` : ''}`.trim()
  );
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<LiveGooglePlaceCandidate[]>([]);
  const [searchPerformed, setSearchPerformed] = useState(false);
  const [alsoUpdateDesklineCore, setAlsoUpdateDesklineCore] = useState(true);
  const [linkingPlaceId, setLinkingPlaceId] = useState<string | null>(null);

  // Sync / Save states
  const [copyingDeskline, setCopyingDeskline] = useState(false);
  const [savingMaster, setSavingMaster] = useState(false);
  const [syncBackToDeskline, setSyncBackToDeskline] = useState(true);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showSchemaPreview, setShowSchemaPreview] = useState(false);

  // Master Profile editable form state
  const [masterForm, setMasterForm] = useState<MasterProfileSnapshot | null>(null);
  const [storeCode, setStoreCode] = useState('');
  const [autoSyncFromDeskline, setAutoSyncFromDeskline] = useState(true);
  const [publicProfileEnabled, setPublicProfileEnabled] = useState(true);

  const hydrateFromResponse = useCallback((res: GoogleProfileWorkspaceResponse) => {
    setData(res);
    setMasterForm(res.profile.masterProfileJson);
    setStoreCode(res.profile.storeCode || '');
    setAutoSyncFromDeskline(res.profile.autoSyncFromDeskline);
    setPublicProfileEnabled(res.profile.publicProfileEnabled);
    if (res.quotaExceeded) {
      window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
    }
  }, []);

  const loadGoogleProfile = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<GoogleProfileWorkspaceResponse>(
        `/api/businesses/${business.id}/google-profile`
      );
      hydrateFromResponse(res);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : 'Unable to load Google Public Profile.'
      );
    } finally {
      setLoading(false);
    }
  }, [business.id, hydrateFromResponse]);

  useEffect(() => {
    setSearchQuery(
      `${business.businessName}${business.address ? ` ${business.address}` : ''}`.trim()
    );
    setSearchResults([]);
    setSearchPerformed(false);
    loadGoogleProfile();
  }, [business.id, business.businessName, business.address, loadGoogleProfile]);

  const showNotice = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 5000);
  };

  const handleCopyText = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      setError('Unable to copy to clipboard.');
    }
  };

  const handleSearchGoogle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearching(true);
    setError(null);
    setSearchPerformed(true);
    try {
      const res = await apiFetch<{
        places: LiveGooglePlaceCandidate[];
        quotaExceeded?: boolean;
      }>(`/api/businesses/${business.id}/google-profile/search`, {
        method: 'POST',
        body: JSON.stringify({ query: searchQuery.trim() }),
      });
      setSearchResults(res.places || []);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Failed to search Google Public Profiles.';
      if (msg.toLowerCase().includes('quota')) {
        window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
      }
      setError(msg);
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleCopyAllDesklineToMaster = async () => {
    setCopyingDeskline(true);
    setError(null);
    try {
      const res = await apiFetch<GoogleProfileWorkspaceResponse>(
        `/api/businesses/${business.id}/google-profile/copy-deskline`,
        { method: 'POST' }
      );
      hydrateFromResponse({
        ...res,
        googleLeadCount: data?.googleLeadCount ?? 0,
        mapsConfigured: data?.mapsConfigured ?? true,
      });
      showNotice(
        'Copied all Deskline business details, operating hours, services, packages, and 24/7 booking link into your Master Profile.'
      );
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to copy Deskline details into Master Profile.'
      );
    } finally {
      setCopyingDeskline(false);
    }
  };

  const handleLinkPlace = async (placeId: string, copyFieldsIntoMaster: boolean) => {
    setLinkingPlaceId(placeId);
    setError(null);
    try {
      const res = await apiFetch<GoogleProfileWorkspaceResponse>(
        `/api/businesses/${business.id}/google-profile/link-and-copy`,
        {
          method: 'POST',
          body: JSON.stringify({
            placeId,
            copyFieldsIntoMaster,
            alsoUpdateDesklineCore: copyFieldsIntoMaster && alsoUpdateDesklineCore,
          }),
        }
      );
      hydrateFromResponse({
        ...res,
        googleLeadCount: data?.googleLeadCount ?? 0,
        mapsConfigured: data?.mapsConfigured ?? true,
      });
      setSearchResults([]);
      setSearchPerformed(false);
      if (copyFieldsIntoMaster && alsoUpdateDesklineCore) {
        await onRefreshWorkspace();
      }
      showNotice(
        copyFieldsIntoMaster
          ? 'Linked Google Public Profile and copied verified listing details into your Master Profile.'
          : 'Linked Google Public Profile for live accuracy monitoring.'
      );
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Failed to link Google Public Profile.';
      if (msg.toLowerCase().includes('quota')) {
        window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
      }
      setError(msg);
    } finally {
      setLinkingPlaceId(null);
    }
  };

  const handleUnlinkPlace = async () => {
    setError(null);
    try {
      const res = await apiFetch<{
        profile: GoogleProfileWorkspaceResponse['profile'];
        livePlace: null;
        audit: GoogleProfileWorkspaceResponse['audit'];
      }>(`/api/businesses/${business.id}/google-profile/link`, {
        method: 'DELETE',
      });
      if (data) {
        hydrateFromResponse({
          ...data,
          profile: res.profile,
          livePlace: null,
          audit: res.audit,
        });
      }
      showNotice('Unlinked Google Place ID. Your Master Profile remains saved.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to unlink Google listing.');
    }
  };

  const handleSaveMasterProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!masterForm) return;
    setSavingMaster(true);
    setError(null);
    try {
      const res = await apiFetch<GoogleProfileWorkspaceResponse>(
        `/api/businesses/${business.id}/google-profile/master`,
        {
          method: 'PUT',
          body: JSON.stringify({
            masterProfile: masterForm,
            storeCode,
            autoSyncFromDeskline,
            publicProfileEnabled,
            syncBackToDeskline,
          }),
        }
      );
      hydrateFromResponse({
        ...res,
        googleLeadCount: data?.googleLeadCount ?? 0,
        mapsConfigured: data?.mapsConfigured ?? true,
      });
      if (syncBackToDeskline) {
        await onRefreshWorkspace();
      }
      showNotice(
        syncBackToDeskline
          ? 'Master Profile saved and synced across Deskline core settings.'
          : 'Master Profile saved.'
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save Master Profile.');
    } finally {
      setSavingMaster(false);
    }
  };

  const handleExportGbpBulkCsv = () => {
    if (!masterForm || !data) return;
    const headers = [
      'Store code',
      'Business name',
      'Address line 1',
      'Country / Region',
      'Primary phone',
      'Additional phone',
      'Website',
      'Primary category',
      ...ORDERED_DAYS.map((d) => d.gbpColumn),
      'From the business (Description)',
      'Appointment links',
      'Google Place ID',
    ];

    const hoursCells = ORDERED_DAYS.map(({ key }) => {
      const cfg = masterForm.workingDays?.[key];
      if (!cfg || !cfg.enabled) return 'x';
      return `${cfg.open}-${cfg.close}`;
    });

    const row = [
      storeCode || `DL-${business.id}`,
      masterForm.businessName,
      masterForm.address,
      masterForm.serviceArea || business.country,
      masterForm.phone || masterForm.whatsappPhone,
      masterForm.whatsappPhone !== masterForm.phone ? masterForm.whatsappPhone : '',
      masterForm.websiteUrl || data.publicProfileUrl,
      masterForm.primaryCategory,
      ...hoursCells,
      masterForm.description,
      masterForm.appointmentBookingUrl,
      data.profile.googlePlaceId || '',
    ];

    const csv = [
      headers.map(csvCell).join(','),
      row.map(csvCell).join(','),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${business.slug}-google-business-profile-master.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
      </div>
    );
  }

  if (!data || !masterForm) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-600">
        {error || 'Unable to load Google Public Profile workspace.'}
      </div>
    );
  }

  const { profile, livePlace, audit, jsonLd, publicProfileUrl, googleLeadCount } = data;
  const mismatchCount = audit.checks.filter((c) => c.status !== 'matched').length;

  return (
    <div className="space-y-6">
      {/* Alerts */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700 flex items-center justify-between gap-3">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="font-semibold underline cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}
      {successMsg && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Executive KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 bg-white border border-slate-200 rounded-xl divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
        <div className="p-5">
          <div className="text-xs text-slate-500">Google Accuracy Score</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span
              className={`font-mono text-2xl font-semibold tabular-nums ${
                audit.accuracyScore >= 85
                  ? 'text-emerald-700'
                  : audit.accuracyScore >= 60
                    ? 'text-amber-700'
                    : 'text-red-700'
              }`}
            >
              {audit.accuracyScore}%
            </span>
            <span className="text-xs text-slate-500 font-mono tabular-nums">
              {audit.matchedCount}/{audit.totalChecks} checks
            </span>
          </div>
          <div className="mt-0.5 text-xs text-slate-500">
            {mismatchCount === 0
              ? 'Master & Google fully aligned'
              : `${mismatchCount} item${mismatchCount === 1 ? '' : 's'} need attention`}
          </div>
        </div>

        <div className="p-5">
          <div className="text-xs text-slate-500">Google Public Listing</div>
          <div className="mt-1 font-display text-lg font-semibold text-slate-900 truncate">
            {profile.googlePlaceId ? 'Linked & Monitored' : 'Not Linked Yet'}
          </div>
          <div className="mt-0.5 text-xs text-slate-500 truncate">
            {livePlace?.rating ? (
              <span className="inline-flex items-center gap-1 font-mono tabular-nums">
                <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                {livePlace.rating.toFixed(1)} ({livePlace.userRatingCount ?? 0} reviews)
              </span>
            ) : profile.googlePlaceId ? (
              <span className="font-mono text-[11px]">{profile.googlePlaceId}</span>
            ) : (
              'Search your business below to link'
            )}
          </div>
        </div>

        <div className="p-5">
          <div className="text-xs text-slate-500">Master Profile Coverage</div>
          <div className="mt-1 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {masterForm.servicesSummary.length}{' '}
            <span className="text-xs font-sans font-normal text-slate-500">services</span>
          </div>
          <div className="mt-0.5 text-xs text-slate-500">
            {masterForm.packagesSummary.length} packages · 7-day hours copied
          </div>
        </div>

        <div className="p-5">
          <div className="text-xs text-slate-500">Google Profile Leads</div>
          <div className="mt-1 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {googleLeadCount}
          </div>
          <div className="mt-0.5 text-xs text-slate-500">
            24/7 AI booking link {masterForm.leadCaptureEnabled ? 'active' : 'paused'}
          </div>
        </div>
      </div>

      {/* Primary Action Strip */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-sm font-semibold text-slate-900">
            Master Business Profile Sync Hub
          </h2>
          <p className="text-xs text-slate-500">
            Copy all business details, hours, services, packages, and direct booking URL
            into one master source of truth so Google never drops a lead.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleCopyAllDesklineToMaster}
            disabled={copyingDeskline}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#0F766E] hover:bg-[#0D625B] rounded-lg cursor-pointer disabled:opacity-60"
          >
            {copyingDeskline ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <ArrowDownToLine className="w-3.5 h-3.5" />
            )}
            Copy All Business Details to Master Profile
          </button>
          <button
            type="button"
            onClick={loadGoogleProfile}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 border border-slate-200 hover:bg-slate-50 rounded-lg cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Run Live Check
          </button>
          <a
            href={publicProfileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 border border-slate-200 hover:bg-slate-50 rounded-lg"
          >
            Open Public Profile
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      {/* Section 1: Connect Live Google Public Profile + Interactive Map */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-display text-base font-semibold text-slate-900">
                1. Connect & Verify Live Google Public Profile
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Search Google Search & Maps via Places API (New) to link your live
                listing, detect mismatches, or import verified details into your Master
                Profile.
              </p>
            </div>
            {profile.googlePlaceId && (
              <button
                type="button"
                onClick={handleUnlinkPlace}
                className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-red-700 cursor-pointer shrink-0"
              >
                <Unlink className="w-3.5 h-3.5" />
                Unlink
              </button>
            )}
          </div>

          <form onSubmit={handleSearchGoogle} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search business name + city (e.g. Soma Wellness Indiranagar Bengaluru)"
                className="w-full rounded-lg border border-slate-200 pl-9 pr-3 py-2 text-xs text-slate-900 focus:border-teal-700 focus:outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={searching}
              className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg cursor-pointer shrink-0 disabled:opacity-60"
            >
              {searching ? 'Searching...' : 'Search Google'}
            </button>
          </form>

          <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
            <input
              type="checkbox"
              checked={alsoUpdateDesklineCore}
              onChange={(e) => setAlsoUpdateDesklineCore(e.target.checked)}
            />
            When copying from Google into Master Profile, also update Deskline core
            business address, phone, website, and operating hours
          </label>

          {/* Search Candidates */}
          {searchResults.length > 0 && (
            <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-80 overflow-y-auto">
              {searchResults.map((place) => (
                <div
                  key={place.id}
                  className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50"
                >
                  <div className="min-w-0 space-y-0.5">
                    <div className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                      <span className="truncate">{place.displayName}</span>
                      {place.rating && (
                        <span className="inline-flex items-center gap-0.5 text-xs font-mono text-slate-600 shrink-0 tabular-nums">
                          <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                          {place.rating.toFixed(1)}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-600 truncate">
                      {place.formattedAddress}
                    </div>
                    <div className="text-[11px] text-slate-500 flex flex-wrap gap-x-3 gap-y-0.5">
                      {place.primaryTypeDisplayName && (
                        <span>{place.primaryTypeDisplayName}</span>
                      )}
                      {(place.internationalPhoneNumber || place.nationalPhoneNumber) && (
                        <span className="font-mono">
                          {place.internationalPhoneNumber || place.nationalPhoneNumber}
                        </span>
                      )}
                      {place.websiteUri && (
                        <span className="truncate max-w-[200px]">{place.websiteUri}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      disabled={linkingPlaceId === place.id}
                      onClick={() => handleLinkPlace(place.id, true)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-white bg-[#0F766E] hover:bg-[#0D625B] rounded-md cursor-pointer"
                    >
                      {linkingPlaceId === place.id ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <ArrowDownToLine className="w-3 h-3" />
                      )}
                      Link & Copy
                    </button>
                    <button
                      type="button"
                      disabled={linkingPlaceId === place.id}
                      onClick={() => handleLinkPlace(place.id, false)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium text-slate-700 border border-slate-200 hover:bg-white rounded-md cursor-pointer"
                    >
                      <Link2 className="w-3 h-3" />
                      Link Only
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {searchPerformed && !searching && searchResults.length === 0 && !error && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
              No matching Google listings found for "{searchQuery}". Try searching with
              your city or street name.
            </div>
          )}

          {/* Currently Linked Live Listing Summary */}
          {livePlace && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-2.5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] font-medium text-slate-500">
                    Live Linked Google Listing
                  </div>
                  <div className="text-sm font-semibold text-slate-900 mt-0.5">
                    {livePlace.displayName}
                  </div>
                  <div className="text-xs text-slate-600 mt-0.5">
                    {livePlace.formattedAddress}
                  </div>
                </div>
                <span
                  className={`text-xs font-semibold shrink-0 ${
                    livePlace.businessStatus === 'OPERATIONAL'
                      ? 'text-emerald-700'
                      : 'text-red-700'
                  }`}
                >
                  {livePlace.businessStatus}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
                <span className="font-mono text-[11px] text-slate-500">
                  Place ID: {livePlace.id}
                </span>
                {livePlace.googleMapsUri && (
                  <a
                    href={livePlace.googleMapsUri}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-medium text-[#0F766E] hover:underline"
                  >
                    View on Google Maps
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
                <a
                  href="https://business.google.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-medium text-slate-700 hover:underline"
                >
                  Google Business Manager
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <div className="pt-1 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={linkingPlaceId === livePlace.id}
                  onClick={() => handleLinkPlace(livePlace.id, true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-800 bg-white border border-slate-200 hover:bg-slate-100 rounded-md cursor-pointer"
                >
                  <ArrowUpFromLine className="w-3.5 h-3.5" />
                  Pull Live Google Details into Master Profile
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right: Interactive Google Map Pin Verification */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between space-y-3">
          <div>
            <h3 className="font-display text-sm font-semibold text-slate-900">
              Verified Google Maps Location Pin
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Confirm your storefront pin so customers navigating from Google Maps arrive
              at the exact entrance.
            </p>
          </div>

          <GooglePlaceMapPreview
            location={livePlace?.location ?? null}
            businessName={livePlace?.displayName || masterForm.businessName}
            address={livePlace?.formattedAddress || masterForm.address}
            googleMapsUri={livePlace?.googleMapsUri}
            directionsUri={livePlace?.directionsUri}
            heightClass="h-[260px]"
          />

          <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
            <span>
              {livePlace?.location
                ? `Coordinates: ${livePlace.location.lat.toFixed(5)}, ${livePlace.location.lng.toFixed(5)}`
                : 'Live coordinates loaded via Places API (New)'}
            </span>
            {livePlace?.writeAReviewUri && (
              <a
                href={livePlace.writeAReviewUri}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-[#0F766E] hover:underline"
              >
                Google Review Link
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Section 2: Field-by-Field Accuracy Audit (Master vs. Live Google) */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-base font-semibold text-slate-900">
              2. Google vs. Master Profile Accuracy Audit
            </h3>
            <p className="text-xs text-slate-500">
              Every field compared in real time against Google Search & Maps so wrong
              hours, outdated phone numbers, or missing booking links never cost a lead.
            </p>
          </div>
          <span className="text-xs font-mono text-slate-500 tabular-nums">
            Last checked: {new Date(audit.auditedAt).toLocaleTimeString()}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-5 py-3">Profile Field</th>
                <th className="px-5 py-3">Deskline Master Profile</th>
                <th className="px-5 py-3">Live Google Public Profile</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {audit.checks.map((check) => (
                <tr key={check.fieldKey} className="hover:bg-slate-50/70">
                  <td className="px-5 py-3.5 align-top font-semibold text-slate-900 whitespace-nowrap">
                    {check.label}
                  </td>
                  <td className="px-5 py-3.5 align-top text-slate-700 max-w-xs break-words">
                    <div>{check.masterValue}</div>
                  </td>
                  <td className="px-5 py-3.5 align-top text-slate-600 max-w-xs break-words">
                    <div>{check.googleValue}</div>
                    {check.status !== 'matched' && (
                      <div className="text-[11px] text-amber-700 mt-1">
                        {check.recommendation}
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-3.5 align-top whitespace-nowrap">
                    {check.status === 'matched' ? (
                      <span className="inline-flex items-center gap-1 font-medium text-emerald-700">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        In Sync
                      </span>
                    ) : check.status === 'mismatch' ? (
                      <span className="inline-flex items-center gap-1 font-medium text-red-700">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        Mismatch
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 font-medium text-amber-700">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        {check.status === 'missing_on_google'
                          ? 'Missing on Google'
                          : 'Needs Setup'}
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 align-top text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() =>
                        handleCopyText(`field-${check.fieldKey}`, check.masterValue)
                      }
                      className="inline-flex items-center gap-1 text-xs font-medium text-[#0F766E] hover:underline cursor-pointer"
                    >
                      {copiedKey === `field-${check.fieldKey}` ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          Copy Master
                        </>
                      )}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Section 3: Master Business Profile Form + Never-Miss-a-Lead Toolkit */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <form
          onSubmit={handleSaveMasterProfile}
          className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 space-y-4"
        >
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="font-display text-base font-semibold text-slate-900">
                3. Master Business Profile (Single Source of Truth)
              </h3>
              <p className="text-xs text-slate-500">
                Canonical business information copied into your public Master Profile,
                Schema.org markup, and Google Business Profile export.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Canonical Business Name
              </label>
              <input
                type="text"
                required
                value={masterForm.businessName}
                onChange={(e) =>
                  setMasterForm({ ...masterForm, businessName: e.target.value })
                }
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-900"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Primary Google Category
              </label>
              <input
                type="text"
                value={masterForm.primaryCategory}
                onChange={(e) =>
                  setMasterForm({ ...masterForm, primaryCategory: e.target.value })
                }
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-900"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Primary Phone
              </label>
              <input
                type="text"
                value={masterForm.phone}
                onChange={(e) => setMasterForm({ ...masterForm, phone: e.target.value })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-mono text-slate-900"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                WhatsApp Booking Phone
              </label>
              <input
                type="text"
                value={masterForm.whatsappPhone}
                onChange={(e) =>
                  setMasterForm({ ...masterForm, whatsappPhone: e.target.value })
                }
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-mono text-slate-900"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Official Website URL
              </label>
              <input
                type="text"
                value={masterForm.websiteUrl}
                onChange={(e) =>
                  setMasterForm({ ...masterForm, websiteUrl: e.target.value })
                }
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-900"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Store / Location Code (for GBP Bulk Sync)
              </label>
              <input
                type="text"
                value={storeCode}
                onChange={(e) => setStoreCode(e.target.value)}
                placeholder="e.g. DL-01"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-mono text-slate-900"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Verified Street Address
            </label>
            <input
              type="text"
              value={masterForm.address}
              onChange={(e) => setMasterForm({ ...masterForm, address: e.target.value })}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-900"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Direct Google Appointment Booking URL (24/7 AI Lead Capture)
            </label>
            <input
              type="text"
              value={masterForm.appointmentBookingUrl}
              onChange={(e) =>
                setMasterForm({ ...masterForm, appointmentBookingUrl: e.target.value })
              }
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-mono text-slate-900"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Business Description (Shown on Google & Master Profile)
            </label>
            <textarea
              rows={3}
              value={masterForm.description}
              onChange={(e) =>
                setMasterForm({ ...masterForm, description: e.target.value })
              }
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-900"
            />
          </div>

          {/* Synced Services & Offers Snapshot Preview */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-800">
              <span>
                Copied Services & Packages ({masterForm.servicesSummary.length} services,{' '}
                {masterForm.packagesSummary.length} packages)
              </span>
              <button
                type="button"
                onClick={handleCopyAllDesklineToMaster}
                className="text-[11px] font-semibold text-[#0F766E] hover:underline cursor-pointer"
              >
                Re-copy from Deskline
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px] text-slate-600">
              {masterForm.servicesSummary.slice(0, 6).map((svc, idx) => (
                <div
                  key={`${svc.name}-${idx}`}
                  className="flex items-center justify-between bg-white border border-slate-200/80 rounded px-2.5 py-1.5"
                >
                  <span className="truncate font-medium text-slate-800">{svc.name}</span>
                  <span className="font-mono text-slate-600 shrink-0 ml-2 tabular-nums">
                    {formatCurrency(svc.price, svc.currency)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Sync Preferences */}
          <div className="space-y-2 pt-1">
            <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={autoSyncFromDeskline}
                onChange={(e) => setAutoSyncFromDeskline(e.target.checked)}
              />
              Auto-sync Master Profile whenever Deskline business details or hours are
              updated
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={publicProfileEnabled}
                onChange={(e) => setPublicProfileEnabled(e.target.checked)}
              />
              Publish live Google-indexed Master Public Profile page with 24/7 AI
              receptionist
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={syncBackToDeskline}
                onChange={(e) => setSyncBackToDeskline(e.target.checked)}
              />
              Sync Master Profile edits back to Deskline core business record on save
            </label>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              disabled={savingMaster}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#0F766E] hover:bg-[#0D625B] rounded-lg cursor-pointer disabled:opacity-60"
            >
              {savingMaster ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              Save Master Profile
            </button>
          </div>
        </form>

        {/* Right Column: Never-Miss-a-Lead Google Publishing Toolkit + Sync Log */}
        <div className="lg:col-span-5 space-y-5">
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <div>
              <h3 className="font-display text-base font-semibold text-slate-900">
                4. Keep Google Accurate & Capture Every Lead
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Deploy your verified Master Profile across Google Search, Google Business
                Profile, and your website so customers can always book 24/7.
              </p>
            </div>

            {/* Direct Google Booking Link */}
            <div className="space-y-1.5">
              <div className="text-xs font-medium text-slate-700">
                Google Business Profile → Booking Link (Tracked as Google Lead)
              </div>
              <div className="flex items-center gap-2 bg-slate-900 text-slate-100 rounded-lg px-3 py-2 font-mono text-[11px]">
                <span className="truncate flex-1">{masterForm.appointmentBookingUrl}</span>
                <button
                  type="button"
                  onClick={() =>
                    handleCopyText('booking-url', masterForm.appointmentBookingUrl)
                  }
                  className="inline-flex items-center gap-1 text-white shrink-0 cursor-pointer"
                >
                  {copiedKey === 'booking-url' ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  {copiedKey === 'booking-url' ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>

            {/* Public Master Profile Link */}
            <div className="space-y-1.5">
              <div className="text-xs font-medium text-slate-700">
                Canonical Master Public Profile URL (Google Website / Link-in-Bio)
              </div>
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-mono text-[11px] text-slate-800">
                <Globe className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="truncate flex-1">{publicProfileUrl}</span>
                <button
                  type="button"
                  onClick={() => handleCopyText('public-url', publicProfileUrl)}
                  className="text-[#0F766E] font-semibold shrink-0 cursor-pointer"
                >
                  {copiedKey === 'public-url' ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>

            {/* Export & Structured Data Buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
              <button
                type="button"
                onClick={handleExportGbpBulkCsv}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-semibold text-slate-800 border border-slate-200 hover:bg-slate-50 rounded-lg cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-[#0F766E]" />
                Export GBP Bulk CSV
              </button>
              <button
                type="button"
                onClick={() =>
                  handleCopyText(
                    'jsonld',
                    `<script type="application/ld+json">\n${JSON.stringify(jsonLd, null, 2)}\n</script>`
                  )
                }
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-semibold text-slate-800 border border-slate-200 hover:bg-slate-50 rounded-lg cursor-pointer"
              >
                <Code2 className="w-3.5 h-3.5 text-[#0F766E]" />
                {copiedKey === 'jsonld' ? 'JSON-LD Copied' : 'Copy Google JSON-LD'}
              </button>
            </div>

            <div>
              <button
                type="button"
                onClick={() => setShowSchemaPreview((prev) => !prev)}
                className="text-xs font-medium text-[#0F766E] hover:underline cursor-pointer"
              >
                {showSchemaPreview
                  ? 'Hide Schema.org LocalBusiness JSON-LD preview'
                  : 'Inspect Schema.org LocalBusiness JSON-LD (ReserveAction + Catalog)'}
              </button>
              {showSchemaPreview && (
                <pre className="mt-2 p-3 rounded-lg bg-slate-900 text-slate-100 text-[11px] font-mono overflow-x-auto max-h-60">
                  {JSON.stringify(jsonLd, null, 2)}
                </pre>
              )}
            </div>
          </div>

          {/* Sync Activity Log */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-sm font-semibold text-slate-900">
                Master Profile Sync Log
              </h3>
              <span className="text-[11px] text-slate-400 font-mono">
                {profile.syncHistoryJson?.length || 0} events
              </span>
            </div>
            <div className="divide-y divide-slate-100 max-h-56 overflow-y-auto">
              {(profile.syncHistoryJson || []).length === 0 ? (
                <p className="text-xs text-slate-500 py-3">No sync events yet.</p>
              ) : (
                profile.syncHistoryJson.slice(0, 8).map((ev) => (
                  <div key={ev.id} className="py-2.5 first:pt-0 last:pb-0">
                    <div className="flex items-center justify-between gap-2 text-[11px] text-slate-400">
                      <span className="font-mono">
                        {new Date(ev.timestamp).toLocaleString()}
                      </span>
                      {typeof ev.accuracyScore === 'number' && (
                        <span className="font-mono text-slate-600 tabular-nums">
                          Score {ev.accuracyScore}%
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-700 mt-0.5 leading-relaxed">
                      {ev.summary}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
