// public.settings has first-class columns for a few fields (see
// supabase/schema/0001_schema.sql) and a single `appearance` jsonb blob for
// everything else (cosmetic overlay/dashboard fields). Every place that
// reads/writes settings needs the same flat (Firestore-shaped) <-> row
// mapping - first established in the overlay page's Phase 3 port.
const FIRST_CLASS_FIELDS = {
    karafunEnabled: 'karafun_enabled',
    karafunPartyId: 'karafun_party_id',
    karaokeEnabled: 'karaoke_enabled',
    karaokeRequestsOpen: 'karaoke_requests_open',
    karaokeRotationOrder: 'karaoke_rotation_order',
    displayDuration: 'display_duration',
};

export function mapSettingsRowToFlat(row) {
    if (!row) return {};
    const flat = { ...(row.appearance || {}) };
    for (const [flatKey, column] of Object.entries(FIRST_CLASS_FIELDS)) {
        if (row[column] !== undefined) flat[flatKey] = row[column];
    }
    return flat;
}

// Builds a partial `settings` row update for a single flat-shaped field
// change. `currentAppearance` is the row's current appearance object -
// PostgREST has no partial-jsonb-merge, the whole column is sent on every
// update, so a single field's save must not clobber the rest of the blob.
export function buildSettingsUpdate(key, value, currentAppearance) {
    const column = FIRST_CLASS_FIELDS[key];
    if (column) return { [column]: value };
    return { appearance: { ...(currentAppearance || {}), [key]: value } };
}

// Same idea for saving several flat fields at once (useSettingsData's
// handleSave, which writes the whole settings object staged in local state).
export function buildSettingsRowFromFlat(flat, currentAppearance) {
    const update = {};
    const appearance = { ...(currentAppearance || {}) };
    for (const [key, value] of Object.entries(flat)) {
        const column = FIRST_CLASS_FIELDS[key];
        if (column) update[column] = value;
        else appearance[key] = value;
    }
    update.appearance = appearance;
    return update;
}

// Writes a partial settings row for a channel that may belong to someone
// else (a mod on ?host=). Update first, upsert only when no row exists yet:
// PostgREST's upsert is INSERT ... ON CONFLICT DO UPDATE, which Postgres
// checks against the owner-only INSERT policy and which also rewrites
// user_id (no column grant) - so a mod's upsert is always rejected, even
// though the equivalent plain UPDATE is allowed. Only the owner can create
// the row, which is exactly when the upsert fallback is needed.
export async function saveSettingsFields(supabase, userId, fields) {
    const { data, error } = await supabase.from('settings').update(fields).eq('user_id', userId).select('user_id');
    if (error) throw error;
    if (data && data.length > 0) return;
    const { error: upsertError } = await supabase.from('settings').upsert({ user_id: userId, ...fields }, { onConflict: 'user_id' });
    if (upsertError) throw upsertError;
}

// For a consumer that only has the already-flattened settings object (e.g.
// useKaraFunData, which receives `userSettings` as a prop rather than
// subscribing to the raw row itself) - reconstructs a best-effort
// `appearance` object to merge into, by stripping the known first-class
// keys back out of the flat shape.
export function extractAppearanceFromFlat(flat) {
    if (!flat) return {};
    const appearance = { ...flat };
    for (const flatKey of Object.keys(FIRST_CLASS_FIELDS)) delete appearance[flatKey];
    return appearance;
}
