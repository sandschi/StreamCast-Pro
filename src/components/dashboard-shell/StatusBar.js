'use client';

import { MONO, Dot, CONN, scan, L } from './treatments';
import { NAV } from './nav';

export default function StatusBar({ t, d, tab, onAir, conn, role, queueDepth = 0, partyId, latencyMs }) {
    const cell = { display: 'flex', alignItems: 'center', gap: 6, padding: '0 11px', borderRight: `1px solid ${t.hair}`, height: '100%' };
    const textStyle = t.modern ? { fontFamily: 'var(--font-sans)', fontSize: 11.5, fontWeight: 500 } : { fontFamily: MONO, fontSize: 11 };

    if (role === 'waiting') return (
        <div style={{ height: d.status, flex: 'none', display: 'flex', alignItems: 'center', background: t.chrome, borderTop: `1px solid ${t.edge}`, ...textStyle, color: t.dim, ...scan(t) }}>
            <span style={{ ...cell, color: 'var(--warning)' }}><Dot tone="var(--warning)" pulse /> {L(t, 'Awaiting approval')}</span>
            <span style={cell}>{L(t, 'No channel connected')}</span>
        </div>
    );

    return (
        <div style={{ height: d.status, flex: 'none', display: 'flex', alignItems: 'center', background: t.chrome, borderTop: `1px solid ${t.edge}`, ...textStyle, color: t.dim, ...scan(t) }}>
            <span style={{ ...cell, color: CONN[conn].tone }}><Dot tone={CONN[conn].tone} pulse={conn === 'reconnecting'} /> {L(t, CONN[conn].status)}</span>
            <span style={cell}>{conn === 'connected' && latencyMs != null ? `${latencyMs}ms` : '—'}</span>
            <span style={cell}>{L(t, `Queue ${queueDepth}`)}</span>
            <span style={{ ...cell, color: onAir ? t.accent : t.faint }}>{L(t, onAir ? 'Overlay visible' : 'Overlay hidden')}</span>
            {partyId && <span style={cell}>{L(t, `Party ${partyId}`)}</span>}
            <span style={{ flex: 1 }} />
            <span style={{ ...cell, borderRight: 'none', color: t.faint }}>{L(t, tab.charAt(0).toUpperCase() + tab.slice(1))} · ⌘{NAV.findIndex(n => n.id === tab) + 1}</span>
        </div>
    );
}
