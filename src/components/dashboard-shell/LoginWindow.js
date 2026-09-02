'use client';

import Image from 'next/image';
import { bevel, scan, MONO } from './treatments';
import { pressStart2P } from '@/lib/fonts';
import TwitchIcon from '@/components/TwitchIcon';
import StatusDot from '@/components/ui/StatusDot';
import { APP_VERSION } from '@/lib/version';

const ARCADE = `${pressStart2P.style.fontFamily}, var(--font-geist-sans), system-ui, sans-serif`;

export default function LoginWindow({ t, onLogin }) {
    return (
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: t.app }}>
            <div style={{ width: '100%', maxWidth: 430, background: t.pane, border: `1px solid ${t.edge}`, boxShadow: '0 30px 70px -20px rgba(0,0,0,.9)', ...bevel(t) }}>
                <div style={{ height: 34, display: 'flex', alignItems: 'center', gap: 10, padding: '0 11px', background: t.chrome, borderBottom: `1px solid ${t.hair}`, ...scan(t) }}>
                    <div style={{ display: 'flex', gap: 6 }}>{['#ff5f57', '#febc2e', '#28c840'].map(c => <span key={c} style={{ width: 10, height: 10, borderRadius: '50%', background: c, opacity: .7 }} />)}</div>
                    <span style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: '.15em', color: t.faint }}>SIGN IN</span>
                </div>
                <div style={{ padding: '34px 30px 30px', display: 'flex', flexDirection: 'column', gap: 20, textAlign: 'center' }}>
                    <Image src="/logo.svg" alt="" width={56} height={56} style={{ margin: '0 auto', imageRendering: t.modern ? 'auto' : 'pixelated' }} />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <h1 style={{ margin: 0, fontFamily: ARCADE, fontSize: 19, lineHeight: 1.5, color: t.accent, textShadow: t.glow ? '0 0 18px rgba(7,252,3,.4)' : 'none' }}>STREAMCAST<br />PRO</h1>
                        <p style={{ margin: 0, fontFamily: 'var(--font-sans)', fontSize: 13, lineHeight: 1.6, color: t.dim }}>The message overlay for Twitch streamers. Connect your account to open the dashboard.</p>
                    </div>
                    <button onClick={onLogin} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, height: 44, appearance: 'none', cursor: 'pointer', border: 'none', background: 'var(--twitch)', color: '#fff', fontFamily: 'var(--font-sans)', fontSize: 14, fontWeight: 700, ...bevel(t) }}>
                        <TwitchIcon className="w-[18px] h-[18px]" />Connect with Twitch
                    </button>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: MONO, fontSize: 10, letterSpacing: '.12em', color: t.faint }}>
                        <StatusDot state="connected" size={7} />Service online · v{APP_VERSION}
                    </div>
                </div>
            </div>
        </div>
    );
}
