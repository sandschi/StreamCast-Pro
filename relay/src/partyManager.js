'use strict';

const { getDb, admin } = require('./firebaseAdmin');
const { acquireLease, renewLease, releaseLease, LEASE_RENEW_INTERVAL_MS } = require('./lease');
const { KaraFunConnection } = require('./karafunConnection');
const { CommandProcessor } = require('./commandProcessor');
const { AutoSort } = require('./autoSort');

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
        // userId -> in-flight _stopParty() promise. _stopParty removes its
        // entry from this.connections before it finishes tearing down (see
        // that method's own comment) - a concurrent discovery tick would
        // otherwise see no entry and start a replacement while the old one's
        // releaseLease() call is still pending. Since releaseLease only
        // checks the lease doc's instanceId (this whole relay PROCESS, not
        // the specific connection that asked for it), the replacement's own
        // fresh acquireLease() (which trivially succeeds against a lease
        // this same process still holds) can then get its lease deleted out
        // from under it by the original call arriving late - freeing the
        // lease for a different relay instance to acquire while this
        // process's replacement connection is still running, exactly the
        // multi-consumer race this relay exists to prevent. Tracked here so
        // _tick() can wait for a teardown to fully finish before starting a
        // replacement for the same user.
        this.stopping = new Map();
        this._discoveryTimer = null;
        this._ticking = false;
        // Set only while a tick is actually in flight - stop() awaits this
        // instead of racing an in-progress _tick() that could still call
        // _maybeStartParty (Firestore round trips can easily outlast
        // shutdown) and start a connection nothing ever gets around to
        // stopping.
        this._tickPromise = null;
    }

    async start() {
        await this.tick();
        this._discoveryTimer = setInterval(() => {
            this.tick().catch((err) => console.error('[partyManager] discovery tick failed', err));
        }, DISCOVERY_INTERVAL_MS);
    }

    async stop() {
        if (this._discoveryTimer) clearInterval(this._discoveryTimer);
        // clearInterval only stops *future* ticks - one already in flight
        // must be allowed to finish (and any party it started added to
        // this.connections) before the stop-all sweep below enumerates keys,
        // or a party it starts after this function returns would never get
        // its lease released.
        if (this._tickPromise) await this._tickPromise.catch(() => {});
        await Promise.all([
            ...[...this.connections.keys()].map((userId) => this._stopParty(userId)),
            // A teardown triggered from outside this sweep (the lease-
            // renewal-failure path) may already be in flight and no longer
            // have an entry in this.connections for the sweep above to
            // find - wait for it too, or a party it's still tearing down
            // could outlive this whole PartyManager's shutdown.
            ...[...this.stopping.values()].map((p) => p.catch(() => {})),
        ]);
    }

    async tick() {
        // A Firestore round trip inside a tick can outlast
        // DISCOVERY_INTERVAL_MS - setInterval doesn't wait for the previous
        // call, so without this guard two overlapping ticks can both see
        // the same userId as untracked and both call _maybeStartParty,
        // leaking the first KaraFunConnection/CommandProcessor (and its
        // still-live socket) when the second overwrites this.connections -
        // reintroducing the multi-consumer race this relay exists to close.
        if (this._ticking) return;
        this._ticking = true;
        this._tickPromise = this._tick().finally(() => {
            this._ticking = false;
            this._tickPromise = null;
        });
        return this._tickPromise;
    }

    async _tick() {
        const activeBroadcasters = await this._findActiveBroadcasters();
        const now = Date.now();

        for (const [userId, cfg] of activeBroadcasters) {
            const entry = this.connections.get(userId);
            if (!entry) {
                // A teardown triggered from outside _tick() (the lease-
                // renewal-failure path) can be mid-flight for this exact
                // user with no entry left to see - wait for it to fully
                // finish (including its releaseLease()) before starting a
                // replacement, or the replacement's own lease acquisition
                // can get clobbered by the original teardown's later
                // release. See the this.stopping field's own comment.
                const inFlight = this.stopping.get(userId);
                if (inFlight) await inFlight.catch(() => {});
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

    // Both fields live on the public settings/config doc - karafunPartyId
    // briefly moved to private/config (see git history) but that broke a
    // mod/singer/viewer session's Karaoke tab entirely (private/config is
    // owner-only by rule, so a non-owner session had no way to read it at
    // all), for a security premise that didn't hold anyway: a KaraFun party
    // ID is public-by-design, and the real fix for issue #29 was routing
    // mutations through this relay's command queue, not hiding the ID.
    async _getKaraFunConfig(userId) {
        const settingsSnap = await this.db.collection('users').doc(userId).collection('settings').doc('config').get();
        const cfg = settingsSnap.data();
        if (cfg?.karafunEnabled && cfg?.karafunPartyId) {
            return { partyId: cfg.karafunPartyId };
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

        // Only ever acts while karafunAutoSortEnabled is set (checked every
        // tick, off by default) - see docs/karafun-relay-design.md §5/§9.
        // Started unconditionally alongside the connection like
        // cmdProcessor above; it no-ops when the toggle is off.
        const autoSort = new AutoSort({ db: this.db, userId, connection: conn });
        autoSort.start();

        const renewTimer = setInterval(() => {
            renewLease(this.db, userId, instanceId).catch(async (err) => {
                console.error(`[partyManager] lost lease for ${userId}, stopping connection:`, err.message);
                await this._stopParty(userId);
            });
        }, LEASE_RENEW_INTERVAL_MS);

        this.connections.set(userId, { conn, cmdProcessor, autoSort, renewTimer, lastPresenceAt: Date.now() });
        console.log(`[partyManager] started party ${cfg.partyId} for user ${userId}`);
    }

    async _stopParty(userId) {
        const entry = this.connections.get(userId);
        if (!entry) return;

        // Deleted up front, before any teardown step that could throw - a
        // discovery tick must always be free to call _maybeStartParty fresh
        // for this user on its next pass, regardless of what fails below.
        // Without this, a throw from conn.stop() would leave a zombie entry
        // that _tick() treats as "already tracked" forever, since it only
        // ever starts a party when this.connections has no entry for it.
        this.connections.delete(userId);

        // Tracked so a concurrent discovery tick (see the this.stopping
        // field's own comment) waits for this to fully finish - including
        // releaseLease() below - before starting a replacement for the same
        // user, rather than racing this call's own later release against
        // the replacement's fresh lease acquisition.
        const donePromise = this._teardown(userId, entry);
        this.stopping.set(userId, donePromise);
        try {
            await donePromise;
        } finally {
            // Only clear if we're still the current entry - a fresh
            // start+immediate-restop cycle for this user could otherwise
            // have this stale cleanup delete a newer in-flight teardown's
            // tracking out from under it.
            if (this.stopping.get(userId) === donePromise) this.stopping.delete(userId);
        }
    }

    async _teardown(userId, entry) {
        clearInterval(entry.renewTimer);
        entry.autoSort.stop();
        entry.cmdProcessor.stop();
        try {
            // Awaited: conn.stop()'s final Firestore flush must land before
            // the lease below frees up, or a newly-started instance's own
            // writes could be overwritten by this stale one arriving late.
            await entry.conn.stop();
        } catch (err) {
            console.error(`[partyManager] error stopping KaraFun connection for ${userId}:`, err.message);
        }

        await releaseLease(this.db, userId, instanceId).catch((err) => {
            console.error(`[partyManager] failed to release lease for ${userId}:`, err.message);
        });
        console.log(`[partyManager] stopped party for user ${userId}`);
    }
}

module.exports = { PartyManager, instanceId };
