'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { Mic, Search, UserPlus, Check, X, ArrowUp, ArrowDown, Play, SkipForward, Trash2, Users } from 'lucide-react';
import { useKaraFunData, searchKaraFunSongs } from '@/hooks/useKaraFunData';
import { useKaraokeData } from '@/hooks/useKaraokeData';
import Pane from './Pane';
import Field from './Field';
import ToolBtn from './ToolBtn';
import ResizableWidth from './ResizableWidth';
import { MONO, tiny, L } from './treatments';
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

function SongRow({ t, song, isSinger, canParticipate, onlineSingers, onSelfAdd, onRequest }) {
    const [picker, setPicker] = useState(null); // 'request' | 'duet' | null

    return (
        <div style={{ ...row(t), position: 'relative' }}>
            {song.img && <Image src={song.img} alt="" width={32} height={32} style={{ flex: 'none', objectFit: 'cover' }} />}
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12.5, fontWeight: 600, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{song.title}</div>
                <div style={{ fontFamily: 'var(--font-sans)', fontSize: 11, color: t.dim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{song.artist}</div>
            </div>
            <div style={btnRow}>
                {isSinger && canParticipate && (
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

export default function KaraokePane({ t, d, targetUid, userRole, user, userSettings }) {
    const {
        queueData, partyId, addToQueue, moveInQueue, removeFromQueue,
        adjustPitch, adjustTempo, setVolume, setBackingVocalsVolume, setLeadVocalVolume, playSong, skipSong,
    } = useKaraFunData({ targetUid, userSettings });

    const {
        requests, stagingQueue, onlineSingers, rotationOrder, permissions,
        submitRequest, acceptRequest, declineAsTarget, modDecline, modForcePublic,
        selfAdd, respondToDuetInvite, clearDuetInvite, dropStagingEntry,
        reorderStaging, setRotationOrder, toggleParticipating,
    } = useKaraokeData({ targetUid, user });

    const isMod = userRole === 'broadcaster' || userRole === 'mod';
    const isSinger = userRole === 'singer';
    const myPerm = permissions[user?.uid];
    const iAmParticipating = !!myPerm?.participating;
    const singerName = user?.displayName || 'Singer';

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

    const myRequests = requests.filter(r => r.targetSingerUid === user?.uid && r.status === 'pending');
    const publicRequests = requests.filter(r => r.status === 'public');
    const myDuetInvites = stagingQueue.filter(s => s.duetInvite?.invitedUid === user?.uid && s.duetInvite?.status === 'pending');
    const modQueue = requests.filter(r => r.status === 'pending' || r.status === 'public');

    // Best-effort correlation: KaraFun's own queue has no id we get back from
    // queueAdd, so "who's on/is it my turn" is inferred from the display name
    // we sent as `singer` - "Alice & Bob" for a duet, per our own convention.
    const onAirNames = (queueData?.currentSong?.singer || '').split(/\s*&\s*/).map(s => s.trim()).filter(Boolean);
    const isMyTurn = onAirNames.includes(singerName);
    const isDuetOnAir = onAirNames.length > 1;
    const showControls = isMod || isMyTurn;

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

    const handleSelfAdd = (song, duetUid) => selfAdd(song, singerName, duetUid);
    const handleRequest = (song, targetUid_) => submitRequest(song, targetUid_);

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
                    <SongRow key={song.songId} t={t} song={song} isSinger={isSinger} canParticipate={iAmParticipating}
                        onlineSingers={onlineSingers} onSelfAdd={handleSelfAdd} onRequest={handleRequest} />
                ))}
            </Pane>

            <ResizableWidth t={t} storageKey="sc-karaoke-w" defaultWidth={d.inspector + 60} minWidth={260} maxWidth={560} style={{ display: 'flex', flexDirection: 'column', gap: d.gutter, overflowY: 'auto', minHeight: 0 }}>
                {isSinger && (
                    <Pane t={t} d={d} icon={<Mic size={13} />} title="My Participation">
                        <ToggleSwitch t={t} checked={iAmParticipating} onChange={toggleParticipating} label="Participating tonight" description="Off = you're just watching: you can still request songs, but you won't be pickable and can't add your own." />
                    </Pane>
                )}

                {showControls && (
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
                )}

                {myDuetInvites.length > 0 && (
                    <Pane t={t} d={d} icon={<UserPlus size={13} />} title="Duet Invites For You">
                        {myDuetInvites.map(entry => (
                            <div key={entry.id} style={row(t)}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: t.text }}>{entry.title}</div>
                                    <div style={{ ...tiny(t), color: t.faint }}>with {entry.singerName}</div>
                                </div>
                                <div style={btnRow}>
                                    <ToolBtn t={t} icon={<Check size={11} />} onClick={() => respondToDuetInvite(entry.id, true, singerName)}>Accept</ToolBtn>
                                    <ToolBtn t={t} icon={<X size={11} />} onClick={() => respondToDuetInvite(entry.id, false)}>Decline</ToolBtn>
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
                                    <ToolBtn t={t} icon={<Check size={11} />} onClick={() => acceptRequest(reqst, singerName)}>Accept</ToolBtn>
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
                                <ToolBtn t={t} icon={<Check size={11} />} onClick={() => acceptRequest(reqst, singerName)}>Claim</ToolBtn>
                            </div>
                        ))}
                    </Pane>
                )}

                {isMod && (
                    <>
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
            </ResizableWidth>
        </div>
    );
}
