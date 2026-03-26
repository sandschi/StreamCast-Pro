'use client';
import { useEffect, useState } from 'react';
import Image from 'next/image';
import { User } from 'lucide-react';

// Simple in-memory cache to prevent duplicate fetches across the app
const avatarCache = {};

export default function TwitchAvatar({ photoURL, username, alt = "", iconSize = 20 }) {
    const [finalUrl, setFinalUrl] = useState(photoURL);

    // Sync state if photoURL prop changes directly (e.g. log in)
    useEffect(() => {
        if (photoURL) setFinalUrl(photoURL);
    }, [photoURL]);

    useEffect(() => {
        // If we already have a direct photo URL or no username, skip fetch
        if (photoURL || !username) return;

        // If we cached it previously in this session, use it instantly
        if (avatarCache[username]) {
            setFinalUrl(avatarCache[username]);
            return;
        }

        let isMounted = true;
        
        const fetchAvatar = async () => {
            try {
                // Fetch direct from IVR.fi matching the Chat.js engine perfectly
                const response = await fetch(`https://api.ivr.fi/v2/twitch/user?login=${username}`);
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
