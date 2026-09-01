'use client';

const VARIANT_STYLES = {
    glass: { background: 'var(--surface-panel)', backdropFilter: 'var(--blur-xl)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-panel)' },
    card: { background: 'var(--surface-card)', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-card)' },
    inset: { background: 'var(--surface-inset)', border: '1px solid var(--border-hairline)', borderRadius: 'var(--radius-card)' },
    solid: { background: 'var(--surface-raised)', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-panel)' },
};

export default function GlassPanel({ variant = 'glass', padding = 'p-5', children, className = '', style }) {
    return (
        <div className={`${padding} ${className}`} style={{ ...VARIANT_STYLES[variant], ...style }}>
            {children}
        </div>
    );
}
