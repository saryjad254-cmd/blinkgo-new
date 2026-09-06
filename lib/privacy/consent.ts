export const CONSENT_COOKIE_NAME = 'blinkgo-consent';
export const CONSENT_VERSION = '2026-08-11';
export const CONSENT_MAX_AGE_SECONDS = 60 * 60 * 24 * 180;

export type ConsentCategories = {
  strictly_necessary: true;
  preferences: boolean;
  analytics: boolean;
  marketing: boolean;
};

export type ConsentState = {
  id: string;
  version: string;
  categories: ConsentCategories;
  updatedAt: string;
};

export const REJECT_NON_ESSENTIAL: ConsentCategories = {
  strictly_necessary: true,
  preferences: false,
  analytics: false,
  marketing: false,
};

export const ACCEPT_ALL: ConsentCategories = {
  strictly_necessary: true,
  preferences: true,
  analytics: true,
  marketing: true,
};

export function readConsent(): ConsentState | null {
  if (typeof document === 'undefined') return null;
  const raw = document.cookie
    .split('; ')
    .find((entry) => entry.startsWith(`${CONSENT_COOKIE_NAME}=`))
    ?.slice(CONSENT_COOKIE_NAME.length + 1);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as ConsentState;
    if (parsed.version !== CONSENT_VERSION || parsed.categories?.strictly_necessary !== true) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeConsent(state: ConsentState) {
  if (typeof document === 'undefined') return;
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${CONSENT_COOKIE_NAME}=${encodeURIComponent(JSON.stringify(state))}; Path=/; Max-Age=${CONSENT_MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
  window.dispatchEvent(new CustomEvent('blinkgo:consent-changed', { detail: state }));
}

export function hasAnalyticsConsent() {
  return readConsent()?.categories.analytics === true;
}

