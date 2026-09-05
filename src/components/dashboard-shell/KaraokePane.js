'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { Mic, Search, UserPlus, Check, X, Play, Pause, SkipForward, Users, Music, Trash2, ArrowRight } from 'lucide-react';
import { useKaraFunData, searchKaraFunSongs } from '@/hooks/useKaraFunData';
import { useKaraokeData } from '@/hooks/useKaraokeData';
import { useAuth } from '@/context/AuthContext';
import Pane from './Pane';
import Field from './Field';
import ToolBtn from './ToolBtn';
import { tiny } from './treatments';
import EmptyState from '@/components/ui/EmptyState';
import TextInput from '@/components/ui/TextInput';
import ToggleSwitch from '@/components/ui/ToggleSwitch';
import RangeSlider from '@/components/ui/RangeSlider';
import Avatar from '@/components/ui/Avatar';

const row = (t) => ({ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderBottom: `1px solid ${t.hair}` });
const btnRow = { display: 'flex', gap: 6, flex: 'none' };

function SingerPicker({ t, singers, onPick, onCancel, allowPublic }) {
    return (
        <div style={{ position: 'absolute', zIndex: 5, top: '100%', right: 0, marginTop: 4, width: 220, background: t.pane, border: `1px solid ${t.edge}`, boxShadow: '0 10px 26px -12px rgba(0,0,0,.7)' }}>
            {allowPublic && (
                <button onClick={() => onPick(null)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', background: 'transparent', border: 'none', borderBottom: `1px solid ${t.hair}`, color: t.text, cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 12 }}>
                    Anyone (public request)
                </button>
            )}
            {singers.length === 0 && <div style={{ padding: 10, ...tiny(t), color: t.faint }}>No singers online right now.</div>}
            {singers.map(s => (
                <button key={s.id} onClick={() => onPick(s.id, s)} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '8px 10px', background: 'transparent', border: 'none', borderBottom: `1px solid ${t.hair}`, color: t.text, cursor: 'pointer' }}>
                    <Avatar photoURL={s.photoURL} username={s.twitchUsername} size={18} />
                    <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12 }}>{s.twitchUsername || s.displayName}</span>
                </button>
            ))}
            <button onClick={onCancel} style={{ display: 'block', width: '100%', textAlign: 'center', padding: '6px 10px', background: 'transparent', border: 'none', color: t.faint, cursor: 'pointer', ...tiny(t) }}>Cancel</button>
        </div>
    );
}

function SongRow({ t, song, canSelfAdd, onlineSingers, onSelfAdd, onRequest }) {
    const [picker, setPicker] = useState(null); // 'request' | 'duet' | null

    return (
        <div style={{ ...row(t), position: 'relative' }}>
            {song.img && <Image src={song.img} alt="" width={32} height={32} style={{ flex: 'none', objectFit: 'cover' }} />}
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12.5, fontWeight: 600, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{song.title}</div>
                <div style={{ fontFamily: 'var(--font-sans)', fontSize: 11, color: t.dim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{song.artist}</div>
            </div>
            <div style={btnRow}>
                {canSelfAdd && (
                    <>
                        <ToolBtn t={t} icon={<Mic size={11} />} onClick={() => onSelfAdd(song, null)}>Add for myself</ToolBtn>
                        <ToolBtn t={t} icon={<UserPlus size={11} />} onClick={() => setPicker(picker === 'duet' ? null : 'duet')}>Duet</ToolBtn>
                    </>
                )}
                <ToolBtn t={t} onClick={() => setPicker(picker === 'request' ? null : 'request')}>Request…</ToolBtn>
            </div>
            {picker === 'duet' && (
                <SingerPicker t={t} singers={onlineSingers} allowPublic={false}
                    onPick={(uid) => { onSelfAdd(song, uid); setPicker(null); }}
                    onCancel={() => setPicker(null)} />
            )}
            {picker === 'request' && (
                <SingerPicker t={t} singers={onlineSingers} allowPublic
                    onPick={(uid) => { onRequest(song, uid); setPicker(null); }}
                    onCancel={() => setPicker(null)} />
            )}
        </div>
    );
}

// Search/self-add/request/duet - shared by every logged-in role. Mod
// oversight (request management, staging queue, rotation order, playback
// controls for mods) lives entirely in KaraokeModPane instead, kept off this
// tab rather than mixed into the same sidebar - see #27.
export default function KaraokePane({ t, d, targetUid, userRole, user, userSettings }) {
    const {
        queueData, partyId, addToQueue, removeFromQueue,
        adjustPitch, adjustTempo, setVolume, setBackingVocalsVolume, setLeadVocalVolume, playSong, skipSong,
    } = useKaraFunData({ targetUid, userSettings });

    const {
        requests, onlineSingers, rotationOrder, permissions, getActiveSingerUid, nameFor,
        submitRequest, acceptRequest, declineAsTarget,
        selfAdd, inviteDuet, respondToDuetInvite, singSoloAfterDecline, dropDeclinedDuet, toggleParticipating,
    } = useKaraokeData({ targetUid, user });

    const isMod = userRole === 'broadcaster' || userRole === 'mod';
    const isSinger = userRole === 'singer';
    const myPerm = permissions[user?.uid];
    const iAmParticipating = !!myPerm?.participating;
    // Twitch OIDC never populates the Firebase Auth user's displayName (see
    // AuthContext.js) - the real handle lives on the Firestore user doc.
    const { userData } = useAuth();
    const singerName = userData?.twitchUsername || user?.displayName || 'Singer';
    // Broadcaster/mod can always add for themselves - the participating gate
    // only exists for the singer role (opting in/out of being pickable).
    const canSelfAdd = isMod || (isSinger && iAmParticipating);

    const [searchTerm, setSearchTerm] = useState('');
    const [results, setResults] = useState([]);
    const [searching, setSearching] = useState(false);

    useEffect(() => {
        if (!searchTerm || !partyId) return;
        let cancelled = false;
        const timer = setTimeout(async () => {
            setSearching(true);
            try {
                const r = await searchKaraFunSongs(partyId, searchTerm);
                if (!cancelled) setResults(r);
            } catch { if (!cancelled) setResults([]); }
            if (!cancelled) setSearching(false);
        }, 350);
        return () => { cancelled = true; clearTimeout(timer); };
    }, [searchTerm, partyId]);
    // Derived rather than reset via effect: clears the moment the box is
    // emptied instead of lagging a render behind.
    const visibleResults = searchTerm ? results : [];

    const myRequests = requests.filter(r => r.kind !== 'duet' && r.targetSingerUid === user?.uid && r.status === 'pending');
    const publicRequests = requests.filter(r => r.kind !== 'duet' && r.status === 'public');
    const myDuetInvites = requests.filter(r => r.kind === 'duet' && r.targetSingerUid === user?.uid && r.status === 'pending');
    // Duets I asked for that came back declined - my move now: solo, drop, or ask someone else.
    const myDeclinedDuets = requests.filter(r => r.kind === 'duet' && r.requestedBy === user?.uid && r.status === 'declined');
    // A duet invite I sent that's still waiting on the other singer - shown so
    // it can be cancelled directly instead of only ever timing out on its own
    // (5 min to expireKaraokeRequests, invisible to the invitee's UI as a
    // duet the whole time either way).
    const myPendingDuetInvites = requests.filter(r => r.kind === 'duet' && r.requestedBy === user?.uid && r.status === 'pending');

    // Best-effort correlation: KaraFun's own queue has no id we get back from
    // queueAdd, so "am I on air" is inferred from the display name we sent
    // as `singer` - "Alice & Bob" for a duet, per our own convention. Mods
    // get playback controls unconditionally in the KaraFun Mod tab instead.
    const onAirNames = (queueData?.currentSong?.singer || '').split(/\s*&\s*/).map(s => s.trim()).filter(Boolean);
    const isDuetOnAir = onAirNames.length > 1;

    // Who's actually singing right now, via useKaraokeData's shared
    // getActiveSingerUid - not a value tracked in Firestore (that drifted
    // from reality once), and not derived independently here either
    // anymore (this and KaraFun Mod used to compute it two different ways
    // and could disagree when presence lagged; see #27). "Next up" is one
    // slot after them.
    const activeSingerUid = getActiveSingerUid(queueData?.currentSong?.singer);
    const nextSingerUid = rotationOrder.length === 0 ? null : (() => {
        const activeIdx = activeSingerUid ? rotationOrder.indexOf(activeSingerUid) : -1;
        return rotationOrder[activeIdx === -1 ? 0 : (activeIdx + 1) % rotationOrder.length] || null;
    })();

    // A singer who's newly online/participating isn't in the persisted
    // rotationOrder yet - indexOf(-1) would otherwise sort them first, not
    // last, jumping them ahead of everyone who's actually been waiting.
    const rotationRank = (id) => { const idx = rotationOrder.indexOf(id); return idx === -1 ? Infinity : idx; };
    // Access opens up to whoever's turn is next per rotation, not only once
    // KaraFun's own status event confirms something is already playing -
    // otherwise the one person who'd actually need Play (to start their own
    // turn) is exactly the one person who never sees it.
    const isMyTurn = onAirNames.includes(singerName) || nextSingerUid === user?.uid;

    const [pitch, setPitch] = useState(0);
    const [tempo, setTempo] = useState(0);
    const [genVol, setGenVol] = useState(100);
    const [bvVol, setBvVol] = useState(60);
    const [leadVol1, setLeadVol1] = useState(0);
    const [leadVol2, setLeadVol2] = useState(0);
    // Adjusting state during render (React's documented pattern for "reset
    // when a prop changes") rather than an effect - avoids an extra render
    // where the old song's pitch/tempo readout would flash for the new song.
    const [trackedSongKey, setTrackedSongKey] = useState(queueData?.currentSong?.title);
    if (trackedSongKey !== queueData?.currentSong?.title) {
        setTrackedSongKey(queueData?.currentSong?.title);
        setPitch(0);
        setTempo(0);
    }

    const handleSelfAdd = (song, duetUid) => duetUid ? inviteDuet(song, singerName, duetUid) : selfAdd(song, singerName, addToQueue);
    const handleRequest = (song, targetUid_) => submitRequest(song, targetUid_, singerName);

    if (!userSettings?.karaokeEnabled) {
        return (
            <Pane t={t} d={d} icon={<Mic size={13} />} title="Karaoke">
                <EmptyState icon={<Mic size={32} />} title="Karaoke requests are disabled." hint="Enable it from Settings → Sound & Media to open this up to your channel." />
            </Pane>
        );
    }
    if (!partyId) {
        return (
            <Pane t={t} d={d} icon={<Mic size={13} />} title="Karaoke">
                <EmptyState icon={<Mic size={32} />} title="No KaraFun Party ID set." hint="Set your Party ID on the KaraFun tab first." />
            </Pane>
        );
    }

    return (
        <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', gap: d.gutter }}>
            <Pane t={t} d={d} icon={<Search size={13} />} title="Search Songs" flush>
                <div style={{ padding: d.pad, borderBottom: `1px solid ${t.hair}` }}>
                    <TextInput t={t} value={searchTerm} onChange={setSearchTerm} placeholder="Search a song, artist…" />
                </div>
                {searching && <div style={{ padding: d.pad, ...tiny(t), color: t.faint }}>Searching…</div>}
                {!searching && searchTerm && visibleResults.length === 0 && <EmptyState icon={<Search size={28} />} title="No matches." />}
                {visibleResults.map(song => (
                    <SongRow key={song.songId} t={t} song={song} canSelfAdd={canSelfAdd}
                        onlineSingers={onlineSingers} onSelfAdd={handleSelfAdd} onRequest={handleRequest} />
                ))}
            </Pane>

            {/* A grid, not a narrow single-column sidebar - up to seven panels can
                stack here (queue, rotation, participation, controls, duet
                invites, requests, public requests), and forcing them all one-
                wide wasted the dashboard's actual width. */}
            <div style={{ flex: 1.2, minWidth: 0, minHeight: 0, display: 'grid', gridTemplateColumns: '1fr 1fr', gridAutoRows: 'min-content', alignContent: 'start', gap: d.gutter, overflowY: 'auto' }}>
                <Pane t={t} d={d} icon={<Music size={13} />} title="Queue" flush>
                    <div style={{ padding: d.pad, borderBottom: `1px solid ${t.hair}`, background: t.inset }}>
                        <div style={{ ...tiny(t), color: t.faint }}>Now playing</div>
                        {queueData?.currentSong ? (
                            <div style={{ marginTop: 4, display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                                <span style={{ fontFamily: 'var(--font-sans)', fontSize: 13.5, fontWeight: 700, color: t.text }}>{queueData.currentSong.title}</span>
                                <span style={{ fontFamily: 'var(--font-sans)', fontSize: 11.5, color: t.dim }}>{queueData.currentSong.singer}</span>
                            </div>
                        ) : (
                            <div style={{ marginTop: 4, fontFamily: 'var(--font-sans)', fontSize: 12, color: t.faint }}>Nothing playing.</div>
                        )}
                    </div>
                    {(queueData?.upcoming || []).length === 0 ? (
                        <EmptyState icon={<Music size={24} />} title="Queue is empty." />
                    ) : queueData.upcoming.map((song, i) => {
                        const names = (song.singer || '').split(/\s*&\s*/).map(s => s.trim());
                        const isMine = names.includes(singerName);
                        return (
                            <div key={song.queueId || i} style={row(t)}>
                                <span style={{ width: 16, flex: 'none', ...tiny(t), color: t.faint }}>{i + 1}</span>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{song.title}</div>
                                    <div style={{ fontFamily: 'var(--font-sans)', fontSize: 11, color: t.faint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{song.singer}</div>
                                </div>
                                {(isMod || isMine) && (
                                    <button type="button" disabled={!song.queueId} title={song.queueId ? 'Remove from queue' : 'Not removable yet'} onClick={() => removeFromQueue(song.queueId)} style={{ flex: 'none', display: 'grid', placeItems: 'center', width: 22, height: 22, appearance: 'none', border: 'none', background: 'transparent', color: t.faint, cursor: song.queueId ? 'pointer' : 'default', opacity: song.queueId ? 1 : 0.4 }}>
                                        <Trash2 size={13} />
                                    </button>
                                )}
                            </div>
                        );
                    })}
                </Pane>

                <Pane t={t} d={d} icon={<Users size={13} />} title="Rotation Order">
                    {onlineSingers.length === 0 ? (
                        <EmptyState icon={<Users size={28} />} title="No participating singers online." />
                    ) : [...onlineSingers].sort((a, b) => rotationRank(a.id) - rotationRank(b.id)).map((s, i) => (
                        <div key={s.id} style={row(t)}>
                            <span style={{ width: 14, flex: 'none', display: 'grid', placeItems: 'center' }}>
                                {(activeSingerUid ? s.id === activeSingerUid : i === 0) && <ArrowRight size={13} color="var(--primary-500)" />}
                            </span>
                            <Avatar photoURL={s.photoURL} username={s.twitchUsername} size={20} />
                            <span style={{ flex: 1, fontFamily: 'var(--font-sans)', fontSize: 12, color: t.text }}>{s.twitchUsername || s.displayName}</span>
                        </div>
                    ))}
                </Pane>

                {(isSinger || isMod) && (
                    <Pane t={t} d={d} icon={<Mic size={13} />} title="My Participation">
                        <ToggleSwitch t={t} checked={iAmParticipating} onChange={toggleParticipating} label="Participating tonight" description={isMod ? "On = you show up in Rotation Order and can be picked for requests/duets, same as a singer." : "Off = you're just watching: you can still request songs, but you won't be pickable and can't add your own."} />
                    </Pane>
                )}

                {isMyTurn && (
                    <Pane t={t} d={d} icon={<Play size={13} />} title={queueData?.currentSong ? `Now: ${queueData.currentSong.title}` : 'Your turn is next'}>
                        {/* Play/Skip stay visible with nothing playing yet - Play is
                            exactly how you start your own turn, so hiding it until
                            something's already playing removed the one control the
                            person whose turn it is actually needs. */}
                        <div style={{ display: 'flex', gap: 8 }}>
                            <ToolBtn t={t} icon={queueData?.playState === 'playing' ? <Pause size={12} /> : <Play size={12} />} onClick={playSong}>{queueData?.playState === 'playing' ? 'Pause' : 'Play'}</ToolBtn>
                            <ToolBtn t={t} icon={<SkipForward size={12} />} onClick={skipSong}>Skip</ToolBtn>
                        </div>
                        {!queueData?.currentSong ? (
                            <EmptyState icon={<Play size={28} />} title="Nothing playing yet." hint="Play starts your song once it's up." />
                        ) : (
                            <>
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
                )}

                {myDuetInvites.length > 0 && (
                    <Pane t={t} d={d} icon={<UserPlus size={13} />} title="Duet Invites For You">
                        {myDuetInvites.map(entry => (
                            <div key={entry.id} style={row(t)}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: t.text }}>{entry.title}</div>
                                    <div style={{ ...tiny(t), color: t.faint }}>with {entry.requestedByName}</div>
                                </div>
                                <div style={btnRow}>
                                    <ToolBtn t={t} icon={<Check size={11} />} onClick={() => respondToDuetInvite(entry, true, singerName, addToQueue)}>Accept</ToolBtn>
                                    <ToolBtn t={t} icon={<X size={11} />} onClick={() => respondToDuetInvite(entry, false, singerName, addToQueue)}>Decline</ToolBtn>
                                </div>
                            </div>
                        ))}
                    </Pane>
                )}

                {myPendingDuetInvites.length > 0 && (
                    <Pane t={t} d={d} icon={<UserPlus size={13} />} title="Duet Invite Sent">
                        {myPendingDuetInvites.map(entry => (
                            <div key={entry.id} style={row(t)}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: t.text }}>{entry.title}</div>
                                    <div style={{ ...tiny(t), color: t.faint }}>waiting on {nameFor(entry.targetSingerUid)}</div>
                                </div>
                                <ToolBtn t={t} icon={<X size={11} />} onClick={() => dropDeclinedDuet(entry.id)}>Cancel</ToolBtn>
                            </div>
                        ))}
                    </Pane>
                )}

                {myDeclinedDuets.length > 0 && (
                    <Pane t={t} d={d} icon={<UserPlus size={13} />} title="Duet Declined">
                        {myDeclinedDuets.map(entry => (
                            <div key={entry.id} style={row(t)}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: t.text }}>{entry.title}</div>
                                    <div style={{ ...tiny(t), color: t.faint }}>they said no</div>
                                </div>
                                <div style={btnRow}>
                                    <ToolBtn t={t} onClick={() => singSoloAfterDecline(entry, singerName, addToQueue)}>Sing Solo</ToolBtn>
                                    <ToolBtn t={t} icon={<X size={11} />} onClick={() => dropDeclinedDuet(entry.id)}>Drop</ToolBtn>
                                </div>
                            </div>
                        ))}
                    </Pane>
                )}

                {(isSinger && iAmParticipating) && myRequests.length > 0 && (
                    <Pane t={t} d={d} icon={<Mic size={13} />} title="Requests For You">
                        {myRequests.map(reqst => (
                            <div key={reqst.id} style={row(t)}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: t.text }}>{reqst.title}</div>
                                    <div style={{ ...tiny(t), color: t.faint }}>requested by {reqst.requestedByName}</div>
                                </div>
                                <div style={btnRow}>
                                    <ToolBtn t={t} icon={<Check size={11} />} onClick={() => acceptRequest(reqst, singerName, addToQueue)}>Accept</ToolBtn>
                                    <ToolBtn t={t} icon={<X size={11} />} onClick={() => declineAsTarget(reqst.id)}>Decline</ToolBtn>
                                </div>
                            </div>
                        ))}
                    </Pane>
                )}

                {(isSinger && iAmParticipating) && publicRequests.length > 0 && (
                    <Pane t={t} d={d} icon={<Users size={13} />} title="Public Requests">
                        {publicRequests.map(reqst => (
                            <div key={reqst.id} style={row(t)}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: t.text }}>{reqst.title}</div>
                                    <div style={{ ...tiny(t), color: t.faint }}>requested by {reqst.requestedByName}</div>
                                </div>
                                <ToolBtn t={t} icon={<Check size={11} />} onClick={() => acceptRequest(reqst, singerName, addToQueue)}>Claim</ToolBtn>
                            </div>
                        ))}
                    </Pane>
                )}
            </div>
        </div>
    );
}
