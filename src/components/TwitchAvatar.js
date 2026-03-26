'use client';
import { useEffect, useState } from 'react';
import Image from 'next/image';
import { User } from 'lucide-react';

// Simple in-memory cache to prevent duplicate fetches across the app
const avatarCache = {};

export default function TwitchAvatar({ photoURL, username, alt = "", iconSize = 20 }) {
    const [finalUrl, setFinalUrl] = useState(() => photoURL || avatarCache[username] || null);

    useEffect(() => {
        // Validation: Twitch usernames are alphanumeric + underscores, 4-25 chars
        const isValidUsername = username && /^[a-zA-Z0-9_]{4,25}$/.test(username);
        
        // If we already have a direct photo URL, no username, or it's already cached, skip fetch
        if (photoURL || !isValidUsername || avatarCache[username]) {
            if (photoURL) setFinalUrl(photoURL);
            else if (avatarCache[username]) setFinalUrl(avatarCache[username]);
            return;
        }

        let isMounted = true;
        
        const fetchAvatar = async () => {
            try {
                // Encode to prevent breakage with special chars
                const safeName = encodeURIComponent(username);
                const response = await fetch(`https://api.ivr.fi/v2/twitch/user?login=${safeName}`);
                const data = await response.json();
                const realUrl = data?.[0]?.logo;
                if (realUrl && isMounted) {
                    avatarCache[username] = realUrl; // Cache to avoid refetching
                    setFinalUrl(realUrl);
                }
            } catch (e) { 
                console.warn(`Fallback Avatar fetch failed for ${username}`);
            }
        };

        fetchAvatar();

        return () => { isMounted = false; };
    }, [photoURL, username]);

    if (finalUrl) {
        return <Image src={finalUrl} alt={alt} fill className="object-cover" unoptimized />;
    }

    // Default icon until the image resolves, or if user truly has no avatar
    return <User size={iconSize} className="text-zinc-500" />;
}
