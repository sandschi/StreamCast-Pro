'use client';

// Generic dense data row — most panes hand-roll their own row markup for
// column-specific grid layouts, but this covers simple cases.
export default function Row({ t, d, cells, actions, tone }) {
    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: 10, height: d.row + 6, padding: '0 10px', borderBottom: `1px solid ${t.hair}`,
            borderLeft: `2px solid ${tone || 'transparent'}`, fontFamily: 'var(--font-sans)', fontSize: 12.5, color: t.text
        }}>
            {cells}<span style={{ flex: 1 }} />{actions}
        </div>
    );
}
