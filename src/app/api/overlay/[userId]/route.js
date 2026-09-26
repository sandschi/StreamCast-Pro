import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { mapSettingsRowToFlat, buildSettingsUpdate } from '@/lib/settingsMapping';
import { getPostHogClient, captureEvent } from '@/lib/posthog-server';

export async function GET(request, { params }) {
    const posthogClient = getPostHogClient();
    let userId;
    try {
        ({ userId } = await params);
        const { searchParams } = new URL(request.url);
        const action = searchParams.get('action');
        const token = searchParams.get('token');

        await captureEvent(posthogClient, userId, 'api_overlay_request_started', {
            action: action,
            userId: userId,
        });

        if (!userId || !token || !action) {
            const errorMsg = "Missing required parameters";
            await captureEvent(posthogClient, userId, 'api_overlay_error', { error: errorMsg, status: 400, action: action, userId: userId }, true);
            return NextResponse.json({ success: false, error: errorMsg }, { status: 400 });
        }

        const supabaseAdmin = getSupabaseAdmin();

        // 1. Verify Token against User's Private Config
        const { data: privateConfig } = await supabaseAdmin
            .from('private_config')
            .select('api_token')
            .eq('user_id', userId)
            .maybeSingle();

        if (!privateConfig) {
            const errorMsg = "Authentication configuration not found";
            await captureEvent(posthogClient, userId, 'api_overlay_error', { error: errorMsg, status: 404, action: action, userId: userId }, true);
            return NextResponse.json({ success: false, error: errorMsg }, { status: 404 });
        }

        if (!privateConfig.api_token) {
            const errorMsg = "Unauthorized or invalid token";
            await captureEvent(posthogClient, userId, 'api_overlay_error', { error: errorMsg, status: 401, action: action, userId: userId }, true);
            return NextResponse.json({ success: false, error: errorMsg }, { status: 401 });
        }

        const storedTokenBuffer = Buffer.from(privateConfig.api_token);
        const providedTokenBuffer = Buffer.from(token);

        if (storedTokenBuffer.length !== providedTokenBuffer.length || !crypto.timingSafeEqual(storedTokenBuffer, providedTokenBuffer)) {
            const errorMsg = "Unauthorized or invalid token";
            await captureEvent(posthogClient, userId, 'api_overlay_error', { error: errorMsg, status: 401, action: action, userId: userId }, true);
            return NextResponse.json({ success: false, error: errorMsg }, { status: 401 });
        }

        // 2. Perform Requested Action
        let newState = null;

        // karafunOverlayQueueEnabled/karafunOverlayNowPlayingEnabled live in
        // the settings row's appearance jsonb blob (not first-class columns -
        // see src/lib/settingsMapping.js), so a toggle needs the current row
        // to merge into rather than a bare column update.
        const toggleAppearanceField = async (field, explicitValue) => {
            const { data: settingsRow, error: fetchError } = await supabaseAdmin
                .from('settings').select('*').eq('user_id', userId).maybeSingle();
            if (fetchError) throw fetchError;
            if (!settingsRow) throw new Error('No document to update');
            const current = mapSettingsRowToFlat(settingsRow);
            newState = explicitValue !== undefined ? explicitValue : !current[field];
            const update = buildSettingsUpdate(field, newState, settingsRow.appearance);
            const { error: updateError } = await supabaseAdmin.from('settings').update(update).eq('user_id', userId);
            if (updateError) throw updateError;
        };

        switch (action) {
            case 'toggle-karafun-queue':
                await toggleAppearanceField('karafunOverlayQueueEnabled');
                break;
            case 'karafun-queue-on':
                await toggleAppearanceField('karafunOverlayQueueEnabled', true);
                break;
            case 'karafun-queue-off':
                await toggleAppearanceField('karafunOverlayQueueEnabled', false);
                break;
            case 'toggle-now-playing':
                await toggleAppearanceField('karafunOverlayNowPlayingEnabled');
                break;
            case 'now-playing-on':
                await toggleAppearanceField('karafunOverlayNowPlayingEnabled', true);
                break;
            case 'now-playing-off':
                await toggleAppearanceField('karafunOverlayNowPlayingEnabled', false);
                break;
            case 'hide-message': {
                await supabaseAdmin.from('active_message').delete().eq('user_id', userId);
                await captureEvent(posthogClient, userId, 'api_overlay_success', { action: action, userId: userId, message_hidden: true }, true);
                return NextResponse.json({ success: true, action: action, message_hidden: true });
            }
            case 'show-now-playing': {
                await supabaseAdmin.from('overlay_triggers').upsert({
                    user_id: userId, now_playing_triggered_at: new Date().toISOString(),
                }, { onConflict: 'user_id' });
                await captureEvent(posthogClient, userId, 'api_overlay_success', { action: action, userId: userId }, true);
                return NextResponse.json({ success: true, action: action });
            }
            case 'hide-now-playing': {
                await supabaseAdmin.from('overlay_triggers').delete().eq('user_id', userId);
                await captureEvent(posthogClient, userId, 'api_overlay_success', { action: action, userId: userId }, true);
                return NextResponse.json({ success: true, action: action });
            }
            default:
                const errorMsg = "Invalid action";
                await captureEvent(posthogClient, userId, 'api_overlay_error', { error: errorMsg, status: 400, action: action, userId: userId }, true);
                return NextResponse.json({ success: false, error: errorMsg }, { status: 400 });
        }

        await captureEvent(posthogClient, userId, 'api_overlay_success', { action: action, state: newState, userId: userId }, true);
        return NextResponse.json({ success: true, action: action, state: newState });

    } catch (error) {
        console.error("Error in overlay API:", error);

        const isNotFound = error?.message?.includes('No document to update');
        const status = isNotFound ? 404 : 500;
        const errorMsg = isNotFound ? "Settings configuration not found" : "Internal server error";

        await captureEvent(posthogClient, userId || 'anonymous', 'api_overlay_error', {
            error: errorMsg,
            status: status,
            exception: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined
        }, true);

        return NextResponse.json({ success: false, error: errorMsg }, { status });
    }
}
