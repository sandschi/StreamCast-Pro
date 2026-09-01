'use client';

const TONE_CLASSES = {
    neutral: 'text-[var(--text-muted)] hover:text-zinc-200 hover:bg-zinc-800',
    success: 'text-[var(--success)] hover:bg-[var(--success)]/10',
    danger: 'text-[var(--danger)] hover:bg-[var(--danger)]/10',
    accent: 'text-[var(--primary-400)] hover:bg-[var(--accent-tint)]',
};

export default function IconButton({ icon, tone = 'neutral', title, onClick, size = 18, className = '' }) {
    const padding = size <= 14 ? 'p-1' : 'p-2';

    return (
        <button
            type="button"
            title={title}
            aria-label={title}
            onClick={onClick}
            className={`inline-flex items-center justify-center rounded-[var(--radius-md)] bg-transparent transition-all duration-200 ${padding} ${TONE_CLASSES[tone]} ${className}`}
        >
            {icon}
        </button>
    );
}
