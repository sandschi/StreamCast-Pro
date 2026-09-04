import { NextResponse } from 'next/server';

const KUMA_BASE = 'https://kuma.sandschi.xyz/api/badge/19';
const BADGES = {
    status: `${KUMA_BASE}/status?style=flat`,
    ping: `${KUMA_BASE}/ping/2?suffix=+ms&style=flat`,
    avgResponse: `${KUMA_BASE}/avg-response/2?suffix=+ms&style=flat`,
    response: `${KUMA_BASE}/response?suffix=+ms&style=flat`,
};
const FETCH_TIMEOUT_MS = 5000;

async function fetchBadge(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
        const res = await fetch(url, { next: { revalidate: 30 }, signal: controller.signal });
        return res.ok ? await res.text() : null;
    } catch {
        return null;
    } finally {
        clearTimeout(timer);
    }
}

// Uptime Kuma's badge endpoints only return rendered SVGs (badge-maker), not JSON.
// Each SVG carries its value in a plain `aria-label="Label: Value"` attribute, so we
// scrape that rather than parse the shape geometry. Fetching server-side avoids CORS
// (the Kuma instance sets no Access-Control-Allow-Origin) and lets us cache briefly.
function parseBadge(svgText) {
    const label = svgText.match(/aria-label="([^"]+)"/)?.[1];
    if (!label) return null;
    const value = label.includes(': ') ? label.slice(label.indexOf(': ') + 2) : label;
    const color = svgText.match(/<rect x="[\d.]+" width="[\d.]+" height="[\d.]+" fill="(#[0-9a-fA-F]{3,6})"\/>/)?.[1] || null;
    return { value, color };
}

export async function GET() {
    // fetchBadge never rejects (it catches its own network/timeout errors), so
    // one slow or dead badge endpoint can't take the other three down with it —
    // only the required `status` badge failing should turn into a 502.
    const entries = Object.entries(BADGES);
    const results = await Promise.all(entries.map(([, url]) => fetchBadge(url)));

    const parsed = {};
    entries.forEach(([key], i) => { parsed[key] = results[i] ? parseBadge(results[i]) : null; });

    if (!parsed.status) {
        return NextResponse.json({ ok: false }, { status: 502 });
    }

    return NextResponse.json({
        ok: true,
        status: parsed.status.value,
        color: parsed.status.color,
        ping: parsed.ping?.value ?? null,
        avgResponse: parsed.avgResponse?.value ?? null,
        response: parsed.response?.value ?? null,
    });
}
