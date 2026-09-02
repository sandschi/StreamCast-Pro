'use client';

import { bevel, MONO, tiny, L } from './treatments';
import { NAV } from './nav';
import Avatar from '@/components/ui/Avatar';

export default function NavList({ t, d, tab, set, allowed, role, user }) {
    return (
        <div style={{ width: d.list, flex: 'none', display: 'flex', flexDirection: 'column', background: t.chrome, borderRight: `1px solid ${t.edge}` }}>
            <div style={{ padding: '10px 12px 6px', ...tiny(t), color: t.faint }}>{L(t, 'Workspace')}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1, padding: '0 6px' }}>
                {NAV.filter(n => allowed.includes(n.id)).map((n, i) => {
                    const on = n.id === tab;
                    const Icon = n.icon;
                    return (
                        <button key={n.id} onClick={() => set(n.id)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 9, height: d.row, padding: '0 9px', appearance: 'none', cursor: 'pointer', textAlign: 'left',
                                border: `1px solid ${on ? t.edge : 'transparent'}`, background: on ? (t.glow ? 'rgba(7,252,3,.12)' : t.inset) : 'transparent',
                                color: on ? t.accent : t.dim, fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: on ? 600 : 500, ...bevel(t)
                            }}>
                            <Icon size={15} />
                            <span style={{ flex: 1 }}>{n.label}</span>
                            <span style={{ fontFamily: MONO, fontSize: 10, color: on ? t.accent : t.faint, opacity: .8 }}>⌘{i + 1}</span>
                        </button>
                    );
                })}
            </div>
            <span style={{ flex: 1 }} />
            <div style={{ padding: '8px 12px', borderTop: `1px solid ${t.hair}`, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Avatar size={22} photoURL={user?.photoURL} username={user?.username} />
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 600, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.username || 'sandschi'}</div>
                    <div style={{ ...tiny(t), color: t.accent }}>{L(t, role)}</div>
                </div>
            </div>
        </div>
    );
}
