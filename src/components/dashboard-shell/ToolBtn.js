export default function ToolBtn({ t, icon, children, primary, onClick }) {
    return (
        <button onClick={onClick} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, height: 24, padding: '0 9px', appearance: 'none', cursor: 'pointer',
            border: `1px solid ${primary ? 'transparent' : t.edge}`, background: primary ? t.accent : 'transparent', color: primary ? 'var(--primary-ink)' : t.text,
            fontFamily: 'var(--font-sans)', fontSize: 11.5, fontWeight: 600, borderRadius: t.round ? 6 : 0,
            boxShadow: primary && t.glow ? '0 0 16px -2px rgba(7,252,3,.55)' : 'none'
        }}>
            {icon}{children}
        </button>
    );
}
