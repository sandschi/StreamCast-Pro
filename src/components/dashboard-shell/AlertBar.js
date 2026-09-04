'use client';

import { XCircle, ShieldAlert, RefreshCw, X } from 'lucide-react';
import { bevel } from './treatments';
import ToolBtn from './ToolBtn';

const ALERTS = {
    'save-failed': { icon: XCircle, tone: 'var(--danger)', title: "Couldn't save overlay settings.", body: 'Your last change was not applied to the stream. Retry, or copy your settings before reloading.', action: 'Retry save' },
    'token-expired': { icon: ShieldAlert, tone: 'var(--warning)', title: 'Your Twitch token expired.', body: 'Chat is read-only until you reconnect your Twitch account.', action: 'Reconnect Twitch' },
};

export default function AlertBar({ t, d, alert, onAction, onDismiss }) {
    const a = ALERTS[alert];
    if (!a) return null;
    const Icon = a.icon;
    return (
        <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 10, margin: `${d.gutter}px ${d.gutter}px 0`, padding: '9px 12px', background: t.modern ? 'rgba(255,255,255,.03)' : t.inset, border: `1px solid ${a.tone}`, borderLeftWidth: 3, ...bevel(t) }}>
            <span style={{ color: a.tone, display: 'inline-flex' }}><Icon size={16} /></span>
            <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12.5, fontWeight: 700, color: t.text }}>{a.title}</div>
                <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: t.dim }}>{a.body}</div>
            </div>
            <span style={{ flex: 1 }} />
            <ToolBtn t={t} icon={<RefreshCw size={12} />} onClick={onAction}>{a.action}</ToolBtn>
            <button type="button" onClick={onDismiss} aria-label="Dismiss alert" style={{ width: 24, height: 24, display: 'grid', placeItems: 'center', appearance: 'none', border: 'none', background: 'transparent', color: t.faint, cursor: 'pointer' }}><X size={14} /></button>
        </div>
    );
}
