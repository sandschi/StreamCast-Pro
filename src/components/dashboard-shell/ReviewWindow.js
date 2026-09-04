'use client';

import { Clock, ShieldAlert } from 'lucide-react';
import { bevel, tiny, L, Dot } from './treatments';

export default function ReviewWindow({
    t, d, tone = 'waiting',
    icon,
    title = 'Access pending',
    body = <>Your application is currently under review by <strong style={{ color: t.text }}>Sandschi</strong>. You will get access as soon as it is approved.</>,
    status = 'Waiting for approval',
}) {
    const color = tone === 'denied' ? 'var(--danger)' : 'var(--warning)';
    const Icon = icon || (tone === 'denied' ? ShieldAlert : Clock);
    return (
        <div style={{ flex: 1, minHeight: 0, display: 'grid', placeItems: 'center', padding: 24 }}>
            <div style={{ width: '100%', maxWidth: 430, textAlign: 'center', padding: '32px 28px', display: 'flex', flexDirection: 'column', gap: 16, background: t.pane, border: `1px solid ${t.hair}`, ...bevel(t) }}>
                <span style={{ width: 52, height: 52, margin: '0 auto', display: 'grid', placeItems: 'center', color, border: `1px solid ${color}59`, ...bevel(t) }}><Icon size={24} /></span>
                <h2 style={{ margin: 0, fontFamily: 'var(--font-sans)', fontSize: 17, fontWeight: 800, color: t.text }}>{title}</h2>
                <p style={{ margin: 0, fontFamily: 'var(--font-sans)', fontSize: 13, lineHeight: 1.6, color: t.dim }}>{body}</p>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, ...tiny(t), color: t.faint }}><Dot tone={color} pulse={tone !== 'denied'} /> {L(t, status)}</div>
            </div>
        </div>
    );
}
