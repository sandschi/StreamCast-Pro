'use client';

import { Terminal, Key, Check, Copy, RefreshCw } from 'lucide-react';
import { useApiSettingsData, REMOTE_ACTIONS } from '@/hooks/useApiSettingsData';
import Pane from './Pane';
import Field from './Field';
import ToolBtn from './ToolBtn';
import ResizableWidth from './ResizableWidth';
import { bevel, MONO, tiny, L } from './treatments';
import TextInput from '@/components/ui/TextInput';
import EmptyState from '@/components/ui/EmptyState';

export default function ApiPane({ t, d, targetUid, user, privateConfig, setPrivateConfig, isMasterAdmin, userRole }) {
    const { generatingToken, copyState, handleGenerateToken, copyApiCommand, copyTokenOnly } = useApiSettingsData({ targetUid, user, privateConfig, setPrivateConfig, isMasterAdmin, userRole });

    if (!privateConfig?.apiToken) {
        return (
            <Pane t={t} d={d} icon={<Terminal size={13} />} title="Remote Actions · Touch Portal">
                <EmptyState icon={<Terminal size={32} />} title="No API token generated yet." hint="Generate one to unlock remote-control URLs for Stream Deck, Touch Portal, or custom scripts." />
                <button onClick={handleGenerateToken} disabled={generatingToken} style={{ alignSelf: 'center', display: 'inline-flex', alignItems: 'center', gap: 8, height: 32, padding: '0 14px', appearance: 'none', cursor: 'pointer', border: 'none', background: t.accent, color: 'var(--primary-ink)', fontFamily: 'var(--font-sans)', fontSize: 12.5, fontWeight: 700, marginTop: 12, ...bevel(t) }}>
                    <Key size={14} />{generatingToken ? 'Generating…' : 'Generate API Token'}
                </button>
            </Pane>
        );
    }

    return (
        <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', gap: d.gutter }}>
            <Pane t={t} d={d} icon={<Terminal size={13} />} title="Remote Actions · Touch Portal" flush scroll>
                {REMOTE_ACTIONS.map(group => (
                    <div key={group.group} style={{ flex: 'none' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 10px', height: 24, background: t.inset, borderBottom: `1px solid ${t.hair}`, borderTop: `1px solid ${t.hair}` }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: group.tone }} />
                            <span style={{ ...tiny(t), color: t.faint }}>{L(t, group.group)}</span>
                        </div>
                        {group.items.map(item => {
                            const copied = copyState === `api-${item.action}`;
                            return (
                                <div key={item.action} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 10px', height: d.row + 10, borderBottom: `1px solid ${t.hair}`, minWidth: 0 }}>
                                    <span style={{ color: copied ? 'var(--success)' : t.accent, display: 'inline-flex', flex: 'none' }}>{copied ? <Check size={13} /> : <RefreshCw size={13} />}</span>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12.5, fontWeight: 600, color: t.text }}>{item.label}</div>
                                        <div style={{ fontFamily: MONO, fontSize: 10.5, color: t.faint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>?action={item.action}</div>
                                    </div>
                                    <button onClick={() => copyApiCommand(item.action)} style={{ height: 22, padding: '0 9px', appearance: 'none', cursor: 'pointer', border: `1px solid ${t.hair}`, background: 'transparent', color: copied ? 'var(--success)' : t.dim, flex: 'none', ...tiny(t), ...bevel(t) }}>{L(t, copied ? 'Copied' : 'Copy')}</button>
                                </div>
                            );
                        })}
                    </div>
                ))}
            </Pane>
            <ResizableWidth t={t} storageKey="sc-inspector-w" defaultWidth={d.inspector} minWidth={210} maxWidth={480} style={{ display: 'flex', flexDirection: 'column', gap: d.gutter }}>
                <Pane t={t} d={d} icon={<Key size={13} />} title="API Token">
                    <Field t={t} label="Active token">
                        <TextInput t={t} mono readOnly value={privateConfig.apiToken} />
                    </Field>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <ToolBtn t={t} icon={<RefreshCw size={12} />} onClick={handleGenerateToken}>{generatingToken ? 'Revoking…' : 'Regenerate'}</ToolBtn>
                        <ToolBtn t={t} icon={<Copy size={12} />} primary onClick={copyTokenOnly}>Copy</ToolBtn>
                    </div>
                    <span style={{ fontFamily: 'var(--font-sans)', fontSize: 11.5, color: t.faint }}>Regenerating invalidates every existing remote URL.</span>
                </Pane>
            </ResizableWidth>
        </div>
    );
}
