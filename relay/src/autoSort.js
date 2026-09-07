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

// Verbatim port of the dead client-side v2 algorithm (KaraFunPane.js, see
// git history), with one real fix found by live-testing a skip against an
// actual two-singer rotation: the original always derived the cursor from
// currentSong.singer alone, defaulting to rotationOrder[0] whenever nothing
// is currently playing. KaraFun doesn't auto-start the next song after a
// skip - there's a real gap (currentSong null) between "someone's turn just
// ended" and "someone pressed Play on the next one" - so that default
// silently favored whoever's first in rotation on every single gap, not
// just on cold start. Skip person B, and instead of B's turn passing to
// whoever's next, the algorithm would forget B ever went and hand priority
// back to rotationOrder[0]. Fixed by threading `lastActiveUid` through:
// only update the remembered active singer when KaraFun actually reports
// someone playing, and keep using the last real one across the gap.
// Returns { move, activeUid } - move is { queueId, from, to } or null if
// already in sync / nothing to do; activeUid is what the caller should pass
// back in as lastActiveUid on the next tick.
function computeDesiredMove({ upcoming, currentSong, rotationOrder, nameFor, lastActiveUid }) {
    if (!upcoming || upcoming.length < 2 || !rotationOrder || rotationOrder.length === 0) {
        return { move: null, activeUid: lastActiveUid };
    }

    const isPlaying = (item) => !!currentSong && item.title === currentSong.title && item.artist === currentSong.artist && item.singer === currentSong.singer;
    const playingIdx = upcoming.findIndex(isPlaying);

    const ownerIndexOf = (singerField) => {
        const primary = (singerField || '').split(/\s*&\s*/)[0].trim();
        if (!primary) return -1;
        return rotationOrder.findIndex((uid) => nameFor(uid) === primary);
    };
    const liveActiveIdx = ownerIndexOf(currentSong?.singer);
    const activeUid = liveActiveIdx !== -1 ? rotationOrder[liveActiveIdx] : lastActiveUid;
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
    if (firstMismatch === -1) return { move: null, activeUid };

    const queueId = desiredIds[firstMismatch];
    const from = currentIds.indexOf(queueId);
    const to = firstMismatch;
    return { move: { queueId, from, to }, activeUid };
}

// Runs the ported algorithm on a fixed interval for one party, only while
// karafunAutoSortEnabled is set (see docs/karafun-relay-design.md §5/§9 -
// off by default, opt-in per broadcaster). Issues moves through the same
// karafun_commands queue manual commands use (§3.1) - never touches the
// socket directly - so a manual mod reorder and an auto-sort pass are two
// producers into the same FIFO queue on one consumer, never two sockets
// racing each other.
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
        if (!settings?.karafunAutoSortEnabled) {
            this.pendingSignature = null;
            return;
        }

        const rotationOrder = settings.karaokeRotationOrder || [];
        const { upcoming, currentSong } = this.connection.state;
        const nameFor = await buildNameFor(this.db, this.userId);

        const { move, activeUid } = computeDesiredMove({ upcoming, currentSong, rotationOrder, nameFor, lastActiveUid: this.lastActiveUid });
        this.lastActiveUid = activeUid;
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
