/**
 * Emote Engine for StreamCast Pro
 * Handles parsing Twitch messages and fetching 3rd party emotes.
 */

const failedIds = new Set();
let globalEmotesCache = null;

/**
 * Fetches global emotes from 7TV, BTTV, and FFZ.
 * Returns a combined object of global emotes.
 */
async function fetchGlobalEmotes() {
    if (globalEmotesCache) return globalEmotesCache;

    const globals = {
        sevenTV: [],
        bttv: [],
        ffz: [],
    };

    try {
        // 7TV Global (V3)
        const res = await fetch('https://7tv.io/v3/emote-sets/global');
        if (res.ok) {
            const data = await res.json();
            globals.sevenTV = data.emotes?.map(e => ({
                id: e.id,
                name: e.name,
                url: e.data.host.url + '/2x.webp',
            })) || [];
        }
    } catch (e) { /* silent */ }

    try {
        // BTTV Global
        const res = await fetch('https://api.betterttv.net/3/cached/emotes/global');
        if (res.ok) {
            const data = await res.json();
            globals.bttv = data.map(e => ({
                id: e.id,
                name: e.code,
                url: `https://cdn.betterttv.net/emote/${e.id}/2x`,
            }));
        }
    } catch (e) { /* silent */ }

    try {
        // FFZ Global
        const res = await fetch('https://api.frankerfacez.com/v1/set/global');
        if (res.ok) {
            const data = await res.json();
            // FFZ global usually comes in sets like "3" or "1"
            const sets = data.sets || {};
            const allFfz = [];
            Object.keys(sets).forEach(setKey => {
                sets[setKey].emoticons.forEach(e => {
                    allFfz.push({
                        id: e.id,
                        name: e.name,
                        url: e.urls['2'] || e.urls['1'],
                    });
                });
            });
            globals.ffz = allFfz;
        }
    } catch (e) { /* silent */ }

    globalEmotesCache = globals;
    return globals;
}

export async function fetchThirdPartyEmotes(channelId) {
    // 1. Fetch Global Emotes first (or from cache)
    const globals = await fetchGlobalEmotes();

    // 2. Prepare result structure
    const emotes = {
        sevenTV: [...globals.sevenTV],
        bttv: [...globals.bttv],
        ffz: [...globals.ffz],
    };

    if (failedIds.has(channelId)) return emotes;

    try {
        // 7TV API (V3)
        const sevenTVRes = await fetch(`https://7tv.io/v3/users/twitch/${channelId}`);
        if (sevenTVRes.ok) {
            const data = await sevenTVRes.json();
            const channelSevenTV = data.emote_set?.emotes?.map(e => ({
                id: e.id,
                name: e.name,
                url: e.data.host.url + '/2x.webp',
            })) || [];
            emotes.sevenTV.push(...channelSevenTV);
        } else if (sevenTVRes.status === 404) {
            failedIds.add(channelId);
        }
    } catch (e) { /* silent */ }

    try {
        // BTTV API
        const bttvRes = await fetch(`https://api.betterttv.net/3/cached/users/twitch/${channelId}`);
        if (bttvRes.ok) {
            const data = await bttvRes.json();
            const allBttv = [...(data.channelEmotes || []), ...(data.sharedEmotes || [])];
            const channelBttv = allBttv.map(e => ({
                id: e.id,
                name: e.code,
                url: `https://cdn.betterttv.net/emote/${e.id}/2x`,
            }));
            emotes.bttv.push(...channelBttv);
        } else if (bttvRes.status === 404) {
            failedIds.add(channelId);
        }
    } catch (e) { /* silent */ }

    try {
        // FFZ API
        const ffzRes = await fetch(`https://api.frankerfacez.com/v1/room/id/${channelId}`);
        if (ffzRes.ok) {
            const data = await ffzRes.json();
            const sets = data.sets || {};
            const channelFfz = [];
            Object.keys(sets).forEach(setKey => {
                sets[setKey].emoticons.forEach(e => {
                    channelFfz.push({
                        id: e.id,
                        name: e.name,
                        url: e.urls['2'] || e.urls['1'],
                    });
                });
            });
            emotes.ffz.push(...channelFfz);
        } else if (ffzRes.status === 404) {
            failedIds.add(channelId);
        }
    } catch (e) { /* silent */ }

    return emotes;
}

export function parseTwitchMessage(message, emotes, thirdPartyEmotes = {}) {
    // 1. Handle Twitch Native Emotes
    let emotePositions = [];

    if (emotes) {
        Object.keys(emotes).forEach(id => {
            emotes[id].forEach(range => {
                const [start, end] = range.split('-').map(Number);
                emotePositions.push({
                    start,
                    end,
                    type: 'twitch',
                    url: `https://static-cdn.jtvnw.net/emoticons/v2/${id}/default/dark/2.0`,
                    name: message.substring(start, end + 1)
                });
            });
        });
    }

    // Sort positions by start index
    emotePositions.sort((a, b) => a.start - b.start);

    // 2. Combine 3rd party emotes
    const allThirdParty = [
        ...(thirdPartyEmotes.sevenTV || []),
        ...(thirdPartyEmotes.bttv || []),
        ...(thirdPartyEmotes.ffz || [])
    ];

    const resultFragments = [];
    let lastIndex = 0;

    let i = 0;
    while (i < message.length) {
        const twitchEmote = emotePositions.find(p => p.start === i);

        if (twitchEmote) {
            if (i > lastIndex) {
                const textSegment = message.substring(lastIndex, i);
                resultFragments.push(...parseTextForThirdParty(textSegment, allThirdParty));
            }

            resultFragments.push({
                type: 'emote',
                url: twitchEmote.url,
                name: twitchEmote.name,
                provider: 'twitch'
            });

            i = twitchEmote.end + 1;
            lastIndex = i;
        } else {
            i++;
        }
    }

    if (lastIndex < message.length) {
        const textSegment = message.substring(lastIndex);
        resultFragments.push(...parseTextForThirdParty(textSegment, allThirdParty));
    }

    return resultFragments;
}

function parseTextForThirdParty(text, emotes) {
    const words = text.split(/(\s+)/);
    const fragments = [];

    words.forEach(word => {
        if (word.trim() === '') {
            if (word.length > 0) fragments.push({ type: 'text', content: word });
            return;
        }

        const emote = emotes.find(e => e.name === word);
        if (emote) {
            fragments.push({
                type: 'emote',
                url: emote.url,
                name: emote.name,
                provider: 'third-party'
            });
        } else {
            fragments.push({ type: 'text', content: word });
        }
    });

    return fragments;
}
