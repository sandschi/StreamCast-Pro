'use client';

import { Cookie } from 'lucide-react';
import { MONO, Dot, CONN, scan, L } from './treatments';
import { NAV } from './nav';
import useServiceStatus from '@/hooks/useServiceStatus';
import { openConsentModal } from '@/lib/cookieConsent';

const STATUS_TONE = { Up: 'var(--primary-500)', Pending: 'var(--warning)' };

// Low-key on purpose - present so it's reachable, not something meant to draw
// the eye every session.
function CookiePreferencesButton({ t }) {
    return (
        <button
            type="button"
            title="Cookie preferences"
            onClick={openConsentModal}
            style={{ display: 'grid', placeItems: 'center', width: 24, height: '100%', flex: 'none', appearance: 'none', cursor: 'pointer', border: 'none', background: 'transparent', color: t.faint }}
        >
            <Cookie size={12} />
        </button>
    );
}

// Mirrors the actual socket state (lifted to dashboard/page.js and shared
// with KaraokePane.js/KaraFunPane.js as `karaFun`, same reasoning as `chat`
// above it) rather than just echoing settings - a party that's configured
// but unreachable must not read as "ready" (confirmed live: KaraFun's own
// 'serverUnreacheable' event fires - and sets error - well after
// karafunEnabled/partyId both look fine).
function karaFunStatus(karafunEnabled, partyId, loading, error, lastUpdated) {
    if (!karafunEnabled) return { label: 'KaraFun Off', tone: 'faint' };
    if (!partyId) return { label: 'No Party ID', tone: 'warning' };
    if (error) return { label: 'KaraFun Unreachable', tone: 'danger' };
    if (lastUpdated) return { label: 'KaraFun Live', tone: 'primary' };
    return { label: loading ? 'KaraFun Connecting…' : 'KaraFun Idle', tone: 'warning' };
}

export default function StatusBar({ t, d, tab, onAir, conn, role, queueDepth = 0, partyId, karafunEnabled, karaFunLoading, karaFunError, karaFunLastUpdated, latencyMs, blocked = false }) {
    const serviceStatus = useServiceStatus();
    const cell = { display: 'flex', alignItems: 'center', gap: 6, padding: '0 11px', borderRight: `1px solid ${t.hair}`, height: '100%' };
    const textStyle = t.modern ? { fontFamily: 'var(--font-sans)', fontSize: 11.5, fontWeight: 500 } : { fontFamily: MONO, fontSize: 11 };
    const kf = karaFunStatus(karafunEnabled, partyId, karaFunLoading, karaFunError, karaFunLastUpdated);
    const kfTone = kf.tone === 'faint' ? t.faint : kf.tone === 'warning' ? 'var(--warning)' : kf.tone === 'danger' ? 'var(--danger)' : 'var(--primary-500)';

    if (blocked || role === 'waiting') return (
        <div style={{ height: d.status, flex: 'none', display: 'flex', alignItems: 'center', background: t.chrome, borderTop: `1px solid ${t.edge}`, ...textStyle, color: t.dim, ...scan(t) }}>
            <span style={{ ...cell, color: 'var(--warning)' }}><Dot tone="var(--warning)" pulse /> {L(t, 'Awaiting approval')}</span>
            <span style={cell}>{L(t, 'No channel connected')}</span>
            <span style={{ flex: 1 }} />
            <CookiePreferencesButton t={t} />
        </div>
    );

    return (
        <div style={{ height: d.status, flex: 'none', display: 'flex', alignItems: 'center', background: t.chrome, borderTop: `1px solid ${t.edge}`, ...textStyle, color: t.dim, ...scan(t) }}>
            <span style={{ ...cell, color: CONN[conn].tone }}><Dot tone={CONN[conn].tone} pulse={conn === 'reconnecting'} /> {L(t, CONN[conn].status)}</span>
            <span style={cell}>{conn === 'connected' && latencyMs != null ? `${latencyMs}ms` : '—'}</span>
            <span style={cell}>{L(t, `Queue ${queueDepth}`)}</span>
            <span style={{ ...cell, color: onAir ? t.accent : t.faint }}>{L(t, onAir ? 'Overlay visible' : 'Overlay hidden')}</span>
            {serviceStatus && (
                <span style={{ ...cell, color: STATUS_TONE[serviceStatus.status] || 'var(--danger)' }}>
                    <Dot tone={STATUS_TONE[serviceStatus.status] || 'var(--danger)'} />
                    {L(t, `StreamCast Pro ${serviceStatus.status}`)}{serviceStatus.ping ? ` · ${serviceStatus.ping}` : ''}
                </span>
            )}
            {partyId && <span style={cell}>{L(t, `Party ${partyId}`)}</span>}
            <span style={{ ...cell, color: kfTone }}><Dot tone={kfTone} /> {L(t, kf.label)}</span>
            <span style={{ flex: 1 }} />
            <span style={{ ...cell, color: t.faint }}>{L(t, NAV.find(n => n.id === tab)?.label || tab)} · Ctrl+{NAV.findIndex(n => n.id === tab) + 1}</span>
            <CookiePreferencesButton t={t} />
        </div>
    );
}
