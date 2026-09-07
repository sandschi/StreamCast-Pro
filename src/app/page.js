'use client';

import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Image from 'next/image';
import {
    ExternalLink, Shield, MessageSquare, ListMusic, RotateCcw, Users, Move,
    ScreenShare, EyeOff, Settings as SettingsIcon, LayoutDashboard, Monitor, Clock,
} from 'lucide-react';
import TwitchIcon from '@/components/TwitchIcon';
import Button from '@/components/ui/Button';
import Avatar from '@/components/ui/Avatar';
import MessageBubble from '@/components/overlay/MessageBubble';
import ChangelogModal from '@/components/dashboard/ChangelogModal';
import StatusDot from '@/components/ui/StatusDot';
import useServiceStatus from '@/hooks/useServiceStatus';
import { openConsentModal } from '@/lib/cookieConsent';
import { pressStart2P } from '@/lib/fonts';

const MONO = 'var(--font-mono)';
// Not var(--font-display): that CSS custom property chain silently fails to
// resolve at point-of-use in this Tailwind v4 setup (confirmed via computed
// styles - every var()-chained --font-* custom property outside an actual
// Tailwind utility class comes back empty, even though each piece resolves
// fine when queried directly). Using next/font/local's own resolved
// font-family string sidesteps it entirely and is guaranteed correct.
const ARCADE = `${pressStart2P.style.fontFamily}, var(--font-geist-sans), system-ui, sans-serif`;

// href: null means the item opens the Changelog modal; 'cookie-consent' means
// it reopens the first-party consent banner instead of navigating.
const FOOTER_LINKS = [
    ['Product', [['Overlay styles', '#overlay'], ['Dashboard', '/dashboard'], ['Status', 'https://status.sandschi.xyz']]],
    ['Community', [['Twitch', 'https://twitch.tv/sandschi'], ['Discord', 'https://d.sandschi.xyz'], ['Changelog', null]]],
    ['Legal', [['Terms', '/terms'], ['Privacy', '/privacy'], ['Contact', 'mailto:support@sandschi.xyz'], ['Cookie preferences', 'cookie-consent']]],
];
const footerLinkStyle = { fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--text-muted)' };

/* ---------- atoms ---------- */

function Eyebrow({ children, tone }) {
    return <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, letterSpacing: 'var(--ls-widest)', textTransform: 'uppercase', color: tone || 'var(--text-faint)' }}>{children}</div>;
}

function Band({ children, tint, rule = true, glow, id, size = 'lg' }) {
    return (
        <section id={id} style={{ borderTop: rule ? '1px solid ' + (glow ? 'rgba(7,252,3,.2)' : 'var(--border-subtle)') : 'none', background: tint || 'transparent' }}>
            <div className={'scl-band-' + size}>{children}</div>
        </section>
    );
}

function SectionHead({ label, title, blurb }) {
    return (
        <div className="scl-head">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 3 }}>
                <Eyebrow tone="var(--primary-500)">{label}</Eyebrow>
                <span style={{ width: 24, height: 2, background: 'var(--primary-500)' }} />
            </div>
            <div style={{ maxWidth: 700, display: 'flex', flexDirection: 'column', gap: 16 }}>
                <h2 className="scl-head-t" style={{ margin: 0, fontFamily: ARCADE, lineHeight: 1.7, fontWeight: 400, color: 'var(--text-heading)' }}>{title}</h2>
                {blurb && <p style={{ margin: 0, font: 'var(--type-body)', fontSize: 15, color: 'var(--text-muted)', textWrap: 'pretty' }}>{blurb}</p>}
            </div>
        </div>
    );
}

function Chip({ children, on, onClick, tight }) {
    return (
        <button type="button" onClick={onClick} disabled={!onClick}
            style={{
                appearance: 'none', cursor: onClick ? 'pointer' : 'default', flex: 'none', padding: tight ? '0 7px' : '0 11px', height: tight ? 24 : 27, display: 'inline-flex', alignItems: 'center', gap: 6,
                background: on ? 'rgba(7,252,3,.1)' : 'transparent', border: '1px solid ' + (on ? 'var(--primary-500)' : 'var(--border-strong)'),
                color: on ? 'var(--primary-400)' : 'var(--text-muted)', fontFamily: MONO, fontSize: tight ? 9.5 : 11, fontWeight: 600, letterSpacing: tight ? '.04em' : '.06em', textTransform: 'uppercase', whiteSpace: 'nowrap',
                transition: 'color var(--dur-fast) var(--ease-standard),border-color var(--dur-fast) var(--ease-standard)'
            }}>{children}</button>
    );
}

function Chrome({ title, right, children, aspect, pad, flush }) {
    return (
        <div style={{ border: '1px solid var(--border-control)', background: 'var(--zinc-950)', boxShadow: '0 26px 64px -26px rgba(0,0,0,.9)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 30, padding: '0 10px', background: 'var(--zinc-900)', borderBottom: '1px solid var(--border-strong)' }}>
                <div style={{ display: 'flex', gap: 5 }}>{[0, 1, 2].map(i => <span key={i} style={{ width: 9, height: 9, border: '1px solid var(--zinc-700)' }} />)}</div>
                <span style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text-faint)' }}>{title}</span>
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>{right}</div>
            </div>
            <div style={{ position: 'relative', aspectRatio: aspect, padding: flush ? 0 : pad }}>{children}</div>
        </div>
    );
}

function CapRow({ n, icon, title, body }) {
    return (
        <div style={{ display: 'grid', gridTemplateColumns: '32px 24px 1fr', gap: 14, alignItems: 'start', padding: '17px 0', borderBottom: '1px solid var(--border-hairline)' }}>
            <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--primary-700)', paddingTop: 3 }}>{n}</span>
            <span style={{ color: 'var(--primary-500)', paddingTop: 1 }}>{icon}</span>
            <div>
                <div style={{ font: 'var(--type-label)', fontSize: 13.5, color: 'var(--text-heading)', marginBottom: 4 }}>{title}</div>
                <div style={{ font: 'var(--type-body)', fontSize: 13, color: 'var(--text-muted)', textWrap: 'pretty' }}>{body}</div>
            </div>
        </div>
    );
}

/* ---------- data ---------- */

const STYLES = [
    ['classic', 'Classic', 'rgba(147,51,234,.9)'],
    ['glass', 'Glass', 'rgba(147,51,234,.9)'],
    ['neon', 'Neon', 'var(--primary-600)'],
    ['cyberpunk', 'Cyberpunk', 'var(--cyber-red)'],
    ['comic', 'Comic', 'var(--warning)'],
    ['retro', 'Retro', 'var(--primary-600)'],
    ['future', 'Future', 'var(--future-blue)'],
    ['bold', 'Bold', 'var(--info)'],
    ['minimal', 'Minimal', 'transparent'],
];

// Per-style font pairing for the hero preview only — a demo flourish, not a
// change to how the real overlay/dashboard picks fonts (broadcasters choose
// their own font independently of bubble style there, on purpose). 'Press
// Start 2P' is the app's own local font (loaded site-wide via layout.js);
// every other entry is a real Google Font loaded on demand, matching the
// same technique the overlay itself already uses for its fontFamily setting.
const STYLE_FONTS = {
    classic: 'Inter',
    glass: 'Poppins',
    neon: 'Monoton',
    cyberpunk: 'Oswald',
    comic: 'Bangers',
    retro: 'Press Start 2P',
    future: 'Ubuntu',
    bold: 'Montserrat',
    minimal: 'Raleway',
};

const CAPS = [
    ['01', <MessageSquare key="i" size={17} />, 'Live chat on stream', 'Twitch messages appear over your video, emotes intact.'],
    ['02', <Shield key="i" size={17} />, 'Approve before it airs', 'Nothing reaches the overlay until you or a moderator clears it.'],
    ['03', <Users key="i" size={17} />, 'Moderators with real roles', 'Invite mods by link. Role gating is enforced server-side, not hidden in the UI.'],
    ['04', <ListMusic key="i" size={17} />, 'KaraFun song queue', 'Pull the party queue in and show who is singing next, live on the overlay.'],
    ['05', <RotateCcw key="i" size={17} />, 'Full message history', 'Every message kept and searchable. Re-air any of them with one click.'],
    ['06', <Move key="i" size={17} />, 'Pixel positioning', 'Place the bubble anywhere in the 16:9 frame and save it per scene.'],
];

const TABS = ['Overview', 'Chat', 'Queue', 'History', 'Users', 'Overlay', 'Settings'];

const ROWS = [
    ['sandschi', 'MOD', 'pushing this one to the overlay in a sec', '21:04', 'live'],
    ['lurker42', '—', 'first time caller, long time lurker', '21:05', 'ok'],
    ['nightowl', '—', 'the retro bubble style goes hard', '21:06', 'ok'],
    ['kbmods', 'MOD', 'queue is open for the next 20 minutes', '21:07', 'ok'],
    ['pixelpanda', '—', 'can we get Africa on the karafun list', '21:08', 'hold'],
];

const RAIL_ICONS = [
    <LayoutDashboard key="0" size={15} />, <MessageSquare key="1" size={15} />, <ListMusic key="2" size={15} />,
    <RotateCcw key="3" size={15} />, <Users key="4" size={15} />, <Monitor key="5" size={15} />, <SettingsIcon key="6" size={15} />,
];

export default function Home() {
    const { user, loginWithTwitch, loading } = useAuth();
    const router = useRouter();
    const [style, setStyle] = useState('retro');
    const [showChangelog, setShowChangelog] = useState(false);
    const serviceStatus = useServiceStatus();
    const active = STYLES.find(s => s[0] === style) || STYLES[0];
    const previewFont = STYLE_FONTS[style] || 'Inter';

    // Load whichever Google Font the current style is paired with, same
    // technique the real overlay uses for its own fontFamily setting — skip
    // the network fetch for Press Start 2P, since that one is already loaded
    // locally site-wide.
    useEffect(() => {
        if (previewFont === 'Press Start 2P') return;
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = `https://fonts.googleapis.com/css2?family=${previewFont.replace(/\s+/g, '+')}:wght@400;700;900&display=swap`;
        document.head.appendChild(link);
        return () => { document.head.removeChild(link); };
    }, [previewFont]);

    useEffect(() => {
        if (user && !loading) {
            router.push('/dashboard');
        }
    }, [user, loading, router]);

    if (loading) {
        return (
            <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
                <div className="w-12 h-12 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (user) {
        return null; // Will redirect via useEffect
    }

    const navLink = { fontFamily: MONO, fontSize: 11, letterSpacing: '.07em', textTransform: 'uppercase', color: 'var(--text-muted)', cursor: 'pointer' };

    return (
        <div style={{ background: 'var(--bg-app)', color: 'var(--text-body)', minHeight: '100vh' }}>

            {/* Title bar — the app's own chrome, not a marketing header */}
            <div style={{ position: 'sticky', top: 0, zIndex: 20, height: 52, background: 'rgba(10,10,10,.86)', backdropFilter: 'var(--blur-md)', borderBottom: '1px solid var(--border-subtle)' }}>
                <div className="scl-topbar">
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                        <Image src="/logo-wordmark.svg" alt="StreamCast Pro" width={93} height={26} />
                    </div>
                    <nav className="scl-nav">
                        <a href="#overlay" style={navLink}>Overlay</a>
                        <a href="#dashboard" style={navLink}>Dashboard</a>
                        <a href="#access" style={navLink}>Access</a>
                    </nav>
                    <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 18 }}>
                        <span className="scl-beta" style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: '.07em', textTransform: 'uppercase', color: 'var(--text-faint)' }}>Free during beta</span>
                        <Button variant="twitch" size="sm" icon={<TwitchIcon className="w-3.5 h-3.5" />} onClick={loginWithTwitch}>Connect</Button>
                    </div>
                </div>
            </div>

            {/* Hero — copy left, live product right */}
            <section id="overlay" className="scl-hero">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
                    <Eyebrow>A Pervtown product</Eyebrow>
                    <h1 className="scl-h1" style={{ margin: 0, fontFamily: ARCADE, lineHeight: 1.5, fontWeight: 400, color: 'var(--text-heading)' }}>
                        PUT CHAT<br /><span style={{ color: 'var(--primary-500)' }}>ON STREAM</span>
                    </h1>
                    <p style={{ margin: 0, font: 'var(--type-body)', fontSize: 16, lineHeight: 1.65, color: 'var(--text-muted)', textWrap: 'pretty' }}>
                        A Twitch chat overlay, a KaraFun queue and a moderation dashboard. Approve a message, it appears on your stream. Built by a streamer who needed it.
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
                        <Button size="lg" icon={<TwitchIcon className="w-[18px] h-[18px]" />} onClick={loginWithTwitch}>Connect with Twitch</Button>
                        <a href="#dashboard" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: MONO, fontSize: 11, letterSpacing: '.07em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                            See the dashboard <ExternalLink size={13} />
                        </a>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 4, fontFamily: MONO, fontSize: 10.5, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--text-faint)' }}>
                        <Shield size={13} /> Manual approval · No card · No cost
                    </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <Chrome aspect="16/9" title="OBS · Browser Source · 1920×1080"
                        right={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: MONO, fontSize: 10, letterSpacing: '.1em', color: 'var(--danger)' }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--danger)', animation: 'sc-blink 1.2s steps(2,end) infinite' }} />LIVE</span>}>
                        <Image src="/scene-preview.png" alt="" fill sizes="(max-width: 768px) 100vw, 640px" style={{ objectFit: 'cover' }} />
                        <div style={{ position: 'absolute', inset: 0, fontFamily: style === 'retro' ? pressStart2P.style.fontFamily : `'${previewFont}', sans-serif` }}>
                            <MessageBubble
                                message={{ id: 'hero-demo', username: 'nightowl', color: active[2], fragments: [{ type: 'text', content: 'the retro bubble style goes hard' }] }}
                                settings={{
                                    bubbleStyle: style, posX: 4, posY: 96, borderRadius: 9, animationStyle: 'fade',
                                    fontSize: 13, nameSize: 10, avatarSize: 26, showAvatar: style !== 'minimal',
                                    textColor: '#ffffff', strokeColor: '#000000',
                                }}
                            />
                        </div>
                    </Chrome>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, letterSpacing: 'var(--ls-widest)', textTransform: 'uppercase', color: 'var(--text-faint)', flex: 'none' }}>Style</span>
                        <div style={{ display: 'flex', gap: 5, overflowX: 'auto', paddingBottom: 2 }} className="sc-xscroll">
                            {STYLES.map(([id, label]) => <Chip key={id} tight on={style === id} onClick={() => setStyle(id)}>{label}</Chip>)}
                        </div>
                    </div>
                </div>
            </section>

            {/* Dashboard — the real chrome, cropped */}
            <Band id="dashboard">
                <SectionHead label="The dashboard"
                    title="A CONTROL SURFACE, NOT A WEBSITE."
                    blurb="Seven panes, a menu bar, a status bar and dense tables. It runs beside OBS on a second monitor, so it is built like a broadcast tool: keyboard-first, no scroll-hunting, every row actionable." />
                <div className="scl-row">
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {TABS.map(t => <Chip key={t} tight on={t === 'Chat'}>{t}</Chip>)}
                    </div>
                    <div className="scl-xwrap sc-xscroll">
                        <div className="scl-xinner">
                            <Chrome title="StreamCast Pro — sandschi" flush
                                right={<span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--primary-500)' }}>● CONNECTED</span>}>
                                <div style={{ display: 'flex', gap: 8, padding: '0 10px', height: 28, alignItems: 'center', borderBottom: '1px solid var(--border-hairline)', background: 'var(--zinc-900)' }}>
                                    {['File', 'Overlay', 'Chat', 'Queue', 'Help'].map(m => (
                                        <span key={m} style={{ fontFamily: 'var(--font-sans)', fontSize: 11.5, color: 'var(--text-muted)', padding: '0 6px' }}>{m}</span>
                                    ))}
                                </div>
                                <div style={{ display: 'flex', minHeight: 268 }}>
                                    <div style={{ width: 46, flex: 'none', borderRight: '1px solid var(--border-hairline)', background: 'var(--zinc-900)', padding: '8px 0', display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'center' }}>
                                        {RAIL_ICONS.map((ic, i) => (
                                            <span key={i} style={{ position: 'relative', width: 32, height: 30, display: 'grid', placeItems: 'center', color: i === 1 ? 'var(--primary-500)' : 'var(--text-faint)', background: i === 1 ? 'rgba(7,252,3,.07)' : 'transparent' }}>
                                                {i === 1 && <span style={{ position: 'absolute', left: 0, top: 6, bottom: 6, width: 2, background: 'var(--primary-500)' }} />}
                                                {ic}
                                            </span>
                                        ))}
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 30, padding: '0 12px', borderBottom: '1px solid var(--border-hairline)' }}>
                                            <MessageSquare size={13} />
                                            <span style={{ font: 'var(--type-label)', fontSize: 11.5, color: 'var(--text-heading)' }}>Chat · 5 pending</span>
                                            <span style={{ marginLeft: 'auto', fontFamily: MONO, fontSize: 10, color: 'var(--text-faint)' }}>AUTO-APPROVE OFF</span>
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '128px 46px 1fr 52px 68px', alignItems: 'center', gap: 10, height: 22, padding: '0 12px', background: 'var(--surface-inset)', borderBottom: '1px solid var(--border-hairline)', fontFamily: MONO, fontSize: 9.5, letterSpacing: '.1em', color: 'var(--text-faint)' }}>
                                            <span>USER</span><span>ROLE</span><span>MESSAGE</span><span>TIME</span><span />
                                        </div>
                                        {ROWS.map(([u, role, text, time, state]) => (
                                            <div key={u} style={{ display: 'grid', gridTemplateColumns: '128px 46px 1fr 52px 68px', alignItems: 'center', gap: 10, height: 38, padding: '0 12px', borderBottom: '1px solid var(--border-hairline)', background: state === 'live' ? 'rgba(7,252,3,.05)' : 'transparent' }}>
                                                <span style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                                                    <Avatar size={18} />
                                                    <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 600, color: state === 'live' ? 'var(--primary-400)' : 'var(--text-body)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u}</span>
                                                </span>
                                                <span style={{ fontFamily: MONO, fontSize: 9.5, color: role === 'MOD' ? 'var(--success)' : 'var(--zinc-700)' }}>{role}</span>
                                                <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{text}</span>
                                                <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--text-faint)' }}>{time}</span>
                                                <span style={{ display: 'flex', justifyContent: 'flex-end', gap: 4, color: 'var(--text-faint)' }}>
                                                    {state === 'live'
                                                        ? <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.1em', color: 'var(--primary-500)' }}>ON AIR</span>
                                                        : <>
                                                            <ScreenShare size={13} /><EyeOff size={13} />
                                                        </>}
                                                </span>
                                            </div>
                                        ))}
                                        <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 14, height: 24, padding: '0 12px', borderTop: '1px solid var(--border-hairline)', background: 'var(--zinc-900)', fontFamily: MONO, fontSize: 9.5, letterSpacing: '.08em', color: 'var(--text-faint)' }}>
                                            <span style={{ color: 'var(--primary-500)' }}>● TWITCH OK</span><span>LATENCY 180MS</span><span>QUEUE 12</span>
                                            <span style={{ marginLeft: 'auto' }}>SAVED 21:08</span>
                                        </div>
                                    </div>
                                </div>
                            </Chrome>
                        </div>
                    </div>
                </div>
            </Band>

            {/* Capabilities — dense list, two columns */}
            <Band>
                <SectionHead label="What it does" title="SIX THINGS, DONE PROPERLY." />
                <div className="scl-caps">
                    {CAPS.map(([n, ic, t, b]) => <CapRow key={n} n={n} icon={ic} title={t} body={b} />)}
                </div>
            </Band>

            {/* Access — honest about the gate */}
            <Band id="access" size="md" tint="var(--surface-inset)">
                <SectionHead label="Getting in" title="APPROVAL IS MANUAL. ON PURPOSE."
                    blurb="Every account is reviewed by hand so the overlay network stays small and abuse stays rare. Expect about a week." />
                <div className="scl-row">
                    <span className="scl-spacer" />
                    <div className="scl-steps">
                        {[['01', <TwitchIcon key="i" className="w-[15px] h-[15px]" />, 'Connect', 'OAuth only. No password ever touches us.'],
                        ['02', <Clock key="i" size={15} />, 'Reviewed', 'Sandschi reads every application personally.'],
                        ['03', <ScreenShare key="i" size={15} />, 'Go live', 'Paste one URL into OBS and you are on.']].map(([n, ic, t, b]) => (
                            <div key={n} style={{ flex: 1, padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 9 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                                    <span style={{ fontFamily: MONO, fontSize: 10.5, color: 'var(--primary-600)' }}>{n}</span>
                                    <span style={{ color: 'var(--primary-500)' }}>{ic}</span>
                                    <span style={{ font: 'var(--type-label)', fontSize: 13, color: 'var(--text-heading)' }}>{t}</span>
                                </div>
                                <div style={{ font: 'var(--type-body)', fontSize: 12.5, color: 'var(--text-muted)', textWrap: 'pretty' }}>{b}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </Band>

            {/* CTA */}
            <Band glow tint="rgba(0,51,0,.22)" size="md">
                <div className="scl-cta">
                    <div className="scl-cta-main" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <h2 className="scl-cta-h2" style={{ margin: 0, fontFamily: ARCADE, lineHeight: 1.65, fontWeight: 400, color: 'var(--text-heading)' }}>
                            READY TO PUT<br /><span style={{ color: 'var(--primary-500)' }}>CHAT ON STREAM?</span>
                        </h2>
                        <span style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: '.07em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Free during beta</span>
                    </div>
                    <Button size="lg" icon={<TwitchIcon className="w-[18px] h-[18px]" />} onClick={loginWithTwitch}>Connect with Twitch</Button>
                </div>
            </Band>

            {/* Footer */}
            <footer style={{ borderTop: '1px solid var(--border-subtle)' }}>
                <div className="scl-foot">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                            <Image src="/logo-icon-transparent.svg" alt="" width={23} height={20} />
                            <span style={{ fontFamily: ARCADE, fontSize: 10, color: 'var(--text-heading)' }}>PERVTOWN</span>
                        </div>
                        <p style={{ margin: 0, font: 'var(--type-body)', fontSize: 12.5, maxWidth: 300, color: 'var(--text-faint)', textWrap: 'pretty' }}>
                            StreamCast Pro is a Pervtown product. Small tools for small streams, run by the people who use them.
                        </p>
                    </div>
                    {FOOTER_LINKS.map(([h, items]) => (
                        <div key={h} style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                            <Eyebrow>{h}</Eyebrow>
                            {items.map(([label, href]) => href === null ? (
                                <button key={label} type="button" onClick={() => setShowChangelog(true)}
                                    style={{ ...footerLinkStyle, appearance: 'none', border: 'none', background: 'transparent', padding: 0, textAlign: 'left', cursor: 'pointer' }}>{label}</button>
                            ) : href === 'cookie-consent' ? (
                                <button key={label} type="button" onClick={openConsentModal}
                                    style={{ ...footerLinkStyle, appearance: 'none', border: 'none', background: 'transparent', padding: 0, textAlign: 'left', cursor: 'pointer' }}>{label}</button>
                            ) : (
                                <a key={label} href={href} style={footerLinkStyle} {...(href.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{label}</a>
                            ))}
                        </div>
                    ))}
                </div>
                <div className="scl-footbar" style={{ borderTop: '1px solid var(--border-hairline)', display: 'flex', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap', fontFamily: MONO, fontSize: 10, letterSpacing: '.07em', textTransform: 'uppercase', color: 'var(--zinc-700)' }}>
                    <span>© 2026 Pervtown</span><span>Built for the Twitch community</span>
                    <a href="https://status.sandschi.xyz" target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 7, color: 'var(--zinc-700)' }}>
                        {serviceStatus ? (
                            <>
                                <StatusDot state={serviceStatus.status === 'Up' ? 'connected' : serviceStatus.status === 'Pending' ? 'connecting' : 'error'} size={6} />
                                Overlay service {serviceStatus.status}{serviceStatus.ping ? ` · ${serviceStatus.ping}` : ''}
                            </>
                        ) : (
                            <>
                                <StatusDot state="idle" size={6} />
                                Overlay service status
                            </>
                        )}
                    </a>
                </div>
            </footer>
            <ChangelogModal open={showChangelog} onClose={() => setShowChangelog(false)} />
        </div>
    );
}
