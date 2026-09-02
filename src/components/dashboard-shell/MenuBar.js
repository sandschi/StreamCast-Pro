'use client';

import { useState } from 'react';
import { bevel, scan } from './treatments';

// Wired to real actions in later stages via onSelect; menu structure stays
// fixed here since it mirrors the app's actual command surface.
export const MENUS = {
    File: ['Copy Overlay URL', 'Copy Moderator Link', 'Export Message History…', '—', 'Sign Out'],
    Overlay: ['Show Last Message', 'Show Permanently  ∞', 'Hide Overlay', '—', 'Send Test Message', 'Save Settings'],
    Chat: ['Reconnect to Twitch', 'Clear Log', '—', 'Approve All Suggestions', 'Mute Suggestions'],
    Window: ['Compact Density', 'Comfortable Density', '—', 'Full Screen'],
    Help: ['Changelog', 'Remote API Reference', 'About StreamCast Pro'],
};

// While access isn't verified (Access Pending / Access Denied) there is no
// functional workspace behind Overlay/Chat's actions, so those categories are
// dropped entirely and File is trimmed to just Sign Out — everything else in
// this component (Window/Help) is chrome-level and stays available either way.
const RESTRICTED_MENUS = {
    File: ['Sign Out'],
    Window: MENUS.Window,
    Help: MENUS.Help,
};

export default function MenuBar({ t, d, onSelect, restricted = false }) {
    const [open, setOpen] = useState(null);
    const menus = restricted ? RESTRICTED_MENUS : MENUS;
    return (
        <div onMouseLeave={() => setOpen(null)} style={{ height: d.menu, flex: 'none', position: 'relative', zIndex: 80, display: 'flex', alignItems: 'stretch', padding: '0 6px', background: t.chrome, borderBottom: `1px solid ${t.hair}`, ...scan(t) }}>
            {Object.keys(menus).map(m => (
                <div key={m} style={{ position: 'relative', display: 'flex' }}>
                    <button onClick={() => setOpen(open === m ? null : m)} onMouseEnter={() => open && setOpen(m)}
                        style={{
                            appearance: 'none', border: 'none', cursor: 'pointer', padding: '0 11px', fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 500, letterSpacing: '.01em',
                            background: open === m ? (t.glow ? 'rgba(7,252,3,.14)' : t.inset) : 'transparent', color: open === m ? t.accent : t.dim
                        }}>{m}</button>
                    {open === m && (
                        <div style={{ position: 'absolute', top: '100%', left: 0, minWidth: 238, padding: 4, background: t.chrome, border: `1px solid ${t.edge}`, boxShadow: '0 18px 40px -12px rgba(0,0,0,.8)', ...bevel(t) }}>
                            {menus[m].map((item, i) => item === '—'
                                ? <div key={i} style={{ height: 1, margin: '4px 6px', background: t.hair }} />
                                : <div key={i}
                                    onClick={() => { setOpen(null); onSelect && onSelect(m, item); }}
                                    style={{ padding: '6px 10px', fontFamily: 'var(--font-sans)', fontSize: 12.5, color: t.text, cursor: 'pointer', whiteSpace: 'nowrap' }}
                                    onMouseEnter={e => e.currentTarget.style.background = t.glow ? 'rgba(7,252,3,.12)' : t.inset}
                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>{item}</div>)}
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}
