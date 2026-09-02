'use client';

import Image from 'next/image';
import { MONO, Dot, CONN, scan } from './treatments';
import { pressStart2P } from '@/lib/fonts';
import { APP_VERSION } from '@/lib/version';

const ARCADE = `${pressStart2P.style.fontFamily}, var(--font-geist-sans), system-ui, sans-serif`;

export default function TitleBar({ t, d, conn, channel }) {
    return (
        <div style={{ height: d.title, flex: 'none', display: 'flex', alignItems: 'center', gap: 12, padding: '0 12px', background: t.chrome, borderBottom: `1px solid ${t.edge}`, ...scan(t) }}>
            <div style={{ display: 'flex', gap: 7, paddingRight: 4 }}>
                {['#ff5f57', '#febc2e', '#28c840'].map(c => <span key={c} style={{ width: 11, height: 11, borderRadius: '50%', background: c, opacity: .85 }} />)}
            </div>
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
            <span style={{ width: 1, height: 16, background: t.hair }} />
            <span style={{ fontFamily: MONO, fontSize: 11, color: t.faint }}>v{APP_VERSION}</span>
        </div>
    );
}
