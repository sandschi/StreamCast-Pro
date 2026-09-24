'use strict';

const { admin } = require('./firebaseAdmin');

// One lease per broadcaster at karafun_relay/{userId}, guarding "only one
// relay instance ever holds this party's socket at a time" - see
// docs/karafun-relay-design.md §4. Matters even with a single always-on
// instance: a rolling deploy can briefly overlap old+new, and this is what
// stops both from dialing the same party.
const LEASE_DURATION_MS = 30_000;
const LEASE_RENEW_INTERVAL_MS = 10_000;

function timestampInMs(ms) {
    return admin.firestore.Timestamp.fromMillis(ms);
}

async function acquireLease(db, userId, instanceId, partyId) {
    const ref = db.collection('karafun_relay').doc(userId);
    const now = Date.now();

    return db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const data = snap.exists ? snap.data() : null;
        const isFree = !data || !data.leaseExpiresAt || data.leaseExpiresAt.toMillis() < now || data.instanceId === instanceId;
        if (!isFree) return false;

        tx.set(ref, {
            instanceId,
            partyId,
            leaseExpiresAt: timestampInMs(now + LEASE_DURATION_MS),
        });
        return true;
    });
}

// Rejects (rather than returning false) when the lease was lost, so the
// caller's renew interval can treat that as a hard stop signal - see
// PartyManager._maybeStartParty.
async function renewLease(db, userId, instanceId) {
    const ref = db.collection('karafun_relay').doc(userId);
    const now = Date.now();

    await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const data = snap.exists ? snap.data() : null;
        if (!data || data.instanceId !== instanceId) {
            throw new Error(`lease-lost:${userId}`);
        }
        tx.update(ref, { leaseExpiresAt: timestampInMs(now + LEASE_DURATION_MS) });
    });
}

async function releaseLease(db, userId, instanceId) {
    const ref = db.collection('karafun_relay').doc(userId);
    await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const data = snap.exists ? snap.data() : null;
        // Only clear a lease this instance actually holds - a lease already
        // taken over by someone else (this instance's own lease expired and
        // was reclaimed) must not be deleted out from under its new holder.
        if (data && data.instanceId === instanceId) {
            tx.delete(ref);
        }
    });
}

module.exports = { acquireLease, renewLease, releaseLease, LEASE_RENEW_INTERVAL_MS };
