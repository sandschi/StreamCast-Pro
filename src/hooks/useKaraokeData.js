'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

const PUBLIC_WINDOW_MS = 10 * 60 * 1000;
const RESPOND_WINDOW_MS = 5 * 60 * 1000;
// Mods and the broadcaster can sing too - scoping this to 'singer' left them
// unable to ever show up in Rotation Order or be pickable as a request/duet
// target, even though they can already self-add unconditionally elsewhere.
const ELIGIBLE_ROTATION_ROLES = ['singer', 'mod', 'broadcaster'];

const mapRequestRow = (row) => ({
    id: row.id,
    kind: row.kind,
    songId: row.song?.songId,
    title: row.song?.title,
    artist: row.song?.artist,
    requestedBy: row.requested_by,
    requestedByName: row.requested_by_name,
    targetSingerUid: row.target_singer_id,
    status: row.status,
    createdAt: row.created_at,
    respondBy: row.respond_by,
    publicExpireBy: row.public_expire_by,
});

const mapPresenceRow = (row) => ({
    id: row.viewer_id, displayName: row.display_name, photoURL: row.photo_url,
    twitchUsername: row.twitch_username, lastSeen: row.last_seen,
});

// Keeps `permissions` in the same camelCase shape the original Firestore
// docs had (role/participating/sittingOut/displayName/photoURL/
// twitchUsername) - KaraokePane.js and other still-unported consumers read
// it directly in that shape.
const mapPermissionRow = (row) => ({
    role: row.role, participating: row.participating, sittingOut: row.sitting_out,
    displayName: row.display_name, photoURL: row.photo_url, twitchUsername: row.twitch_username,
});

// Song requests, duet invites, and the online+participating singer list (see
// #27). Deliberately does NOT hold songs anywhere before they hit KaraFun's
// real queue - accept/self-add push straight into it via the addToQueue
// callback the caller supplies (from useKaraFunData), and fairness is
// enforced afterward by reordering that same live queue via queueMove
// (see KaraFunPane.js's auto-sort effect), not by staging songs in our own
// database first.
export function useKaraokeData({ targetUid, user, userRole }) {
    const [requests, setRequests] = useState([]);
    const [presence, setPresence] = useState([]);
    const [permissions, setPermissions] = useState({});
    const [rotationOrder, setRotationOrderState] = useState([]);

    useEffect(() => {
        if (!targetUid || !supabase) return;

        supabase.from('karaoke_requests').select('*').eq('user_id', targetUid).order('created_at', { ascending: true })
            .then(({ data }) => setRequests((data || []).map(mapRequestRow)));

        const requestsChannel = supabase
            .channel(`karaoke-data-requests-${targetUid}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'karaoke_requests', filter: `user_id=eq.${targetUid}` }, (payload) => {
                setRequests((prev) => {
                    if (payload.eventType === 'DELETE') return prev.filter(r => r.id !== payload.old.id);
                    const row = mapRequestRow(payload.new);
                    const idx = prev.findIndex(r => r.id === row.id);
                    const next = idx === -1 ? [...prev, row] : prev.map((r, i) => i === idx ? row : r);
                    return [...next].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
                });
            })
            .subscribe();

        supabase.from('online').select('*').eq('user_id', targetUid)
            .then(({ data }) => setPresence((data || []).map(mapPresenceRow)));

        const presenceChannel = supabase
            .channel(`karaoke-data-online-${targetUid}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'online', filter: `user_id=eq.${targetUid}` }, (payload) => {
                setPresence((prev) => {
                    if (payload.eventType === 'DELETE') return prev.filter(p => p.id !== payload.old.viewer_id);
                    const row = mapPresenceRow(payload.new);
                    const idx = prev.findIndex(p => p.id === row.id);
                    return idx === -1 ? [...prev, row] : prev.map((p, i) => i === idx ? row : p);
                });
            })
            .subscribe();

        supabase.from('permissions').select('*').eq('user_id', targetUid)
            .then(({ data }) => {
                const perms = {};
                (data || []).forEach(row => { perms[row.viewer_id] = mapPermissionRow(row); });
                setPermissions(perms);
            });

        const permissionsChannel = supabase
            .channel(`karaoke-data-permissions-${targetUid}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'permissions', filter: `user_id=eq.${targetUid}` }, (payload) => {
                setPermissions((prev) => {
                    if (payload.eventType === 'DELETE') {
                        const next = { ...prev };
                        delete next[payload.old.viewer_id];
                        return next;
                    }
                    return { ...prev, [payload.new.viewer_id]: mapPermissionRow(payload.new) };
                });
            })
            .subscribe();

        supabase.from('settings').select('karaoke_rotation_order').eq('user_id', targetUid).maybeSingle()
            .then(({ data }) => setRotationOrderState(data?.karaoke_rotation_order || []));

        const settingsChannel = supabase
            .channel(`karaoke-data-settings-${targetUid}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'settings', filter: `user_id=eq.${targetUid}` }, (payload) => {
                setRotationOrderState(payload.eventType === 'DELETE' ? [] : (payload.new?.karaoke_rotation_order || []));
            })
            .subscribe();

        return () => {
            supabase.removeChannel(requestsChannel);
            supabase.removeChannel(presenceChannel);
            supabase.removeChannel(permissionsChannel);
            supabase.removeChannel(settingsChannel);
        };
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
                if (!ELIGIBLE_ROTATION_ROLES.includes(role)) return false;
                // The broadcaster defaults into their own rotation with no
                // permissions row at all (the common case - UsersPane never
                // creates one for the owner; without this default they'd
                // silently drop out of onlineSingers entirely) - but once a
                // row exists (e.g. the broadcaster used their own
                // "Participating tonight" toggle, which writes one), its
                // explicit value must still be respected instead of the
                // broadcaster role unconditionally overriding it forever.
                const participating = role === 'broadcaster' ? perm?.participating !== false : !!perm?.participating;
                if (!participating) return false;
                const lastSeenMs = p.lastSeen ? new Date(p.lastSeen).getTime() : 0;
                return now - lastSeenMs < 90_000;
            })
            .map(p => ({ id: p.id, displayName: p.displayName, twitchUsername: p.twitchUsername, photoURL: p.photoURL }));
    }, [presence, permissions, now, targetUid]);

    // Session-lifetime cache of the last good name/avatar seen for each uid,
    // consulted only as a last-resort fallback below. The `online` and
    // `permissions` tables are two independent realtime channels (see the
    // effect above) - a brief reconnect (a network blip, or the browser tab
    // getting backgrounded/foregrounded, common while alt-tabbing to OBS
    // mid-stream) can have one channel catch up a moment before the other's,
    // or briefly redeliver an incomplete result while re-establishing.
    // Without this, that transient gap made an already-known singer's name
    // flash blank/"someone" in Rotation Order and everywhere else nameFor is
    // used, even though nothing about them actually changed - reported as
    // "really really annoying" during a live stream. Only ever updated by
    // adding/filling in real data (the upsert below keeps whatever was
    // already cached when the new value is blank), never by removing an
    // entry, so it can't itself go stale into showing a wrong name for a
    // genuinely different person - a uid's name essentially doesn't change
    // once set as long as the browser tab stays open. Plain state rather
    // than a ref: reading a ref during render (rotationMembers/nameFor both
    // need this value while computing what to return) trips this project's
    // react-hooks/refs lint rule. Merged during render itself, not in an
    // effect (react-hooks/set-state-in-effect flags a setState call
    // synchronously inside useEffect) - this is React's own documented
    // "adjusting state during rendering" pattern: comparing against the
    // last-seen inputs (also state, not a ref) and calling setState
    // conditionally in the render body bails out and re-renders immediately
    // without committing/painting the stale pass, and only actually runs
    // when onlineSingers/permissions change - exactly when nameFor/
    // rotationMembers need to recompute anyway.
    const [lastKnown, setLastKnown] = useState({});
    const [mergedInputs, setMergedInputs] = useState(null);
    if (mergedInputs?.onlineSingers !== onlineSingers || mergedInputs?.permissions !== permissions) {
        setMergedInputs({ onlineSingers, permissions });
        const upsert = (next, uid, name) => {
            if (!name.twitchUsername && !name.displayName) return;
            const prevEntry = next[uid];
            const merged = {
                twitchUsername: name.twitchUsername || prevEntry?.twitchUsername,
                displayName: name.displayName || prevEntry?.displayName,
                photoURL: name.photoURL || prevEntry?.photoURL,
            };
            if (!prevEntry || prevEntry.twitchUsername !== merged.twitchUsername || prevEntry.displayName !== merged.displayName || prevEntry.photoURL !== merged.photoURL) {
                next[uid] = merged;
            }
        };
        setLastKnown((prev) => {
            const next = { ...prev };
            onlineSingers.forEach((s) => upsert(next, s.id, s));
            Object.entries(permissions).forEach(([uid, perm]) => upsert(next, uid, {
                twitchUsername: perm?.twitchUsername, displayName: perm?.displayName, photoURL: perm?.photoURL,
            }));
            return next;
        });
    }

    // uid -> display name, falling back to the permissions row for a
    // participating singer who isn't currently online (e.g. their next-up
    // slot is showing while they're between songs). Shared by KaraFun Mod
    // and the Karaoke tab so "whose turn" is resolved the same way in both
    // places - they used to derive it independently and silently drifted
    // (KaraFun Mod's version had this fallback, Karaoke's didn't, so a
    // presence lapse on the active singer could hand turn control to the
    // wrong person on one tab but not the other; see #27).
    //
    // A `guest:{name}` id (see setRotationOrder/rotationMembers below) has no
    // account behind it at all - a mod added someone straight from chat, or
    // typed a name freeform. Its "name" is the id itself; there's nothing to
    // look up.
    const nameFor = useCallback((uid) => {
        if (uid?.startsWith('guest:')) return uid.slice(6);
        const online = onlineSingers.find(s => s.id === uid);
        const perm = permissions[uid];
        const cached = lastKnown[uid];
        return online?.twitchUsername || online?.displayName || perm?.twitchUsername || perm?.displayName || cached?.twitchUsername || cached?.displayName || 'someone';
    }, [onlineSingers, permissions, lastKnown]);

    // The persisted order, extended with any online singer it doesn't know
    // about yet (appended at the end). Both KaraFun Mod's and the Karaoke
    // tab's Rotation Order panels reorder/display THIS array and persist the
    // whole thing back via setRotationOrder - swapping within an
    // online-only view would drop every temporarily offline singer (and
    // every guest, who's never "online") from karaoke_rotation_order on the
    // next reorder.
    const fullRotationOrder = useMemo(
        () => [...rotationOrder, ...onlineSingers.map(s => s.id).filter(id => !rotationOrder.includes(id))],
        [rotationOrder, onlineSingers],
    );

    // Resolved rotation membership - real accounts (online or not) and guest
    // placeholders alike - shared by both Rotation Order panels (KaraFun Mod
    // for full management, Karaoke tab read-only) and by the mod's "add song
    // for X" attribution picker, so all three agree on who's actually in
    // rotation right now instead of each re-deriving it.
    const rotationMembers = useMemo(() => fullRotationOrder.map((id) => {
        if (id.startsWith('guest:')) {
            return { id, twitchUsername: null, displayName: id.slice(6), photoURL: null, isOnline: false, isGuest: true, sittingOut: false };
        }
        const online = onlineSingers.find(s => s.id === id);
        const perm = permissions[id];
        const cached = lastKnown[id];
        return {
            id,
            photoURL: online?.photoURL || perm?.photoURL || cached?.photoURL,
            twitchUsername: online?.twitchUsername || perm?.twitchUsername || cached?.twitchUsername,
            displayName: online?.displayName || perm?.displayName || cached?.displayName,
            isOnline: !!online,
            isGuest: false,
            sittingOut: !!perm?.sittingOut,
        };
    }), [fullRotationOrder, onlineSingers, permissions, lastKnown]);

    const submitRequest = async (song, targetSingerUid, requestedByName) => {
        if (!targetUid || !user || !supabase) return;
        const now = Date.now();
        await supabase.from('karaoke_requests').insert({
            user_id: targetUid,
            kind: 'song',
            song: { songId: song.songId, title: song.title, artist: song.artist },
            requested_by: user.id,
            requested_by_name: requestedByName || 'Someone',
            target_singer_id: targetSingerUid || null,
            status: targetSingerUid ? 'pending' : 'public',
            respond_by: targetSingerUid ? new Date(now + RESPOND_WINDOW_MS).toISOString() : null,
            public_expire_by: targetSingerUid ? null : new Date(now + PUBLIC_WINDOW_MS).toISOString(),
        });
    };

    // Accept as the originally-targeted singer, or claim an already-public
    // request - same outcome either way. addToQueue is useKaraFunData's live
    // KaraFun emitter, passed in by the caller so this hook stays ignorant of
    // the socket connection itself. The database write happens FIRST, as a
    // conditional update that only succeeds if the request hasn't already
    // been resolved by someone else (a mod force-publishing it, another
    // singer claiming a public request, etc.) - addToQueue only fires once
    // that succeeds, so a race can no longer queue the same request's song
    // twice.
    const acceptRequest = async (request, singerName, addToQueue) => {
        if (!supabase) return;
        const { data } = await supabase.from('karaoke_requests').update({ status: 'accepted' })
            .eq('id', request.id).in('status', ['pending', 'public']).select('id');
        if (!data || data.length === 0) return;
        addToQueue(request.songId, singerName);
    };

    // Only the targeted singer declining - drops to public, doesn't kill it.
    const declineAsTarget = async (requestId) => {
        await supabase.from('karaoke_requests').update({
            status: 'public', target_singer_id: null, public_expire_by: new Date(Date.now() + PUBLIC_WINDOW_MS).toISOString(), respond_by: null,
        }).eq('id', requestId);
    };

    // Mod/broadcaster only - kills the request outright.
    const modDecline = async (requestId) => {
        await supabase.from('karaoke_requests').update({ status: 'declined' }).eq('id', requestId);
    };

    // Mod/broadcaster only - force straight to public regardless of timers.
    const modForcePublic = async (requestId) => {
        await supabase.from('karaoke_requests').update({
            status: 'public', target_singer_id: null, public_expire_by: new Date(Date.now() + PUBLIC_WINDOW_MS).toISOString(), respond_by: null,
        }).eq('id', requestId);
    };

    // Solo self-add is a direct queueAdd - nothing to persist, there's no
    // lifecycle to track once it's already in KaraFun's real queue. A duet
    // invite is the one case that needs a row first: the invitee has to
    // agree before anything is actually queued, so it's recorded as a
    // karaoke_requests row (kind: 'duet') the same shape a viewer's request
    // uses, just requested_by === the asking singer themselves.
    const selfAdd = (song, singerName, addToQueue) => addToQueue(song.songId, singerName);

    const inviteDuet = async (song, singerName, invitedUid) => {
        if (!targetUid || !user || !supabase) return;
        await supabase.from('karaoke_requests').insert({
            user_id: targetUid,
            kind: 'duet',
            song: { songId: song.songId, title: song.title, artist: song.artist },
            requested_by: user.id,
            requested_by_name: singerName,
            target_singer_id: invitedUid,
            // A real respond_by (same window a targeted song request gets) so
            // an invitee who never responds doesn't leave this pending
            // forever - the expiry cron's respond_by<=now query can't match
            // a null field at all. The asker can also cancel it directly any
            // time via dropDeclinedDuet, which works on a still-pending
            // invite too.
            status: 'pending',
            respond_by: new Date(Date.now() + RESPOND_WINDOW_MS).toISOString(),
            public_expire_by: null,
        });
    };

    const respondToDuetInvite = async (request, accept, myName, addToQueue) => {
        if (!supabase) return;
        if (accept) {
            // Database write first, then the command - src/lib/karafunCommands.js's
            // resolveQueueSingerName requires this invite's status to already be
            // 'accepted' when it validates the duet name server-side. Queuing
            // first raced that write: if addToQueue's command reached the API
            // before this update committed, the server saw a still-'pending'
            // invite, rejected the duet name, and no song was queued - but this
            // update still ran afterward and marked it accepted anyway, so
            // nothing here surfaced the failure.
            await supabase.from('karaoke_requests').update({ status: 'accepted' }).eq('id', request.id);
            addToQueue(request.songId, `${request.requestedByName} & ${myName}`);
        } else {
            await supabase.from('karaoke_requests').update({ status: 'declined' }).eq('id', request.id);
        }
    };

    // Asker's choices once a duet invite they sent comes back declined.
    const singSoloAfterDecline = async (request, singerName, addToQueue) => {
        addToQueue(request.songId, singerName);
        await supabase.from('karaoke_requests').update({ status: 'dropped' }).eq('id', request.id);
    };
    const dropDeclinedDuet = async (requestId) => supabase.from('karaoke_requests').update({ status: 'dropped' }).eq('id', requestId);
    // Resets respond_by to a fresh window - without this, re-inviting after
    // the original deadline already passed (or after the expiry cron already
    // cleared it to null) would either instantly time out again or never
    // time out at all.
    const reinviteDuet = async (requestId, newInvitedUid) => supabase.from('karaoke_requests').update({
        target_singer_id: newInvitedUid, status: 'pending', respond_by: new Date(Date.now() + RESPOND_WINDOW_MS).toISOString(),
    }).eq('id', requestId);

    const setRotationOrder = async (uidArray) => {
        if (!targetUid || !supabase) return;
        await supabase.from('settings').upsert({ user_id: targetUid, karaoke_rotation_order: uidArray }, { onConflict: 'user_id' });
    };

    const toggleParticipating = async (value) => {
        if (!user || !targetUid || !supabase) return;
        // A brand-new permissions row (the broadcaster's own first-ever
        // toggle, since UsersPane never creates one for the owner) needs a
        // role - the column is NOT NULL. Any other case is always an UPDATE
        // on an existing row (a mod already had to assign a real role before
        // anyone but the owner can reach this toggle at all), so role is
        // left out of the payload there and stays whatever it already was.
        const isSelf = targetUid === user.id;
        await supabase.from('permissions').upsert({
            user_id: targetUid, viewer_id: user.id, participating: value,
            ...(isSelf ? { role: 'mod' } : {}),
        }, { onConflict: 'user_id,viewer_id' });
    };

    // Self-service only ("so the user can pass rounds if they go on a
    // break") - independent of `participating`. Doesn't remove them from
    // rotation and doesn't touch anything they already have queued; it only
    // affects who the turn-skip logic (isMyTurn / autoSort's cursor, both
    // server/relay-side) treats as eligible for "next". A guest entry can
    // never call this - there's no account to call it from - which is
    // correct: guests are always turn-eligible by default (see
    // src/lib/karafunCommands.js).
    const toggleSittingOut = async (value) => {
        if (!user || !targetUid || !supabase) return;
        const isSelf = targetUid === user.id;
        await supabase.from('permissions').upsert({
            user_id: targetUid, viewer_id: user.id, sitting_out: value,
            ...(isSelf ? { role: 'mod' } : {}),
        }, { onConflict: 'user_id,viewer_id' });
    };

    return {
        requests, onlineSingers, rotationOrder, fullRotationOrder, rotationMembers, permissions,
        nameFor,
        submitRequest, acceptRequest, declineAsTarget, modDecline, modForcePublic,
        selfAdd, inviteDuet, respondToDuetInvite, singSoloAfterDecline, dropDeclinedDuet, reinviteDuet,
        setRotationOrder, toggleParticipating, toggleSittingOut,
    };
}
