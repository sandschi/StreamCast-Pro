'use client';

import { useAuth } from '@/context/AuthContext';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useSettingsData, SOUNDS } from '@/hooks/useSettingsData';
import { Settings as SettingsIcon, Save, Send, XCircle, Sparkles, Move } from 'lucide-react';
import Pane from './Pane';
import Field from './Field';
import ToolBtn from './ToolBtn';
import ResizableBox from './ResizableBox';
import ResizableWidth from './ResizableWidth';
import { TREATMENTS, bevel, tiny, L } from './treatments';
import TextInput from '@/components/ui/TextInput';
import Select from '@/components/ui/Select';
import RangeSlider from '@/components/ui/RangeSlider';
import ToggleSwitch from '@/components/ui/ToggleSwitch';
import StyleTile from '@/components/ui/StyleTile';
import MessageBubble from '@/components/overlay/MessageBubble';

const FONTS = ['Inter', 'Roboto', 'Poppins', 'Montserrat', 'Oswald', 'Ubuntu', 'Raleway', 'Playfair Display', 'Bangers', 'Pacifico', 'Monoton'];
const STYLES = [['classic', 'Classic'], ['glass', 'Glass'], ['neon', 'Neon'], ['minimal', 'Minimal'], ['bold', 'Bold'], ['cyberpunk', 'Cyber'], ['comic', 'Comic'], ['retro', 'Retro'], ['future', 'Future']];
const TREATMENT_IDS = [['carbon', 'Carbon'], ['graphite', 'Graphite'], ['slate', 'Slate'], ['phosphor', 'Phosphor']];

// MessageBubble is position:absolute (built for the full-screen overlay) so it
// never contributes to a parent's layout size on its own, and measuring the
// visible (already-scaled) copy back out proved unreliable in practice. So this
// renders a second, invisible copy at true scale purely to measure — position:fixed
// takes it out of any clipped/overflow ancestor, and it's never transformed itself,
// so offsetWidth/offsetHeight always reflect its real, natural footprint.
function ScaledBubblePreview({ message, settings, boxWidth, boxHeight }) {
    const measureRef = useRef(null);
    const [natural, setNatural] = useState({ width: 0, height: 0 });

    useEffect(() => {
        // MessageBubble is itself position:absolute, so this wrapper never sizes
        // to it — observe the bubble's own root node (the wrapper's only child)
        // instead. A real ResizeObserver subscription (rather than measuring and
        // setState-ing straight in an effect body) also re-fires on its own
        // whenever that node's size changes for any reason.
        const el = measureRef.current?.firstElementChild;
        if (!el || typeof ResizeObserver === 'undefined') return;
        const ro = new ResizeObserver(() => {
            setNatural({ width: el.offsetWidth, height: el.offsetHeight });
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, [message, settings]);

    // Purely derived from state already being tracked — no effect needed.
    const scale = useMemo(() => {
        if (!natural.width || !natural.height || !boxWidth || !boxHeight) return 1;
        return Math.min(1, boxWidth / natural.width, boxHeight / natural.height);
    }, [natural, boxWidth, boxHeight]);

    const bubbleSettings = { ...settings, posX: 0, posY: 0 };
    return (
        <>
            {/* MessageBubble's inner divs use Tailwind's transition-all duration-500,
                so a settings change (e.g. font size) animates smoothly instead of
                snapping — this hidden copy exists purely to measure, so it needs the
                FINAL size immediately; the override below forces it to skip that
                transition, or every measurement would read a mid-animation size. */}
            <div className="sc-measure-instant" style={{ position: 'fixed', left: -9999, top: -9999, visibility: 'hidden', pointerEvents: 'none' }}>
                <div ref={measureRef} style={{ position: 'relative' }}>
                    <MessageBubble message={message} settings={bubbleSettings} />
                </div>
            </div>
            <style>{`.sc-measure-instant, .sc-measure-instant * { transition: none !important; animation: none !important; }`}</style>
            <div style={{ position: 'absolute', left: 0, top: 0, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
                <MessageBubble message={message} settings={bubbleSettings} />
            </div>
        </>
    );
}

export default function SettingsPane({ t, d, targetUid, isModeratorMode, uiScale, setUiScale }) {
    const { user } = useAuth();
    const {
        effectiveUid, settings, updateSetting, updateAppearanceSetting,
        twitchUsername, setTwitchUsername, saving, activeMessage,
        handleSave, sendTestOverlay, hideOverlay,
    } = useSettingsData({ targetUid, isModeratorMode });

    const previewMessage = { id: 'preview', username: user?.displayName || 'PreviewUser', color: 'var(--primary-500)', avatarUrl: user?.photoURL, fragments: [{ type: 'text', content: 'Settings looks good!' }] };
    const canHide = activeMessage && (user?.uid === effectiveUid || isModeratorMode);

    const previewBoxRef = useRef(null);
    const [previewBoxSize, setPreviewBoxSize] = useState({ width: 0, height: 0 });
    useLayoutEffect(() => {
        const el = previewBoxRef.current;
        if (!el || typeof ResizeObserver === 'undefined') return;
        // The absolutely-positioned bubble's containing block is this element's
        // padding box, not its content box — measure via getBoundingClientRect
        // (border box; there's no border here) rather than entry.contentRect,
        // which excludes padding and would under-report the space it actually has.
        const ro = new ResizeObserver(() => {
            const rect = el.getBoundingClientRect();
            setPreviewBoxSize({ width: rect.width, height: rect.height });
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    return (
        <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', gap: d.gutter }}>
            <Pane t={t} d={d} icon={<SettingsIcon size={13} />} title="Overlay Customization"
                actions={<>
                    {canHide && <ToolBtn t={t} icon={<XCircle size={12} />} onClick={hideOverlay}>Hide</ToolBtn>}
                    <ToolBtn t={t} icon={<Send size={12} />} onClick={() => sendTestOverlay(false)}>Test</ToolBtn>
                    <ToolBtn t={t} icon={<Send size={12} />} onClick={() => sendTestOverlay(true)}>Send ∞</ToolBtn>
                    <ToolBtn t={t} icon={<Save size={12} />} primary onClick={handleSave}>{saving ? 'Saving…' : 'Save'}</ToolBtn>
                </>}>

                <Field t={t} label="Appearance" hint="Applies to this dashboard immediately — your stream overlay is unaffected.">
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
                        {TREATMENT_IDS.map(([id, label]) => {
                            const th = TREATMENTS[id], on = settings.dashboardTreatment === id;
                            return (
                                <button key={id} onClick={() => updateAppearanceSetting('dashboardTreatment', id)}
                                    style={{
                                        padding: 0, appearance: 'none', cursor: 'pointer', textAlign: 'left', overflow: 'hidden',
                                        border: `1px solid ${on ? t.accent : t.hair}`, background: 'transparent',
                                        boxShadow: on && t.glow ? '0 0 14px -2px rgba(7,252,3,.45)' : 'none', ...bevel(t)
                                    }}>
                                    <span style={{ display: 'block', height: 34, background: th.app, borderBottom: `1px solid ${th.edge}`, position: 'relative' }}>
                                        <span style={{ position: 'absolute', inset: '5px 5px auto 5px', height: 7, background: th.chrome, borderBottom: `1px solid ${th.edge}` }} />
                                        <span style={{ position: 'absolute', left: 5, bottom: 5, width: 12, height: 12, background: th.pane, border: `1px solid ${th.hair}` }} />
                                        <span style={{ position: 'absolute', left: 21, bottom: 5, right: 5, height: 12, background: th.pane, border: `1px solid ${th.hair}` }} />
                                        <span style={{ position: 'absolute', right: 7, top: 8, width: 5, height: 5, borderRadius: '50%', background: th.accent }} />
                                    </span>
                                    <span style={{ display: 'block', padding: '6px 8px', fontFamily: 'var(--font-sans)', fontSize: 11.5, fontWeight: 600, color: on ? t.accent : t.dim }}>{label}</span>
                                </button>
                            );
                        })}
                    </div>
                </Field>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: d.gap }}>
                    <Field t={t} label="Navigation">
                        <div style={{ display: 'flex', gap: 1 }}>
                            {[['tabs', 'Tabs'], ['rail', 'Icon rail'], ['list', 'Sidebar']].map(([id, label]) => (
                                <button key={id} onClick={() => updateAppearanceSetting('dashboardNav', id)}
                                    style={{
                                        flex: 1, height: 30, appearance: 'none', cursor: 'pointer', border: `1px solid ${settings.dashboardNav === id ? t.accent : t.hair}`,
                                        background: settings.dashboardNav === id ? (t.glow ? 'rgba(7,252,3,.1)' : t.inset) : 'transparent',
                                        color: settings.dashboardNav === id ? t.accent : t.dim, fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 600
                                    }}>{label}</button>
                            ))}
                        </div>
                    </Field>
                    <Field t={t} label="Density">
                        <div style={{ display: 'flex', gap: 1 }}>
                            {[['compact', 'Compact'], ['comfortable', 'Comfortable']].map(([id, label]) => (
                                <button key={id} onClick={() => updateAppearanceSetting('dashboardDensity', id)}
                                    style={{
                                        flex: 1, height: 30, appearance: 'none', cursor: 'pointer', border: `1px solid ${settings.dashboardDensity === id ? t.accent : t.hair}`,
                                        background: settings.dashboardDensity === id ? (t.glow ? 'rgba(7,252,3,.1)' : t.inset) : 'transparent',
                                        color: settings.dashboardDensity === id ? t.accent : t.dim, fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 600
                                    }}>{label}</button>
                            ))}
                        </div>
                    </Field>
                </div>
                <Field t={t} label="UI Scale" hint="Zooms the whole dashboard for legibility — this is a per-browser preference, not shared with mods or saved to your channel.">
                    <div style={{ display: 'flex', gap: 1 }}>
                        {[100, 110, 125, 150].map(pct => (
                            <button key={pct} onClick={() => setUiScale && setUiScale(pct)}
                                style={{
                                    flex: 1, height: 30, appearance: 'none', cursor: 'pointer', border: `1px solid ${uiScale === pct ? t.accent : t.hair}`,
                                    background: uiScale === pct ? (t.glow ? 'rgba(7,252,3,.1)' : t.inset) : 'transparent',
                                    color: uiScale === pct ? t.accent : t.dim, fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 600
                                }}>{pct}%</button>
                        ))}
                    </div>
                </Field>
                <ToggleSwitch checked={settings.dashboardMenubar} onChange={v => updateAppearanceSetting('dashboardMenubar', v)} label="Show Menu Bar" description="Keep every action reachable from File, Overlay, Chat, Window and Help." />
                <ToggleSwitch checked={settings.dashboardStatusbar} onChange={v => updateAppearanceSetting('dashboardStatusbar', v)} label="Show Status Bar" description="Connection, latency, queue depth and overlay visibility along the bottom edge." />

                <Field t={t} label="Twitch identity"><TextInput placeholder="Twitch Channel Name" value={twitchUsername} onChange={setTwitchUsername} /></Field>

                <Field t={t} label="Bubble style">
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 6 }}>
                        {STYLES.map(([id, label]) => <StyleTile key={id} id={id} label={label} selected={settings.bubbleStyle === id} onClick={() => updateSetting('bubbleStyle', id)} />)}
                    </div>
                </Field>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: d.gap }}>
                    <Field t={t} label="Font family"><Select value={settings.fontFamily} options={FONTS} onChange={v => updateSetting('fontFamily', v)} /></Field>
                    <Field t={t} label="Text colour">
                        <div style={{ display: 'flex', gap: 6 }}>
                            <input type="color" value={settings.textColor} onChange={e => updateSetting('textColor', e.target.value)} style={{ width: 32, height: 32, border: `1px solid ${t.hair}`, background: t.inset, cursor: 'pointer', padding: 0 }} />
                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', padding: '0 10px', fontFamily: 'var(--font-mono)', fontSize: 11.5, textTransform: 'uppercase', color: t.dim, background: t.inset, border: `1px solid ${t.hair}` }}>{settings.textColor}</div>
                        </div>
                    </Field>
                </div>

                <RangeSlider label="Display Duration" value={settings.displayDuration} min={3} max={60} unit="s" onChange={v => updateSetting('displayDuration', v)} hint="How long the message stays on screen (in seconds)." />
                <RangeSlider label="Message Text Size" value={settings.fontSize} min={12} max={80} unit="px" onChange={v => updateSetting('fontSize', v)} />
                <RangeSlider label="Username Size" value={settings.nameSize} min={8} max={40} unit="px" onChange={v => updateSetting('nameSize', v)} />
                <ToggleSwitch checked={settings.showAvatar} onChange={v => updateSetting('showAvatar', v)} label="Enable Profile Pictures" description="Show the sender's circular avatar next to their name." />
                {settings.showAvatar && <RangeSlider label="Avatar Diameter" value={settings.avatarSize} min={20} max={120} unit="px" onChange={v => updateSetting('avatarSize', v)} hint="Tip: Setting this close to text size creates a modern inline look." />}
                <ToggleSwitch checked={settings.soundEnabled} onChange={v => updateSetting('soundEnabled', v)} label="Enable Sound" description="Play a sound when a message appears." />
                {settings.soundEnabled && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: d.gap }}>
                        <Field t={t} label="Sound Type">
                            <Select value={settings.soundType || 'pop'} options={Object.keys(SOUNDS)} onChange={(v) => {
                                updateSetting('soundType', v);
                                const audio = new Audio(SOUNDS[v]);
                                audio.volume = settings.soundVolume ?? 0.5;
                                audio.play().catch(() => { });
                            }} />
                        </Field>
                        <RangeSlider label="Volume" value={settings.soundVolume ?? 0.5} min={0} max={1} step={0.05} displayValue={Math.round((settings.soundVolume ?? 0.5) * 100)} unit="%" onChange={v => updateSetting('soundVolume', v)}
                            onMouseUp={() => { const audio = new Audio(SOUNDS[settings.soundType || 'pop']); audio.volume = settings.soundVolume ?? 0.5; audio.play().catch(() => { }); }} />
                    </div>
                )}
                <ToggleSwitch checked={settings.karafunEnabled} onChange={v => updateSetting('karafunEnabled', v)} label="Enable KaraFun" description="Show song queue and current song in the sidebar." />
            </Pane>

            <ResizableWidth t={t} storageKey="sc-inspector-w" defaultWidth={d.inspector + 40} minWidth={210} maxWidth={520} style={{ display: 'flex', flexDirection: 'column', gap: d.gutter, minHeight: 0, overflowY: 'auto' }}>
                <ResizableBox t={t} storageKey="sc-settings-live-preview-h" defaultHeight={220} minHeight={140} maxHeight={560}
                    style={{ background: t.pane, border: `1px solid ${t.edge}`, ...bevel(t) }}>
                    <div style={{ height: d.toolbar, flex: 'none', display: 'flex', alignItems: 'center', gap: 8, padding: '0 10px', borderBottom: `1px solid ${t.hair}`, background: t.inset }}>
                        <span style={{ color: t.accent, display: 'inline-flex' }}><Sparkles size={13} /></span>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '.15em', color: t.accent }}>{L(t, 'Live preview')}</span>
                        <span style={{ flex: 1 }} />
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: t.faint }}>{L(t, 'Drag bottom edge to resize')}</span>
                    </div>
                    <div ref={previewBoxRef} style={{ position: 'relative', flex: 1, minHeight: 0, padding: 16, background: t.app, backgroundImage: 'radial-gradient(rgba(255,255,255,.10) 1px,transparent 1px)', backgroundSize: '16px 16px', overflow: 'hidden' }}>
                        <ScaledBubblePreview message={previewMessage} settings={settings} boxWidth={previewBoxSize.width} boxHeight={previewBoxSize.height} />
                    </div>
                </ResizableBox>
                <Pane t={t} d={d} icon={<Move size={13} />} title="Precision Positioning">
                    <div style={{ position: 'relative', aspectRatio: '16/9', background: t.app, border: `1px solid ${t.hair}`, backgroundImage: `linear-gradient(${t.hair} 1px,transparent 1px),linear-gradient(90deg,${t.hair} 1px,transparent 1px)`, backgroundSize: '12.5% 16.6%' }}>
                        <div style={{ position: 'absolute', left: settings.posX + '%', top: settings.posY + '%', width: 10, height: 10, marginLeft: -5, marginTop: -5, background: t.accent, boxShadow: t.glow ? '0 0 12px rgba(7,252,3,.8)' : 'none' }} />
                    </div>
                    <RangeSlider label="Horizontal (X)" value={settings.posX} unit="%" valueTone="accent" onChange={v => updateSetting('posX', v)} />
                    <RangeSlider label="Vertical (Y)" value={settings.posY} unit="%" valueTone="accent" onChange={v => updateSetting('posY', v)} />
                </Pane>
            </ResizableWidth>
        </div>
    );
}
