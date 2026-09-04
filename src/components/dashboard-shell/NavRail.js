'use client';

import { LogOut } from 'lucide-react';
import { bevel } from './treatments';
import { NAV } from './nav';

export default function NavRail({ t, d, tab, set, allowed, onSignOut }) {
    return (
        <div style={{ width: d.rail, flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '8px 0', background: t.chrome, borderRight: `1px solid ${t.edge}` }}>
            {NAV.filter(n => allowed.includes(n.id)).map((n, i) => {
                const on = n.id === tab;
                const Icon = n.icon;
                return (
                    <button key={n.id} onClick={() => set(n.id)} title={`${n.label}  ⌘${i + 1}`}
                        style={{
                            position: 'relative', width: d.rail - 10, height: d.rail - 12, display: 'grid', placeItems: 'center', appearance: 'none', cursor: 'pointer',
                            border: `1px solid ${on ? t.edge : 'transparent'}`, background: on ? (t.glow ? 'rgba(7,252,3,.12)' : t.inset) : 'transparent',
                            color: on ? t.accent : t.dim, boxShadow: on && t.glow ? '0 0 14px rgba(7,252,3,.18) inset' : 'none', ...bevel(t)
                        }}>
                        <Icon size={18} />
                        {on && <span style={{ position: 'absolute', left: -1, top: '22%', bottom: '22%', width: 2, background: t.accent }} />}
                    </button>
                );
            })}
            <span style={{ flex: 1 }} />
            <button title="Sign out" onClick={onSignOut} style={{ width: d.rail - 10, height: d.rail - 12, display: 'grid', placeItems: 'center', appearance: 'none', border: '1px solid transparent', background: 'transparent', color: t.faint, cursor: 'pointer' }}><LogOut size={18} /></button>
        </div>
    );
}
