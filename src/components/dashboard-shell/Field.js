'use client';

import { tiny, L } from './treatments';

export default function Field({ t, label, children, hint }) {
    return (
        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={{ ...tiny(t), color: t.faint }}>{L(t, label)}</span>
            {children}
            {hint && <span style={{ fontFamily: 'var(--font-sans)', fontSize: 11.5, color: t.faint }}>{hint}</span>}
        </div>
    );
}
