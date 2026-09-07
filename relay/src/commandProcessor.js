'use strict';

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
        const ref = this.db.collection('users').doc(this.userId).collection('karafun_commands')
            .where('status', '==', 'pending')
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
}

module.exports = { CommandProcessor, ACTION_TO_WIRE };
