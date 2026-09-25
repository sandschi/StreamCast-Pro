'use strict';

// Commands older than this were queued against a queue state that no longer
// exists by the time the relay gets to them (e.g. it was down, or hadn't
// acquired the party's lease yet) - replaying a stale skipSong/moveInQueue
// against today's queue does more harm than skipping it silently. The
// catch-up query cutoff below just stops the relay from ever fetching these;
// it doesn't mark them failed/expired - see the follow-up task flagged
// alongside this fix for that piece.
const COMMAND_MAX_AGE_MS = 30_000;

// Same hardcoded UID is_master_admin() and src/lib/karafunCommands.js check -
// duplicated here for the same reason ACTION_TO_WIRE below is: relay/ and
// the Next.js app are separate packages/runtimes with no shared module.
const MASTER_ADMIN_UID = '4a0c4f9e-2f6c-49e7-a8b1-815fc0b6ad3d';

// Authorization-relevant subset of src/lib/karafunCommands.js's
// KARAFUN_ACTIONS table (turnScoped/ownershipScoped/modOnly), used only by
// _reauthorize below - kept separate from ACTION_TO_WIRE so that table's
// existing shape doesn't have to change.
const TURN_SCOPED_ACTIONS = new Set(['adjustPitch', 'adjustTempo', 'setVolume', 'setBackingVocalsVolume', 'setLeadVocalVolume', 'playSong', 'skipSong']);
const OWNERSHIP_SCOPED_ACTIONS = new Set(['removeFromQueue', 'moveInQueue']);
const MOD_ONLY_ACTIONS = new Set([]);
// A singer may only move their own queue entry into the immediately
// adjacent slot - see src/lib/karafunCommands.js's authorize() for the full
// reasoning (a clean, single-call, race-free swap vs. a multi-step one that
// would need trusting client-declared intent).
const SINGER_ADJACENT_ONLY_ACTIONS = new Set(['moveInQueue']);

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

// Processes one party's public.karafun_commands sequentially (FIFO by
// created_at) against the single socket this relay instance holds for that
// party - see docs/karafun-relay-design.md §3.1 step 5. This is the actual
// fix for the "DISABLED AGAIN" incident's suspect (a) (§0: multiple
// independent pollers racing the same live queue) - there is structurally
// one consumer of this queue per party, regardless of how many dashboard
// tabs/mods/singers sent commands.
//
// Unlike the Firestore version's onSnapshot (which redelivers the whole
// result set on every change), postgres_changes only ever delivers the one
// new row - but Realtime has no initial-snapshot replay the way onSnapshot
// gave for free, so an explicit catch-up query runs before subscribing (see
// start() below), or a command queued while this relay was down/hadn't yet
// acquired the lease would be silently missed forever (migration plan §5).
class CommandProcessor {
    constructor({ supabaseAdmin, userId, connection }) {
        this.supabaseAdmin = supabaseAdmin;
        this.userId = userId;
        this.connection = connection;
        this.channel = null;
        this.pending = [];
        // Guards against double-processing a command that lands in both the
        // catch-up query and a live INSERT event during the brief overlap
        // window between them (subscribe fires first, then the catch-up
        // query runs - see start() below) - not redundant with Realtime's
        // own no-redelivery guarantee, which only covers the live-event path.
        this.processedIds = new Set();
        this.draining = false;
    }

    start() {
        // Subscribe first, catch-up query second: if the order were
        // reversed, a command created in the gap between the query
        // completing and the subscription actually being live would be
        // missed entirely.
        this.channel = this.supabaseAdmin
            .channel(`relay-commands-${this.userId}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'karafun_commands', filter: `user_id=eq.${this.userId}` }, (payload) => {
                this._enqueue(payload.new);
            })
            .subscribe((status, err) => {
                if (status === 'SUBSCRIBED') this._catchUp();
                if (err) console.error(`[commands:${this.userId}] subscription error:`, err.message);
            });
    }

    async _catchUp() {
        const cutoff = new Date(Date.now() - COMMAND_MAX_AGE_MS).toISOString();
        const { data, error } = await this.supabaseAdmin.from('karafun_commands').select('*')
            .eq('user_id', this.userId).eq('status', 'pending').gt('created_at', cutoff)
            .order('created_at', { ascending: true });
        if (error) {
            console.error(`[commands:${this.userId}] catch-up query failed:`, error.message);
            return;
        }
        (data || []).forEach((row) => this._enqueue(row));
    }

    stop() {
        if (this.channel) {
            this.supabaseAdmin.removeChannel(this.channel);
            this.channel = null;
        }
        this.pending = [];
        this.processedIds.clear();
    }

    _enqueue(row) {
        if (this.processedIds.has(row.id)) return;
        this.processedIds.add(row.id);
        this.pending.push(row);
        this._drain();
    }

    _drain() {
        if (this.draining) return;
        this.draining = true;
        this._drainLoop().finally(() => { this.draining = false; });
    }

    async _drainLoop() {
        while (this.pending.length > 0) {
            const row = this.pending.shift();
            await this._process(row);
        }
    }

    async _process(row) {
        const commandId = row.id;
        const toWire = ACTION_TO_WIRE[row.action];
        if (!toWire) {
            console.error(`[commands:${this.userId}] unknown action "${row.action}" on command ${commandId}`);
            await this.supabaseAdmin.from('karafun_commands').update({ status: 'failed', error: `unknown action: ${row.action}` }).eq('id', commandId).catch(() => {});
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
        if (row.requested_by_role !== 'system') {
            const decision = await this._reauthorize(row);
            if (!decision.ok) {
                console.warn(`[commands:${this.userId}] command ${commandId} (${row.action}) failed re-authorization at execution time: ${decision.reason}`);
                await this.supabaseAdmin.from('karafun_commands').update({ status: 'failed', error: `re-authorization failed: ${decision.reason}` }).eq('id', commandId).catch(() => {});
                return;
            }
        }

        try {
            const [wireEvent, payload] = toWire(row.params || {});
            // KaraFun's real protocol has no per-command ack (the client
            // hook this was ported from never used one either - see
            // useKaraFunData.js's emit()). Marking 'done' right after a
            // successful emit on a live socket matches the behavior this
            // app has always had (fire-and-forget), just with real
            // server-side authorization in front of it now instead of none.
            this.connection.emit(wireEvent, payload);
            await this.supabaseAdmin.from('karafun_commands').update({ status: 'done' }).eq('id', commandId);
        } catch (err) {
            console.error(`[commands:${this.userId}] command ${commandId} (${row.action}) failed:`, err.message);
            await this.supabaseAdmin.from('karafun_commands').update({ status: 'failed', error: err.message }).eq('id', commandId).catch(() => {});
        }
    }

    // Mirrors src/lib/karafunCommands.js's authorize()/isMyTurn/
    // ownsQueueEntry, re-run here against current state rather than trusted
    // from the command row's stored requested_by_role. Turn/ownership read
    // this.connection.state directly (the freshest signal available - no
    // extra round trip or mirror-write debounce) rather than the mirrored
    // karafun_state, except activeSingerUid, which only AutoSort resolves
    // and there's no cheaper source for it.
    async _reauthorize(row) {
        const role = await this._resolveCurrentRole(row.requested_by);
        if (role === 'broadcaster' || role === 'mod') return { ok: true };
        if (role !== 'singer') return { ok: false, reason: `role "${role}" cannot perform ${row.action}` };

        if (MOD_ONLY_ACTIONS.has(row.action)) return { ok: false, reason: `${row.action} is broadcaster/mod only` };

        if (TURN_SCOPED_ACTIONS.has(row.action)) {
            const singerName = await this._resolveCurrentSingerName(row.requested_by);
            const context = await this._buildTurnContext();
            if (!isMyTurn(context, row.requested_by, singerName)) return { ok: false, reason: 'not your turn' };
        }

        if (OWNERSHIP_SCOPED_ACTIONS.has(row.action)) {
            const singerName = await this._resolveCurrentSingerName(row.requested_by);
            if (!ownsQueueEntry(this.connection.state.upcoming, row.params?.queueId, singerName)) {
                return { ok: false, reason: 'not your queue entry' };
            }
        }

        if (SINGER_ADJACENT_ONLY_ACTIONS.has(row.action) && Math.abs(row.params?.from - row.params?.to) !== 1) {
            return { ok: false, reason: 'can only move one slot at a time' };
        }

        return { ok: true };
    }

    async _resolveCurrentRole(callerUid) {
        if (callerUid === this.userId || callerUid === MASTER_ADMIN_UID) return 'broadcaster';
        const { data } = await this.supabaseAdmin.from('permissions').select('role')
            .eq('user_id', this.userId).eq('viewer_id', callerUid).maybeSingle();
        return data?.role || 'viewer';
    }

    async _resolveCurrentSingerName(callerUid) {
        const { data } = await this.supabaseAdmin.from('users').select('twitch_username').eq('id', callerUid).maybeSingle();
        return data?.twitch_username || 'Singer';
    }

    async _buildTurnContext() {
        const [{ data: settingsRow }, { data: stateRow }] = await Promise.all([
            this.supabaseAdmin.from('settings').select('karaoke_rotation_order').eq('user_id', this.userId).maybeSingle(),
            this.supabaseAdmin.from('karafun_state').select('active_singer_id').eq('user_id', this.userId).maybeSingle(),
        ]);
        const rotationOrder = settingsRow?.karaoke_rotation_order || [];

        // Scoped read, same reasoning as src/lib/karafunCommands.js's
        // buildKaraokeContext - a guest:* id never has a row here, so it's
        // skipped entirely rather than queried.
        const nonGuestRotationUids = rotationOrder.filter((uid) => !uid.startsWith('guest:'));
        const permissionsByUid = {};
        if (nonGuestRotationUids.length) {
            const { data: permRows } = await this.supabaseAdmin.from('permissions').select('viewer_id, sitting_out')
                .eq('user_id', this.userId).in('viewer_id', nonGuestRotationUids);
            (permRows || []).forEach((r) => { permissionsByUid[r.viewer_id] = { sittingOut: r.sitting_out }; });
        }

        return {
            rotationOrder,
            currentSong: this.connection.state.currentSong,
            activeSingerUid: stateRow?.active_singer_id || null,
            permissionsByUid,
        };
    }
}

// Same helper as src/lib/karafunCommands.js's resolveNextEligibleIdx -
// duplicated, not imported (relay and the Next.js app are separate
// runtimes). See that file for the full comment.
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

// Mirrors src/lib/karafunCommands.js's isMyTurn - see that file's own
// comment for why activeSingerUid (not currentSong alone) is required to
// get "who's next" right across the gap between songs, and for the
// sittingOut skip-walk / guest-id reasoning.
function isMyTurn({ currentSong, rotationOrder, activeSingerUid, permissionsByUid }, callerUid, singerName) {
    const onAirNames = (currentSong?.singer || '').split(/\s*&\s*/).map((s) => s.trim()).filter(Boolean);
    if (onAirNames.includes(singerName)) return true;

    if (rotationOrder.length === 0) return false;
    const isEligible = (uid) => permissionsByUid[uid]?.sittingOut !== true;
    const activeIdx = activeSingerUid ? rotationOrder.indexOf(activeSingerUid) : -1;
    const nextIdx = resolveNextEligibleIdx(rotationOrder, activeIdx, isEligible);
    const nextSingerUid = nextIdx === -1 ? null : rotationOrder[nextIdx];
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
