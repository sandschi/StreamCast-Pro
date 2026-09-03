'use client';

import { Shield, Send, CheckCircle, XCircle, Clock, AlertTriangle } from 'lucide-react';
import { useBroadcastersData } from '@/hooks/useBroadcastersData';
import Pane from './Pane';
import ToolBtn from './ToolBtn';
import ResizableWidth from './ResizableWidth';
import { bevel, MONO, tiny, L } from './treatments';
import { pressStart2P } from '@/lib/fonts';
import EmptyState from '@/components/ui/EmptyState';
import Avatar from '@/components/ui/Avatar';

const ARCADE = `${pressStart2P.style.fontFamily}, var(--font-geist-sans), system-ui, sans-serif`;
const TONE = { approved: 'var(--success)', waiting: 'var(--warning)', denied: 'var(--danger)' };
const STATUSES = [
    { id: 'approved', label: 'Approve', icon: CheckCircle },
    { id: 'denied', label: 'Deny', icon: XCircle },
    { id: 'waiting', label: 'Waiting', icon: Clock },
];

export default function BroadcastersPane({ t, d }) {
    const { broadcasters, error, testingWebhook, setStatus, testWebhook } = useBroadcastersData();

    if (error) {
        return (
            <Pane t={t} d={d} icon={<Shield size={13} />} title="Broadcaster Access · Master Admin">
                <EmptyState icon={<AlertTriangle size={32} />} title="Couldn't load broadcasters." hint={error} />
            </Pane>
        );
    }

    if (broadcasters.length === 0) {
        return (
            <Pane t={t} d={d} icon={<Shield size={13} />} title="Broadcaster Access · Master Admin">
                <EmptyState icon={<Shield size={32} />} title="No broadcasters registered." hint="Anyone who signs in with Twitch appears here awaiting your review." />
            </Pane>
        );
    }

    const approved = broadcasters.filter(b => b.status === 'approved').length;
    const waiting = broadcasters.filter(b => b.status !== 'approved' && b.status !== 'denied').length;

    return (
        <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', gap: d.gutter }}>
            <Pane t={t} d={d} icon={<Shield size={13} />} title="Broadcaster Access · Master Admin" flush
                actions={<ToolBtn t={t} icon={<Send size={12} />} onClick={testWebhook} disabled={testingWebhook}>{testingWebhook ? 'Sending…' : 'Test Webhook'}</ToolBtn>}>
                {/* One wrapper so this is Pane's only flush child — Pane's own content
                    gap would otherwise land between every row (on top of each row's
                    own divider below it), pushing each row's content down unevenly. */}
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 10px', height: 24, background: t.inset, borderBottom: `1px solid ${t.hair}`, ...tiny(t), color: t.faint }}>
                        <span style={{ width: 26 }} /><span style={{ flex: 1 }}>{L(t, 'Broadcaster')}</span><span style={{ width: 86 }}>{L(t, 'Status')}</span><span style={{ width: 220 }}>{L(t, 'Decision')}</span>
                    </div>
                    {broadcasters.map(b => {
                        const status = b.status || 'waiting';
                        return (
                            <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 10px', height: d.row + 10, borderBottom: `1px solid ${t.hair}`, borderLeft: `2px solid ${TONE[status] || TONE.waiting}` }}>
                                <Avatar photoURL={b.photoURL} username={b.twitchUsername || b.displayName} size={22} />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12.5, fontWeight: 600, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.displayName}</div>
                                    {b.twitchUsername && <div style={{ fontFamily: MONO, fontSize: 10, color: t.faint }}>@{b.twitchUsername}</div>}
                                </div>
                                <span style={{ width: 86, fontFamily: MONO, fontSize: 10, letterSpacing: '.11em', color: TONE[status] || TONE.waiting }}>{status.toUpperCase()}</span>
                                <div style={{ width: 220, display: 'flex', gap: 1 }}>
                                    {STATUSES.map(s => (
                                        <button key={s.id} onClick={() => setStatus(b.id, s.id)}
                                            style={{
                                                flex: 1, height: 22, appearance: 'none', cursor: 'pointer', border: `1px solid ${status === s.id ? t.edge : t.hair}`,
                                                background: status === s.id ? (t.glow ? 'rgba(7,252,3,.12)' : t.inset) : 'transparent', color: status === s.id ? TONE[s.id] : t.faint,
                                                ...tiny(t), ...bevel(t)
                                            }}>{L(t, s.label)}</button>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </Pane>
            <ResizableWidth t={t} storageKey="sc-stats-w" defaultWidth={200} minWidth={150} maxWidth={360} style={{ display: 'flex', flexDirection: 'column', gap: d.gutter }}>
                {[[broadcasters.length, 'Registered'], [approved, 'Approved'], [waiting, 'Awaiting review']].map(([n, l]) => (
                    <div key={l} style={{ padding: '14px 12px', background: t.pane, border: `1px solid ${t.hair}`, ...bevel(t) }}>
                        <div style={t.modern ? { fontFamily: 'var(--font-sans)', fontSize: 28, fontWeight: 900, letterSpacing: '-.02em', color: t.text } : { fontFamily: ARCADE, fontSize: 22, lineHeight: 1.4, color: t.accent, textShadow: t.glow ? '0 0 14px rgba(7,252,3,.4)' : 'none' }}>{n}</div>
                        <div style={{ marginTop: 4, ...tiny(t), color: t.faint }}>{L(t, l)}</div>
                    </div>
                ))}
            </ResizableWidth>
        </div>
    );
}
