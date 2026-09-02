'use client';

import { L } from './treatments';

export const SETTINGS_SECTIONS = [['dashboard', 'Dashboard'], ['overlay', 'Overlay appearance'], ['sound', 'Sound & integrations']];

// Real tabs — flat background, a 2px accent bar on top of the active item
// instead of a full border box — the same visual language as the
// dashboard's own top nav (NavTabStrip.js), sized to sit inline in the
// workspace header row rather than as a block of its own.
export default function SectionTabs({ t, sections = SETTINGS_SECTIONS, active, onChange }) {
    return (
        <div style={{ flex: 'none', display: 'flex', alignItems: 'stretch', height: '100%', gap: 1 }}>
            {sections.map(([id, label]) => {
                const on = active === id;
                return (
                    <button key={id} onClick={() => onChange(id)}
                        style={{
                            display: 'flex', alignItems: 'center', padding: '0 12px', appearance: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                            borderLeft: `1px solid ${on ? t.hair : 'transparent'}`, borderRight: `1px solid ${on ? t.hair : 'transparent'}`,
                            borderTop: `2px solid ${on ? t.accent : 'transparent'}`, borderBottom: 'none',
                            background: on ? t.pane : 'transparent', color: on ? t.text : t.dim,
                            fontFamily: 'var(--font-sans)', fontSize: 12.5, fontWeight: on ? 700 : 500,
                        }}>{L(t, label)}</button>
                );
            })}
        </div>
    );
}
