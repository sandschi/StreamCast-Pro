'use client';

import { useEffect, useMemo, useState } from 'react';
import { db } from '@/lib/firebase';
import {
    collection, doc, onSnapshot, addDoc, updateDoc, deleteDoc, setDoc,
    serverTimestamp, Timestamp, query, orderBy,
} from 'firebase/firestore';

const RESPOND_WINDOW_MS = 5 * 60 * 1000;
const PUBLIC_WINDOW_MS = 10 * 60 * 1000;

// Song requests, the rotation-ordered staging queue, and the online+
// participating singer list (see #27). Split from useKaraFunData - that hook
// owns the live KaraFun socket connection; this one owns our own Firestore
// data model that sits in front of it. A component wires the two together
// (e.g. pushing a staging entry into KaraFun's real queue via
// karaFun.addToQueue once it's that singer's turn).
export function useKaraokeData({ targetUid, user }) {
    const [requests, setRequests] = useState([]);
    const [stagingQueue, setStagingQueue] = useState([]);
    const [presence, setPresence] = useState([]);
    const [permissions, setPermissions] = useState({});
    const [rotationOrder, setRotationOrderState] = useState([]);

    useEffect(() => {
        if (!targetUid) return;

        const unsubRequests = onSnapshot(collection(db, 'users', targetUid, 'karaoke_requests'), (snap) => {
            setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });

        const unsubStaging = onSnapshot(query(collection(db, 'users', targetUid, 'karaoke_staging_queue'), orderBy('order', 'asc')), (snap) => {
            setStagingQueue(snap.docs.map(d => ({ id: d.id, ...d.data() })));
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

        return () => { unsubRequests(); unsubStaging(); unsubPresence(); unsubPermissions(); unsubSettings(); };
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
                if (!perm || perm.role !== 'singer' || !perm.participating) return false;
                const lastSeenMs = p.lastSeen?.toMillis ? p.lastSeen.toMillis() : 0;
                return now - lastSeenMs < 90_000;
            })
            .map(p => ({ id: p.id, displayName: p.displayName, twitchUsername: p.twitchUsername, photoURL: p.photoURL }));
    }, [presence, permissions, now]);

    const submitRequest = async (song, targetSingerUid) => {
        if (!targetUid || !user) return;
        const requestedByName = user.displayName || 'Someone';
        const now = Date.now();
        await addDoc(collection(db, 'users', targetUid, 'karaoke_requests'), {
            songId: song.songId, title: song.title, artist: song.artist,
            requestedBy: user.uid, requestedByName,
            targetSingerUid: targetSingerUid || null,
            status: targetSingerUid ? 'pending' : 'public',
            createdAt: serverTimestamp(),
            respondBy: targetSingerUid ? Timestamp.fromMillis(now + RESPOND_WINDOW_MS) : null,
            publicExpireBy: targetSingerUid ? null : Timestamp.fromMillis(now + PUBLIC_WINDOW_MS),
        });
    };

    // duetInvite is always written explicitly (map or null), never omitted -
    // firestore.rules checks it with `!= null`, which throws on a genuinely
    // absent field rather than treating it like JS's undefined.
    const pushToStaging = async (requestOrSong, singerUid, singerName) => {
        const stagingRef = collection(db, 'users', targetUid, 'karaoke_staging_queue');
        const maxOrder = stagingQueue.reduce((m, s) => Math.max(m, s.order ?? 0), 0);
        await addDoc(stagingRef, {
            songId: requestOrSong.songId, title: requestOrSong.title, artist: requestOrSong.artist,
            singerUid, singerName, coSingerUid: null, coSingerName: null,
            duetInvite: null, addedAt: serverTimestamp(), order: maxOrder + 1,
        });
    };

    // Accept as the originally-targeted singer, or claim an already-public
    // request - same outcome either way, just gated differently by the caller.
    const acceptRequest = async (request, singerName) => {
        await updateDoc(doc(db, 'users', targetUid, 'karaoke_requests', request.id), { status: 'accepted' });
        await pushToStaging(request, user.uid, singerName);
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

    const selfAdd = async (song, singerName, duetInviteUid) => {
        const stagingRef = collection(db, 'users', targetUid, 'karaoke_staging_queue');
        const maxOrder = stagingQueue.reduce((m, s) => Math.max(m, s.order ?? 0), 0);
        await addDoc(stagingRef, {
            songId: song.songId, title: song.title, artist: song.artist,
            singerUid: user.uid, singerName, coSingerUid: null, coSingerName: null,
            duetInvite: duetInviteUid ? { invitedUid: duetInviteUid, status: 'pending' } : null,
            addedAt: serverTimestamp(), order: maxOrder + 1,
        });
    };

    const respondToDuetInvite = async (entryId, accept, coSingerName) => {
        const ref = doc(db, 'users', targetUid, 'karaoke_staging_queue', entryId);
        if (accept) {
            await updateDoc(ref, {
                coSingerUid: user.uid, coSingerName,
                duetInvite: { invitedUid: user.uid, status: 'accepted' },
            });
        } else {
            await updateDoc(ref, { 'duetInvite.status': 'declined' });
        }
    };

    // Asker's choice after a decline: sing it solo, drop it, or re-invite someone else.
    const clearDuetInvite = async (entryId) => updateDoc(doc(db, 'users', targetUid, 'karaoke_staging_queue', entryId), { duetInvite: null });
    const reInviteDuet = async (entryId, invitedUid) => updateDoc(doc(db, 'users', targetUid, 'karaoke_staging_queue', entryId), { duetInvite: { invitedUid, status: 'pending' } });
    const dropStagingEntry = async (entryId) => deleteDoc(doc(db, 'users', targetUid, 'karaoke_staging_queue', entryId));

    // Simple index-swap reorder within the staging list - mod drag-and-drop.
    const reorderStaging = async (fromIndex, toIndex) => {
        const items = [...stagingQueue];
        const [moved] = items.splice(fromIndex, 1);
        items.splice(toIndex, 0, moved);
        await Promise.all(items.map((item, i) => updateDoc(doc(db, 'users', targetUid, 'karaoke_staging_queue', item.id), { order: i })));
    };

    const setRotationOrder = async (uidArray) => {
        await setDoc(doc(db, 'users', targetUid, 'settings', 'config'), { karaokeRotationOrder: uidArray }, { merge: true });
    };

    const toggleParticipating = async (value) => {
        if (!user) return;
        await setDoc(doc(db, 'users', targetUid, 'permissions', user.uid), { participating: value }, { merge: true });
    };

    return {
        requests, stagingQueue, onlineSingers, rotationOrder, permissions,
        submitRequest, acceptRequest, declineAsTarget, modDecline, modForcePublic,
        selfAdd, respondToDuetInvite, clearDuetInvite, reInviteDuet, dropStagingEntry,
        reorderStaging, setRotationOrder, toggleParticipating,
    };
}
