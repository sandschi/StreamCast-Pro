'use client';

import { useState } from 'react';
import { tiny } from './treatments';
import Avatar from '@/components/ui/Avatar';

// Shared "pick a person" dropdown - used by KaraokePane.js's Duet/Request
// pickers (allowFreeform omitted, unchanged from before this was extracted)
// and by KaraFunPane.js's Add-to-rotation and Add-for-X pickers.
export default function SingerPicker({ t, singers, onPick, onCancel, allowPublic, allowFreeform }) {
    const [freeformValue, setFreeformValue] = useState('');

    const submitFreeform = () => {
        const name = freeformValue.trim();
        if (!name) return;
        onPick(null, { freeformName: name });
    };

    return (
        <div style={{ position: 'absolute', zIndex: 5, top: '100%', right: 0, marginTop: 4, width: 220, background: t.pane, border: `1px solid ${t.edge}`, boxShadow: '0 10px 26px -12px rgba(0,0,0,.7)' }}>
            {allowFreeform && (
                <div style={{ display: 'flex', gap: 6, padding: '8px 10px', borderBottom: `1px solid ${t.hair}` }}>
                    <input
                        value={freeformValue}
                        onChange={(e) => setFreeformValue(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') submitFreeform(); }}
                        placeholder="Type any name…"
                        style={{ flex: 1, minWidth: 0, background: t.inset, border: `1px solid ${t.edge}`, color: t.text, fontFamily: 'var(--font-sans)', fontSize: 12, padding: '4px 6px' }}
                    />
                    <button onClick={submitFreeform} disabled={!freeformValue.trim()} style={{ flex: 'none', border: 'none', background: 'transparent', color: freeformValue.trim() ? t.text : t.faint, cursor: freeformValue.trim() ? 'pointer' : 'default', fontFamily: 'var(--font-sans)', fontSize: 12 }}>
                        Add
                    </button>
                </div>
            )}
            {allowPublic && (
                <button onClick={() => onPick(null)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', background: 'transparent', border: 'none', borderBottom: `1px solid ${t.hair}`, color: t.text, cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 12 }}>
                    Anyone (public request)
                </button>
            )}
            {singers.length === 0 && <div style={{ padding: 10, ...tiny(t), color: t.faint }}>{allowFreeform ? 'No recent chatters - type a name above.' : 'No singers online right now.'}</div>}
            {singers.map(s => (
                <button key={s.id} onClick={() => onPick(s.id, s)} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '8px 10px', background: 'transparent', border: 'none', borderBottom: `1px solid ${t.hair}`, color: t.text, cursor: 'pointer' }}>
                    <Avatar photoURL={s.photoURL} username={s.twitchUsername} size={18} />
                    <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12 }}>{s.twitchUsername || s.displayName}</span>
                </button>
            ))}
            <button onClick={onCancel} style={{ display: 'block', width: '100%', textAlign: 'center', padding: '6px 10px', background: 'transparent', border: 'none', color: t.faint, cursor: 'pointer', ...tiny(t) }}>Cancel</button>
        </div>
    );
}
