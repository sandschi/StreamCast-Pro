'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { db } from '@/lib/firebase';
import {
    collection, doc, onSnapshot, addDoc, updateDoc, setDoc, runTransaction,
    serverTimestamp, Timestamp, query, orderBy,
} from 'firebase/firestore';

const RESPOND_WINDOW_MS = 5 * 60 * 1000;
const PUBLIC_WINDOW_MS = 10 * 60 * 1000;
// Mods and the broadcaster can sing too - scoping this to 'singer' left them
// unable to ever show up in Rotation Order or be pickable as a request/duet
// target, even though they can already self-add unconditionally elsewhere.
const ELIGIBLE_ROTATION_ROLES = ['singer', 'mod', 'broadcaster'];

// Song requests, duet invites, and the online+participating singer list (see
// #27). Deliberately does NOT hold songs anywhere before they hit KaraFun's
// real queue - accept/self-add push straight into it via the addToQueue
// callback the caller supplies (from useKaraFunData), and fairness is
// enforced afterward by reordering that same live queue via queueMove
// (see KaraFunPane.js's auto-sort effect), not by staging songs in our own
// Firestore collection first. An earlier version held a separate
// karaoke_staging_queue with a manual "push next" step; dropped per
// feedback - moving songs around in the actual KaraFun queue is the point,
// not a parallel holding area.
export function useKaraokeData({ targetUid, user, userRole }) {
    const [requests, setRequests] = useState([]);
    const [presence, setPresence] = useState([]);
    const [permissions, setPermissions] = useState({});
    const [rotationOrder, setRotationOrderState] = useState([]);

    useEffect(() => {
        if (!targetUid) return;

        const unsubRequests = onSnapshot(query(collection(db, 'users', targetUid, 'karaoke_requests'), orderBy('createdAt', 'asc')), (snap) => {
            setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });

        const unsubPresence = onSnapshot(collection(db, 'users', targetUid, 'online'), (snap) => {
            setPresence(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });

        const unsubPermissions = onSnapshot(collection(db, 'users', targetUid, 'permissions'), (snap) => {
            const perms = {};
            snap.forEach(d => { perms[d.id] = d.data(); });
            setPermissions(perms);
        });

        const unsubSettings = onSnapshot(doc(db, 'users', targetUid, 'settings', 'config'), (snap) => {
            setRotationOrderState(snap.exists() ? (snap.data().karaokeRotationOrder || []) : []);
        });

        return () => { unsubRequests(); unsubPresence(); unsubPermissions(); unsubSettings(); };
    }, [targetUid]);

    // "now" is tracked as state (rather than called inline in the memo below)
    // so the memo stays a pure function of its explicit inputs - it just
    // recomputes whenever this ticks, same end result without an impure
    // Date.now() call inside render.
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), 15_000);
        return () => clearInterval(id);
    }, []);

    // Sweeps timed-out requests (pending -> public after 5 min unanswered,
    // public -> expired after 10 min unclaimed). This was originally a
    // Cloud Scheduler function (functions/index.js's expireKaraokeRequests)
    // so it'd fire even with no dashboard open, but that needs the project
    // on Firebase's Blaze plan to deploy at all - not available here, so
    // this client-driven fallback is the same pattern useChatData.js already
    // uses for active_message expiry, with the same tradeoff: it only runs
    // while a mod/broadcaster dashboard happens to be open. Gated to
    // mod/broadcaster because that's the only role firestore.rules lets
    // transition these fields (isChannelModerator) - a singer/viewer
    // dashboard attempting this would just get permission-denied.
    const canExpire = userRole === 'broadcaster' || userRole === 'mod';
    useEffect(() => {
        if (!targetUid || !canExpire) return;
        requests.forEach(r => {
            if (r.status === 'pending' && r.respondBy && r.respondBy.toMillis() <= now) {
                const ref = doc(db, 'users', targetUid, 'karaoke_requests', r.id);
                runTransaction(db, async (tx) => {
                    const fresh = await tx.get(ref);
                    const data = fresh.data();
                    if (!fresh.exists() || data.status !== 'pending' || !(data.respondBy?.toMillis() <= now)) return;
                    tx.update(ref, {
                        status: 'public', targetSingerUid: null, respondBy: null,
                        publicExpireBy: Timestamp.fromMillis(now + PUBLIC_WINDOW_MS),
                    });
                }).catch(e => console.error('Error expiring karaoke request:', e));
            } else if (r.status === 'public' && r.publicExpireBy && r.publicExpireBy.toMillis() <= now) {
                const ref = doc(db, 'users', targetUid, 'karaoke_requests', r.id);
                runTransaction(db, async (tx) => {
                    const fresh = await tx.get(ref);
                    const data = fresh.data();
                    if (!fresh.exists() || data.status !== 'public' || !(data.publicExpireBy?.toMillis() <= now)) return;
                    tx.update(ref, { status: 'expired' });
                }).catch(e => console.error('Error expiring karaoke request:', e));
            }
        });
    }, [targetUid, canExpire, requests, now]);

    // A stale heartbeat (see dashboard/page.js - written every 30s, no
    // onDisconnect) is the closest thing to "closed the tab" this app has;
    // treat >90s since lastSeen as effectively offline rather than waiting on
    // a signal that doesn't exist.
    const onlineSingers = useMemo(() => {
        return presence
            .filter(p => {
                const perm = permissions[p.id];
                const role = perm?.role || (p.id === targetUid ? 'broadcaster' : null);
                if (!ELIGIBLE_ROTATION_ROLES.includes(role)) return false;
                // The broadcaster has no reason to opt in/out via a permission
                // doc the way an invited singer does - they're always in their
                // own rotation. Without this, a broadcaster with no permissions
                // doc yet (the common case - UsersPane never creates one for
                // the owner) silently drops out of onlineSingers entirely.
                if (role !== 'broadcaster' && !perm?.participating) return false;
                const lastSeenMs = p.lastSeen?.toMillis ? p.lastSeen.toMillis() : 0;
                return now - lastSeenMs < 90_000;
            })
            .map(p => ({ id: p.id, displayName: p.displayName, twitchUsername: p.twitchUsername, photoURL: p.photoURL }));
    }, [presence, permissions, now, targetUid]);

    // uid -> display name, falling back to the permissions doc for a
    // participating singer who isn't currently online (e.g. their next-up
    // slot is showing while they're between songs). Shared by KaraFun Mod
    // and the Karaoke tab so "whose turn" is resolved the same way in both
    // places - they used to derive it independently and silently drifted
    // (KaraFun Mod's version had this fallback, Karaoke's didn't, so a
    // presence lapse on the active singer could hand turn control to the
    // wrong person on one tab but not the other; see #27).
    const nameFor = useCallback((uid) => {
        const online = onlineSingers.find(s => s.id === uid);
        return online?.twitchUsername || online?.displayName || permissions[uid]?.twitchUsername || permissions[uid]?.displayName || 'someone';
    }, [onlineSingers, permissions]);

    // KaraFun's currentSong.singer is a plain string ("Alice" or, for a
    // duet, "Alice & Bob" per our own queueAdd convention) - resolve its
    // primary name back to a rotationOrder uid via nameFor above.
    const getActiveSingerUid = useCallback((currentSongSinger) => {
        const primary = (currentSongSinger || '').split(/\s*&\s*/)[0].trim();
        if (!primary) return null;
        return rotationOrder.find(uid => nameFor(uid) === primary) || null;
    }, [rotationOrder, nameFor]);

    const submitRequest = async (song, targetSingerUid, requestedByName) => {
        if (!targetUid || !user) return;
        const now = Date.now();
        await addDoc(collection(db, 'users', targetUid, 'karaoke_requests'), {
            kind: 'song', songId: song.songId, title: song.title, artist: song.artist,
            requestedBy: user.uid, requestedByName: requestedByName || 'Someone',
            targetSingerUid: targetSingerUid || null,
            status: targetSingerUid ? 'pending' : 'public',
            createdAt: serverTimestamp(),
            respondBy: targetSingerUid ? Timestamp.fromMillis(now + RESPOND_WINDOW_MS) : null,
            publicExpireBy: targetSingerUid ? null : Timestamp.fromMillis(now + PUBLIC_WINDOW_MS),
        });
    };

    // Accept as the originally-targeted singer, or claim an already-public
    // request - same outcome either way. addToQueue is useKaraFunData's live
    // KaraFun emitter, passed in by the caller so this hook stays ignorant of
    // the socket connection itself. The Firestore write happens FIRST, inside
    // a transaction that checks the request hasn't already been resolved by
    // someone else (a mod force-publishing it, another singer claiming a
    // public request, etc.) - addToQueue only fires once that succeeds, so a
    // race can no longer queue the same request's song twice.
    const acceptRequest = async (request, singerName, addToQueue) => {
        const reqRef = doc(db, 'users', targetUid, 'karaoke_requests', request.id);
        try {
            await runTransaction(db, async (tx) => {
                const snap = await tx.get(reqRef);
                if (!snap.exists() || !['pending', 'public'].includes(snap.data().status)) {
                    throw new Error('karaoke-request-already-resolved');
                }
                tx.update(reqRef, { status: 'accepted' });
            });
        } catch {
            return;
        }
        addToQueue(request.songId, singerName);
    };

    // Only the targeted singer declining - drops to public, doesn't kill it.
    const declineAsTarget = async (requestId) => {
        await updateDoc(doc(db, 'users', targetUid, 'karaoke_requests', requestId), {
            status: 'public', targetSingerUid: null, publicExpireBy: Timestamp.fromMillis(Date.now() + PUBLIC_WINDOW_MS), respondBy: null,
        });
    };

    // Mod/broadcaster only - kills the request outright.
    const modDecline = async (requestId) => {
        await updateDoc(doc(db, 'users', targetUid, 'karaoke_requests', requestId), { status: 'declined' });
    };

    // Mod/broadcaster only - force straight to public regardless of timers.
    const modForcePublic = async (requestId) => {
        await updateDoc(doc(db, 'users', targetUid, 'karaoke_requests', requestId), {
            status: 'public', targetSingerUid: null, publicExpireBy: Timestamp.fromMillis(Date.now() + PUBLIC_WINDOW_MS), respondBy: null,
        });
    };

    // Solo self-add is a direct queueAdd - nothing to persist, there's no
    // lifecycle to track once it's already in KaraFun's real queue. A duet
    // invite is the one case that needs Firestore first: the invitee has to
    // agree before anything is actually queued, so it's recorded as a
    // karaoke_requests doc (kind: 'duet') the same shape a viewer's request
    // uses, just requestedBy === the asking singer themselves.
    const selfAdd = (song, singerName, addToQueue) => addToQueue(song.songId, singerName);

    const inviteDuet = async (song, singerName, invitedUid) => {
        await addDoc(collection(db, 'users', targetUid, 'karaoke_requests'), {
            kind: 'duet', songId: song.songId, title: song.title, artist: song.artist,
            requestedBy: user.uid, requestedByName: singerName, targetSingerUid: invitedUid,
            // A real respondBy (same window a targeted song request gets) so an
            // invitee who never responds doesn't leave this pending forever -
            // expireKaraokeRequests' respondBy<=now query can't match a null
            // field at all. The asker can also cancel it directly any time via
            // dropDeclinedDuet, which works on a still-pending invite too.
            status: 'pending', createdAt: serverTimestamp(),
            respondBy: Timestamp.fromMillis(Date.now() + RESPOND_WINDOW_MS), publicExpireBy: null,
        });
    };

    const respondToDuetInvite = async (request, accept, myName, addToQueue) => {
        if (accept) {
            addToQueue(request.songId, `${request.requestedByName} & ${myName}`);
            await updateDoc(doc(db, 'users', targetUid, 'karaoke_requests', request.id), { status: 'accepted' });
        } else {
            await updateDoc(doc(db, 'users', targetUid, 'karaoke_requests', request.id), { status: 'declined' });
        }
    };

    // Asker's choices once a duet invite they sent comes back declined.
    const singSoloAfterDecline = async (request, singerName, addToQueue) => {
        addToQueue(request.songId, singerName);
        await updateDoc(doc(db, 'users', targetUid, 'karaoke_requests', request.id), { status: 'dropped' });
    };
    const dropDeclinedDuet = async (requestId) => updateDoc(doc(db, 'users', targetUid, 'karaoke_requests', requestId), { status: 'dropped' });
    // Resets respondBy to a fresh window - without this, re-inviting after
    // the original deadline already passed (or after expireKaraokeRequests
    // already cleared it to null) would either instantly time out again or
    // never time out at all.
    const reinviteDuet = async (requestId, newInvitedUid) => updateDoc(doc(db, 'users', targetUid, 'karaoke_requests', requestId), {
        targetSingerUid: newInvitedUid, status: 'pending', respondBy: Timestamp.fromMillis(Date.now() + RESPOND_WINDOW_MS),
    });

    const setRotationOrder = async (uidArray) => {
        await setDoc(doc(db, 'users', targetUid, 'settings', 'config'), { karaokeRotationOrder: uidArray }, { merge: true });
    };

    const toggleParticipating = async (value) => {
        if (!user) return;
        await setDoc(doc(db, 'users', targetUid, 'permissions', user.uid), { participating: value }, { merge: true });
    };

    return {
        requests, onlineSingers, rotationOrder, permissions,
        nameFor, getActiveSingerUid,
        submitRequest, acceptRequest, declineAsTarget, modDecline, modForcePublic,
        selfAdd, inviteDuet, respondToDuetInvite, singSoloAfterDecline, dropDeclinedDuet, reinviteDuet,
        setRotationOrder, toggleParticipating,
    };
}
