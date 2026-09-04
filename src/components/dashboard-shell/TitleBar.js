'use client';

import Image from 'next/image';
import { MONO, Dot, CONN, scan, tiny, L } from './treatments';
import { pressStart2P } from '@/lib/fonts';
import { APP_VERSION } from '@/lib/version';

const ARCADE = `${pressStart2P.style.fontFamily}, var(--font-geist-sans), system-ui, sans-serif`;

export default function TitleBar({ t, d, conn, channel, role, isMasterAdmin, onVersionClick }) {
    return (
        <div style={{ height: d.title, flex: 'none', display: 'flex', alignItems: 'center', gap: 12, padding: '0 12px', background: t.chrome, borderBottom: `1px solid ${t.edge}`, ...scan(t) }}>
            <Image src="/logo.svg" alt="" width={18} height={18} style={{ imageRendering: t.modern ? 'auto' : 'pixelated' }} />
            {t.modern
                ? <span style={{ fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 700, letterSpacing: '-.01em', color: t.text }}>StreamCast Pro</span>
                : <>
                    <span style={{ fontFamily: ARCADE, fontSize: 16, lineHeight: 1.4, color: t.accent, textShadow: t.glow ? '0 0 12px rgba(7,252,3,.45)' : 'none' }}>STREAMCAST</span>
                    <span style={{ fontFamily: MONO, fontSize: 11, color: t.faint }}>PRO</span>
                </>}
            <span style={{ flex: 1 }} />
            <span style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0, fontFamily: MONO, fontSize: 11, color: conn === 'connected' ? t.dim : CONN[conn].tone }}>
                <Dot tone={CONN[conn].tone} pulse={conn === 'reconnecting'} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}>{channel}</span>
            </span>
            {role && <span style={{ ...tiny(t), color: isMasterAdmin ? t.accent : t.dim, padding: '3px 8px', border: `1px solid ${t.edge}`, borderRadius: t.round ? 5 : 0 }}>{L(t, role)}</span>}
            <span style={{ width: 1, height: 16, background: t.hair }} />
            <button onClick={onVersionClick} title="View changelog" style={{ appearance: 'none', cursor: onVersionClick ? 'pointer' : 'default', border: 'none', background: 'transparent', padding: 0, fontFamily: MONO, fontSize: 11, color: t.faint }}>v{APP_VERSION}</button>
        </div>
    );
}
