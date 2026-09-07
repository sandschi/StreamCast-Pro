'use client';

// First-party replacement for the old Cloudflare Zaraz consent modal (see
// #<zaraz-removal>) - Zaraz turned out to only ever be usable on the apex
// sandschi.xyz (a separate, unrelated project); this app (marketing page +
// dashboard, served under overlay.sandschi.xyz/betaoverlay.sandschi.xyz) has
// no legitimate connection to it. Analytics (PostHog) is the only thing ever
// gated on consent here, so this is deliberately a single accept/decline
// choice, not a multi-purpose preference center.
const STORAGE_KEY = 'sc-cookie-consent'; // 'granted' | 'denied'
export const CONSENT_UPDATED_EVENT = 'cookieConsentUpdated';
export const CONSENT_REOPEN_EVENT = 'cookieConsentReopen';

export function getConsent() {
    if (typeof window === 'undefined') return null;
    try { return window.localStorage.getItem(STORAGE_KEY); } catch { return null; }
}

export function setConsent(value) {
    if (typeof window === 'undefined') return;
    try { window.localStorage.setItem(STORAGE_KEY, value); } catch { /* storage unavailable */ }
    document.dispatchEvent(new CustomEvent(CONSENT_UPDATED_EVENT, { detail: value }));
}

// Same call sites that used to flip Zaraz's own `zaraz.consent.modal = true`
// (landing-page footer, dashboard StatusBar's cookie icon) - re-shows the
// banner so a visitor can change their mind after already deciding once.
export function openConsentModal() {
    if (typeof window === 'undefined') return;
    document.dispatchEvent(new CustomEvent(CONSENT_REOPEN_EVENT));
}
