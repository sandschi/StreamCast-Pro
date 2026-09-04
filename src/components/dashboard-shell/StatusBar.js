'use client';

import { Cookie } from 'lucide-react';
import { MONO, Dot, CONN, scan, L } from './treatments';
import { NAV } from './nav';
import useServiceStatus from '@/hooks/useServiceStatus';

const STATUS_TONE = { Up: 'var(--primary-500)', Pending: 'var(--warning)' };

// Low-key on purpose - present so it's reachable, not something meant to draw
// the eye every session.
function CookiePreferencesButton({ t }) {
    return (
        <button
            type="button"
            title="Cookie preferences"
            onClick={() => { if (window.zaraz?.consent) window.zaraz.consent.modal = true; }}
            style={{ display: 'grid', placeItems: 'center', width: 24, height: '100%', flex: 'none', appearance: 'none', cursor: 'pointer', border: 'none', background: 'transparent', color: t.faint }}
        >
            <Cookie size={12} />
        </button>
    );
}

export default function StatusBar({ t, d, tab, onAir, conn, role, queueDepth = 0, partyId, latencyMs, blocked = false }) {
    const serviceStatus = useServiceStatus();
    const cell = { display: 'flex', alignItems: 'center', gap: 6, padding: '0 11px', borderRight: `1px solid ${t.hair}`, height: '100%' };
    const textStyle = t.modern ? { fontFamily: 'var(--font-sans)', fontSize: 11.5, fontWeight: 500 } : { fontFamily: MONO, fontSize: 11 };

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
            {partyId && <span style={cell}>{L(t, `Party ${partyId}`)}</span>}
            {serviceStatus && (
                <span style={{ ...cell, color: STATUS_TONE[serviceStatus.status] || 'var(--danger)' }}>
                    <Dot tone={STATUS_TONE[serviceStatus.status] || 'var(--danger)'} />
                    {L(t, `Service ${serviceStatus.status}`)}{serviceStatus.ping ? ` · ${serviceStatus.ping}` : ''}
                </span>
            )}
            <span style={{ flex: 1 }} />
            <span style={{ ...cell, color: t.faint }}>{L(t, NAV.find(n => n.id === tab)?.label || tab)} · ⌘{NAV.findIndex(n => n.id === tab) + 1}</span>
            <CookiePreferencesButton t={t} />
        </div>
    );
}
