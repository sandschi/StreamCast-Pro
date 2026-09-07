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

// Mirrors useKaraokeData.js's ELIGIBLE_ROTATION_ROLES and its >90s "offline"
// presence threshold - see that file's own comments for why these values.
const ELIGIBLE_ROTATION_ROLES = ['singer', 'mod', 'broadcaster'];
const PRESENCE_STALE_MS = 90_000;

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

// Ports useKaraokeData.js's onlineSingers/nameFor/getActiveSingerUid/isMyTurn
// chain server-side, reading the same collections that hook subscribes to
// client-side, plus karafun_state/live (this relay's own mirrored state) in
// place of the client's local queueData.
async function buildKaraokeContext(db, userId) {
    const [presenceSnap, permsSnap, settingsSnap, stateSnap] = await Promise.all([
        db.collection(`users/${userId}/online`).get(),
        db.collection(`users/${userId}/permissions`).get(),
        db.doc(`users/${userId}/settings/config`).get(),
        db.doc(`users/${userId}/karafun_state/live`).get(),
    ]);

    const permissions = {};
    permsSnap.forEach((d) => { permissions[d.id] = d.data(); });

    const now = Date.now();
    const onlineSingers = [];
    presenceSnap.forEach((d) => {
        const p = d.data();
        const perm = permissions[d.id];
        const role = perm?.role || (d.id === userId ? 'broadcaster' : null);
        if (!ELIGIBLE_ROTATION_ROLES.includes(role)) return;
        const participating = role === 'broadcaster' ? perm?.participating !== false : !!perm?.participating;
        if (!participating) return;
        const lastSeenMs = p.lastSeen?.toMillis ? p.lastSeen.toMillis() : 0;
        if (now - lastSeenMs >= PRESENCE_STALE_MS) return;
        onlineSingers.push({ id: d.id, displayName: p.displayName, twitchUsername: p.twitchUsername });
    });

    const rotationOrder = settingsSnap.exists ? (settingsSnap.data().karaokeRotationOrder || []) : [];
    const state = stateSnap.exists ? stateSnap.data() : null;

    const nameFor = (uid) => {
        const online = onlineSingers.find((s) => s.id === uid);
        return online?.twitchUsername || online?.displayName || permissions[uid]?.twitchUsername || permissions[uid]?.displayName || 'someone';
    };

    const getActiveSingerUid = (currentSongSinger) => {
        const primary = (currentSongSinger || '').split(/\s*&\s*/)[0].trim();
        if (!primary) return null;
        return rotationOrder.find((uid) => nameFor(uid) === primary) || null;
    };

    return { rotationOrder, currentSong: state?.currentSong || null, upcoming: state?.upcoming || [], getActiveSingerUid };
}

// Mirrors KaraokePane.js's isMyTurn exactly: already on air (their name is in
// the current song's singer field, split on duet '&') or next up per
// rotation order.
function isMyTurn(context, callerUid, singerName) {
    const onAirNames = (context.currentSong?.singer || '').split(/\s*&\s*/).map((s) => s.trim()).filter(Boolean);
    if (onAirNames.includes(singerName)) return true;

    if (context.rotationOrder.length === 0) return false;
    const activeSingerUid = context.getActiveSingerUid(context.currentSong?.singer);
    const activeIdx = activeSingerUid ? context.rotationOrder.indexOf(activeSingerUid) : -1;
    const nextSingerUid = context.rotationOrder[activeIdx === -1 ? 0 : (activeIdx + 1) % context.rotationOrder.length] || null;
    return nextSingerUid === callerUid;
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
    buildKaraokeContext,
    isMyTurn,
    ownsQueueEntry,
    authorize,
    MASTER_ADMIN_UID,
};
