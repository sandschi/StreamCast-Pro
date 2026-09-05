'use client';

import { useEffect, useRef, useState } from 'react';
import { Music, RefreshCw, Link as LinkIcon, Eye, EyeOff, Play, SkipForward, Users, Mic, ArrowUp, ArrowDown, Trash2, X } from 'lucide-react';
import { useKaraFunData } from '@/hooks/useKaraFunData';
import { useKaraokeData } from '@/hooks/useKaraokeData';
import Pane from './Pane';
import Field from './Field';
import ToolBtn from './ToolBtn';
import { MONO, tiny, L } from './treatments';
import EmptyState from '@/components/ui/EmptyState';
import TextInput from '@/components/ui/TextInput';
import ToggleSwitch from '@/components/ui/ToggleSwitch';
import Select from '@/components/ui/Select';
import RangeSlider from '@/components/ui/RangeSlider';
import Avatar from '@/components/ui/Avatar';

const THEMES = ['classic', 'glass', 'neon', 'minimal', 'cyberpunk', 'retro', 'comic', 'future'];
const row = (t) => ({ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderBottom: `1px solid ${t.hair}` });
const btnRow = { display: 'flex', gap: 6, flex: 'none' };

// Position sliders write to Firestore on every tick otherwise (dozens of
// writes per drag, when only the settled value matters). Keeps the value in
// local state for instant visual feedback and commits ~400ms after the last
// change - a real debounce, not just onMouseUp, so keyboard-driven arrow-key
// adjustments settle and commit too, not just mouse drags.
function useDebouncedSetting(propValue, onCommit) {
    const [value, setValue] = useState(propValue);
    const timerRef = useRef(null);
    // Split into two effects (each a single statement) rather than one effect
    // that both clears the timer and calls setValue: React's hooks lint flags
    // setState in an effect once the body does more than just the sync call.
    // Declaration order guarantees this one runs first on the same commit, so
    // a stale pending commit is cleared before value re-syncs from propValue -
    // it would otherwise fire and overwrite a newer externally-set value (e.g.
    // a Firestore snapshot landing mid-debounce).
    useEffect(() => { clearTimeout(timerRef.current); timerRef.current = null; }, [propValue]);
    useEffect(() => { setValue(propValue); }, [propValue]);
    useEffect(() => () => clearTimeout(timerRef.current), []);
    const handleChange = (v) => {
        setValue(v);
        clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
            timerRef.current = null;
            onCommit(v);
        }, 400);
    };
    return [value, handleChange];
}

export default function KaraFunPane({ t, d, targetUid, user, userSettings }) {
    const {
        queueData, loading, error, lastUpdated, tempPartyId, setTempPartyId, isSavingId, partyId,
        handleReconnect, handleSavePartyId, handleToggleSetting, handleShowNowPlaying, handleHideNowPlaying,
        addToQueue, adjustPitch, adjustTempo, setVolume, setBackingVocalsVolume, setLeadVocalVolume, playSong, skipSong,
    } = useKaraFunData({ targetUid, userSettings });

    // Karaoke request oversight (see #27) - deliberately gated on
    // karaokeEnabled separately below, not folded into the karafunEnabled
    // guard further down, since a broadcaster can run the KaraFun overlay
    // without ever opening viewer requests at all.
    const {
        requests, stagingQueue, onlineSingers, rotationOrder, permissions,
        modDecline, modForcePublic, dropStagingEntry, reorderStaging, setRotationOrder,
    } = useKaraokeData({ targetUid, user });

    const [queueX, setQueueX] = useDebouncedSetting(userSettings?.karafunQueuePosX ?? 5, v => handleToggleSetting('karafunQueuePosX', v));
    const [queueY, setQueueY] = useDebouncedSetting(userSettings?.karafunQueuePosY ?? 5, v => handleToggleSetting('karafunQueuePosY', v));
    const [nowPlayingX, setNowPlayingX] = useDebouncedSetting(userSettings?.karafunNowPlayingPosX ?? 50, v => handleToggleSetting('karafunNowPlayingPosX', v));
    const [nowPlayingY, setNowPlayingY] = useDebouncedSetting(userSettings?.karafunNowPlayingPosY ?? 90, v => handleToggleSetting('karafunNowPlayingPosY', v));

    const modQueue = requests.filter(r => r.status === 'pending' || r.status === 'public');
    const onAirNames = (queueData?.currentSong?.singer || '').split(/\s*&\s*/).map(s => s.trim()).filter(Boolean);
    const isDuetOnAir = onAirNames.length > 1;

    const [pitch, setPitch] = useState(0);
    const [tempo, setTempo] = useState(0);
    const [genVol, setGenVol] = useState(100);
    const [bvVol, setBvVol] = useState(60);
    const [leadVol1, setLeadVol1] = useState(0);
    const [leadVol2, setLeadVol2] = useState(0);
    const [trackedSongKey, setTrackedSongKey] = useState(queueData?.currentSong?.title);
    if (trackedSongKey !== queueData?.currentSong?.title) {
        setTrackedSongKey(queueData?.currentSong?.title);
        setPitch(0);
        setTempo(0);
    }

    const nextEligibleEntry = () => {
        for (const uid of rotationOrder) {
            const entry = stagingQueue.find(s => s.singerUid === uid);
            if (entry) return entry;
        }
        return stagingQueue[0] || null;
    };

    const pushNext = async () => {
        const entry = nextEligibleEntry();
        if (!entry) return;
        const singer = entry.coSingerName ? `${entry.singerName} & ${entry.coSingerName}` : entry.singerName;
        addToQueue(entry.songId, singer);
        await dropStagingEntry(entry.id);
    };

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
            {/* A grid, not a narrow single-column sidebar: this tab now carries
                six-plus panels (queue mod tools plus the original settings),
                and stacking all of them one-wide wasted the dashboard's actual
                width while forcing constant scrolling. */}
            <div style={{ flex: 1.4, minWidth: 0, minHeight: 0, display: 'grid', gridTemplateColumns: '1fr 1fr', gridAutoRows: 'min-content', alignContent: 'start', gap: d.gutter, overflowY: 'auto' }}>
                {userSettings?.karaokeEnabled && (
                    <>
                        <Pane t={t} d={d} icon={<Play size={13} />} title={queueData?.currentSong ? `Now: ${queueData.currentSong.title}` : 'Playback Controls'}>
                            {!queueData?.currentSong ? (
                                <EmptyState icon={<Play size={28} />} title="Nothing playing." />
                            ) : (
                                <>
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <ToolBtn t={t} icon={<Play size={12} />} onClick={playSong}>Play</ToolBtn>
                                        <ToolBtn t={t} icon={<SkipForward size={12} />} onClick={skipSong}>Skip</ToolBtn>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: d.gap }}>
                                        <Field t={t} label="Key">
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <ToolBtn t={t} disabled={pitch <= -6} onClick={() => { adjustPitch(-1); setPitch(p => p - 1); }}>-</ToolBtn>
                                                <span style={{ ...tiny(t), color: t.text, minWidth: 24, textAlign: 'center' }}>{pitch > 0 ? `+${pitch}` : pitch}</span>
                                                <ToolBtn t={t} disabled={pitch >= 6} onClick={() => { adjustPitch(1); setPitch(p => p + 1); }}>+</ToolBtn>
                                            </div>
                                        </Field>
                                        <Field t={t} label="Tempo">
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <ToolBtn t={t} disabled={tempo <= -50} onClick={() => { adjustTempo(-5); setTempo(v => v - 5); }}>-</ToolBtn>
                                                <span style={{ ...tiny(t), color: t.text, minWidth: 32, textAlign: 'center' }}>{tempo > 0 ? `+${tempo}%` : `${tempo}%`}</span>
                                                <ToolBtn t={t} disabled={tempo >= 50} onClick={() => { adjustTempo(5); setTempo(v => v + 5); }}>+</ToolBtn>
                                            </div>
                                        </Field>
                                    </div>
                                    <RangeSlider t={t} label="General Volume" value={genVol} onChange={v => { setGenVol(v); setVolume(v); }} />
                                    {isDuetOnAir ? (
                                        <>
                                            <RangeSlider t={t} label="Lead Vocal 1" value={leadVol1} onChange={v => { setLeadVol1(v); setLeadVocalVolume('1', v); }} />
                                            <RangeSlider t={t} label="Lead Vocal 2" value={leadVol2} onChange={v => { setLeadVol2(v); setLeadVocalVolume('2', v); }} />
                                        </>
                                    ) : (
                                        <>
                                            <RangeSlider t={t} label="Backing Vocals" value={bvVol} onChange={v => { setBvVol(v); setBackingVocalsVolume(v); }} />
                                            <RangeSlider t={t} label="Lead Vocal" value={leadVol1} onChange={v => { setLeadVol1(v); setLeadVocalVolume('1', v); }} />
                                        </>
                                    )}
                                </>
                            )}
                        </Pane>

                        <Pane t={t} d={d} icon={<Users size={13} />} title={`All Requests · ${modQueue.length}`}>
                            {modQueue.length === 0 && <EmptyState icon={<Users size={28} />} title="No open requests." />}
                            {modQueue.map(reqst => (
                                <div key={reqst.id} style={row(t)}>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: t.text }}>{reqst.title}</div>
                                        <div style={{ ...tiny(t), color: t.faint }}>{reqst.status === 'public' ? 'public' : `for ${permissions[reqst.targetSingerUid]?.twitchUsername || permissions[reqst.targetSingerUid]?.displayName || 'someone'}`} · by {reqst.requestedByName}</div>
                                    </div>
                                    <div style={btnRow}>
                                        {reqst.status === 'pending' && <ToolBtn t={t} onClick={() => modForcePublic(reqst.id)}>Force Public</ToolBtn>}
                                        <ToolBtn t={t} icon={<X size={11} />} onClick={() => modDecline(reqst.id)}>Decline</ToolBtn>
                                    </div>
                                </div>
                            ))}
                        </Pane>

                        <Pane t={t} d={d} icon={<Mic size={13} />} title={`Staging Queue · ${stagingQueue.length}`}
                            actions={<ToolBtn t={t} primary onClick={pushNext} disabled={stagingQueue.length === 0}>Push Next</ToolBtn>}>
                            {stagingQueue.length === 0 && <EmptyState icon={<Mic size={28} />} title="Nothing staged." />}
                            {stagingQueue.map((entry, i) => (
                                <div key={entry.id} style={row(t)}>
                                    <span style={{ ...tiny(t), color: t.faint, width: 18 }}>{i + 1}</span>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: t.text }}>{entry.title}</div>
                                        <div style={{ ...tiny(t), color: t.faint }}>{entry.coSingerName ? `${entry.singerName} & ${entry.coSingerName}` : entry.singerName}</div>
                                    </div>
                                    <div style={btnRow}>
                                        <ToolBtn t={t} icon={<ArrowUp size={11} />} disabled={i === 0} onClick={() => reorderStaging(i, i - 1)} />
                                        <ToolBtn t={t} icon={<ArrowDown size={11} />} disabled={i === stagingQueue.length - 1} onClick={() => reorderStaging(i, i + 1)} />
                                        <ToolBtn t={t} icon={<Trash2 size={11} />} onClick={() => dropStagingEntry(entry.id)} />
                                    </div>
                                </div>
                            ))}
                        </Pane>

                        <Pane t={t} d={d} icon={<Users size={13} />} title="Rotation Order">
                            {onlineSingers.length === 0 && <EmptyState icon={<Users size={28} />} title="No participating singers online." />}
                            {[...onlineSingers].sort((a, b) => rotationOrder.indexOf(a.id) - rotationOrder.indexOf(b.id)).map((s, i, arr) => (
                                <div key={s.id} style={row(t)}>
                                    <Avatar photoURL={s.photoURL} username={s.twitchUsername} size={20} />
                                    <span style={{ flex: 1, fontFamily: 'var(--font-sans)', fontSize: 12, color: t.text }}>{s.twitchUsername || s.displayName}</span>
                                    <div style={btnRow}>
                                        <ToolBtn t={t} icon={<ArrowUp size={11} />} disabled={i === 0} onClick={() => {
                                            const order = arr.map(x => x.id);
                                            [order[i - 1], order[i]] = [order[i], order[i - 1]];
                                            setRotationOrder(order);
                                        }} />
                                        <ToolBtn t={t} icon={<ArrowDown size={11} />} disabled={i === arr.length - 1} onClick={() => {
                                            const order = arr.map(x => x.id);
                                            [order[i + 1], order[i]] = [order[i], order[i + 1]];
                                            setRotationOrder(order);
                                        }} />
                                    </div>
                                </div>
                            ))}
                        </Pane>
                    </>
                )}

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
            </div>
        </div>
    );
}
