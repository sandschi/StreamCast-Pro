'use client';

import { scan } from './treatments';
import { NAV } from './nav';

export default function NavTabStrip({ t, d, tab, set, allowed }) {
    return (
        <div style={{ height: d.tabs, flex: 'none', display: 'flex', alignItems: 'flex-end', gap: 1, padding: '0 6px', background: t.chrome, borderBottom: `1px solid ${t.edge}`, ...scan(t) }}>
            {NAV.filter(n => allowed.includes(n.id)).map((n, i) => {
                const on = n.id === tab;
                const Icon = n.icon;
                return (
                    <button key={n.id} onClick={() => set(n.id)} title={`⌘${i + 1}`}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 7, height: d.tabs - 5, padding: '0 13px', appearance: 'none', cursor: 'pointer',
                            borderLeft: `1px solid ${on ? t.edge : 'transparent'}`, borderRight: `1px solid ${on ? t.edge : 'transparent'}`, borderTop: `2px solid ${on ? t.accent : 'transparent'}`, borderBottom: 'none',
                            background: on ? t.pane : 'transparent', color: on ? t.text : t.dim, fontFamily: 'var(--font-sans)', fontSize: 12.5, fontWeight: on ? 600 : 500,
                            boxShadow: on && t.glow ? '0 -8px 18px -8px rgba(7,252,3,.35)' : 'none'
                        }}>
                        <Icon size={14} />{n.label}
                    </button>
                );
            })}
        </div>
    );
}
