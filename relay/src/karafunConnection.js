'use strict';

const io = require('socket.io-client');

// How long to coalesce rapid queue/status events into a single Firestore
// write - KaraFun can emit 'queue' faster than the UI (or Firestore's own
// write quota) needs. See docs/karafun-relay-design.md §3.2.
const STATE_WRITE_DEBOUNCE_MS = 500;

// 'serverUnreacheable' is KaraFun telling us the party channel isn't open
// right now (e.g. the broadcaster's dashboard came up before they actually
// started KaraFun) - it's an application-level rejection, not a transport
// drop, so socket.io's own reconnection logic never fires for it. Without an
// explicit retry here the connection sits inert forever once this fires.
// PartyManager's presence-based idle close (IDLE_CLOSE_MS) is what bounds
// this if the party never comes up - not a retry limit here.
const UNREACHABLE_RETRY_MS = 5_000;

// Mirrors one KaraFun party's live queue/status into
// users/{userId}/karafun_state/live, replacing the direct client-side
// socket.io connections previously opened independently by
// useKaraFunData.js (dashboard) and overlay/[userId]/page.js (overlay).
// The connect/authenticate handshake and the queue/status transform logic
// below are ported as-is from useKaraFunData.js - not reinvented - since
// that shape was already verified live against KaraFun's real protocol
// (see issue #27, cited in docs/karafun-relay-design.md §0/§3.1).
class KaraFunConnection {
    constructor({ db, userId, partyId }) {
        this.db = db;
        this.userId = userId;
        this.partyId = partyId;
        this.socket = null;
        // In-memory accumulator - all merge logic below runs synchronously
        // against this on each event, so only the actual Firestore write is
        // debounced. Keeps merge logic free of the read-modify-write race a
        // "read current doc, merge, write" approach would have if two
        // flushes ever overlapped.
        this.state = { upcoming: [], currentSong: null, playState: null };
        this.writeTimer = null;
        this.dirty = false;
        this.retryTimer = null;
        this.stopped = false;
        // Tracks the transport-level connection only (fires on 'connect'),
        // not "has KaraFun confirmed this party is real" - a
        // 'serverUnreacheable' can still follow. Good enough for gating
        // command emits: the existing client hook's own emit() never waited
        // for anything stronger than this either (see useKaraFunData.js's
        // canControl comment).
        this.connected = false;
    }

    start() {
        // Unique login per connection - avoids duplicate-name rejection on
        // reconnects, same reasoning as the client-side hook.
        const suffix = Math.floor(1000 + Math.random() * 9000);
        const loginName = `StreamCastRelay${suffix}`;

        this.socket = io('https://www.karafun.com', {
            query: { remote: `kf${this.partyId}` },
            transports: ['polling', 'websocket'],
            forceNew: true,
            reconnection: true,
            reconnectionDelay: 3000,
            reconnectionAttempts: Infinity,
        });

        this.socket.on('connect', () => {
            this.connected = true;
            console.log(`[karafun:${this.userId}] connected to party ${this.partyId}, authenticating as ${loginName}`);
            this.socket.emit('authenticate', {
                login: loginName,
                channel: this.partyId,
                role: 'participant',
                app: 'karafun',
                socket_id: null,
            }, null);
            // Mirrored for the dashboard/overlay's own "KaraFun Live" vs.
            // "Unreachable" status (see StatusBar.js's karaFunStatus) - they
            // no longer hold a socket of their own to observe this from.
            this._scheduleWrite();
        });

        this.socket.on('connect_error', (err) => {
            console.error(`[karafun:${this.userId}] connect_error:`, err.message);
        });

        this.socket.on('serverUnreacheable', () => {
            console.error(`[karafun:${this.userId}] party unreachable: ${this.partyId}, retrying in ${UNREACHABLE_RETRY_MS}ms`);
            this.connected = false;
            this._scheduleWrite();
            this.socket.disconnect();
            this.retryTimer = setTimeout(() => {
                this.retryTimer = null;
                if (!this.stopped) this.start();
            }, UNREACHABLE_RETRY_MS);
        });

        this.socket.on('disconnect', (reason) => {
            this.connected = false;
            this._scheduleWrite();
            console.log(`[karafun:${this.userId}] disconnected: ${reason}`);
        });

        // Real queue items have top-level: { title, artist, singer, songId, queueId, status }
        this.socket.on('queue', (items) => {
            const upcoming = (items || []).map((item) => ({
                title: item.title || 'Unknown',
                artist: item.artist || '',
                singer: item.singer || '',
                queueId: item.queueId,
            }));
            this.state.upcoming = upcoming;
            // The authoritative "is anything left to play at all" signal -
            // status's own 'idle' is ambiguous (also means "paused, still
            // loaded"), and a real party can send 'status' before OR after
            // this event on a Skip - checking the fresh queue length here
            // (rather than trusting whatever 'status' last said) is what
            // useKaraFunData.js's own comment identifies as the fix for
            // that race. Ported verbatim, not reinvented.
            if (upcoming.length === 0) this.state.currentSong = null;
            this.state.timestamp = Date.now();
            this._scheduleWrite();
        });

        this.socket.on('status', (status) => {
            const cur = status?.songPlaying || status?.current || null;
            if (cur) {
                this.state.currentSong = {
                    title: cur.title || cur.song?.title || 'Unknown',
                    artist: cur.artist || cur.song?.artist || '',
                    singer: cur.singer || cur.singerName || cur.options?.singer || '',
                };
                this.state.playState = status.state;
            } else {
                // 'idle' is ambiguous by itself (loaded-but-paused vs. queue
                // fully empty) - the 'queue' handler above is the
                // authoritative fix for that; this is just a secondary catch
                // for whichever event arrives first, same as the client hook.
                const queueEmpty = (this.state.upcoming?.length ?? 0) === 0;
                const nothingLoaded = status?.state === 'infoscreen' || status?.state === 'stop' || (status?.state === 'idle' && queueEmpty);
                if (nothingLoaded) this.state.currentSong = null;
                this.state.playState = status?.state;
            }
            this._scheduleWrite();
        });
    }

    isConnected() {
        return this.connected && !!this.socket;
    }

    // Used by CommandProcessor to actually execute an already-authorized
    // command (see relay/src/commandProcessor.js) - this class owns the one
    // socket a party's commands are allowed to go through.
    emit(event, payload) {
        if (!this.isConnected()) throw new Error('not connected to KaraFun');
        this.socket.emit(event, payload);
    }

    _scheduleWrite() {
        // stop() already does one best-effort final flush - without this
        // guard, socket.disconnect() inside stop() fires the 'disconnect'
        // handler (which calls _scheduleWrite() itself), arming a second
        // 500ms timer after teardown that can flush stale state once
        // another instance has already taken the party's lease.
        if (this.stopped) return;
        this.dirty = true;
        if (this.writeTimer) return;
        this.writeTimer = setTimeout(() => {
            this._flush().catch((err) => console.error(`[karafun:${this.userId}] flush failed`, err));
        }, STATE_WRITE_DEBOUNCE_MS);
    }

    async _flush() {
        this.writeTimer = null;
        if (!this.dirty) return;
        this.dirty = false;

        const ref = this.db.collection('users').doc(this.userId).collection('karafun_state').doc('live');
        // merge:true - a plain set() here would replace the whole doc and
        // silently drop activeSingerUid, which AutoSort owns and writes
        // separately (see autoSort.js's own mirror write) - this fires far
        // more often (every queue/status event) than that write, so without
        // merge it would erase the field on almost every mirror tick.
        // currentSong/upcoming are always assigned null/[] explicitly by the
        // handlers above rather than omitted, so merge:true never leaves a
        // stale value behind for those two fields.
        await ref.set({ ...this.state, connected: this.connected, updatedAt: Date.now() }, { merge: true });
    }

    stop() {
        this.stopped = true;
        this.connected = false;
        if (this.writeTimer) {
            clearTimeout(this.writeTimer);
            this.writeTimer = null;
        }
        if (this.retryTimer) {
            clearTimeout(this.retryTimer);
            this.retryTimer = null;
        }
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
        // Best-effort final write so a torn-down party doesn't leave
        // connected:true mirrored forever - the debounced write above was
        // just cancelled, not flushed.
        this.dirty = true;
        this._flush().catch((err) => console.error(`[karafun:${this.userId}] final flush failed`, err));
    }
}

module.exports = { KaraFunConnection };
