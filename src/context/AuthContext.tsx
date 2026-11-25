import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth';
import { auth, googleAuthProvider } from '../lib/firebase';
import { apiFetch, isDemoMode, setDemoMode } from '../lib/api';
import { DEMO_USER_PROFILE } from '../lib/demoStore';
import type { UserProfile } from '../types';

interface AuthContextValue {
  firebaseUser: User | null;
  profile: UserProfile | null;
  demoMode: boolean;
  loading: boolean;
  authError: string | null;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  enterDemoMode: () => void;
  exitDemoMode: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(
    isDemoMode() ? DEMO_USER_PROFILE : null
  );
  const [demoMode, setDemoModeState] = useState<boolean>(isDemoMode());
  const [loading, setLoading] = useState(!isDemoMode());
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (!user) {
        if (isDemoMode()) {
          setDemoModeState(true);
          setProfile(DEMO_USER_PROFILE);
        } else {
          setProfile(null);
        }
        setLoading(false);
        return;
      }

      // Real signed-in session takes precedence over demo mode
      setDemoMode(false);
      setDemoModeState(false);

      try {
        const res = await apiFetch<{ user: UserProfile }>('/api/me');
        setProfile(res.user);
        setAuthError(null);
      } catch (err: unknown) {
        console.error('Failed to sync user profile:', err);
        setAuthError(
          err instanceof Error ? err.message : 'Unable to verify your session.'
        );
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const enterDemoMode = () => {
    setAuthError(null);
    setDemoMode(true);
    setDemoModeState(true);
    setProfile(DEMO_USER_PROFILE);
    setLoading(false);
  };

  const exitDemoMode = () => {
    setDemoMode(false);
    setDemoModeState(false);
    if (!firebaseUser) {
      setProfile(null);
    }
  };

  const signInWithGoogle = async () => {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleAuthProvider);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Google sign-in was cancelled or blocked.';
      setAuthError(msg);
    }
  };

  const signOut = async () => {
    if (demoMode && !firebaseUser) {
      exitDemoMode();
      return;
    }
    setDemoMode(false);
    setDemoModeState(false);
    await firebaseSignOut(auth);
    setProfile(null);
  };

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        profile,
        demoMode,
        loading,
        authError,
        signInWithGoogle,
        signOut,
        enterDemoMode,
        exitDemoMode,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
