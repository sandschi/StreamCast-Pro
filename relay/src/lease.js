'use strict';

const { Client } = require('pg');
const { getSupabaseAdmin } = require('./supabaseAdmin');

// One long-lived Postgres connection per acquired lease, using
// pg_try_advisory_lock(hashtext(userId)) for mutual exclusion between relay
// instances - replaces the old Firestore-transaction/TTL-lease approach (see
// migration plan §5). Strictly better than a lease: the lock releases the
// instant its holding connection dies (network drop, crash, kill -9),
// instead of sitting "held" for up to a lease's own expiry window after its
// owner crashed. Needs a direct session-mode Postgres connection (Supavisor's
// session port - supabase-pooler:5432 on dokploy-network, 5433 on the host's
// loopback - NOT the transaction-mode pooler on 6543/6544; that mode doesn't
// guarantee the same backend session across queries, which advisory locks
// require).
//
// Requires SUPABASE_DB_HOST/PORT/USER/PASSWORD/NAME/SSL in the relay's own env -
// separate from NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY (used for
// everything else via supabaseAdmin.js), since this is a raw `pg` connection,
// not a PostgREST/Realtime call.

// A periodic no-op query on the SAME connection the lock was acquired on -
// advisory locks have no expiry to renew, but a silently-dead TCP connection
// (network partition, box hiccup) would otherwise leave this relay believing
// it still holds a party indefinitely. Detecting that and surfacing it the
// same way a lost lease used to (PartyManager stops and lets discovery retry)
// is the only thing this timer is for.
const HEALTH_CHECK_INTERVAL_MS = 10_000;

function connectionConfig() {
    return {
        host: process.env.SUPABASE_DB_HOST,
        port: Number(process.env.SUPABASE_DB_PORT || 5432),
        user: process.env.SUPABASE_DB_USER,
        password: process.env.SUPABASE_DB_PASSWORD,
        database: process.env.SUPABASE_DB_NAME || 'postgres',
        // Plaintext only as an explicit opt-in (SUPABASE_DB_SSL=false), for a
        // private network path: the deployed relay reaches Supavisor over
        // Dokploy's internal dokploy-network (supabase-pooler:5432), and the
        // pooler's host ports are loopback-only - see
        // supabase/docker-compose.yml. Anything else gets TLS, which this
        // Supavisor doesn't serve, so a misconfigured relay fails loudly
        // instead of sending the database password in the clear.
        ssl: process.env.SUPABASE_DB_SSL === 'false' ? false : { rejectUnauthorized: true },
    };
}

// Returns null if another instance already holds this party's lock, or a
// lease handle ({ release() }) that PartyManager keeps alongside its
// connection entry and calls when tearing down. `onLost(err)` fires if the
// health check ever detects the connection died out from under the lock -
// PartyManager treats that exactly like the old lease-renewal-failure path.
async function acquireLease(userId, partyId, onLost) {
    const client = new Client(connectionConfig());
    // pg.Client emits 'error' when an idle connection drops (network
    // partition, Supavisor restart, server-side termination). With no
    // listener, Node rethrows it and the whole relay process exits - every
    // party, not just this one. Routed into the same onLost path as the
    // health check below once the lock is actually held; before that,
    // connect()/query() reject on their own and the caller handles it.
    let lost = false;
    let released = false;
    let healthTimer = null;
    const markLost = (err) => {
        if (lost || released) return;
        lost = true;
        if (healthTimer) clearInterval(healthTimer);
        onLost(err);
    };
    let lockHeld = false;
    client.on('error', (err) => {
        console.error(`[lease:${userId}] lease connection error:`, err.message);
        if (lockHeld) markLost(err);
    });
    await client.connect();

    const { rows } = await client.query('select pg_try_advisory_lock(hashtext($1)) as locked', [userId]);
    if (!rows[0].locked) {
        await client.end().catch(() => {});
        return null;
    }
    lockHeld = true;

    // Observability-only mirror row (see supabase/schema/0001_schema.sql's
    // karafun_relay comment) - the advisory lock above is the actual
    // mutual-exclusion mechanism now; this is just visibility into which
    // instance holds which party, not itself load-bearing.
    const supabaseAdmin = getSupabaseAdmin();
    const instanceId = `${process.env.HOSTNAME || 'relay'}-${process.pid}`;
    await supabaseAdmin.from('karafun_relay').upsert({
        user_id: userId, instance_id: instanceId, party_id: partyId, acquired_at: new Date().toISOString(),
    }, { onConflict: 'user_id' }).then(({ error }) => {
        if (error) console.error(`[lease:${userId}] failed to write observability row (non-fatal):`, error.message);
    });

    healthTimer = setInterval(async () => {
        try {
            await client.query('select 1');
        } catch (err) {
            markLost(err);
        }
    }, HEALTH_CHECK_INTERVAL_MS);

    return {
        async release() {
            released = true;
            clearInterval(healthTimer);
            // Disconnecting releases every advisory lock this connection
            // held, immediately - no explicit pg_advisory_unlock needed, and
            // no window where a crashed process's lock lingers the way a TTL
            // lease's expiry window did.
            await client.end().catch((err) => console.error(`[lease:${userId}] error closing lease connection:`, err.message));
            // Query builders have no .catch() (see commandProcessor.js's
            // _markFailed) - and this row is observability-only, so a failed
            // delete is logged, never thrown.
            try {
                const { error } = await supabaseAdmin.from('karafun_relay').delete().eq('user_id', userId).eq('instance_id', instanceId);
                if (error) console.error(`[lease:${userId}] failed to delete observability row (non-fatal):`, error.message);
            } catch (err) {
                console.error(`[lease:${userId}] failed to delete observability row (non-fatal):`, err.message);
            }
        },
    };
}

module.exports = { acquireLease };
