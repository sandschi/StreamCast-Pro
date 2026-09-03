'use client';

import { useEffect, useRef, useState } from 'react';
import { Music, RefreshCw, Link as LinkIcon, Eye, EyeOff } from 'lucide-react';
import { useKaraFunData } from '@/hooks/useKaraFunData';
import Pane from './Pane';
import Field from './Field';
import ToolBtn from './ToolBtn';
import ResizableWidth from './ResizableWidth';
import { MONO, tiny, L } from './treatments';
import EmptyState from '@/components/ui/EmptyState';
import TextInput from '@/components/ui/TextInput';
import ToggleSwitch from '@/components/ui/ToggleSwitch';
import Select from '@/components/ui/Select';
import RangeSlider from '@/components/ui/RangeSlider';

const THEMES = ['classic', 'glass', 'neon', 'minimal', 'cyberpunk', 'retro', 'comic', 'future'];

// Position sliders write to Firestore on every tick otherwise (dozens of
// writes per drag, when only the settled value matters). Keeps the value in
// local state for instant visual feedback and commits ~400ms after the last
// change - a real debounce, not just onMouseUp, so keyboard-driven arrow-key
// adjustments settle and commit too, not just mouse drags.
function useDebouncedSetting(propValue, onCommit) {
    const [value, setValue] = useState(propValue);
    const timerRef = useRef(null);
    useEffect(() => { setValue(propValue); }, [propValue]);
    useEffect(() => () => clearTimeout(timerRef.current), []);
    const handleChange = (v) => {
        setValue(v);
        clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => onCommit(v), 400);
    };
    return [value, handleChange];
}

export default function KaraFunPane({ t, d, targetUid, userSettings }) {
    const {
        queueData, loading, error, lastUpdated, tempPartyId, setTempPartyId, isSavingId, partyId,
        handleReconnect, handleSavePartyId, handleToggleSetting, handleShowNowPlaying, handleHideNowPlaying,
    } = useKaraFunData({ targetUid, userSettings });

    const [queueX, setQueueX] = useDebouncedSetting(userSettings?.karafunQueuePosX ?? 5, v => handleToggleSetting('karafunQueuePosX', v));
    const [queueY, setQueueY] = useDebouncedSetting(userSettings?.karafunQueuePosY ?? 5, v => handleToggleSetting('karafunQueuePosY', v));
    const [nowPlayingX, setNowPlayingX] = useDebouncedSetting(userSettings?.karafunNowPlayingPosX ?? 50, v => handleToggleSetting('karafunNowPlayingPosX', v));
    const [nowPlayingY, setNowPlayingY] = useDebouncedSetting(userSettings?.karafunNowPlayingPosY ?? 90, v => handleToggleSetting('karafunNowPlayingPosY', v));

    if (!userSettings?.karafunEnabled) {
        return (
            <Pane t={t} d={d} icon={<Music size={13} />} title="Song Queue">
                <EmptyState icon={<Music size={32} />} title="KaraFun integration is disabled." hint="Enable it from Overlay Customization to track your party's queue." />
            </Pane>
        );
    }

    const conn = error ? 'disconnected' : lastUpdated ? 'connected' : 'reconnecting';
    const upcoming = queueData?.upcoming || [];

    return (
        <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', gap: d.gutter }}>
            <Pane t={t} d={d} icon={<Music size={13} />} title={partyId ? `Song Queue · Party ${partyId}` : 'Song Queue'} flush
                actions={<ToolBtn t={t} icon={<RefreshCw size={12} />} onClick={handleReconnect} disabled={loading && !lastUpdated}>{loading && !lastUpdated ? 'Connecting…' : 'Refresh'}</ToolBtn>}>
                {!partyId ? (
                    <EmptyState icon={<Music size={32} />} title="No Party ID set." hint="Save your KaraFun Party ID in the panel on the right to start tracking the queue." />
                ) : (
                    // One wrapper so this is Pane's only flush child — Pane's own content
                    // gap would otherwise land between every row (on top of each row's
                    // own divider below it), pushing each row's content down unevenly.
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <div style={{ padding: d.pad, borderBottom: `1px solid ${t.edge}`, background: t.inset }}>
                            <div style={{ ...tiny(t), color: t.faint }}>{L(t, 'Now playing')}</div>
                            {queueData?.currentSong ? (
                                <>
                                    <div style={{ marginTop: 6, display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                                        <span style={{ fontFamily: 'var(--font-sans)', fontSize: 17, fontWeight: 800, color: t.text }}>{queueData.currentSong.title}</span>
                                        <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12.5, color: t.dim }}>{queueData.currentSong.artist}</span>
                                    </div>
                                    {queueData.currentSong.singer && <div style={{ marginTop: 4, fontFamily: MONO, fontSize: 11, color: t.accent }}>{L(t, `Sung by @${queueData.currentSong.singer}`)}</div>}
                                </>
                            ) : (
                                <div style={{ marginTop: 6, fontFamily: 'var(--font-sans)', fontSize: 13, color: t.faint }}>
                                    {queueData?.playState === 'infoscreen' ? 'Waiting for a song to start…' : error || 'No song playing currently.'}
                                </div>
                            )}
                            <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                                <ToolBtn t={t} icon={<Eye size={12} />} onClick={handleShowNowPlaying}>Show</ToolBtn>
                                <ToolBtn t={t} icon={<EyeOff size={12} />} onClick={handleHideNowPlaying}>Dismiss</ToolBtn>
                            </div>
                        </div>
                        {upcoming.length === 0 ? (
                            <EmptyState icon={<Music size={32} />} title="Queue is empty." hint="Songs your chat adds to the KaraFun party show up here." />
                        ) : upcoming.map((song, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 10px', height: d.row + 14, borderBottom: `1px solid ${t.hair}` }}>
                                <span style={{ width: 20, flex: 'none', fontFamily: MONO, fontSize: 11, color: t.faint, fontVariantNumeric: 'tabular-nums' }}>{String(i + 1).padStart(2, '0')}</span>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12.5, fontWeight: 600, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{song.title}</div>
                                    <div style={{ fontFamily: 'var(--font-sans)', fontSize: 11.5, color: t.dim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{song.artist}</div>
                                </div>
                                {song.singer && <span style={{ flex: 'none', maxWidth: 170, fontFamily: MONO, fontSize: 11, color: t.dim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>@{song.singer}</span>}
                            </div>
                        ))}
                    </div>
                )}
            </Pane>
            <ResizableWidth t={t} storageKey="sc-inspector-w" defaultWidth={d.inspector} minWidth={210} maxWidth={480} style={{ display: 'flex', flexDirection: 'column', gap: d.gutter, overflowY: 'auto', minHeight: 0 }}>
                <Pane t={t} d={d} icon={<LinkIcon size={13} />} title="Party Connection">
                    <Field t={t} label="Party ID">
                        <div style={{ display: 'flex', gap: 6 }}>
                            <TextInput t={t} mono value={tempPartyId} onChange={setTempPartyId} placeholder="e.g. 727383" />
                        </div>
                    </Field>
                    <ToolBtn t={t} icon={<RefreshCw size={12} />} primary onClick={handleSavePartyId} disabled={isSavingId}>{isSavingId ? 'Saving…' : 'Save Party ID'}</ToolBtn>
                    <Field t={t} label="Overlay visibility">
                        {/* This inspector column can be as narrow as 210px (ResizableWidth
                            minWidth below) — a rigid 2-column grid left no room for the
                            switch pill (a fixed 50px) next to wrapped label text at that
                            width, so it visually overran the card. flex-wrap falls back to
                            one-per-row until the panel is actually wide enough for two. */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            <div style={{ flex: '1 1 140px', minWidth: 140 }}>
                                <ToggleSwitch t={t} checked={!!userSettings?.karafunOverlayQueueEnabled} onChange={(v) => handleToggleSetting('karafunOverlayQueueEnabled', v)} label="Queue on stream" />
                            </div>
                            <div style={{ flex: '1 1 140px', minWidth: 140 }}>
                                <ToggleSwitch t={t} checked={!!userSettings?.karafunOverlayNowPlayingEnabled} onChange={(v) => handleToggleSetting('karafunOverlayNowPlayingEnabled', v)} label="Now Playing popup" />
                            </div>
                        </div>
                    </Field>
                </Pane>
                <Pane t={t} d={d} icon={<Music size={13} />} title="Overlay Style">
                    <Field t={t} label="Theme">
                        <Select t={t} value={userSettings?.karafunOverlayTheme || 'classic'} onChange={(v) => handleToggleSetting('karafunOverlayTheme', v)} options={THEMES} />
                    </Field>
                    <RangeSlider t={t} label="Queue X" value={queueX} unit="%" valueTone="accent" onChange={setQueueX} />
                    <RangeSlider t={t} label="Queue Y" value={queueY} unit="%" valueTone="accent" onChange={setQueueY} />
                    <RangeSlider t={t} label="Now Playing X" value={nowPlayingX} unit="%" valueTone="accent" onChange={setNowPlayingX} />
                    <RangeSlider t={t} label="Now Playing Y" value={nowPlayingY} unit="%" valueTone="accent" onChange={setNowPlayingY} />
                </Pane>
            </ResizableWidth>
        </div>
    );
}
