import { MessageSquare, History, Users, Music, Mic, Settings, Terminal, Shield } from 'lucide-react';

// Order here is the display order (dashboard/page.js filters this array, so
// whatever order NAV lists tabs in is what the tab strip/rail/sidebar shows).
export const NAV = [
    { id: 'chat', label: 'Live Chat', icon: MessageSquare, title: 'Moderation Dashboard' },
    { id: 'history', label: 'History', icon: History, title: 'Message History' },
    { id: 'karaoke', label: 'Karaoke', icon: Mic, title: 'Song Requests' },
    { id: 'karafun', label: 'KaraFun Mod', icon: Music, title: 'KaraFun Queue & Moderation' },
    { id: 'users', label: 'Users', icon: Users, title: 'Manage Users' },
    { id: 'settings', label: 'Settings', icon: Settings, title: 'Overlay Customization' },
    { id: 'api', label: 'Remote', icon: Terminal, title: 'Remote API Controls' },
    { id: 'broadcasters', label: 'Broadcasters', icon: Shield, title: 'Manage Broadcasters' },
];

// Which tabs each role can reach. 'waiting' sees no dashboard at all.
// 'karafun' ("KaraFun Mod" - needs karafunEnabled, broadcaster/mod/admin;
// this is also where karaoke request oversight, the staging queue, rotation
// order, and playback controls live, gated separately on karaokeEnabled
// inside the pane itself), 'karaoke' (needs karaokeEnabled, every role) and
// 'broadcasters' (master admin only) are conditionally appended by the page,
// not listed here — matching the real access rules in dashboard/page.js
// rather than the design mockup's guess.
export const ROLE_TABS = {
    broadcaster: ['chat', 'history', 'users', 'settings', 'api'],
    mod: ['chat', 'history', 'users'],
    viewer: ['chat'],
    singer: ['chat'],
    waiting: [],
};
