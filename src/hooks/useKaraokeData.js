'use client';

import { useEffect, useMemo, useState } from 'react';
import { db } from '@/lib/firebase';
import {
    collection, doc, onSnapshot, addDoc, updateDoc, setDoc,
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
export function useKaraokeData({ targetUid, user }) {
    const [requests, setRequests] = useState([]);
    const [presence, setPresence] = useState([]);
    const [permissions, setPermissions] = useState({});
    const [rotationOrder, setRotationOrderState] = useState([]);
    // uid of whoever's turn is next - not the same as "first in rotationOrder"
    // once anyone has actually sung; see KaraFunPane.js's cursor-advance effect.
    const [rotationCursor, setRotationCursorState] = useState(null);

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
            setRotationCursorState(snap.exists() ? (snap.data().karaokeRotationCursor || null) : null);
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

    // A stale heartbeat (see dashboard/page.js - written every 30s, no
    // onDisconnect) is the closest thing to "closed the tab" this app has;
    // treat >90s since lastSeen as effectively offline rather than waiting on
    // a signal that doesn't exist.
    const onlineSingers = useMemo(() => {
        return presence
            .filter(p => {
                const perm = permissions[p.id];
                const role = perm?.role || (p.id === targetUid ? 'broadcaster' : null);
                if (!ELIGIBLE_ROTATION_ROLES.includes(role) || !perm?.participating) return false;
                const lastSeenMs = p.lastSeen?.toMillis ? p.lastSeen.toMillis() : 0;
                return now - lastSeenMs < 90_000;
            })
            .map(p => ({ id: p.id, displayName: p.displayName, twitchUsername: p.twitchUsername, photoURL: p.photoURL }));
    }, [presence, permissions, now, targetUid]);

    const submitRequest = async (song, targetSingerUid) => {
        if (!targetUid || !user) return;
        const requestedByName = user.displayName || 'Someone';
        const now = Date.now();
        await addDoc(collection(db, 'users', targetUid, 'karaoke_requests'), {
            kind: 'song', songId: song.songId, title: song.title, artist: song.artist,
            requestedBy: user.uid, requestedByName,
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
    // the socket connection itself.
    const acceptRequest = async (request, singerName, addToQueue) => {
        addToQueue(request.songId, singerName);
        await updateDoc(doc(db, 'users', targetUid, 'karaoke_requests', request.id), { status: 'accepted' });
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
            status: 'pending', createdAt: serverTimestamp(), respondBy: null, publicExpireBy: null,
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
    const reinviteDuet = async (requestId, newInvitedUid) => updateDoc(doc(db, 'users', targetUid, 'karaoke_requests', requestId), { targetSingerUid: newInvitedUid, status: 'pending' });

    const setRotationOrder = async (uidArray) => {
        await setDoc(doc(db, 'users', targetUid, 'settings', 'config'), { karaokeRotationOrder: uidArray }, { merge: true });
    };

    // Whoever's turn is next - advanced automatically (see KaraFunPane.js)
    // whenever a new song actually starts playing, not set directly by a mod.
    const setRotationCursor = async (uid) => {
        await setDoc(doc(db, 'users', targetUid, 'settings', 'config'), { karaokeRotationCursor: uid }, { merge: true });
    };

    const toggleParticipating = async (value) => {
        if (!user) return;
        await setDoc(doc(db, 'users', targetUid, 'permissions', user.uid), { participating: value }, { merge: true });
    };

    return {
        requests, onlineSingers, rotationOrder, rotationCursor, permissions,
        submitRequest, acceptRequest, declineAsTarget, modDecline, modForcePublic,
        selfAdd, inviteDuet, respondToDuetInvite, singSoloAfterDecline, dropDeclinedDuet, reinviteDuet,
        setRotationOrder, setRotationCursor, toggleParticipating,
    };
}
