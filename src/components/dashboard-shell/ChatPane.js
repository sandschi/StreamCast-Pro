'use client';

import { useEffect, useState } from 'react';
import { MessageSquare, RefreshCw, XCircle, HandHelping, Zap, Send, ScreenShare, EyeOff, ExternalLink, Link as LinkIcon, ListOrdered, X } from 'lucide-react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import Pane from './Pane';
import ToolBtn from './ToolBtn';
import ResizableWidth from './ResizableWidth';
import { bevel, lbl, tiny, L, Dot, CONN } from './treatments';
import EmptyState from '@/components/ui/EmptyState';
import SuggestionChip from '@/components/ui/SuggestionChip';
import ChatMessageRow from './ChatMessageRow';
import MessageBubble from '@/components/overlay/MessageBubble';

const DEFAULT_SETTINGS = {
    posX: 5, posY: 85, bubbleStyle: 'classic', showAvatar: true, avatarSize: 28,
    fontSize: 15, nameSize: 11, textColor: '#ffffff', strokeColor: '#000000', borderRadius: 16, animationStyle: 'slide',
};

const ACTION_BTN = (t) => ({ display: 'flex', alignItems: 'center', gap: 9, height: 30, padding: '0 9px', appearance: 'none', cursor: 'pointer', border: `1px solid ${t.hair}`, background: 'transparent', color: t.text, fontFamily: 'var(--font-sans)', fontSize: 12.5, textAlign: 'left', width: '100%', ...bevel(t) });

// Accepts the return value of useChatData as `chat` — lifted to the dashboard
// shell so the connection it opens survives tab switches (this pane is kept
// mounted, just hidden, exactly like the classic Chat.js was) and so the
// title/status bar chrome can show the same real connection state.
export default function ChatPane({ t, d, userRole, chat, hidden = false, muted = false }) {
    const { user } = useAuth();
    const {
        effectiveUid,
        displayMessages,
        connectionStatus,
        channelName,
        suggestions,
        activeMessage,
        queuedMessages,
        hideOverlay,
        sendToScreen,
        queueMessage,
        removeFromQueue,
        approveSuggestion,
        denySuggestion,
        reconnect,
    } = chat;

    const [overlaySettings, setOverlaySettings] = useState(DEFAULT_SETTINGS);
    useEffect(() => {
        if (!effectiveUid) return;
        const ref = doc(db, 'users', effectiveUid, 'settings', 'config');
        const unsub = onSnapshot(ref, (snap) => {
            if (snap.exists()) setOverlaySettings({ ...DEFAULT_SETTINGS, ...snap.data() });
        });
        return () => unsub();
    }, [effectiveUid]);

    const conn = connectionStatus === 'connected' ? 'connected' : connectionStatus === 'connecting' ? 'reconnecting' : 'disconnected';
    // The whole inspector column (queue, on-stream preview, Hide/quick actions)
    // is moderator/broadcaster-only - excluded 'viewer' but not 'denied', so a
    // denied user's own dashboard rendered these controls too.
    const showInspector = userRole === 'broadcaster' || userRole === 'mod';

    const copy = (text) => { if (typeof navigator !== 'undefined' && navigator.clipboard) navigator.clipboard.writeText(text).catch(() => { }); };
    const origin = typeof window !== 'undefined' ? window.location.origin : '';

    const sendTestMessage = () => sendToScreen({
        username: user?.displayName || 'Test User', login: 'test', color: '#07fc03', avatarUrl: user?.photoURL || null,
        fragments: [{ type: 'text', content: 'This is a test message from the dashboard.' }],
    });

    return (
        <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: hidden ? 'none' : 'flex', gap: d.gutter }}>
            <Pane t={t} d={d} icon={<MessageSquare size={13} />} title={`Twitch Chat · #${channelName || '…'}`} flush
                actions={<>
                    <span style={{ ...lbl(t), color: t.faint }}>{L(t, `${displayMessages.length} msg`)}</span>
                    <ToolBtn t={t} icon={<RefreshCw size={12} />} onClick={reconnect}>Reconnect</ToolBtn>
                </>}>
                {conn !== 'connected' && (
                    <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 9, padding: '9px 11px', borderBottom: `1px solid ${CONN[conn].tone}`, background: t.modern ? 'rgba(255,255,255,.03)' : t.inset }}>
                        <Dot tone={CONN[conn].tone} pulse={conn === 'reconnecting'} />
                        <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12.5, fontWeight: 600, color: CONN[conn].tone }}>
                            {conn === 'reconnecting' ? 'Reconnecting to Twitch chat…' : 'Not connected to Twitch chat.'}
                        </span>
                        <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: t.dim }}>
                            {conn === 'reconnecting' ? 'Messages sent now may not reach the overlay.' : 'The log below is the last state before the connection dropped.'}
                        </span>
                        <span style={{ flex: 1 }} />
                        {conn === 'disconnected' && <ToolBtn t={t} icon={<RefreshCw size={12} />} primary onClick={reconnect}>Reconnect</ToolBtn>}
                    </div>
                )}
                {userRole !== 'viewer' && !muted && suggestions.length > 0 && (
                    <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderBottom: `1px solid ${t.edge}`, background: t.glow ? 'rgba(7,252,3,.06)' : t.inset, overflowX: 'auto', overflowY: 'hidden' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6, paddingRight: 10, borderRight: `1px solid ${t.hair}`, ...tiny(t), color: t.accent, whiteSpace: 'nowrap' }}>
                            <HandHelping size={12} /> {L(t, 'Suggestions')}
                        </span>
                        {suggestions.map((sug) => (
                            <SuggestionChip key={sug.id} username={sug.username} avatarUrl={sug.avatarUrl} color={sug.color} text={sug.fragments?.[0]?.content}
                                onApprove={() => approveSuggestion(sug)} onDeny={() => denySuggestion(sug.id)} />
                        ))}
                    </div>
                )}
                <div style={{ flex: 1, minWidth: 0, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', display: 'flex', flexDirection: 'column' }}>
                    {displayMessages.length === 0 && (
                        <EmptyState icon={<MessageSquare size={32} />} title="No messages yet." hint="Once someone types in your Twitch chat it appears here." />
                    )}
                    {displayMessages.map((msg) => (
                        <div key={msg.id} style={{ padding: d.compact ? '7px 10px' : '10px 12px', borderBottom: `1px solid ${t.hair}`, minWidth: 0 }}>
                            <ChatMessageRow t={t} msg={msg} userRole={userRole} onShow={() => sendToScreen(msg)} onShowPermanent={() => sendToScreen(msg, true)} onQueue={() => queueMessage(msg)} />
                        </div>
                    ))}
                </div>
            </Pane>

            {showInspector && (
                <ResizableWidth t={t} storageKey="sc-inspector-w" defaultWidth={d.inspector} minWidth={210} maxWidth={480} style={{ display: 'flex', flexDirection: 'column', gap: d.gutter, minHeight: 0 }}>
                    <div style={{ flex: 'none', display: 'flex', flexDirection: 'column', background: t.pane, border: `1px solid ${activeMessage ? t.edge : t.hair}`, ...bevel(t) }}>
                        <div style={{ height: d.toolbar, display: 'flex', alignItems: 'center', gap: 8, padding: '0 10px', borderBottom: `1px solid ${t.hair}`, background: t.inset }}>
                            <span style={{ ...lbl(t), color: activeMessage ? t.accent : t.dim }}>{L(t, activeMessage ? '● On stream' : '○ Overlay idle')}</span>
                            <span style={{ flex: 1 }} />
                            {activeMessage && <ToolBtn t={t} icon={<XCircle size={12} />} onClick={hideOverlay}>Hide</ToolBtn>}
                        </div>
                        <div style={{ position: 'relative', minHeight: 118, padding: 12, backgroundColor: t.app, backgroundImage: 'radial-gradient(rgba(255,255,255,.10) 1px,transparent 1px)', backgroundSize: '14px 14px', overflow: 'hidden' }}>
                            {activeMessage
                                ? <MessageBubble message={activeMessage} settings={overlaySettings} />
                                : <div style={{ display: 'grid', placeItems: 'center', minHeight: 94 }}>
                                    <span style={{ ...lbl(t), color: t.faint, textAlign: 'center', lineHeight: 1.7 }}>{L(t, 'Nothing on stream')}<br />{L(t, 'Send a message to preview it')}</span>
                                </div>}
                        </div>
                    </div>
                    {queuedMessages.length > 0 && (
                        <Pane t={t} d={d} icon={<ListOrdered size={13} />} title={`Queue · ${queuedMessages.length}`}>
                            {queuedMessages.map((qm, i) => (
                                <div key={qm.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: i < queuedMessages.length - 1 ? `1px solid ${t.hair}` : 'none' }}>
                                    <span style={{ ...tiny(t), color: t.faint, flex: 'none', width: 14, textAlign: 'right' }}>{i + 1}</span>
                                    <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12.5, fontWeight: 700, color: qm.color || t.text, flex: 'none' }}>{qm.username}</span>
                                    <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: t.dim, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {qm.fragments?.find(f => f.type === 'text')?.content || ''}
                                    </span>
                                    <button onClick={() => removeFromQueue(qm.id)} title="Remove from queue" style={{ display: 'grid', placeItems: 'center', width: 18, height: 18, flex: 'none', appearance: 'none', cursor: 'pointer', border: 'none', background: 'transparent', color: t.faint }}>
                                        <X size={12} />
                                    </button>
                                </div>
                            ))}
                        </Pane>
                    )}
                    <Pane t={t} d={d} icon={<Zap size={13} />} title="Quick Actions">
                        <button onClick={sendTestMessage} style={ACTION_BTN(t)}>
                            <Send size={14} /><span style={{ flex: 1 }}>Send Test Message</span>
                        </button>
                        {activeMessage && activeMessage.duration !== -1 && (
                            <button onClick={() => sendToScreen(activeMessage, true)} style={ACTION_BTN(t)}>
                                <ScreenShare size={14} /><span style={{ flex: 1 }}>Show Permanently  ∞</span>
                            </button>
                        )}
                        <button onClick={hideOverlay} style={ACTION_BTN(t)}>
                            <EyeOff size={14} /><span style={{ flex: 1 }}>Hide Overlay</span>
                        </button>
                        <button onClick={() => copy(`${origin}/overlay/${effectiveUid}`)} style={ACTION_BTN(t)}>
                            <ExternalLink size={14} /><span style={{ flex: 1 }}>Copy Overlay URL</span>
                        </button>
                        <button onClick={() => copy(`${origin}/dashboard?host=${effectiveUid}`)} style={ACTION_BTN(t)}>
                            <LinkIcon size={14} /><span style={{ flex: 1 }}>Copy Dashboard Link</span>
                        </button>
                    </Pane>
                </ResizableWidth>
            )}
        </div>
    );
}
