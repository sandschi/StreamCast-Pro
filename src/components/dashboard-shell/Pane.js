'use client';

import { bevel, lbl, L } from './treatments';

export default function Pane({ t, d, title, icon, actions, children, scroll = true, flush = false }) {
    return (
        <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', background: t.pane, border: `1px solid ${t.hair}`, boxShadow: t.shadow ? '0 1px 0 rgba(255,255,255,.04) inset, 0 10px 26px -18px rgba(0,0,0,.9)' : 'none', overflow: 'hidden', ...bevel(t) }}>
            <div style={{ height: d.toolbar, flex: 'none', display: 'flex', alignItems: 'center', gap: 8, padding: '0 10px', borderBottom: `1px solid ${t.hair}`, background: t.inset }}>
                {icon && <span style={{ color: t.dim, display: 'inline-flex' }}>{icon}</span>}
                <span style={{ ...lbl(t), color: t.dim }}>{L(t, title)}</span>
                <span style={{ flex: 1 }} />
                {actions}
            </div>
            <div style={{ flex: 1, minWidth: 0, minHeight: 0, overflowY: scroll ? 'auto' : 'hidden', overflowX: 'hidden', padding: flush ? 0 : d.pad, display: 'flex', flexDirection: 'column', gap: d.gap, boxSizing: 'border-box' }}>{children}</div>
        </div>
    );
}
