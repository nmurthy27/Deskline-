import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { DashboardWorkspace } from './components/DashboardWorkspace';
import { LandingShowcase } from './components/LandingShowcase';
import { LiveAgentChat } from './components/LiveAgentChat';
import { PublicMasterProfilePage } from './components/PublicMasterProfilePage';

function AppRouter() {
  const { firebaseUser, demoMode, loading, authError, signInWithGoogle, enterDemoMode } =
    useAuth();

  const params = new URLSearchParams(window.location.search);

  // Public Google-indexed Master Business Profile: /?profile=<businessSlug>
  const profileSlug = params.get('profile');
  if (profileSlug) {
    return <PublicMasterProfilePage slug={profileSlug} />;
  }

  // Standalone embeddable widget mode: /?widget=<businessSlug>[&source=google_profile]
  const widgetSlug = params.get('widget');
  if (widgetSlug) {
    const source = params.get('source');
    const widgetChannel = source === 'google_profile' ? 'google_profile' : 'website';
    return (
      <div className="min-h-screen bg-white p-2">
        <LiveAgentChat slug={widgetSlug} channel={widgetChannel} />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center">
        <div className="flex items-center gap-2.5 text-sm text-slate-600">
          <Loader2 className="w-4 h-4 animate-spin text-[#0F766E]" />
          <span>Loading Deskline...</span>
        </div>
      </div>
    );
  }

  if (firebaseUser || demoMode) {
    return <DashboardWorkspace />;
  }

  return (
    <LandingShowcase
      onSignIn={signInWithGoogle}
      onStartDemo={enterDemoMode}
      authError={authError}
    />
  );
}

export default function App() {
  const [mapsQuotaExceeded, setMapsQuotaExceeded] = useState(false);

  useEffect(() => {
    const onQuotaExceeded = () => setMapsQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', onQuotaExceeded);
    return () => {
      window.removeEventListener('gmp-quota-exceeded', onQuotaExceeded);
    };
  }, []);

  return (
    <AuthProvider>
      {mapsQuotaExceeded && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm">
          <span>
            Google Maps Platform quota reached. If you are the app owner, visit{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-amber-950 hover:text-amber-800"
            >
              maps developer site
            </a>{' '}
            for instructions to update your account.
          </span>
        </div>
      )}
      <AppRouter />
    </AuthProvider>
  );
}
