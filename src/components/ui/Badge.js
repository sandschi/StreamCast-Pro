'use client';

const TONE_CLASSES = {
    accent: { tint: 'bg-[var(--accent-tint)] text-[var(--primary-400)] border-[var(--accent-border)]', solid: 'bg-[var(--primary-500)] text-black border-transparent shadow-[var(--shadow-glow-pill)]' },
    success: { tint: 'bg-[var(--success-alt)]/10 text-[var(--success-alt)] border-[var(--success-alt)]/20', solid: 'bg-[var(--success-alt)] text-white border-transparent' },
    warning: { tint: 'bg-[var(--warning)]/10 text-[var(--warning)] border-[var(--warning)]/20', solid: 'bg-[var(--warning)] text-black border-transparent' },
    danger: { tint: 'bg-[var(--danger)]/10 text-[var(--danger)] border-[var(--danger)]/20', solid: 'bg-[var(--danger)] text-white border-transparent' },
    neutral: { tint: 'bg-[var(--surface-card)] text-[var(--text-muted)] border-[var(--border-strong)]', solid: 'bg-[var(--zinc-700)] text-white border-transparent' },
};

export default function Badge({ tone = 'neutral', solid = false, icon, size = 'md', children, className = '' }) {
    const sizeClasses = size === 'sm' ? 'px-2 py-[2px] text-[10px]' : 'px-4 py-1.5 text-xs';

    return (
        <span
            className={`inline-flex items-center gap-2 rounded-full border font-black uppercase tracking-widest whitespace-nowrap ${sizeClasses} ${solid ? TONE_CLASSES[tone].solid : TONE_CLASSES[tone].tint} ${className}`}
        >
            {icon}
            {children}
        </span>
    );
}
