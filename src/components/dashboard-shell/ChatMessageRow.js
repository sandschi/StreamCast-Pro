'use client';

import Image from 'next/image';
import { Send, ScreenShare, ListPlus } from 'lucide-react';
import Avatar from '@/components/ui/Avatar';
import { bevel, MONO, tiny, L } from './treatments';
import { formatTimestamp } from '@/lib/utils';

export default function ChatMessageRow({ t, msg, userRole, onShow, onShowPermanent, onQueue }) {
    const canModerate = userRole === 'broadcaster' || userRole === 'mod';
    return (
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <Avatar photoURL={msg.avatarUrl} username={msg.username} size={30} />
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12.5, fontWeight: 700, color: msg.color || t.text }}>{msg.username}</span>
                    {msg.isMod && (
                        <span style={{ padding: '0 4px', border: '1px solid var(--success)', color: 'var(--success)', ...tiny(t), ...bevel(t) }}>{L(t, 'Mod')}</span>
                    )}
                    <span style={{ fontFamily: MONO, fontSize: 10.5, color: t.faint, fontVariantNumeric: 'tabular-nums' }}>{formatTimestamp(msg.timestamp)}</span>
                    <span style={{ flex: 1 }} />
                    <div style={{ display: 'flex', gap: 6, flex: 'none' }}>
                        {canModerate && (
                            <button onClick={onQueue} title="Show next, once the current message clears" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 20, padding: '0 7px', appearance: 'none', cursor: 'pointer', border: `1px solid ${t.hair}`, background: 'transparent', color: t.faint, ...tiny(t), ...bevel(t) }}>
                                <ListPlus size={11} />{L(t, 'Queue')}
                            </button>
                        )}
                        {canModerate && (
                            <button onClick={onShowPermanent} title="Show Permanently (∞)" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 20, padding: '0 7px', appearance: 'none', cursor: 'pointer', border: `1px solid ${t.hair}`, background: 'transparent', color: t.faint, ...tiny(t), ...bevel(t) }}>
                                {L(t, 'Send ∞')}
                            </button>
                        )}
                        <button onClick={onShow} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 20, padding: '0 7px', appearance: 'none', cursor: 'pointer', border: `1px solid ${t.edge}`, background: 'transparent', color: t.accent, ...tiny(t), ...bevel(t) }}>
                            {userRole === 'viewer' ? <Send size={11} /> : <ScreenShare size={11} />}{L(t, userRole === 'viewer' ? 'Suggest' : 'Show')}
                        </button>
                    </div>
                </div>
                <div style={{ marginTop: 3, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4, fontFamily: 'var(--font-sans)', fontSize: 13, color: t.text, lineHeight: 1.5 }}>
                    {msg.fragments.map((frag, i) => (
                        frag.type === 'text' ? <span key={i}>{frag.content}</span> :
                            <span key={i} style={{ height: '1.3em', width: '1.3em', position: 'relative', display: 'inline-block', verticalAlign: 'middle' }}>
                                <Image src={frag.url} alt={frag.name} fill unoptimized />
                            </span>
                    ))}
                </div>
            </div>
        </div>
    );
}
