'use client';

const SIZE_CLASSES = {
    sm: 'px-4 py-[6px] text-[10px]',
    md: 'px-6 py-[10px] text-xs',
    lg: 'px-10 py-5 text-base',
};

const VARIANT_CLASSES = {
    primary: 'bg-[var(--primary-500)] text-[var(--text-on-primary)] border border-[var(--primary-500)] shadow-[var(--shadow-glow-primary)] hover:shadow-[var(--shadow-glow-primary-hover)]',
    secondary: 'bg-[var(--zinc-800)] text-[var(--zinc-200)] border border-[var(--zinc-600)]',
    ghost: 'bg-transparent text-[var(--text-faint)] border border-[var(--border-strong)]',
    danger: 'bg-[var(--danger)] text-white border border-[var(--danger)] shadow-[var(--shadow-glow-danger)]',
    twitch: 'bg-[var(--twitch)] text-white border border-[var(--twitch)] shadow-[0_10px_30px_-8px_rgba(145,70,255,0.6)]',
};

export default function Button({
    variant = 'primary',
    size = 'md',
    icon,
    disabled = false,
    full = false,
    children,
    onClick,
    title,
    type = 'button',
    className = '',
}) {
    return (
        <button
            type={type}
            onClick={onClick}
            disabled={disabled}
            title={title}
            className={`${full ? 'flex w-full' : 'inline-flex'} items-center justify-center gap-2 rounded-[var(--radius-action)] font-bold uppercase tracking-tight transition-all duration-300 hover:-translate-y-0.5 active:translate-y-0 active:scale-95 disabled:opacity-50 disabled:pointer-events-none ${SIZE_CLASSES[size]} ${VARIANT_CLASSES[variant]} ${className}`}
        >
            {icon}
            {children}
        </button>
    );
}
