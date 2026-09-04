// Four visual skins over one identical layout, ported from
// Designsystem/templates/dashboard-app-shell/AppShell.jsx.
// `phosphor` is the arcade lean-in: CRT green, bevelled panel corners, scanlined chrome.
export const TREATMENTS = {
    // The design system's default: soft radii, tonal glass surfaces, primary-green glow.
    carbon: { app: '#09090b', chrome: '#121215', pane: 'rgba(24,24,27,.55)', inset: 'rgba(39,39,42,.3)', hair: 'rgba(255,255,255,.05)', edge: 'rgba(63,63,70,.55)', text: '#f4f4f5', dim: '#a1a1aa', faint: '#71717a', accent: 'var(--primary-500)', bevel: 0, glow: 1, scan: 0, round: 12 },
    // Modern desktop app: neutral surfaces, soft radii, sans labels, accent only where something is live.
    graphite: { app: '#0d0d10', chrome: '#15151a', pane: '#1a1a20', inset: '#141419', hair: 'rgba(255,255,255,.065)', edge: 'rgba(255,255,255,.12)', text: '#f1f1f4', dim: '#9c9ca6', faint: '#71717c', accent: 'var(--primary-500)', bevel: 0, glow: 0, scan: 0, round: 9, modern: 1, shadow: 1 },
    slate: { app: '#101013', chrome: '#16161a', pane: '#1a1a1e', inset: '#141417', hair: 'rgba(255,255,255,.06)', edge: 'rgba(255,255,255,.13)', text: '#e6e6ea', dim: '#8e8e98', faint: '#6a6a74', accent: 'var(--primary-500)', bevel: 0, glow: 0, scan: 0 },
    phosphor: { app: '#070907', chrome: '#0b0f0b', pane: '#0c110c', inset: '#0a0e0a', hair: 'rgba(7,252,3,.13)', edge: 'rgba(7,252,3,.26)', text: '#cdf6c9', dim: '#5f8d5c', faint: '#436540', accent: 'var(--primary-500)', bevel: 6, glow: 1, scan: 1 },
};

export const MONO = 'var(--font-mono)';

// Bevelled corners (top-left + bottom-right) — the arcade panel shape.
export const bevel = (t) => t.bevel ? { clipPath: `polygon(${t.bevel}px 0,100% 0,100% calc(100% - ${t.bevel}px),calc(100% - ${t.bevel}px) 100%,0 100%,0 ${t.bevel}px)`, borderRadius: 0 } : { borderRadius: (t.round || 0) };
export const scan = (t) => t.scan ? { backgroundImage: 'repeating-linear-gradient(180deg,rgba(255,255,255,.035) 0 1px,transparent 1px 3px)' } : {};
// Mono all-caps micro-labels read as a terminal; modern treatments use sans sentence case.
export const lbl = (t) => t.modern ? { fontFamily: 'var(--font-sans)', fontSize: 11.5, fontWeight: 600, letterSpacing: '0' } : { fontFamily: MONO, fontSize: 10.5, letterSpacing: '.15em' };
export const tiny = (t) => t.modern ? { fontFamily: 'var(--font-sans)', fontSize: 10.5, fontWeight: 600, letterSpacing: '.02em' } : { fontFamily: MONO, fontSize: 9.5, letterSpacing: '.14em' };
export const L = (t, str) => t.modern ? str : str.toUpperCase();

export function Dot({ tone, pulse }) {
    return <span style={{ width: 7, height: 7, flex: 'none', borderRadius: '50%', background: tone, boxShadow: `0 0 8px ${tone}`, animation: pulse ? 'sc-blink 1.1s steps(2,end) infinite' : 'none' }} />;
}

export const CONN = {
    connected: { tone: 'var(--primary-500)', status: 'IRC connected', short: 'Connected' },
    reconnecting: { tone: 'var(--warning)', status: 'Reconnecting…', short: 'Reconnecting' },
    disconnected: { tone: 'var(--danger)', status: 'Disconnected', short: 'Disconnected' },
};
