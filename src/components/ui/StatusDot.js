'use client';

const STATE_CLASSES = {
    connected: 'bg-[var(--success)] shadow-[0_0_8px_rgba(34,197,94,0.5)] animate-pulse',
    connecting: 'bg-[var(--warning)] animate-pulse',
    error: 'bg-[var(--danger)]',
    idle: 'bg-[var(--zinc-500)]',
};

export default function StatusDot({ state = 'connected', size = 8, className = '', title }) {
    return (
        <span
            title={title}
            className={`inline-block rounded-full ${STATE_CLASSES[state]} ${className}`}
            style={{ width: size, height: size }}
        />
    );
}
