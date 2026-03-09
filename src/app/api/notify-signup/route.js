import { NextResponse } from 'next/server';
import { getPostHogClient, captureEvent } from '@/lib/posthog-server';

const DISCORD_USER_ID = "520983375885107200";

export async function POST(request) {
    const posthogClient = getPostHogClient();

    const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
    if (!DISCORD_WEBHOOK_URL) {
        console.error("CRITICAL: Notification service not configured. Missing DISCORD_WEBHOOK_URL");
        return NextResponse.json({ success: false, error: "Notification service not configured" }, { status: 503 });
    }

    try {
        const { userId, userData } = await request.json();

        // Extract user information
        const twitchUsername = userData.twitchUsername || "Unknown";
        const displayName = userData.displayName || twitchUsername;
        const photoURL = userData.photoURL || "https://static-cdn.jtvnw.net/user-default-pictures-uv/cdd517fe-def4-11e9-948e-784f43822e80-profile_image-300x300.png";
        const status = userData.status || "waiting";
        const timestamp = userData.lastLogin || new Date().toISOString();

        captureEvent(posthogClient, userId, 'api_signup_notification_started', {
            userId: userId,
            status: status,
            twitchUsername: twitchUsername
        });

        // Skip notification if user is already approved (e.g., sandschi)
        if (status === "approved") {
            await captureEvent(posthogClient, userId, 'api_signup_notification_skipped', { userId: userId, reason: "auto-approved" }, true);
            return NextResponse.json({ success: true, skipped: true, reason: "auto-approved" });
        }

        // Create Discord embed
        const embed = {
            title: "🎮 New StreamCast Pro Signup!",
            description: `<@${DISCORD_USER_ID}> A new broadcaster has signed up and is waiting for approval.`,
            color: 0x9146FF, // Twitch purple
            fields: [
                {
                    name: "👤 Display Name",
                    value: displayName,
                    inline: true
                },
                {
                    name: "📺 Twitch Username",
                    value: `[@${twitchUsername}](https://twitch.tv/${twitchUsername})`,
                    inline: true
                },
                {
                    name: "🆔 User ID",
                    value: `\`${userId}\``,
                    inline: false
                },
                {
                    name: "📊 Status",
                    value: `⏳ ${status.toUpperCase()}`,
                    inline: true
                },
                {
                    name: "🕐 Signed Up",
                    value: `<t:${Math.floor(new Date(timestamp).getTime() / 1000)}:R>`,
                    inline: true
                }
            ],
            thumbnail: {
                url: photoURL
            },
            footer: {
                text: "StreamCast Pro • Broadcaster Management"
            },
            timestamp: new Date().toISOString()
        };

        // Send to Discord
        const response = await fetch(DISCORD_WEBHOOK_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                content: `<@${DISCORD_USER_ID}>`,
                embeds: [embed],
                username: "StreamCast Pro"
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("Discord webhook failed:", response.status, errorText);

            await captureEvent(posthogClient, userId, 'api_signup_notification_error', {
                error: "Discord webhook failed",
                status: response.status,
                details: errorText,
                userId: userId
            }, true);
            return NextResponse.json({ success: false, error: "Discord webhook failed" }, { status: 500 });
        }

        await captureEvent(posthogClient, userId, 'api_signup_notification_success', { userId: userId }, true);
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Error sending Discord notification:", error);

        await captureEvent(posthogClient, 'anonymous', 'api_signup_notification_error', {
            error: "Internal server error",
            exception: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined
        }, true);

        return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
    }
}
