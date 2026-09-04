'use client';

// Shared by every "Cookie preferences" trigger (landing page footer,
// dashboard StatusBar) so they don't each reimplement this. `window.zaraz`
// existing doesn't mean the Consent API has finished loading - per
// Cloudflare's own docs, APIReady is the actual readiness signal, and a click
// that lands before it's true needs to wait for zarazConsentAPIReady rather
// than silently no-op.
export function openConsentModal() {
    if (typeof window === 'undefined') return;
    const open = () => { if (window.zaraz?.consent) window.zaraz.consent.modal = true; };
    if (window.zaraz?.consent?.APIReady) {
        open();
    } else {
        document.addEventListener('zarazConsentAPIReady', open, { once: true });
    }
}
