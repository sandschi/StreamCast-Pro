// public.active_message has a server-computed expires_at column (NULL means
// "permanent") instead of Firestore's client-trusted `duration` field - the
// pg_cron+trigger pair in supabase/schema/0003_cron.sql is the only thing
// that ever reads it now, so every direct writer of active_message must
// compute it up front rather than leaving it to a client-side setTimeout.
export function computeExpiresAt(displayDurationSeconds, permanent) {
    if (permanent) return null;
    const seconds = typeof displayDurationSeconds === 'number' && displayDurationSeconds > 0 ? displayDurationSeconds : 5;
    return new Date(Date.now() + seconds * 1000).toISOString();
}
