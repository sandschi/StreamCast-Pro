'use client';

const PADDING = { md: 'py-12', lg: 'py-20' };

export default function EmptyState({ icon, title, hint, size = 'md', className = '' }) {
    return (
        <div className={`${PADDING[size]} text-center bg-zinc-900/30 border border-dashed border-zinc-800 rounded-3xl ${className}`}>
            {icon && <div className="flex justify-center text-zinc-700 mb-3">{icon}</div>}
            <p className="text-zinc-500">{title}</p>
            {hint && <p className="text-zinc-600 text-xs mt-1">{hint}</p>}
        </div>
    );
}
