'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Music, Save, Link as LinkIcon, Eye, EyeOff, Play, Pause, SkipForward, Users, Mic, ArrowUp, ArrowDown, ArrowRight, UserPlus, Ban, X, Trash2 } from 'lucide-react';
import { useKaraokeData } from '@/hooks/useKaraokeData';
import Pane from './Pane';
import Field from './Field';
import ToolBtn from './ToolBtn';
import SingerPicker from './SingerPicker';
import RemoveFromRotationModal from './RemoveFromRotationModal';
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

export default function KaraFunPane({ t, d, targetUid, user, userRole, userSettings, karaFun, chat, isMasterAdmin }) {
    const {
        queueData, connected, tempPartyId, setTempPartyId, isSavingId, partyId,
        handleSavePartyId, handleToggleSetting, handleShowNowPlaying, handleHideNowPlaying,
        removeFromQueue, playSong, skipSong,
    } = karaFun;

    // Karaoke request oversight (see #27) - deliberately gated on
    // karaokeEnabled separately below, not folded into the karafunEnabled
    // guard further down, since a broadcaster can run the KaraFun overlay
    // without ever opening viewer requests at all.
    const {
        requests, rotationOrder, fullRotationOrder, rotationMembers, permissions, nameFor,
        modDecline, modForcePublic, setRotationOrder,
    } = useKaraokeData({ targetUid, user, userRole });

    const [queueX, setQueueX] = useDebouncedSetting(userSettings?.karafunQueuePosX ?? 5, v => handleToggleSetting('karafunQueuePosX', v));
    const [queueY, setQueueY] = useDebouncedSetting(userSettings?.karafunQueuePosY ?? 5, v => handleToggleSetting('karafunQueuePosY', v));
    const [nowPlayingX, setNowPlayingX] = useDebouncedSetting(userSettings?.karafunNowPlayingPosX ?? 50, v => handleToggleSetting('karafunNowPlayingPosX', v));
    const [nowPlayingY, setNowPlayingY] = useDebouncedSetting(userSettings?.karafunNowPlayingPosY ?? 90, v => handleToggleSetting('karafunNowPlayingPosY', v));

    const modQueue = requests.filter(r => r.status === 'pending' || r.status === 'public');

    // Who's actually singing right now, per the relay's own resolved and
    // mirrored karafun_state/live.activeSingerUid (relay/src/autoSort.js's
    // resolveActiveUid) - not derived here from currentSong.singer directly.
    // That used to default to rotationOrder[0] whenever nothing was actively
    // playing (the gap between a skip and the next Play), which forgot whose
    // turn it was and pointed the arrow back at whoever's first in rotation
    // on every gap. The relay is the one process that can see across that
    // gap continuously; this and the Karaoke tab both just read its answer,
    // so they always agree (see #27 - they used to derive it independently
    // client-side and could disagree).
    const activeSingerUid = queueData?.activeSingerUid || null;
    const displayedSingerUid = activeSingerUid ?? rotationMembers.find((member) => !member.sittingOut)?.id;

    // Candidates for the "Add to rotation" picker: whoever's shown up in
    // chat recently (useChatData.js's own rolling last-50 window, passed
    // down from dashboard/page.js), deduped by login, most recent first -
    // reusing data that's already being tracked rather than standing up a
    // separate "who's chatting" tracker. Freeform typing (see SingerPicker's
    // allowFreeform) covers anyone not currently chatting.
    const recentChatters = useMemo(() => {
        const seen = new Map();
        for (const m of [...(chat?.messages || [])].reverse()) {
            if (!m.login || seen.has(m.login)) continue;
            seen.set(m.login, { id: m.login, twitchUsername: m.login, displayName: m.displayName || m.login, photoURL: m.avatarUrl });
        }
        return [...seen.values()];
    }, [chat?.messages]);

    const [addingToRotation, setAddingToRotation] = useState(false);
    const [removeTarget, setRemoveTarget] = useState(null); // { id, name } | null

    // A chatter whose Twitch login matches an existing account gets added by
    // that real uid, not wrapped as a guest - so if they ever do open the
    // dashboard, their own self-service controls (sit-out, self turn-taking)
    // keep working instead of being stuck behind a disconnected placeholder.
    const handleAddPick = (uid, singerObj) => {
        let id = uid;
        if (!id) {
            const typedName = singerObj?.freeformName?.trim();
            // SingerPicker already rejects these characters before calling
            // onPick - this is a second, cheap guard against '/' (breaks
            // db.doc()'s path parsing wherever a guest id gets looked up)
            // and '&' (collides with the duet-split convention every
            // ownership/attribution check uses), not something a mod should
            // be able to bypass by calling this handler some other way.
            if (!typedName || /[/&]/.test(typedName)) return;
            id = `guest:${typedName}`;
        } else {
            // uid here is a chatter's Twitch login (from recentChatters), not
            // necessarily their Firebase uid - reconcile against every known
            // account on this channel (not just current rotation members) by
            // twitchUsername before falling back to a guest entry.
            const knownEntry = Object.entries(permissions).find(([, p]) => p.twitchUsername === uid);
            id = knownEntry ? knownEntry[0] : `guest:${uid}`;
        }
        if (fullRotationOrder.includes(id)) { setAddingToRotation(false); return; }
        setRotationOrder([...fullRotationOrder, id]);
        setAddingToRotation(false);
    };

    const queuedCountFor = (name) => (queueData?.upcoming || [])
        .filter((song) => (song.singer || '').split(/\s*&\s*/).map((s) => s.trim()).includes(name)).length;

    const confirmRemoveFromRotation = () => {
        if (!removeTarget) return;
        const { id, name } = removeTarget;
        setRotationOrder(fullRotationOrder.filter((x) => x !== id));
        (queueData?.upcoming || [])
            .filter((song) => (song.singer || '').split(/\s*&\s*/).map((s) => s.trim()).includes(name))
            .forEach((song) => { if (song.queueId) removeFromQueue(song.queueId); });
        setRemoveTarget(null);
    };

    // Auto-sort (round-robin queue reordering) previously lived here as a
    // client-side effect, disabled since a real incident (see git history,
    // issue #27) - two independent "KaraFun Mod" sessions each polling and
    // reconciling the same live queue could fight each other, among other
    // suspects never fully ruled out client-side. docs/karafun-relay-
    // design.md §5 has since relocated that logic into relay/src/autoSort.js,
    // where there's structurally only one process per party issuing moves -
    // opt-in via the karafunAutoSortEnabled toggle below (off by default, per
    // design doc §9), not a component-side effect anymore. This component no
    // longer holds any of that logic, dead or otherwise.

    if (!userSettings?.karafunEnabled) {
        return (
            <Pane t={t} d={d} icon={<Music size={13} />} title="Song Queue">
                <EmptyState icon={<Music size={32} />} title="KaraFun integration is disabled." hint="Enable it from Overlay Customization to track your party's queue." />
            </Pane>
        );
    }

    const upcoming = queueData?.upcoming || [];

    return (
        <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', gap: d.gutter }}>
            <Pane t={t} d={d} icon={<Music size={13} />} title={partyId ? `Song Queue · Party ${partyId}` : 'Song Queue'} flush>
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
                                    {queueData?.playState === 'infoscreen' ? 'Waiting for a song to start…' : !connected ? 'Party unreachable. Make sure the KaraFun app is open and the Remote is connected.' : 'No song playing currently.'}
                                </div>
                            )}
                            <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <ToolBtn t={t} icon={<Eye size={12} />} onClick={handleShowNowPlaying}>Show</ToolBtn>
                                    <ToolBtn t={t} icon={<EyeOff size={12} />} onClick={handleHideNowPlaying}>Dismiss</ToolBtn>
                                </div>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <ToolBtn t={t} icon={queueData?.playState === 'playing' ? <Pause size={12} /> : <Play size={12} />} onClick={playSong}>{queueData?.playState === 'playing' ? 'Pause' : 'Play'}</ToolBtn>
                                    <ToolBtn t={t} icon={<SkipForward size={12} />} onClick={skipSong}>Skip</ToolBtn>
                                </div>
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
                                <button type="button" disabled={!song.queueId} title={song.queueId ? 'Remove from queue' : 'Not removable yet'} onClick={() => removeFromQueue(song.queueId)} style={{ flex: 'none', display: 'grid', placeItems: 'center', width: 22, height: 22, appearance: 'none', border: 'none', background: 'transparent', color: t.faint, cursor: song.queueId ? 'pointer' : 'default', opacity: song.queueId ? 1 : 0.4 }}>
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
                    Settings) since it's a mod action, not overlay appearance.
                    Broadcaster/master-admin only: firestore.rules only lets a
                    mod update karaokeRotationOrder on settings/config, not
                    karaokeEnabled/karaokeRequestsOpen, so an invited mod
                    seeing these toggles would just get permission-denied on
                    every click. */}
                {(userRole === 'broadcaster' || isMasterAdmin) && (
                    <div style={{ gridColumn: '1 / -1' }}>
                        <Pane t={t} d={d} icon={<Mic size={13} />} title="Karaoke Access">
                            <div style={{ display: 'flex', gap: d.gap }}>
                                <div style={{ flex: 1 }}>
                                    <ToggleSwitch t={t} checked={!!userSettings?.karaokeEnabled} onChange={v => handleToggleSetting('karaokeEnabled', v)} label="Karaoke Mode" description="Opens the Karaoke tab and connects to KaraFun." />
                                </div>
                                {userSettings?.karaokeEnabled && (
                                    <div style={{ flex: 1 }}>
                                        <ToggleSwitch t={t} checked={userSettings?.karaokeRequestsOpen !== false} onChange={v => handleToggleSetting('karaokeRequestsOpen', v)} label="Public Song Requests" description="Let viewers submit requests. Off to self-add only." />
                                    </div>
                                )}
                            </div>
                        </Pane>
                    </div>
                )}

                {userSettings?.karaokeEnabled && (
                    <>
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

                        <Pane t={t} d={d} icon={<Users size={13} />} title="Rotation Order" actions={
                            <div style={{ position: 'relative' }}>
                                <ToolBtn t={t} icon={<UserPlus size={12} />} onClick={() => setAddingToRotation(v => !v)}>Add</ToolBtn>
                                {addingToRotation && (
                                    <SingerPicker t={t} allowFreeform
                                        singers={recentChatters.filter(c => !rotationMembers.some(m => (m.isGuest ? m.displayName : m.twitchUsername) === c.id))}
                                        onPick={handleAddPick}
                                        onCancel={() => setAddingToRotation(false)} />
                                )}
                            </div>
                        }>
                            {rotationMembers.length === 0 && <EmptyState icon={<Users size={28} />} title="Nobody in the rotation yet." hint="Use Add above, or wait for a singer to opt in from the Karaoke tab." />}
                            {rotationMembers.map((s, i, arr) => (
                                <div key={s.id} style={{ ...row(t), opacity: s.sittingOut ? 0.55 : 1 }}>
                                    <span style={{ width: 14, flex: 'none', display: 'grid', placeItems: 'center' }}>
                                        {s.id === displayedSingerUid && <ArrowRight size={13} color="var(--primary-500)" />}
                                    </span>
                                    <Avatar photoURL={s.photoURL} username={s.twitchUsername} size={20} />
                                    <span style={{ flex: 1, fontFamily: 'var(--font-sans)', fontSize: 12, color: t.text }}>
                                        {s.twitchUsername || s.displayName}
                                        {s.isGuest && <span style={{ color: t.faint }}> (guest)</span>}
                                        {s.sittingOut && <span style={{ color: t.faint }}> (sitting out)</span>}
                                    </span>
                                    <div style={btnRow}>
                                        <ToolBtn t={t} icon={<ArrowUp size={11} />} disabled={i === 0} onClick={() => {
                                            const order = [...fullRotationOrder];
                                            const curIdx = order.indexOf(s.id);
                                            const neighborIdx = order.indexOf(arr[i - 1].id);
                                            [order[curIdx], order[neighborIdx]] = [order[neighborIdx], order[curIdx]];
                                            setRotationOrder(order);
                                        }} />
                                        <ToolBtn t={t} icon={<ArrowDown size={11} />} disabled={i === arr.length - 1} onClick={() => {
                                            const order = [...fullRotationOrder];
                                            const curIdx = order.indexOf(s.id);
                                            const neighborIdx = order.indexOf(arr[i + 1].id);
                                            [order[curIdx], order[neighborIdx]] = [order[neighborIdx], order[curIdx]];
                                            setRotationOrder(order);
                                        }} />
                                        <ToolBtn t={t} icon={<Ban size={11} />} onClick={() => setRemoveTarget({ id: s.id, name: s.twitchUsername || s.displayName })} />
                                    </div>
                                </div>
                            ))}
                        </Pane>
                    </>
                )}

                <RemoveFromRotationModal t={t} open={!!removeTarget} name={removeTarget?.name}
                    queuedCount={removeTarget ? queuedCountFor(removeTarget.name) : 0}
                    onCancel={() => setRemoveTarget(null)} onConfirm={confirmRemoveFromRotation} />

                <Pane t={t} d={d} icon={<LinkIcon size={13} />} title="Party Connection">
                    <Field t={t} label="Party ID">
                        {/* flex-wrap, not a rigid row - this column can shrink to
                            210px (see Overlay visibility below, same reasoning in
                            its own comment). Auto-sort sits alongside Party ID/Save
                            at comfortable widths and drops to its own line once it
                            can't fit. Broadcaster/master-admin only - firestore.rules
                            only lets the owner write karafunAutoSortEnabled (same
                            owner-only default the Karaoke Access toggles above rely
                            on), so a mod would just get permission-denied. */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flex: 'none' }}>
                                <div style={{ width: 100, flex: 'none' }}>
                                    <TextInput t={t} mono value={tempPartyId} onChange={setTempPartyId} placeholder="e.g. 727383" />
                                </div>
                                <ToolBtn t={t} icon={<Save size={12} />} primary onClick={handleSavePartyId} disabled={isSavingId}>{isSavingId ? 'Saving…' : 'Save'}</ToolBtn>
                            </div>
                            {(userRole === 'broadcaster' || isMasterAdmin) && (
                                <div style={{ flex: '1 1 190px', minWidth: 190 }}>
                                    <ToggleSwitch t={t} checked={!!userSettings?.karafunAutoSortEnabled} onChange={(v) => handleToggleSetting('karafunAutoSortEnabled', v)} label="Auto-sort" description="Round-robin reorder by rotation." />
                                </div>
                            )}
                        </div>
                        {/* The relay flips this same toggle off itself if auto-sort
                            trips its circuit breaker (see relay/src/autoSort.js) -
                            surfacing why beats the silent disable this used to be a
                            code comment about (docs/karafun-relay-design.md §5). */}
                        {!userSettings?.karafunAutoSortEnabled && userSettings?.karafunAutoSortDisabledReason && (
                            <div style={{ marginTop: 6, ...tiny(t), color: 'var(--danger)' }}>
                                Auto-sort turned off: {userSettings.karafunAutoSortDisabledReason}
                            </div>
                        )}
                    </Field>
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
