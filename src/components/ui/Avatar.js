'use client';

import TwitchAvatar from '@/components/TwitchAvatar';

export default function Avatar({
    photoURL,
    username,
    alt = '',
    size = 40,
    iconSize,
    ringClassName = 'border border-zinc-700 bg-zinc-800',
    online = false,
    onlineDotClassName = 'w-4 h-4 -bottom-1 -right-1 border-4',
    className = '',
}) {
    return (
        <div className={`relative shrink-0 ${className}`} style={{ width: size, height: size }}>
            <div className={`relative w-full h-full overflow-hidden rounded-full flex items-center justify-center ${ringClassName}`}>
                <TwitchAvatar photoURL={photoURL} username={username} alt={alt} iconSize={iconSize ?? Math.round(size * 0.5)} />
            </div>
            {online && (
                <div className={`absolute bg-green-500 border-zinc-900 rounded-full ${onlineDotClassName}`} />
            )}
        </div>
    );
}
