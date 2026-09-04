export default function manifest() {
    return {
        name: 'StreamCast Pro',
        short_name: 'StreamCast',
        description: 'The message overlay dashboard for Twitch streamers.',
        start_url: '/dashboard',
        display: 'standalone',
        background_color: '#0d0d10',
        theme_color: '#0d0d10',
        icons: [
            { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
    };
}
