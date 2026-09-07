'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { getConsent, setConsent, CONSENT_REOPEN_EVENT } from '@/lib/cookieConsent';

// First-party cookie/analytics prompt - see cookieConsent.js for why this
// replaced Cloudflare Zaraz's modal. Mounted once in the root layout so it's
// available on every route (marketing page and dashboard alike) - except the
// OBS overlay, which never shows it: PostHogProvider already runs
// unconditionally there (no real "visitor" to ask), so there's nothing this
// banner would ever need to gate on that route.
export default function CookieConsentBanner() {
    const pathname = usePathname();
    const [visible, setVisible] = useState(false);
    const onOverlay = !!pathname?.startsWith('/overlay');

    useEffect(() => {
        // One-time read of an external source (localStorage) on mount, kept
        // client-only so the server-rendered/first-paint markup never shows
        // the banner and then hydration-mismatches against a visitor who
        // already decided.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (getConsent() === null) setVisible(true);
    }, []);

    useEffect(() => {
        const onReopen = () => setVisible(true);
        document.addEventListener(CONSENT_REOPEN_EVENT, onReopen);
        return () => document.removeEventListener(CONSENT_REOPEN_EVENT, onReopen);
    }, []);

    if (onOverlay || !visible) return null;

    const choose = (value) => {
        setConsent(value);
        setVisible(false);
    };

    return (
        <div style={{
            position: 'fixed', left: 16, right: 16, bottom: 16, zIndex: 9999,
            maxWidth: 560, margin: '0 auto',
            display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 14,
            padding: '16px 18px', borderRadius: 12,
            background: 'var(--surface-raised)', border: '1px solid var(--border-strong)',
            boxShadow: '0 12px 32px -8px rgba(0,0,0,.6)',
        }}>
            <p style={{ flex: '1 1 260px', margin: 0, fontFamily: 'var(--font-sans)', fontSize: 13, lineHeight: 1.5, color: 'var(--text-body)' }}>
                This site uses analytics to understand how it&apos;s used. Agree to allow it, or decline and enjoy the site without it.
            </p>
            <div style={{ display: 'flex', gap: 8, flex: 'none' }}>
                <button type="button" onClick={() => choose('denied')} style={{
                    appearance: 'none', cursor: 'pointer', padding: '8px 14px', borderRadius: 8,
                    background: 'transparent', border: '1px solid var(--border-control)', color: 'var(--text-muted)',
                    fontFamily: 'var(--font-sans)', fontSize: 12.5, fontWeight: 600,
                }}>Decline</button>
                <button type="button" onClick={() => choose('granted')} style={{
                    appearance: 'none', cursor: 'pointer', padding: '8px 14px', borderRadius: 8,
                    background: 'var(--primary-500)', border: '1px solid transparent', color: 'var(--text-on-primary)',
                    fontFamily: 'var(--font-sans)', fontSize: 12.5, fontWeight: 700,
                }}>Accept</button>
            </div>
        </div>
    );
}
