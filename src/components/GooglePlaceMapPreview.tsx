import React, { useEffect, useState } from 'react';
import {
  APIProvider,
  AdvancedMarker,
  InfoWindow,
  Map as GoogleMap,
  Pin,
  useAdvancedMarkerRef,
  useMap,
} from '@vis.gl/react-google-maps';
import { ExternalLink, MapPin } from 'lucide-react';
import { publicFetch } from '../lib/api';

interface GooglePlaceMapPreviewProps {
  location: { lat: number; lng: number } | null;
  businessName: string;
  address: string;
  googleMapsUri?: string;
  directionsUri?: string;
  heightClass?: string;
}

function CameraRecenter({ center }: { center: { lat: number; lng: number } }) {
  const map = useMap();
  useEffect(() => {
    if (map) {
      map.panTo(center);
      map.setZoom(16);
    }
  }, [map, center.lat, center.lng]);
  return null;
}

function BusinessPinMarker({
  location,
  businessName,
  address,
  directionsUri,
}: {
  location: { lat: number; lng: number };
  businessName: string;
  address: string;
  directionsUri?: string;
}) {
  const [markerRef, marker] = useAdvancedMarkerRef();
  const [open, setOpen] = useState(true);

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={location}
        title={businessName}
        onClick={() => setOpen((prev) => !prev)}
      >
        <Pin background="#0F766E" borderColor="#115E59" glyphColor="#FFFFFF" />
      </AdvancedMarker>
      {open && marker && (
        <InfoWindow
          anchor={marker}
          maxWidth={260}
          onCloseClick={() => setOpen(false)}
        >
          <div className="p-0.5 space-y-1">
            <div className="text-xs font-semibold text-slate-900">{businessName}</div>
            {address && <div className="text-[11px] text-slate-600">{address}</div>}
            {directionsUri && (
              <a
                href={directionsUri}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#0F766E] hover:underline pt-0.5"
              >
                Open in Google Maps
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        </InfoWindow>
      )}
    </>
  );
}

export function GooglePlaceMapPreview({
  location,
  businessName,
  address,
  googleMapsUri,
  directionsUri,
  heightClass = 'h-[280px]',
}: GooglePlaceMapPreviewProps) {
  const envKey = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '').trim();
  const [apiKey, setApiKey] = useState<string>(envKey);
  const [loadingKey, setLoadingKey] = useState(!envKey);

  useEffect(() => {
    if (envKey) {
      setApiKey(envKey);
      setLoadingKey(false);
      return;
    }
    let cancelled = false;
    publicFetch<{ mapsConfigured: boolean; apiKey: string }>('/api/public/maps-config')
      .then((res) => {
        if (!cancelled && res.apiKey) {
          setApiKey(res.apiKey);
        }
      })
      .catch(() => {
        // Fallback cleanly to address card if key unavailable
      })
      .finally(() => {
        if (!cancelled) setLoadingKey(false);
      });
    return () => {
      cancelled = true;
    };
  }, [envKey]);

  if (!location) {
    return (
      <div
        className={`${heightClass} w-full rounded-xl border border-dashed border-slate-200 bg-slate-50 flex flex-col items-center justify-center p-6 text-center`}
      >
        <MapPin className="w-6 h-6 text-slate-400 mb-2" />
        <div className="text-xs font-medium text-slate-700">
          No Google Map pin linked yet
        </div>
        <p className="text-[11px] text-slate-500 mt-1 max-w-xs">
          Search and link your Google Public Profile to display your live verified Google
          Maps location pin and directions link.
        </p>
      </div>
    );
  }

  if (loadingKey || !apiKey) {
    return (
      <div
        className={`${heightClass} w-full rounded-xl border border-slate-200 bg-slate-50 relative overflow-hidden flex flex-col items-center justify-center p-6 text-center`}
      >
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-40 pointer-events-none"
          style={{
            backgroundImage:
              'linear-gradient(to right, #cbd5e1 1px, transparent 1px), linear-gradient(to bottom, #cbd5e1 1px, transparent 1px)',
            backgroundSize: '28px 28px',
          }}
        />
        <div className="relative z-10 flex flex-col items-center max-w-md">
          <div className="w-10 h-10 rounded-full bg-[#0F766E] text-white flex items-center justify-center shadow-md mb-2.5">
            <MapPin className="w-5 h-5" />
          </div>
          <div className="text-sm font-semibold text-slate-900">{businessName}</div>
          <div className="text-xs text-slate-600 mt-1">{address}</div>
          <div className="mt-2 font-mono text-[11px] text-slate-500 tabular-nums bg-white/90 border border-slate-200 rounded-md px-2.5 py-1">
            {location.lat.toFixed(4)}° N, {location.lng.toFixed(4)}° E · Sample Pin Preview
          </div>
          <div className="mt-2.5 flex flex-wrap items-center justify-center gap-3">
            {(directionsUri || googleMapsUri) && (
              <a
                href={directionsUri || googleMapsUri}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#0F766E] hover:underline"
              >
                Open Directions in Google Maps
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
          <p className="mt-2 text-[11px] text-slate-500">
            Interactive map tiles activate automatically when you add your Google Maps API key.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`${heightClass} w-full rounded-xl overflow-hidden border border-slate-200 bg-slate-100`}
    >
      <APIProvider apiKey={apiKey} libraries={['marker']} language="en">
        <GoogleMap
          mapId="DEMO_MAP_ID"
          defaultCenter={location}
          defaultZoom={16}
          gestureHandling="cooperative"
          streetViewControl={false}
          mapTypeControl={false}
          internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
          className="w-full h-full"
        >
          <CameraRecenter center={location} />
          <BusinessPinMarker
            location={location}
            businessName={businessName}
            address={address}
            directionsUri={directionsUri || googleMapsUri}
          />
        </GoogleMap>
      </APIProvider>
    </div>
  );
}
