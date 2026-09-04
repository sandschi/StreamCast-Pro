'use client';

export default function SectionLabel({ icon, children, className = '' }) {
    return (
        <h4 className={`text-zinc-500 text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-2 ${className}`}>
            {icon}
            {children}
        </h4>
    );
}
