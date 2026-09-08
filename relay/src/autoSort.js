'use strict';

const { admin } = require('./firebaseAdmin');

// Same constants/reasoning as the original client-side v2 algorithm (see git
// history / docs/karafun-relay-design.md §5) - not re-derived, just relocated.
const TICK_INTERVAL_MS = 5_000;
const MAX_STALLED_ATTEMPTS = 3;
const ELIGIBLE_ROTATION_ROLES = ['singer', 'mod', 'broadcaster'];
const PRESENCE_STALE_MS = 90_000;

// Ports useKaraokeData.js's onlineSingers/nameFor - relay-side copy since
// there's no shared module between this package and the Next.js app's src/
// (same pattern as commandProcessor.js's own wire-protocol table). Only
// nameFor is actually needed here, not the rest of that hook's surface.
async function buildNameFor(db, userId) {
    const [presenceSnap, permsSnap] = await Promise.all([
        db.collection('users').doc(userId).collection('online').get(),
        db.collection('users').doc(userId).collection('permissions').get(),
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

    return (uid) => {
        const online = onlineSingers.find((s) => s.id === uid);
        return online?.twitchUsername || online?.displayName || permissions[uid]?.twitchUsername || permissions[uid]?.displayName || 'someone';
    };
}

// Resolves "who's actually up" from KaraFun's own live status, falling back
// to the last singer KaraFun actually reported playing when nobody's
// playing right now. KaraFun doesn't auto-start the next song after a skip -
// there's a real gap (currentSong null) between "someone's turn just ended"
// and "someone pressed Play on the next one" - so naively re-deriving this
// from currentSong alone every time (defaulting to rotationOrder[0] when
// it's null) would forget whose turn it was the moment they stopped playing
// and hand priority back to whoever's first in rotation, on every gap, not
// just cold start. Found by live-testing a skip against a real two-singer
// rotation. This is the one place that resolves it - both the queue-
// reordering logic below and (via the mirrored karafun_state/live.
// activeSingerUid field) the dashboard's turn display and the command
// route's isMyTurn authorization all read the same answer instead of each
// re-deriving their own.
function resolveActiveUid({ currentSong, rotationOrder, nameFor, lastActiveUid }) {
    const ownerIndexOf = (singerField) => {
        const primary = (singerField || '').split(/\s*&\s*/)[0].trim();
        if (!primary) return -1;
        return rotationOrder.findIndex((uid) => nameFor(uid) === primary);
    };
    const liveActiveIdx = ownerIndexOf(currentSong?.singer);
    return liveActiveIdx !== -1 ? rotationOrder[liveActiveIdx] : (lastActiveUid || null);
}

// Verbatim port of the dead client-side v2 algorithm (KaraFunPane.js, see
// git history) - round-robin by rotation round, single move per tick
// recomputed fresh from the latest queue, never targets whatever's
// currently playing (KaraFun's own 'queue' event still lists the playing
// item, matched here by title/artist/singer against currentSong - it has no
// drag handle in KaraFun's own remote client and confirmed separately that
// it can't actually be moved). `activeUid` is the already-resolved "who's
// up" (see resolveActiveUid above) - cursor is one slot after them.
// Returns { queueId, from, to } for the one move needed to converge upcoming
// toward the desired order, or null if already in sync / nothing to do.
function computeDesiredMove({ upcoming, currentSong, rotationOrder, nameFor, activeUid }) {
    if (!upcoming || upcoming.length < 2 || !rotationOrder || rotationOrder.length === 0) return null;

    const isPlaying = (item) => !!currentSong && item.title === currentSong.title && item.artist === currentSong.artist && item.singer === currentSong.singer;
    const playingIdx = upcoming.findIndex(isPlaying);

    const ownerIndexOf = (singerField) => {
        const primary = (singerField || '').split(/\s*&\s*/)[0].trim();
        if (!primary) return -1;
        return rotationOrder.findIndex((uid) => nameFor(uid) === primary);
    };
    const activeIdx = activeUid ? rotationOrder.indexOf(activeUid) : -1;
    const cursorIdx = activeIdx === -1 ? 0 : (activeIdx + 1) % rotationOrder.length;

    const seenRounds = {};
    const currentIds = upcoming.map((s) => s.queueId);
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
        .map((x) => x.queueId);
    const desiredIds = [...restSorted];
    if (playingIdx !== -1) desiredIds.splice(playingIdx, 0, currentIds[playingIdx]);

    const firstMismatch = desiredIds.findIndex((queueId, i) => currentIds[i] !== queueId);
    if (firstMismatch === -1) return null;

    const queueId = desiredIds[firstMismatch];
    const from = currentIds.indexOf(queueId);
    const to = firstMismatch;
    return { queueId, from, to };
}

// Runs on a fixed interval for every party the relay holds a lease for,
// regardless of the karafunAutoSortEnabled toggle - it always resolves and
// mirrors activeSingerUid (see resolveActiveUid above; the dashboard's turn
// display and the command route's isMyTurn both depend on this being
// correct even when nobody has opted into actual reordering). The queue-
// reordering part below stays gated on the toggle (see
// docs/karafun-relay-design.md §5/§9 - off by default, opt-in per
// broadcaster) and issues moves through the same karafun_commands queue
// manual commands use, not the socket directly, so a manual mod reorder and
// an auto-sort pass are two producers into one FIFO queue on one consumer,
// never two sockets racing each other.
class AutoSort {
    constructor({ db, userId, connection }) {
        this.db = db;
        this.userId = userId;
        this.connection = connection;
        this.timer = null;
        // Suspect (b) from §0/§5: presence flickering across the 90s online
        // threshold could make nameFor/ownerIndexOf intermittently
        // misattribute a queue entry and propose a move that isn't really
        // needed. Requiring the SAME move to be proposed on two consecutive
        // ticks before ever issuing it is the fix the original disable
        // comment named but never implemented - carried over here, not just
        // the file location.
        this.pendingSignature = null;
        // Separate from pendingSignature: tracks a move that was actually
        // issued, to catch KaraFun never applying it (suspect (a), now
        // structurally impossible with one consumer, but kept as a
        // circuit breaker regardless - the original reasoning for it was
        // never specific to multiple pollers).
        this.lastIssuedSignature = null;
        this.stallCount = 0;
        // Who KaraFun last actually reported as playing, kept across the gap
        // between songs (currentSong null) - see computeDesiredMove's own
        // comment for why the cursor can't just reset to rotationOrder[0]
        // there. Lost on a relay restart, same as every other in-memory
        // piece of this class - acceptable, bounded, and no worse than the
        // lease/connection state elsewhere already losing its memory too.
        this.lastActiveUid = null;
        // Forces the very first tick's mirror write through even when the
        // resolved value is null and happens to equal the fresh
        // lastActiveUid=null above - without this, a restart while nothing
        // is playing skips the write entirely and leaves whatever
        // activeSingerUid the previous relay process last wrote in place.
        this.mirroredOnce = false;
    }

    start() {
        this.timer = setInterval(() => {
            this._tick().catch((err) => console.error(`[autosort:${this.userId}] tick failed:`, err.message));
        }, TICK_INTERVAL_MS);
    }

    stop() {
        if (this.timer) clearInterval(this.timer);
    }

    async _tick() {
        const settingsSnap = await this.db.collection('users').doc(this.userId).collection('settings').doc('config').get();
        const settings = settingsSnap.data();
        const rotationOrder = settings?.karaokeRotationOrder || [];
        const { upcoming, currentSong } = this.connection.state;
        const nameFor = await buildNameFor(this.db, this.userId);

        // Always resolved and mirrored, independent of the toggle below -
        // see the class comment for why the turn display/authorization need
        // this even when nobody's opted into actual reordering.
        const activeUid = resolveActiveUid({ currentSong, rotationOrder, nameFor, lastActiveUid: this.lastActiveUid });
        if (!this.mirroredOnce || activeUid !== this.lastActiveUid) {
            this.mirroredOnce = true;
            this.lastActiveUid = activeUid;
            await this.db.collection('users').doc(this.userId).collection('karafun_state').doc('live')
                .set({ activeSingerUid: activeUid }, { merge: true })
                .catch((err) => console.error(`[autosort:${this.userId}] failed to mirror activeSingerUid:`, err.message));
        }

        if (!settings?.karafunAutoSortEnabled) {
            this.pendingSignature = null;
            return;
        }

        const move = computeDesiredMove({ upcoming, currentSong, rotationOrder, nameFor, activeUid });
        if (!move) {
            this.pendingSignature = null;
            return;
        }

        const signature = `${move.queueId}:${move.from}->${move.to}`;

        if (signature !== this.pendingSignature) {
            this.pendingSignature = signature;
            return;
        }

        if (signature === this.lastIssuedSignature) {
            this.stallCount += 1;
            if (this.stallCount >= MAX_STALLED_ATTEMPTS) {
                console.error(`[autosort:${this.userId}] same move keeps being proposed without the queue ever reflecting it - disabling:`, signature);
                await this._disable(`Stopped after the same reorder (${signature}) didn't take effect ${MAX_STALLED_ATTEMPTS} times in a row.`);
                return;
            }
        } else {
            this.stallCount = 0;
            this.lastIssuedSignature = signature;
        }

        await this._issue(move);
    }

    async _issue({ queueId, from, to }) {
        await this.db.collection('users').doc(this.userId).collection('karafun_commands').add({
            action: 'moveInQueue',
            params: { queueId, from, to },
            requestedBy: 'auto-sort',
            requestedByRole: 'system',
            status: 'pending',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
    }

    // Flips the same toggle the broadcaster's own switch controls, so
    // re-enabling from the dashboard is the only way back on - not a silent
    // self-heal - and writes a reason a human can actually read (see
    // docs/karafun-relay-design.md §5's own complaint that today's disable
    // is a comment nobody but a developer ever sees).
    async _disable(reason) {
        await this.db.collection('users').doc(this.userId).collection('settings').doc('config').set({
            karafunAutoSortEnabled: false,
            karafunAutoSortDisabledReason: reason,
        }, { merge: true });
    }
}

module.exports = { AutoSort, computeDesiredMove };
