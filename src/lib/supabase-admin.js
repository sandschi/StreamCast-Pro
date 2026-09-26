import { createClient } from '@supabase/supabase-js';

// Service-role client: bypasses RLS entirely, server-only, never imported by
// client code. A single opaque token (unlike Firebase's service-account PEM
// key), so none of firebase-admin.js's defensive env-var reconstruction is
// needed here.
let adminClient = null;

export function getSupabaseAdmin() {
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
