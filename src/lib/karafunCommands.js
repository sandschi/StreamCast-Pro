// Server-side counterpart to src/hooks/useKaraFunData.js's emit() calls and
// src/components/dashboard-shell/KaraokePane.js's isMyTurn/isMine checks -
// see docs/karafun-relay-design.md §3.1/§3.3. This is what actually closes
// issue #29 (today's canControl is a client-side-only guard): a client can
// only ever name one of the JS-level actions below, never a raw KaraFun wire
// event, and turn/ownership are re-derived here from Firestore, never
// trusted from the request body.

// Same hardcoded UID firestore.rules' isMasterAdmin() and
// src/app/api/set-admin-claim/route.js check - kept independently here
// rather than imported, matching how both of those already do it.
const MASTER_ADMIN_UID = 'WPifULbh4NePmKpojiAnKwv0rWY2';

function isFiniteNumber(v) {
    return typeof v === 'number' && Number.isFinite(v);
}
function isNonEmptyString(v) {
    return typeof v === 'string' && v.trim().length > 0;
}

// Wire protocol table from docs/karafun-relay-design.md §3.1, verified live
// against KaraFun's own remote client (issue #27). `turnScoped` actions are
// only allowed for a singer during their own turn (isMyTurn below).
// `ownershipScoped` actions additionally require the target queue entry to
// belong to the caller when the caller is a singer (mod/broadcaster are
// exempt from ownership - they can act on any entry).
const KARAFUN_ACTIONS = {
    addToQueue: {
        wireEvent: 'queueAdd',
        validate(params) {
            if (!isNonEmptyString(params?.songId) && !isFiniteNumber(params?.songId)) throw new Error('songId is required');
            if (!isNonEmptyString(params?.singer)) throw new Error('singer is required');
            const pos = params?.pos === undefined ? 99999 : params.pos;
            if (!isFiniteNumber(pos)) throw new Error('pos must be a number');
            return { songId: params.songId, pos, singer: params.singer };
        },
        toWirePayload(p) { return { songId: p.songId, pos: p.pos, singer: p.singer }; },
    },
    moveInQueue: {
        wireEvent: 'queueMove',
        modOnly: true,
        validate(params) {
            if (!isNonEmptyString(params?.queueId)) throw new Error('queueId is required');
            if (!isFiniteNumber(params?.from)) throw new Error('from must be a number');
            if (!isFiniteNumber(params?.to)) throw new Error('to must be a number');
            return { queueId: params.queueId, from: params.from, to: params.to };
        },
        toWirePayload(p) { return { queueId: p.queueId, from: p.from, to: p.to }; },
    },
    removeFromQueue: {
        wireEvent: 'queueRemove',
        ownershipScoped: true,
        validate(params) {
            if (!isNonEmptyString(params?.queueId)) throw new Error('queueId is required');
            return { queueId: params.queueId };
        },
        toWirePayload(p) { return p.queueId; },
    },
    adjustPitch: {
        wireEvent: 'pitch',
        turnScoped: true,
        validate(params) {
            if (!isFiniteNumber(params?.delta)) throw new Error('delta must be a number');
            return { delta: params.delta };
        },
        toWirePayload(p) { return p.delta; },
    },
    adjustTempo: {
        wireEvent: 'tempo',
        turnScoped: true,
        validate(params) {
            if (!isFiniteNumber(params?.delta)) throw new Error('delta must be a number');
            return { delta: params.delta };
        },
        toWirePayload(p) { return p.delta; },
    },
    setVolume: {
        wireEvent: 'volume',
        turnScoped: true,
        validate(params) {
            if (!isFiniteNumber(params?.value)) throw new Error('value must be a number');
            return { value: params.value };
        },
        toWirePayload(p) { return p.value; },
    },
    setBackingVocalsVolume: {
        wireEvent: 'volumeBv',
        turnScoped: true,
        validate(params) {
            if (!isFiniteNumber(params?.value)) throw new Error('value must be a number');
            return { value: params.value };
        },
        toWirePayload(p) { return p.value; },
    },
    setLeadVocalVolume: {
        wireEvent: 'volumeLd',
        turnScoped: true,
        validate(params) {
            if (!isNonEmptyString(params?.filename)) throw new Error('filename is required');
            if (!isFiniteNumber(params?.value)) throw new Error('value must be a number');
            return { filename: params.filename, value: params.value };
        },
        toWirePayload(p) { return { filename: p.filename, volume: p.value }; },
    },
    playSong: {
        wireEvent: 'play',
        turnScoped: true,
        validate() { return {}; },
        toWirePayload() { return null; },
    },
    skipSong: {
        wireEvent: 'next',
        turnScoped: true,
        validate() { return {}; },
        toWirePayload() { return null; },
    },
};

function getKaraFunActionSpec(action) {
    return Object.prototype.hasOwnProperty.call(KARAFUN_ACTIONS, action) ? KARAFUN_ACTIONS[action] : null;
}

// Mirrors dashboard/page.js's own role resolution (lines ~111-163): the
// caller viewing their own dashboard is 'broadcaster'; otherwise their role
// comes from users/{userId}/permissions/{callerUid}.role, defaulting to
// 'viewer' when no doc exists. Master admin is resolved by the caller
// separately (from the verified ID token's custom claim), not here.
async function resolveRole(db, userId, callerUid) {
    if (callerUid === userId) return 'broadcaster';
    const permSnap = await db.doc(`users/${userId}/permissions/${callerUid}`).get();
    return permSnap.exists ? (permSnap.data().role || 'viewer') : 'viewer';
}

// Mirrors useKaraokeData.js's userData?.twitchUsername || user?.displayName
// || 'Singer' fallback chain - twitchUsername lives on the caller's own
// users/{callerUid} doc, not under the target broadcaster.
async function resolveSingerName(db, callerUid, decodedToken) {
    const userSnap = await db.doc(`users/${callerUid}`).get();
    const twitchUsername = userSnap.exists ? userSnap.data()?.twitchUsername : null;
    return twitchUsername || decodedToken?.name || 'Singer';
}

// Reads rotationOrder + the relay's mirrored karafun_state/live (queue,
// current song, and activeSingerUid). Used to be onlineSingers/permissions/
// nameFor too (ported from useKaraokeData.js to re-derive "who's active"
// here) - dropped once activeSingerUid moved to being resolved once by the
// relay and mirrored, rather than re-derived per-request. A fresh serverless
// invocation per request can't see across the gap between songs the way the
// relay's long-lived process can (see relay/src/autoSort.js's
// resolveActiveUid) - re-deriving it here used to default to
// rotationOrder[0] whenever nothing was actively playing, handing turn
// authorization back to whoever's first in rotation on every gap instead of
// whoever's actually next.
async function buildKaraokeContext(db, userId) {
    const [settingsSnap, stateSnap] = await Promise.all([
        db.doc(`users/${userId}/settings/config`).get(),
        db.doc(`users/${userId}/karafun_state/live`).get(),
    ]);

    const rotationOrder = settingsSnap.exists ? (settingsSnap.data().karaokeRotationOrder || []) : [];
    const state = stateSnap.exists ? stateSnap.data() : null;

    // Scoped to just the rotation's own members (not a full permissions
    // collection scan) - this is a per-request serverless read, and it's
    // only ever consulted for sittingOut (see isMyTurn below). A guest:*
    // pseudo-id has no doc at this path at all - db.doc() on it still
    // resolves to a (non-existent) ref harmlessly, so no special-casing is
    // needed here; permissionsByUid[guestId] just stays undefined.
    const permissionRefs = rotationOrder.map((uid) => db.doc(`users/${userId}/permissions/${uid}`));
    const permissionSnaps = permissionRefs.length ? await db.getAll(...permissionRefs) : [];
    const permissionsByUid = {};
    permissionSnaps.forEach((snap, i) => { if (snap.exists) permissionsByUid[rotationOrder[i]] = snap.data(); });

    return {
        rotationOrder,
        currentSong: state?.currentSong || null,
        upcoming: state?.upcoming || [],
        activeSingerUid: state?.activeSingerUid || null,
        permissionsByUid,
    };
}

// Walks forward from activeIdx+1 (or 0 if nobody's active), returns the
// index of the first rotation slot where isEligible(uid) is true. Bounded
// to rotationOrder.length iterations, so it can never infinite-loop even if
// every member is ineligible. Returns -1 if no slot is eligible - the
// caller decides what that means (see isMyTurn vs. relay/src/autoSort.js's
// computeDesiredMove, which fall back differently). Duplicated identically
// in relay/src/commandProcessor.js and relay/src/autoSort.js - relay and
// this Next.js app are separate runtimes with no shared module, same
// pattern as isMyTurn/ownsQueueEntry/MASTER_ADMIN_UID below.
function resolveNextEligibleIdx(rotationOrder, activeIdx, isEligible) {
    const n = rotationOrder.length;
    if (n === 0) return -1;
    const startIdx = activeIdx === -1 ? 0 : (activeIdx + 1) % n;
    for (let step = 0; step < n; step++) {
        const idx = (startIdx + step) % n;
        if (isEligible(rotationOrder[idx])) return idx;
    }
    return -1;
}

// Mirrors KaraokePane.js's isMyTurn: already on air (their name is in the
// current song's singer field, split on duet '&') or next up per rotation
// order, using the relay's mirrored activeSingerUid (see buildKaraokeContext
// above) rather than re-deriving it from currentSong alone. The "next up"
// walk skips anyone with sittingOut:true (see useKaraokeData.js's
// toggleSittingOut) - a guest:* id is never sitting out (no permissions doc
// exists for it), and can never BE the caller either (nobody authenticates
// as a guest), so a guest's turn is only ever actionable by broadcaster/mod.
function isMyTurn(context, callerUid, singerName) {
    const onAirNames = (context.currentSong?.singer || '').split(/\s*&\s*/).map((s) => s.trim()).filter(Boolean);
    if (onAirNames.includes(singerName)) return true;

    if (context.rotationOrder.length === 0) return false;
    const isEligible = (uid) => context.permissionsByUid[uid]?.sittingOut !== true;
    const activeIdx = context.activeSingerUid ? context.rotationOrder.indexOf(context.activeSingerUid) : -1;
    const nextIdx = resolveNextEligibleIdx(context.rotationOrder, activeIdx, isEligible);
    const nextSingerUid = nextIdx === -1 ? null : context.rotationOrder[nextIdx];
    return nextSingerUid === callerUid;
}

// addToQueue's params.singer is otherwise just whatever the client sent
// (validate() only checks it's a non-empty string) - for a singer-role
// caller that's an IDOR: nothing stopped them from queuing a song under
// another participant's name, which then feeds auto-sort's name-based
// ownerIndexOf attribution and the turn/queue displays. A caller may only
// name themselves solo, or themselves as the second half of a duet ("Asker &
// Them") when they're the invitee on a karaoke_requests doc (kind: 'duet')
// that's actually been accepted - mirroring the exact string
// respondToDuetInvite (useKaraokeData.js) writes on accept. Broadcaster/mod
// are never routed through this - they're exempt in authorize() below, same
// as every other ownership check.
async function resolveQueueSingerName(db, userId, callerUid, singerName, requestedSinger) {
    if (!requestedSinger || requestedSinger === singerName) return singerName;

    const parts = requestedSinger.split(/\s*&\s*/).map((s) => s.trim());
    if (parts.length !== 2 || parts[1] !== singerName) return null;

    const inviteSnap = await db.collection(`users/${userId}/karaoke_requests`)
        .where('kind', '==', 'duet')
        .where('targetSingerUid', '==', callerUid)
        .where('status', '==', 'accepted')
        .where('requestedByName', '==', parts[0])
        .limit(1)
        .get();

    return inviteSnap.empty ? null : requestedSinger;
}

// Mirrors KaraokePane.js's isMine: the queue entry's singer field (split on
// '&' for duets) includes the caller's own name.
function ownsQueueEntry(context, queueId, singerName) {
    const item = context.upcoming.find((i) => i.queueId === queueId);
    if (!item) return false;
    const names = (item.singer || '').split(/\s*&\s*/).map((s) => s.trim());
    return names.includes(singerName);
}

// The authorization matrix from docs/karafun-relay-design.md §3.3. `params`
// is the already-validated (spec.validate'd) params object, so ownership
// checks below can read e.g. params.queueId directly. Returns { ok: true }
// or { ok: false, reason } - never throws, so the route can always turn this
// into a clean 403.
function authorize({ action, params, role, isMasterAdminClaim, callerUid, singerName, context }) {
    const spec = getKaraFunActionSpec(action);
    if (isMasterAdminClaim || role === 'broadcaster' || role === 'mod') {
        return { ok: true };
    }
    if (role === 'singer') {
        if (spec.modOnly) return { ok: false, reason: `${action} is broadcaster/mod only` };
        if (spec.turnScoped && !isMyTurn(context, callerUid, singerName)) {
            return { ok: false, reason: 'not your turn' };
        }
        if (spec.ownershipScoped && !ownsQueueEntry(context, params.queueId, singerName)) {
            return { ok: false, reason: 'not your queue entry' };
        }
        return { ok: true };
    }
    return { ok: false, reason: `role "${role}" cannot perform ${action}` };
}

export {
    KARAFUN_ACTIONS,
    getKaraFunActionSpec,
    resolveRole,
    resolveSingerName,
    resolveQueueSingerName,
    buildKaraokeContext,
    isMyTurn,
    ownsQueueEntry,
    authorize,
    MASTER_ADMIN_UID,
};
