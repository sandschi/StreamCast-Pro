'use strict';

const { getDb, admin } = require('./firebaseAdmin');
const { acquireLease, renewLease, releaseLease, LEASE_RENEW_INTERVAL_MS } = require('./lease');
const { KaraFunConnection } = require('./karafunConnection');
const { CommandProcessor } = require('./commandProcessor');

const DISCOVERY_INTERVAL_MS = 30_000;
// Matches useKaraokeData.js's own ">90s since lastSeen = offline" threshold
// (dashboard/page.js's presence heartbeat writes every 30s) - reused here as
// a stand-in for "does someone currently have this broadcaster's dashboard
// or overlay open" until real command traffic (a later slice) gives a more
// direct signal.
const PRESENCE_STALE_MS = 90_000;
// How long to keep a party's socket open with no presence detected before
// closing it - avoids holding a connection open for a broadcaster who
// isn't live, per docs/karafun-relay-design.md §4.
const IDLE_CLOSE_MS = 10 * 60_000;

const instanceId = `${process.env.HOSTNAME || 'relay'}-${process.pid}-${Date.now()}`;

class PartyManager {
    constructor() {
        this.db = getDb();
        // userId -> { conn: KaraFunConnection, renewTimer, lastPresenceAt }
        this.connections = new Map();
        this._discoveryTimer = null;
    }

    async start() {
        await this.tick();
        this._discoveryTimer = setInterval(() => {
            this.tick().catch((err) => console.error('[partyManager] discovery tick failed', err));
        }, DISCOVERY_INTERVAL_MS);
    }

    async stop() {
        if (this._discoveryTimer) clearInterval(this._discoveryTimer);
        await Promise.all([...this.connections.keys()].map((userId) => this._stopParty(userId)));
    }

    async tick() {
        const activeBroadcasters = await this._findActiveBroadcasters();
        const now = Date.now();

        for (const [userId, cfg] of activeBroadcasters) {
            const entry = this.connections.get(userId);
            if (!entry) {
                await this._maybeStartParty(userId);
                continue;
            }
            entry.lastPresenceAt = now;
            // A broadcaster can change Party ID while already live (see
            // useKaraFunData.js's handleSavePartyId) - discovery alone
            // wouldn't notice, since this userId is already in
            // this.connections and the branch above only fires for a
            // userId that isn't tracked yet.
            if (entry.conn.partyId !== cfg.partyId) {
                console.log(`[partyManager] party ID changed for ${userId} (${entry.conn.partyId} -> ${cfg.partyId}), restarting`);
                await this._stopParty(userId);
                await this._maybeStartParty(userId);
            }
        }

        for (const [userId, entry] of this.connections.entries()) {
            if (!activeBroadcasters.has(userId) && now - entry.lastPresenceAt > IDLE_CLOSE_MS) {
                await this._stopParty(userId);
            }
        }
    }

    // Broadcasters with a fresh presence heartbeat under their own
    // users/{userId}/online subcollection (written by anyone with that
    // broadcaster's dashboard open - see dashboard/page.js), cross-checked
    // against karafunEnabled + a saved party ID. Returns a Map so tick() can
    // reuse the resolved config instead of re-deriving it.
    async _findActiveBroadcasters() {
        const cutoff = admin.firestore.Timestamp.fromMillis(Date.now() - PRESENCE_STALE_MS);
        const snap = await this.db.collectionGroup('online').where('lastSeen', '>', cutoff).get();

        const candidateUserIds = new Set();
        for (const doc of snap.docs) {
            // doc.ref shape: users/{userId}/online/{onlineId}
            const userId = doc.ref.parent.parent?.id;
            if (userId) candidateUserIds.add(userId);
        }

        const active = new Map();
        await Promise.all([...candidateUserIds].map(async (userId) => {
            const cfg = await this._getKaraFunConfig(userId);
            if (cfg) active.set(userId, cfg);
        }));
        return active;
    }

    // karafunEnabled stays a public settings/config toggle; karafunPartyId
    // lives in private/config (owner-only) - see
    // docs/karafun-relay-design.md §6. The Admin SDK reads both regardless
    // of those client-facing rules; this split is about what a client is
    // allowed to read, not what the relay needs.
    async _getKaraFunConfig(userId) {
        const [settingsSnap, privateSnap] = await Promise.all([
            this.db.collection('users').doc(userId).collection('settings').doc('config').get(),
            this.db.collection('users').doc(userId).collection('private').doc('config').get(),
        ]);
        const karafunEnabled = settingsSnap.data()?.karafunEnabled;
        const partyId = privateSnap.data()?.karafunPartyId;
        if (karafunEnabled && partyId) {
            return { partyId };
        }
        return null;
    }

    async _maybeStartParty(userId) {
        const cfg = await this._getKaraFunConfig(userId);
        if (!cfg) return;

        const gotLease = await acquireLease(this.db, userId, instanceId, cfg.partyId);
        if (!gotLease) {
            console.log(`[partyManager] lease held by another instance for ${userId}, skipping`);
            return;
        }

        const conn = new KaraFunConnection({ db: this.db, userId, partyId: cfg.partyId });
        conn.start();

        // One consumer of this party's command queue - see
        // docs/karafun-relay-design.md §3.1 step 5 and
        // relay/src/commandProcessor.js's own comment for why this is what
        // actually fixes the "DISABLED AGAIN" incident's multiple-poller
        // suspect (§0).
        const cmdProcessor = new CommandProcessor({ db: this.db, userId, connection: conn });
        cmdProcessor.start();

        const renewTimer = setInterval(() => {
            renewLease(this.db, userId, instanceId).catch(async (err) => {
                console.error(`[partyManager] lost lease for ${userId}, stopping connection:`, err.message);
                await this._stopParty(userId);
            });
        }, LEASE_RENEW_INTERVAL_MS);

        this.connections.set(userId, { conn, cmdProcessor, renewTimer, lastPresenceAt: Date.now() });
        console.log(`[partyManager] started party ${cfg.partyId} for user ${userId}`);
    }

    async _stopParty(userId) {
        const entry = this.connections.get(userId);
        if (!entry) return;

        clearInterval(entry.renewTimer);
        entry.cmdProcessor.stop();
        entry.conn.stop();
        this.connections.delete(userId);

        await releaseLease(this.db, userId, instanceId).catch((err) => {
            console.error(`[partyManager] failed to release lease for ${userId}:`, err.message);
        });
        console.log(`[partyManager] stopped party for user ${userId}`);
    }
}

module.exports = { PartyManager, instanceId };
