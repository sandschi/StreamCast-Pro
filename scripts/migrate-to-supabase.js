'use strict';

// One-time (Phase 1 beta) / freeze-window (Phase 9 cutover) data migration:
// walks the master admin's real Firestore data (read-only) and writes it
// under their already-known real Supabase UUID (they must have already
// logged in for real against the target Supabase instance - see plan §8).
//
// Only one broadcaster has data worth migrating this way (confirmed via
// scripts/firestore-data-summary style review of the live project) - other
// people's Firebase UIDs referenced inside jsonb payloads (e.g. a history
// doc's `suggestedBy`) don't map to real Supabase accounts, so they're left
// as opaque historical strings except where they identify the master admin
// themselves (remapped below).
//
// The leaked `apiToken` field found embedded in settings/config (it's
// publicly readable per firestore.rules - `settings/{document=**}` is
// `allow read: if true`) is deliberately dropped from what lands in the new
// public `settings` table. The real token comes from private/config.apiToken
// instead, written only to private_config.api_token (owner/service-role only).
// `karaokeRotationOrder` is dropped from settings too - see the comment on
// buildSettingsRow below, it's live session state full of stale old UIDs,
// not a real historical setting.
//
// Safe to re-run: settings/private_config are upserted by user_id (already
// each table's primary key). history has no natural key preserved anywhere
// in the Postgres schema, so it's fully replaced (delete-then-insert) for
// this one user on every run rather than diffed or matched row-by-row -
// simpler than a natural-key upsert and produces the same idempotent
// end state, matching the plan's "idempotent full re-export, not a diff"
// design for the eventual freeze-window cutover run.
//
// Defaults to a dry run (reads Firestore + looks up the target Supabase
// user, but writes nothing). Pass --apply to actually write.
//
// Usage:
//   node scripts/migrate-to-supabase.js            # dry run
//   node scripts/migrate-to-supabase.js --apply    # writes for real

require('dotenv').config({ path: '.env.local' });
const admin = require('firebase-admin');
const { createClient } = require('@supabase/supabase-js');

const OLD_FIREBASE_UID = 'WPifULbh4NePmKpojiAnKwv0rWY2';
const MASTER_ADMIN_TWITCH_USERNAME = 'sandschi';
const APPLY = process.argv.includes('--apply');
const HISTORY_INSERT_CHUNK_SIZE = 200;

// Mirrors src/lib/settingsMapping.js's FIRST_CLASS_FIELDS. Duplicated rather
// than imported: that file is an ES module consumed by the Next.js app,
// this is a plain CommonJS script run standalone via `node` - same
// separate-runtime tradeoff relay/src/supabaseAdmin.js already makes for
// its own copy of supabase-admin.js. Keep in sync if the schema changes.
const FIRST_CLASS_FIELDS = {
    karafunEnabled: 'karafun_enabled',
    karafunPartyId: 'karafun_party_id',
    karaokeEnabled: 'karaoke_enabled',
    karaokeRequestsOpen: 'karaoke_requests_open',
    karaokeRotationOrder: 'karaoke_rotation_order',
    displayDuration: 'display_duration',
};

function initFirebase() {
    if (!process.env.FIREBASE_PRIVATE_KEY || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PROJECT_ID) {
        throw new Error('Missing FIREBASE_PROJECT_ID/FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY in .env.local');
    }
    const privateKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey,
        }),
    });
    return admin.firestore();
}

function getSupabaseAdmin() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
    return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function toIso(ts) {
    if (!ts) return null;
    return ts.toDate ? ts.toDate().toISOString() : new Date(ts).toISOString();
}

// karaokeRotationOrder is a live singer-rotation queue of viewer UUIDs
// (see useKaraokeData.js), not a historical setting - the real data found
// under it (`['<master admin's old Firebase UID>', '<some other viewer's
// old Firebase UID>']`) is stale from whoever happened to be mid-rotation
// months ago and none of those old UIDs map to anything in the new schema
// (plan §8's identity-model note). Treated the same as other ephemeral
// live-stream state (online/karafun_state/active_message) - left at the
// table's default empty array rather than carried over.
//
// karaokeRotationCursor is the same category of stale-UID cruft, just
// inside `appearance` instead of a first-class column: commit 68acde4
// ("derive whose turn from live status only") explicitly dropped this
// field from the app's own write path, but Firestore never deletes an
// orphaned field on its own, so the live doc still had it holding another
// viewer's old Firebase UID. Nothing in the current codebase reads it -
// confirmed dead, not just stale - so it's dropped here rather than
// carried into the new appearance blob.
function buildSettingsRow(adminUuid, flatSettings) {
    const { apiToken: _leakedApiToken, karaokeRotationOrder: _staleRotationOrder, karaokeRotationCursor: _deadRotationCursor, ...rest } = flatSettings || {};
    const row = { user_id: adminUuid, appearance: {} };
    for (const [flatKey, value] of Object.entries(rest)) {
        const column = FIRST_CLASS_FIELDS[flatKey];
        if (column) row[column] = value;
        else row.appearance[flatKey] = value;
    }
    return row;
}

// Other people's old Firebase UIDs inside jsonb payload fields are opaque
// historical strings now (no FK, nothing resolves them to a real account
// per the plan's identity-model note) - only remap the one UID that does
// have a known new home.
function remapSuggestedBy(value, adminUuid) {
    if (value === OLD_FIREBASE_UID) return adminUuid;
    return value ?? null;
}

function buildHistoryRow(adminUuid, doc) {
    const data = doc.data();
    const { timestamp, twitchMessageId, login, suggestedBy, ...rest } = data;
    return {
        user_id: adminUuid,
        twitch_message_id: twitchMessageId || null,
        login: login || null,
        timestamp: toIso(timestamp) || new Date().toISOString(),
        payload: {
            ...rest,
            twitchMessageId: twitchMessageId || null,
            login: login || null,
            suggestedBy: remapSuggestedBy(suggestedBy, adminUuid),
        },
    };
}

async function main() {
    const db = initFirebase();
    const supabase = getSupabaseAdmin();

    console.log(APPLY ? '=== APPLY MODE - writing to Supabase ===' : '=== DRY RUN - no writes will be made (pass --apply to write for real) ===');

    const { data: adminRow, error: adminLookupError } = await supabase
        .from('users').select('id, twitch_username').eq('twitch_username', MASTER_ADMIN_TWITCH_USERNAME).single();
    if (adminLookupError || !adminRow) {
        throw new Error(
            `Could not find the master admin's Supabase user row (twitch_username='${MASTER_ADMIN_TWITCH_USERNAME}') on this Supabase instance - ` +
            `they must log in for real against it first so a row exists to migrate data under (plan §8, step 1/2). ` +
            (adminLookupError?.message || '')
        );
    }
    const ADMIN_UUID = adminRow.id;
    console.log(`Master admin Supabase UUID: ${ADMIN_UUID}`);

    // --- settings/config -> public.settings (minus the leaked apiToken) ---
    const settingsDoc = await db.doc(`users/${OLD_FIREBASE_UID}/settings/config`).get();
    if (settingsDoc.exists) {
        const flat = settingsDoc.data();
        const hadLeakedToken = Object.prototype.hasOwnProperty.call(flat, 'apiToken');
        const settingsRow = buildSettingsRow(ADMIN_UUID, flat);
        console.log(`settings: ${Object.keys(flat).length} fields${hadLeakedToken ? ' (dropping leaked apiToken field)' : ''}`);
        if (APPLY) {
            const { error } = await supabase.from('settings').upsert(settingsRow, { onConflict: 'user_id' });
            if (error) throw new Error(`settings upsert failed: ${error.message}`);
        }
    } else {
        console.log('settings: NOT FOUND, skipping');
    }

    // --- private/config.apiToken -> public.private_config.api_token ---
    const privConfigDoc = await db.doc(`users/${OLD_FIREBASE_UID}/private/config`).get();
    if (privConfigDoc.exists && privConfigDoc.data().apiToken) {
        console.log('private_config: writing real api_token');
        if (APPLY) {
            const { error } = await supabase.from('private_config')
                .upsert({ user_id: ADMIN_UUID, api_token: privConfigDoc.data().apiToken }, { onConflict: 'user_id' });
            if (error) throw new Error(`private_config upsert failed: ${error.message}`);
        }
    } else {
        console.log('private_config: NOT FOUND or no apiToken, skipping');
    }

    // --- history/* -> public.history (full replace for this user, see header) ---
    const historySnap = await db.collection(`users/${OLD_FIREBASE_UID}/history`).get();
    const historyRows = historySnap.docs.map((d) => buildHistoryRow(ADMIN_UUID, d));
    console.log(`history: ${historyRows.length} docs`);
    if (APPLY && historyRows.length > 0) {
        const { error: delError } = await supabase.from('history').delete().eq('user_id', ADMIN_UUID);
        if (delError) throw new Error(`history delete (pre-reinsert) failed: ${delError.message}`);
        for (let i = 0; i < historyRows.length; i += HISTORY_INSERT_CHUNK_SIZE) {
            const chunk = historyRows.slice(i, i + HISTORY_INSERT_CHUNK_SIZE);
            const { error } = await supabase.from('history').insert(chunk);
            if (error) throw new Error(`history insert failed at offset ${i}: ${error.message}`);
            console.log(`  inserted ${Math.min(i + HISTORY_INSERT_CHUNK_SIZE, historyRows.length)}/${historyRows.length}`);
        }
    }

    console.log(APPLY ? '=== Done ===' : '=== Dry run complete - re-run with --apply to write for real ===');
    process.exit(0);
}

main().catch((e) => { console.error('ERROR:', e); process.exit(1); });
