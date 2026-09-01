'use client';

export default function NavItem({ icon, label, active = false, onClick }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`nav-item ${active ? 'nav-item-active' : ''}`}
        >
            {icon}
            <span>{label}</span>
        </button>
    );
}
