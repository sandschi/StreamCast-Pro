import { PostHog } from 'posthog-node';

let posthogClient = null;

export function getPostHogClient() {
    if (posthogClient) return posthogClient;

    const apiKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;

    if (!apiKey || apiKey === 'phc_placeholder' || apiKey === 'phc_REPLACE_WITH_YOUR_KEY') {
        console.warn("PostHog Analytics is disabled: NEXT_PUBLIC_POSTHOG_KEY is missing or using a placeholder.");
        return null;
    }

    try {
        posthogClient = new PostHog(
            apiKey,
            { host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://eu.i.posthog.com', flushAt: 1, flushInterval: 0 }
        );
        return posthogClient;
    } catch (e) {
        console.warn("PostHog initialization failed:", e);
        return null;
    }
}

export async function captureEvent(client, distinctId, event, properties, shouldFlush = false) {
    if (!client) return;
    try {
        client.capture({
            distinctId: distinctId || 'anonymous',
            event,
            properties
        });
        if (shouldFlush) {
            await client.flush();
        }
    } catch (telemetryError) {
        console.error(`PostHog telemetry failed for event: ${event}`, telemetryError);
    }
}
