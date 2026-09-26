// Single source of truth for the master admin's identity on the Next.js side
// (relay/src/commandProcessor.js keeps its own copy - separate package/Docker
// context, can't import from src/).
//
// MASTER_ADMIN_TWITCH_ID is the stable identity: Twitch's own numeric user ID,
// read server-side from the user's auth.identities row (never user_metadata,
// which the user can edit via auth.updateUser). It survives auth.users wipes,
// unlike the Supabase UUID below, so /api/set-admin-claim keys the claim
// grant off this - that's what makes a fresh post-reset login bootstrap
// itself without any SQL-side username trust.
export const MASTER_ADMIN_TWITCH_ID = '154510494';

// Supabase UUID - changes every time auth.users gets wiped and the master
// admin logs in fresh. Only a fallback next to the app_metadata.is_master_admin
// claim; if it drifts, check `select id from auth.users where
// raw_user_meta_data->>'name' = 'sandschi'` and update it here (and in
// relay/src/commandProcessor.js).
export const MASTER_ADMIN_UID = 'ad462962-938e-467f-9bd1-993a0e3e0ba9';

// `user` must come from a server-side supabaseAdmin.auth.getUser(token) call,
// whose identities array is read from auth.identities, not client-supplied.
export function hasMasterAdminTwitchIdentity(user) {
    return (user?.identities || []).some((identity) => identity.provider === 'twitch'
        && (identity.id === MASTER_ADMIN_TWITCH_ID || identity.identity_data?.sub === MASTER_ADMIN_TWITCH_ID));
}

export function isMasterAdminUser(user) {
    return user?.app_metadata?.is_master_admin === true || user?.id === MASTER_ADMIN_UID;
}
