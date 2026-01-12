/**
 * Emote Engine for StreamCast Pro
 * Handles parsing Twitch messages and fetching 3rd party emotes.
 */

const failedIds = new Set();

export async function fetchThirdPartyEmotes(channelId) {
    if (failedIds.has(channelId)) return { sevenTV: [], bttv: [], ffz: [] };

    const emotes = {
        sevenTV: [],
        bttv: [],
        ffz: [],
    };

    try {
        // 7TV API (V3)
        const sevenTVRes = await fetch(`https://7tv.io/v3/users/twitch/${channelId}`);
        if (sevenTVRes.ok) {
            const data = await sevenTVRes.json();
            emotes.sevenTV = data.emote_set?.emotes?.map(e => ({
                id: e.id,
                name: e.name,
                url: e.data.host.url + '/2x.webp',
            })) || [];
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
            emotes.bttv = allBttv.map(e => ({
                id: e.id,
                name: e.code,
                url: `https://cdn.betterttv.net/emote/${e.id}/2x`,
            }));
        } else if (bttvRes.status === 404) {
            failedIds.add(channelId);
        }
    } catch (e) { /* silent */ }

    try {
        // FFZ API
        const ffzRes = await fetch(`https://api.frankerfacez.com/v1/room/id/${channelId}`);
        if (ffzRes.ok) {
            const data = await ffzRes.json();
            const setKey = Object.keys(data.sets)[0];
            emotes.ffz = data.sets[setKey].emoticons.map(e => ({
                id: e.id,
                name: e.name,
                url: e.urls['2'] || e.urls['1'],
            }));
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
