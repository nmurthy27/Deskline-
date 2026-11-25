import { auth } from './firebase';
import { handleDemoApiFetch } from './demoStore';

const DEMO_STORAGE_KEY = 'deskline_full_demo_mode';

let demoModeActive = false;

if (typeof window !== 'undefined') {
  const params = new URLSearchParams(window.location.search);
  if (params.get('demo') === '1') {
    demoModeActive = true;
    try {
      window.sessionStorage.setItem(DEMO_STORAGE_KEY, '1');
    } catch {
      // ignore storage restrictions in embedded iframes
    }
  } else {
    try {
      demoModeActive = window.sessionStorage.getItem(DEMO_STORAGE_KEY) === '1';
    } catch {
      demoModeActive = false;
    }
  }
}

export function isDemoMode(): boolean {
  return demoModeActive;
}

export function setDemoMode(enabled: boolean): void {
  demoModeActive = enabled;
  if (typeof window !== 'undefined') {
    try {
      if (enabled) {
        window.sessionStorage.setItem(DEMO_STORAGE_KEY, '1');
      } else {
        window.sessionStorage.removeItem(DEMO_STORAGE_KEY);
      }
    } catch {
      // ignore storage restrictions
    }
  }
}

export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  if (demoModeActive) {
    return handleDemoApiFetch<T>(path, options);
  }

  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }

  const currentUser = auth.currentUser;
  if (currentUser) {
    const token = await currentUser.getIdToken();
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(path, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      (data as { error?: string }).error || `Request failed (${response.status})`
    );
  }
  return data as T;
}

export async function publicFetch<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  if (demoModeActive) {
    return handleDemoApiFetch<T>(path, options);
  }

  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }
  const response = await fetch(path, {
    ...options,
    headers,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      (data as { error?: string }).error || `Request failed (${response.status})`
    );
  }
  return data as T;
}
