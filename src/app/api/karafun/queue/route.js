import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const partyId = searchParams.get('partyId');

    if (!partyId) {
        return NextResponse.json({ error: 'Party ID is required' }, { status: 400 });
    }

    try {
        const response = await fetch(`https://www.karafun.com/party/${partyId}`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            next: { revalidate: 10 } // Cache for 10 seconds
        });

        if (!response.ok) {
            return NextResponse.json({ error: 'Failed to fetch KaraFun page' }, { status: response.status });
        }

        const html = await response.text();
        const $ = cheerio.load(html);

        const queue = [];

        // Structure analysis (based on common patterns):
        // Current song usually in a "player" or "now-playing" section
        // Queue usually in a list

        // This is a guestimate of the structure, we might need to adjust.
        // Usually KaraFun remote has a .playlist or .queue class
        $('.playlist-item, .song-item').each((i, el) => {
            const title = $(el).find('.title, .song-title').text().trim();
            const artist = $(el).find('.artist, .song-artist').text().trim();
            const singer = $(el).find('.singer, .user-name').text().trim();

            if (title) {
                queue.push({ title, artist, singer });
            }
        });

        // The first item might be the "Now Playing"
        const currentSong = queue.shift() || null;

        return NextResponse.json({
            currentSong,
            upcoming: queue.slice(0, 10), // Return next 10 songs
            timestamp: Date.now()
        });

    } catch (error) {
        console.error('KaraFun Scrape Error:', error);
        return NextResponse.json({ error: 'Internal server error while scraping' }, { status: 500 });
    }
}
