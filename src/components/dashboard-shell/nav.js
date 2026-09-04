import { MessageSquare, History, Users, Music, Settings, Terminal, Shield } from 'lucide-react';

export const NAV = [
    { id: 'chat', label: 'Live Chat', icon: MessageSquare, title: 'Moderation Dashboard' },
    { id: 'history', label: 'History', icon: History, title: 'Message History' },
    { id: 'users', label: 'Users', icon: Users, title: 'Manage Users' },
    { id: 'karafun', label: 'KaraFun', icon: Music, title: 'KaraFun Queue' },
    { id: 'settings', label: 'Settings', icon: Settings, title: 'Overlay Customization' },
    { id: 'api', label: 'Remote', icon: Terminal, title: 'Remote API Controls' },
    { id: 'broadcasters', label: 'Broadcasters', icon: Shield, title: 'Manage Broadcasters' },
];

// Which tabs each role can reach. 'waiting' sees no dashboard at all.
// 'karafun' (needs karafunEnabled + broadcaster/admin) and 'broadcasters' (master
// admin only) are conditionally appended by the page, not listed here — matching
// the real access rules in dashboard/page.js rather than the design mockup's guess.
export const ROLE_TABS = {
    broadcaster: ['chat', 'history', 'users', 'settings', 'api'],
    mod: ['chat', 'history', 'users'],
    viewer: ['chat'],
    waiting: [],
};
