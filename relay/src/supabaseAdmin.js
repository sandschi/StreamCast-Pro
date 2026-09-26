'use strict';

// Ported from src/lib/supabase-admin.js (the main Next.js app's copy) -
// duplicated rather than shared, since relay/ is a separate package/runtime
// with no shared module (same pattern as the wire-protocol table in
// commandProcessor.js). A single opaque service-role token, unlike
// Firebase's service-account PEM key, so none of firebaseAdmin.js's
// defensive env-var reconstruction is needed here.
global.WebSocket = global.WebSocket || require('ws');
const { createClient } = require('@supabase/supabase-js');

let adminClient = null;

function getSupabaseAdmin() {
    if (!adminClient) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!url || !serviceRoleKey) {
            throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
        }
        adminClient = createClient(url, serviceRoleKey, {
            auth: { autoRefreshToken: false, persistSession: false },
        });
    }
    return adminClient;
}

module.exports = { getSupabaseAdmin };
