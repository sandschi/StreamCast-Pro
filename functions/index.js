const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

initializeApp();

// Discord Webhook URL - stored in environment config
const DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/1471625368908595382/7c7Gut2JK8ZOTuxId4AFvtNBPuEuIP7FEVEOBCQXEG2ZZ6KRYS1PgY8tDTNDFdG-rHDN";
const DISCORD_USER_ID = "520983375885107200";

/**
 * Sends a Discord notification when a new user signs up
 * Triggers on: /users/{userId} document creation
 */
exports.notifyNewSignup = onDocumentCreated("users/{userId}", async (event) => {
    const snapshot = event.data;
    if (!snapshot) {
        console.log("No data associated with the event");
        return;
    }

    const userData = snapshot.data();
    const userId = event.params.userId;

    // Extract user information
    const twitchUsername = userData.twitchUsername || "Unknown";
    const displayName = userData.displayName || twitchUsername;
    const photoURL = userData.photoURL || "";
    const twitchId = userData.twitchId || "";
    const status = userData.status || "waiting";
    const timestamp = userData.lastLogin || new Date().toISOString();

    // Skip notification if user is already approved (e.g., sandschi)
    if (status === "approved") {
        console.log(`User ${twitchUsername} auto-approved, skipping notification`);
        return;
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
            url: photoURL || "https://static-cdn.jtvnw.net/user-default-pictures-uv/cdd517fe-def4-11e9-948e-784f43822e80-profile_image-300x300.png"
        },
        footer: {
            text: "StreamCast Pro • Broadcaster Management",
            icon_url: "https://cdn.discordapp.com/attachments/1234567890/logo.png"
        },
        timestamp: new Date().toISOString()
    };

    // Send to Discord
    try {
        const response = await fetch(DISCORD_WEBHOOK_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                content: `<@${DISCORD_USER_ID}>`,
                embeds: [embed],
                username: "StreamCast Pro",
                avatar_url: "https://cdn.discordapp.com/attachments/1234567890/logo.png"
            }),
        });

        if (!response.ok) {
            console.error("Discord webhook failed:", response.status, await response.text());
        } else {
            console.log(`Discord notification sent for user: ${twitchUsername}`);
        }
    } catch (error) {
        console.error("Error sending Discord notification:", error);
    }
});
