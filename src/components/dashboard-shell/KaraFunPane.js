'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Music, RefreshCw, Link as LinkIcon, Eye, EyeOff, Play, SkipForward, Users, Mic, ArrowUp, ArrowDown, ArrowRight, X, Trash2 } from 'lucide-react';
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
        moveInQueue, removeFromQueue, adjustPitch, adjustTempo, setVolume, setBackingVocalsVolume, setLeadVocalVolume, playSong, skipSong,
    } = useKaraFunData({ targetUid, userSettings });

    // Karaoke request oversight (see #27) - deliberately gated on
    // karaokeEnabled separately below, not folded into the karafunEnabled
    // guard further down, since a broadcaster can run the KaraFun overlay
    // without ever opening viewer requests at all.
    const {
        requests, onlineSingers, rotationOrder, rotationCursor, permissions,
        modDecline, modForcePublic, setRotationOrder, setRotationCursor,
    } = useKaraokeData({ targetUid, user });

    // Presence (via onlineSingers), not permissions, is the primary name
    // source - permissions only gets twitchUsername/displayName written when
    // a mod assigns a role, and the broadcaster's own permissions doc (only
    // ever created the first time they toggle Participating) never has one
    // at all. Falls back to permissions for a currently-offline target.
    const nameFor = useCallback((uid) => {
        const online = onlineSingers.find(s => s.id === uid);
        return online?.twitchUsername || online?.displayName || permissions[uid]?.twitchUsername || permissions[uid]?.displayName || 'someone';
    }, [onlineSingers, permissions]);

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

    // Auto-sort v2 (see #27 - v1 caused a live runaway reorder loop against a
    // real party, "switching songs around in rapid succession", and had to
    // be killed by turning the party off). Redesigned around three changes,
    // any one of which might have been the actual cause - rather than bet on
    // a single diagnosis against a production party again, all three ship
    // together:
    //
    // 1. Polls on a fixed 5s interval via refs, instead of reacting to every
    //    dependency change. v1 re-ran on every Firestore tick (presence,
    //    permissions, settings all update independently of the real KaraFun
    //    queue), and nameFor/onlineSingers are new references each time -
    //    plausible on their own for far more frequent re-evaluation than
    //    intended, especially since v1 evaluated the correction and re-sent
    //    it inline in the same effect that also re-created a `working` array
    //    just from `current`, no fresher than what was already lined up.
    // 2. Applies at most ONE move per tick, computed fresh from the latest
    //    server-reported queue each time - not a whole batch derived from a
    //    local simulation of how earlier moves in the same batch land. If
    //    KaraFun applies a move differently than simulated (index semantics,
    //    async ordering, a rejected move), a multi-move batch has nothing to
    //    notice or recover from; a single move re-evaluated 5s later does.
    // 3. Never targets whatever KaraFun currently reports as playing - it
    //    has no drag handle in KaraFun's own remote client and confirmed
    //    separately that it can't actually be moved; a desired order that
    //    displaces it could never be satisfied.
    //
    // On top of all three: a circuit breaker. If the exact same move keeps
    // getting proposed without the queue ever reflecting it, that means
    // something is blocking it that this code doesn't understand yet - stop
    // and log rather than retry forever.
    const liveRef = useRef({});
    useEffect(() => {
        liveRef.current = { upcoming: queueData?.upcoming, currentSong: queueData?.currentSong, rotationOrder, rotationCursor, nameFor, moveInQueue };
    }, [queueData?.upcoming, queueData?.currentSong, rotationOrder, rotationCursor, nameFor, moveInQueue]);
    const stallCountRef = useRef(0);
    const lastMoveSignatureRef = useRef(null);

    // Whose turn is next - advances the moment a genuinely NEW song starts
    // playing (title+artist+singer changed), to whoever comes after that
    // song's singer in rotationOrder. Reactive rather than part of the 5s
    // poll below: this only ever does one idempotent Firestore write per
    // real transition (multiple mod sessions computing the same value is
    // harmless), it doesn't repeatedly command an external system the way
    // queueMove does, so it doesn't carry the same runaway-loop risk.
    const lastAdvanceKeyRef = useRef(null);
    useEffect(() => {
        const cur = queueData?.currentSong;
        if (!cur || rotationOrder.length === 0) return;
        const key = `${cur.title}|${cur.artist}|${cur.singer}`;
        if (key === lastAdvanceKeyRef.current) return;
        lastAdvanceKeyRef.current = key;
        const primary = (cur.singer || '').split(/\s*&\s*/)[0].trim();
        const idx = rotationOrder.findIndex(uid => nameFor(uid) === primary);
        if (idx === -1) return;
        setRotationCursor(rotationOrder[(idx + 1) % rotationOrder.length]);
    }, [queueData?.currentSong, rotationOrder, nameFor, setRotationCursor]);

    useEffect(() => {
        const AUTO_SORT_INTERVAL_MS = 5000;
        const MAX_STALLED_ATTEMPTS = 3;

        const tick = () => {
            const { upcoming, currentSong, rotationOrder, rotationCursor, nameFor, moveInQueue } = liveRef.current;
            if (!moveInQueue || !upcoming || upcoming.length < 2 || !rotationOrder || rotationOrder.length === 0) return;

            const isPlaying = (item) => !!currentSong && item.title === currentSong.title && item.artist === currentSong.artist && item.singer === currentSong.singer;
            const playingIdx = upcoming.findIndex(isPlaying);

            const ownerIndexOf = (singerField) => {
                const primary = (singerField || '').split(/\s*&\s*/)[0].trim();
                if (!primary) return -1;
                return rotationOrder.findIndex(uid => nameFor(uid) === primary);
            };
            const cursorIdx = Math.max(0, rotationOrder.indexOf(rotationCursor));

            // Round-robin, not a static priority ranking: everyone's FIRST
            // queued song (round 0) comes before anyone's SECOND (round 1),
            // so one singer adding several songs in a row can't bury
            // everyone else - it just claims one slot per lap, starting from
            // whoever's turn is actually next (the cursor), not always
            // rotationOrder[0].
            const seenRounds = {};
            const currentIds = upcoming.map(s => s.queueId);
            const restSorted = upcoming
                .map((s, i) => {
                    const ownerIdx = ownerIndexOf(s.singer);
                    if (ownerIdx === -1) return { queueId: s.queueId, round: Infinity, distance: Infinity, origIndex: i };
                    const round = seenRounds[ownerIdx] || 0;
                    seenRounds[ownerIdx] = round + 1;
                    const distance = (ownerIdx - cursorIdx + rotationOrder.length) % rotationOrder.length;
                    return { queueId: s.queueId, round, distance, origIndex: i };
                })
                .filter((_, i) => i !== playingIdx)
                .sort((a, b) => a.round - b.round || a.distance - b.distance || a.origIndex - b.origIndex)
                .map(x => x.queueId);
            const desiredIds = [...restSorted];
            if (playingIdx !== -1) desiredIds.splice(playingIdx, 0, currentIds[playingIdx]);

            const firstMismatch = desiredIds.findIndex((queueId, i) => currentIds[i] !== queueId);
            if (firstMismatch === -1) {
                stallCountRef.current = 0;
                lastMoveSignatureRef.current = null;
                return;
            }

            const queueId = desiredIds[firstMismatch];
            const from = currentIds.indexOf(queueId);
            const to = firstMismatch;
            const signature = `${queueId}:${from}->${to}`;

            if (signature === lastMoveSignatureRef.current) {
                stallCountRef.current += 1;
                if (stallCountRef.current >= MAX_STALLED_ATTEMPTS) {
                    console.error('Karaoke auto-sort: the same move keeps being proposed without the live queue ever reflecting it - stopping instead of retrying indefinitely.', signature);
                    return;
                }
            } else {
                stallCountRef.current = 0;
            }
            lastMoveSignatureRef.current = signature;
            moveInQueue(queueId, from, to);
        };

        const id = setInterval(tick, AUTO_SORT_INTERVAL_MS);
        return () => clearInterval(id);
    }, []);

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
                            <div key={song.queueId || i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 10px', height: d.row + 14, borderBottom: `1px solid ${t.hair}` }}>
                                <span style={{ width: 20, flex: 'none', fontFamily: MONO, fontSize: 11, color: t.faint, fontVariantNumeric: 'tabular-nums' }}>{String(i + 1).padStart(2, '0')}</span>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12.5, fontWeight: 600, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{song.title}</div>
                                    <div style={{ fontFamily: 'var(--font-sans)', fontSize: 11.5, color: t.dim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{song.artist}</div>
                                </div>
                                {song.singer && <span style={{ flex: 'none', maxWidth: 170, fontFamily: MONO, fontSize: 11, color: t.dim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>@{song.singer}</span>}
                                <button type="button" title="Remove from queue" onClick={() => removeFromQueue(song.queueId)} style={{ flex: 'none', display: 'grid', placeItems: 'center', width: 22, height: 22, appearance: 'none', border: 'none', background: 'transparent', color: t.faint, cursor: 'pointer' }}>
                                    <Trash2 size={13} />
                                </button>
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
                {/* Deliberately outside the karaokeEnabled-gated block below -
                    it's the switch that turns that whole section on, so it
                    can't itself disappear once it's off. Lives here (not
                    Settings) since it's a mod action, not overlay appearance. */}
                <div style={{ gridColumn: '1 / -1' }}>
                    <Pane t={t} d={d} icon={<Mic size={13} />} title="Karaoke Access">
                        <ToggleSwitch t={t} checked={!!userSettings?.karaokeEnabled} onChange={v => handleToggleSetting('karaokeEnabled', v)} label="Enable Karaoke Requests" description="Open the Karaoke tab to everyone — viewers can request songs, singers can add their own." />
                    </Pane>
                </div>

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
                                        <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: t.text }}>{reqst.title}{reqst.kind === 'duet' && <span style={{ color: t.accent }}> (duet)</span>}</div>
                                        <div style={{ ...tiny(t), color: t.faint }}>{reqst.status === 'public' ? 'public' : `for ${nameFor(reqst.targetSingerUid)}`} · by {reqst.requestedByName}</div>
                                    </div>
                                    <div style={btnRow}>
                                        {reqst.status === 'pending' && reqst.kind !== 'duet' && <ToolBtn t={t} onClick={() => modForcePublic(reqst.id)}>Force Public</ToolBtn>}
                                        <ToolBtn t={t} icon={<X size={11} />} onClick={() => modDecline(reqst.id)}>Decline</ToolBtn>
                                    </div>
                                </div>
                            ))}
                        </Pane>

                        <Pane t={t} d={d} icon={<Users size={13} />} title="Rotation Order">
                            {onlineSingers.length === 0 && <EmptyState icon={<Users size={28} />} title="No participating singers online." />}
                            {[...onlineSingers].sort((a, b) => rotationOrder.indexOf(a.id) - rotationOrder.indexOf(b.id)).map((s, i, arr) => (
                                <div key={s.id} style={row(t)}>
                                    <span style={{ width: 14, flex: 'none', display: 'grid', placeItems: 'center' }}>
                                        {(rotationCursor ? s.id === rotationCursor : i === 0) && <ArrowRight size={13} color="var(--primary-500)" />}
                                    </span>
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
