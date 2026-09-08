'use strict';

const { admin } = require('./firebaseAdmin');

// Commands older than this were queued against a queue state that no longer
// exists by the time the relay gets to them (e.g. it was down, or hadn't
// acquired the party's lease yet) - replaying a stale skipSong/moveInQueue
// against today's queue does more harm than skipping it silently. The
// pending-query cutoff below just stops the relay from ever fetching these;
// it doesn't mark them failed/expired in Firestore - see the follow-up task
// flagged alongside this fix for that piece.
const COMMAND_MAX_AGE_MS = 30_000;

// Same hardcoded UID firestore.rules' isMasterAdmin() and
// src/lib/karafunCommands.js check - duplicated here for the same reason
// ACTION_TO_WIRE below is: relay/ and the Next.js app are separate
// packages/runtimes with no shared module.
const MASTER_ADMIN_UID = 'WPifULbh4NePmKpojiAnKwv0rWY2';

// Authorization-relevant subset of src/lib/karafunCommands.js's
// KARAFUN_ACTIONS table (turnScoped/ownershipScoped/modOnly), used only by
// _reauthorize below - kept separate from ACTION_TO_WIRE so that table's
// existing shape doesn't have to change.
const TURN_SCOPED_ACTIONS = new Set(['adjustPitch', 'adjustTempo', 'setVolume', 'setBackingVocalsVolume', 'setLeadVocalVolume', 'playSong', 'skipSong']);
const OWNERSHIP_SCOPED_ACTIONS = new Set(['removeFromQueue']);
const MOD_ONLY_ACTIONS = new Set(['moveInQueue']);

// JS-level action -> KaraFun wire event + payload shape, from
// docs/karafun-relay-design.md §3.1 (verified live against KaraFun's real
// remote client, issue #27). Mirrors src/lib/karafunCommands.js's
// KARAFUN_ACTIONS table - duplicated rather than imported, since relay/ and
// the Next.js app are separate packages/runtimes (same pattern functions/
// already established - see CLAUDE.md). The API route is what enforces WHO
// may send which action (role/turn/ownership, per §3.3); this table only
// ever decides HOW an already-authorized action reaches KaraFun's wire
// protocol - it does not re-check authorization.
const ACTION_TO_WIRE = {
    addToQueue: (p) => ['queueAdd', { songId: p.songId, pos: p.pos, singer: p.singer }],
    moveInQueue: (p) => ['queueMove', { queueId: p.queueId, from: p.from, to: p.to }],
    removeFromQueue: (p) => ['queueRemove', p.queueId],
    adjustPitch: (p) => ['pitch', p.delta],
    adjustTempo: (p) => ['tempo', p.delta],
    setVolume: (p) => ['volume', p.value],
    setBackingVocalsVolume: (p) => ['volumeBv', p.value],
    setLeadVocalVolume: (p) => ['volumeLd', { filename: p.filename, volume: p.value }],
    playSong: () => ['play', null],
    skipSong: () => ['next', null],
};

// Processes one party's users/{userId}/karafun_commands sequentially (FIFO
// by createdAt) against the single socket this relay instance holds for
// that party - see docs/karafun-relay-design.md §3.1 step 5. This is the
// actual fix for the "DISABLED AGAIN" incident's suspect (a) (§0: multiple
// independent pollers racing the same live queue) - there is structurally
// one consumer of this queue per party, regardless of how many dashboard
// tabs/mods/singers sent commands.
class CommandProcessor {
    constructor({ db, userId, connection }) {
        this.db = db;
        this.userId = userId;
        this.connection = connection;
        this.unsubscribe = null;
        // A snapshot listener re-delivers the whole current result set on
        // every change, not just the new doc - queuedIds is what keeps a
        // command that's still 'pending' (still being processed, or simply
        // still in `pending` array) from being enqueued a second time on the
        // next snapshot.
        this.pending = [];
        this.queuedIds = new Set();
        this.draining = false;
    }

    start() {
        const cutoff = admin.firestore.Timestamp.fromMillis(Date.now() - COMMAND_MAX_AGE_MS);
        const ref = this.db.collection('users').doc(this.userId).collection('karafun_commands')
            .where('status', '==', 'pending')
            .where('createdAt', '>', cutoff)
            .orderBy('createdAt', 'asc');

        this.unsubscribe = ref.onSnapshot((snap) => {
            snap.docChanges().forEach((change) => {
                if (change.type !== 'added') return;
                if (this.queuedIds.has(change.doc.id)) return;
                this.queuedIds.add(change.doc.id);
                this.pending.push({ id: change.doc.id, data: change.doc.data() });
            });
            this._drain();
        }, (err) => {
            console.error(`[commands:${this.userId}] listener error:`, err.message);
        });
    }

    stop() {
        if (this.unsubscribe) {
            this.unsubscribe();
            this.unsubscribe = null;
        }
        this.pending = [];
        this.queuedIds.clear();
    }

    _drain() {
        if (this.draining) return;
        this.draining = true;
        this._drainLoop().finally(() => { this.draining = false; });
    }

    async _drainLoop() {
        while (this.pending.length > 0) {
            const { id, data } = this.pending.shift();
            this.queuedIds.delete(id);
            await this._process(id, data);
        }
    }

    async _process(commandId, data) {
        const ref = this.db.collection('users').doc(this.userId).collection('karafun_commands').doc(commandId);
        const toWire = ACTION_TO_WIRE[data.action];
        if (!toWire) {
            console.error(`[commands:${this.userId}] unknown action "${data.action}" on command ${commandId}`);
            await ref.update({ status: 'failed', error: `unknown action: ${data.action}` }).catch(() => {});
            return;
        }

        // The API route only authorized this at enqueue time. A command can
        // sit pending for up to COMMAND_MAX_AGE_MS, during which a turn can
        // pass to someone else, a queue entry can be removed/claimed, or a
        // singer's role/participation can change - re-check immediately
        // before the wire emit rather than trusting the stale decision.
        // System-issued commands (auto-sort's own moveInQueue) are exempt -
        // the relay generated those itself, there's no external caller to
        // re-authorize.
        if (data.requestedByRole !== 'system') {
            const decision = await this._reauthorize(data);
            if (!decision.ok) {
                console.warn(`[commands:${this.userId}] command ${commandId} (${data.action}) failed re-authorization at execution time: ${decision.reason}`);
                await ref.update({ status: 'failed', error: `re-authorization failed: ${decision.reason}` }).catch(() => {});
                return;
            }
        }

        try {
            const [wireEvent, payload] = toWire(data.params || {});
            // KaraFun's real protocol has no per-command ack (the client
            // hook this was ported from never used one either - see
            // useKaraFunData.js's emit()). Marking 'done' right after a
            // successful emit on a live socket matches the behavior this
            // app has always had (fire-and-forget), just with real
            // server-side authorization in front of it now instead of none.
            this.connection.emit(wireEvent, payload);
            await ref.update({ status: 'done' });
        } catch (err) {
            console.error(`[commands:${this.userId}] command ${commandId} (${data.action}) failed:`, err.message);
            await ref.update({ status: 'failed', error: err.message }).catch(() => {});
        }
    }

    // Mirrors src/lib/karafunCommands.js's authorize()/isMyTurn/
    // ownsQueueEntry, re-run here against current state rather than trusted
    // from the command doc's stored requestedByRole. Turn/ownership read
    // this.connection.state directly (the freshest signal available - no
    // Firestore round trip or mirror-write debounce) rather than the
    // Firestore-mirrored karafun_state/live, except activeSingerUid, which
    // only AutoSort resolves and there's no cheaper source for it.
    async _reauthorize(data) {
        const role = await this._resolveCurrentRole(data.requestedBy);
        if (role === 'broadcaster' || role === 'mod') return { ok: true };
        if (role !== 'singer') return { ok: false, reason: `role "${role}" cannot perform ${data.action}` };

        if (MOD_ONLY_ACTIONS.has(data.action)) return { ok: false, reason: `${data.action} is broadcaster/mod only` };

        if (TURN_SCOPED_ACTIONS.has(data.action)) {
            const singerName = await this._resolveCurrentSingerName(data.requestedBy);
            const context = await this._buildTurnContext();
            if (!isMyTurn(context, data.requestedBy, singerName)) return { ok: false, reason: 'not your turn' };
        }

        if (OWNERSHIP_SCOPED_ACTIONS.has(data.action)) {
            const singerName = await this._resolveCurrentSingerName(data.requestedBy);
            if (!ownsQueueEntry(this.connection.state.upcoming, data.params?.queueId, singerName)) {
                return { ok: false, reason: 'not your queue entry' };
            }
        }

        return { ok: true };
    }

    async _resolveCurrentRole(callerUid) {
        if (callerUid === this.userId || callerUid === MASTER_ADMIN_UID) return 'broadcaster';
        const snap = await this.db.doc(`users/${this.userId}/permissions/${callerUid}`).get();
        return snap.exists ? (snap.data().role || 'viewer') : 'viewer';
    }

    async _resolveCurrentSingerName(callerUid) {
        const snap = await this.db.doc(`users/${callerUid}`).get();
        return (snap.exists && snap.data().twitchUsername) || 'Singer';
    }

    async _buildTurnContext() {
        const [settingsSnap, stateSnap] = await Promise.all([
            this.db.doc(`users/${this.userId}/settings/config`).get(),
            this.db.doc(`users/${this.userId}/karafun_state/live`).get(),
        ]);
        return {
            rotationOrder: settingsSnap.exists ? (settingsSnap.data().karaokeRotationOrder || []) : [],
            currentSong: this.connection.state.currentSong,
            activeSingerUid: stateSnap.exists ? (stateSnap.data().activeSingerUid || null) : null,
        };
    }
}

// Mirrors src/lib/karafunCommands.js's isMyTurn - see that file's own
// comment for why activeSingerUid (not currentSong alone) is required to
// get "who's next" right across the gap between songs.
function isMyTurn({ currentSong, rotationOrder, activeSingerUid }, callerUid, singerName) {
    const onAirNames = (currentSong?.singer || '').split(/\s*&\s*/).map((s) => s.trim()).filter(Boolean);
    if (onAirNames.includes(singerName)) return true;

    if (rotationOrder.length === 0) return false;
    const activeIdx = activeSingerUid ? rotationOrder.indexOf(activeSingerUid) : -1;
    const nextSingerUid = rotationOrder[activeIdx === -1 ? 0 : (activeIdx + 1) % rotationOrder.length] || null;
    return nextSingerUid === callerUid;
}

// Mirrors src/lib/karafunCommands.js's ownsQueueEntry.
function ownsQueueEntry(upcoming, queueId, singerName) {
    const item = (upcoming || []).find((i) => i.queueId === queueId);
    if (!item) return false;
    const names = (item.singer || '').split(/\s*&\s*/).map((s) => s.trim());
    return names.includes(singerName);
}

module.exports = { CommandProcessor, ACTION_TO_WIRE };
