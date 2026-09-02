'use client';

import Image from 'next/image';
import { History as HistoryIcon, Trash2, ScreenShare, Send, XCircle } from 'lucide-react';
import { useHistoryData } from '@/hooks/useHistoryData';
import Pane from './Pane';
import ToolBtn from './ToolBtn';
import { MONO, tiny, L } from './treatments';
import EmptyState from '@/components/ui/EmptyState';
import Avatar from '@/components/ui/Avatar';
import { formatTimestamp } from '@/lib/utils';

export default function HistoryPane({ t, d, targetUid, userRole }) {
    const { history, activeMessage, hideOverlay, resendToScreen, clearHistory } = useHistoryData({ targetUid, userRole });
    const canModerate = userRole === 'broadcaster' || userRole === 'mod';

    if (history.length === 0) {
        return (
            <Pane t={t} d={d} icon={<HistoryIcon size={13} />} title="Message History · Last 50">
                <EmptyState icon={<HistoryIcon size={32} />} title="Nothing sent to the overlay yet." hint="Messages you push to your stream are kept here." />
            </Pane>
        );
    }

    return (
        <Pane t={t} d={d} icon={<HistoryIcon size={13} />} title="Message History · Last 50" flush
            actions={<>
                <span style={{ ...tiny(t), color: t.faint }}>{L(t, `${history.length} record${history.length === 1 ? '' : 's'}`)}</span>
                {activeMessage && canModerate && <ToolBtn t={t} icon={<XCircle size={12} />} onClick={hideOverlay}>Hide</ToolBtn>}
                {canModerate && <ToolBtn t={t} icon={<Trash2 size={12} />} onClick={clearHistory}>Clear</ToolBtn>}
            </>}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 10px', height: 24, background: t.inset, borderBottom: `1px solid ${t.hair}`, ...tiny(t), color: t.faint }}>
                <span style={{ width: 26 }} /><span style={{ width: 92 }}>{L(t, 'Time')}</span><span style={{ width: 110 }}>{L(t, 'User')}</span><span style={{ flex: 1 }}>{L(t, 'Message')}</span><span>{L(t, 'Action')}</span>
            </div>
            {history.map((msg) => (
                <div key={msg.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderBottom: `1px solid ${t.hair}`, minWidth: 0 }}>
                    <Avatar photoURL={msg.avatarUrl} username={msg.username} size={26} />
                    <span style={{ width: 92, fontFamily: MONO, fontSize: 11, color: t.faint, fontVariantNumeric: 'tabular-nums' }}>{formatTimestamp(msg.timestamp)}</span>
                    <span style={{ width: 110, fontFamily: 'var(--font-sans)', fontSize: 12.5, fontWeight: 600, color: msg.color, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{msg.username}</span>
                    <span style={{ flex: 1, minWidth: 0, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4, fontFamily: 'var(--font-sans)', fontSize: 12.5, color: t.text, overflow: 'hidden' }}>
                        {msg.fragments?.map((frag, i) => (
                            frag.type === 'text' ? <span key={i}>{frag.content}</span> :
                                <span key={i} style={{ height: '1.2em', width: '1.2em', position: 'relative', display: 'inline-block', verticalAlign: 'middle' }}>
                                    <Image src={frag.url} alt={frag.name} fill unoptimized />
                                </span>
                        ))}
                    </span>
                    <div style={{ display: 'flex', gap: 6, flex: 'none' }}>
                        {canModerate && (
                            <button onClick={() => resendToScreen(msg, true)} title="Show Permanently (∞)" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 22, padding: '0 8px', appearance: 'none', cursor: 'pointer', border: `1px solid ${t.hair}`, background: 'transparent', color: t.faint, ...tiny(t) }}>
                                {L(t, 'Send ∞')}
                            </button>
                        )}
                        <button onClick={() => resendToScreen(msg)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 22, padding: '0 8px', appearance: 'none', cursor: 'pointer', border: `1px solid ${t.edge}`, background: 'transparent', color: t.accent, ...tiny(t) }}>
                            {userRole === 'viewer' ? <Send size={11} /> : <ScreenShare size={11} />}{L(t, userRole === 'viewer' ? 'Suggest' : 'Re-send')}
                        </button>
                    </div>
                </div>
            ))}
        </Pane>
    );
}
