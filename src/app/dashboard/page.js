'use client';
export const dynamic = 'force-dynamic';

import { useSearchParams } from 'next/navigation';
import React, { useState, Suspense, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import Chat from '@/components/dashboard/Chat';
import History from '@/components/dashboard/History';
import Settings from '@/components/dashboard/Settings';
import {
    LayoutDashboard,
    MessageSquare,
    History as HistoryIcon,
    Settings as SettingsIcon,
    LogOut,
    ExternalLink,
    ShieldAlert,
    Copy,
    Check,
    Link as LinkIcon
} from 'lucide-react';
import Link from 'next/link';

function DashboardContent() {
    const { user, loginWithTwitch, logout, loading } = useAuth();
    const [activeTab, setActiveTab] = useState('chat');
    const [copyState, setCopyState] = useState(null); // 'overlay' | 'mod'
    const [isModAuthorized, setIsModAuthorized] = useState(true); // Default to true while checking
    const [verifyingMod, setVerifyingMod] = useState(false);
    const searchParams = useSearchParams();
    const hostParam = searchParams.get('host');

    const targetUid = hostParam || user?.uid;
    const isModeratorMode = hostParam && hostParam !== user?.uid;

    // Verifying Moderator Permissions
    useEffect(() => {
        if (!user || !isModeratorMode || !hostParam) {
            setIsModAuthorized(true);
            return;
        }

        const checkPermissions = async () => {
            setVerifyingMod(true);
            try {
                // 1. Get host's twitch username
                const hostDoc = await getDoc(doc(db, 'users', hostParam));
                const hostName = hostDoc.data()?.twitchUsername;
                const myName = user.displayName; // Fallback to display name if twitchUsername not set

                if (!hostName) {
                    console.error('Host has no twitch username set.');
                    setIsModAuthorized(false);
                    return;
                }

                // 2. Check IVR for mod status
                const res = await fetch(`https://api.ivr.fi/v2/twitch/mod_check?user=${myName}&channel=${hostName}`);
                const data = await res.json();

                // If it returns true (mod) or the user IS the broadcaster (safety check)
                if (data === true || myName?.toLowerCase() === hostName.toLowerCase()) {
                    setIsModAuthorized(true);
                } else {
                    setIsModAuthorized(false);
                }
            } catch (e) {
                console.error('Permission check failed:', e);
                // In case of error, we default to block for security
                setIsModAuthorized(false);
            } finally {
                setVerifyingMod(false);
            }
        };

        checkPermissions();
    }, [user, hostParam, isModeratorMode]);

    useEffect(() => {
        if (copyState) {
            const timer = setTimeout(() => setCopyState(null), 2000);
            return () => clearTimeout(timer);
        }
    }, [copyState]);

    const copyToClipboard = async (type) => {
        if (!user) return;
        const baseUrl = window.location.origin;
        const url = type === 'overlay'
            ? `${baseUrl}/overlay/${user.uid}`
            : `${baseUrl}/dashboard?host=${user.uid}`;

        try {
            await navigator.clipboard.writeText(url);
            setCopyState(type);
        } catch (err) {
            console.error('Failed to copy!', err);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
                <div className="w-12 h-12 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (!user) {
        return (
            <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-purple-900/20 via-zinc-950 to-zinc-950">
                <div className="max-w-md w-full bg-zinc-900 border border-zinc-800 p-8 rounded-2xl shadow-2xl text-center space-y-6">
                    <div className="w-20 h-20 bg-purple-600/20 flex items-center justify-center rounded-2xl mx-auto border border-purple-500/20">
                        <LayoutDashboard className="w-10 h-10 text-purple-500" />
                    </div>
                    <div className="space-y-2">
                        <h1 className="text-3xl font-bold text-zinc-100">StreamCast Pro</h1>
                        <p className="text-zinc-400">The ultimate message overlay for elite streamers. Connect your Twitch to get started.</p>
                    </div>
                    <button
                        onClick={loginWithTwitch}
                        className="w-full py-4 px-6 bg-[#9146FF] hover:bg-[#7c3aeb] text-white font-bold rounded-xl transition-all shadow-lg flex items-center justify-center gap-3 active:scale-95"
                    >
                        <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24"><path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z" /></svg>
                        Connect with Twitch
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-zinc-950 text-zinc-100 flex font-sans">
            {/* Sidebar */}
            <aside className="w-20 md:w-64 border-r border-zinc-800 bg-zinc-900/50 flex flex-col p-4">
                <div className="flex items-center gap-3 px-2 mb-10">
                    <div className="w-10 h-10 bg-purple-600 rounded-lg flex items-center justify-center shadow-lg shadow-purple-500/20 shrink-0">
                        <LayoutDashboard className="text-white" />
                    </div>
                    <span className="hidden md:block font-bold text-xl tracking-tight">StreamCast</span>
                </div>

                <nav className="flex-1 space-y-2">
                    <TabButton
                        active={activeTab === 'chat'}
                        onClick={() => setActiveTab('chat')}
                        icon={<MessageSquare size={20} />}
                        label="Live Chat"
                    />
                    <TabButton
                        active={activeTab === 'history'}
                        onClick={() => setActiveTab('history')}
                        icon={<HistoryIcon size={20} />}
                        label="History"
                    />
                    <TabButton
                        active={activeTab === 'settings'}
                        onClick={() => setActiveTab('settings')}
                        icon={<SettingsIcon size={20} />}
                        label="Settings"
                    />

                    {/* Quick Tools Section */}
                    <div className="pt-6 pb-2 px-3 hidden md:block">
                        <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Toolkit</p>
                    </div>

                    {!isModeratorMode && (
                        <>
                            <button
                                onClick={() => copyToClipboard('overlay')}
                                className="w-full flex items-center gap-4 p-3 rounded-xl transition-all text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800"
                            >
                                <div className="shrink-0">
                                    {copyState === 'overlay' ? <Check size={20} className="text-green-500" /> : <ExternalLink size={20} />}
                                </div>
                                <span className="hidden md:block text-sm font-medium">
                                    {copyState === 'overlay' ? 'Copied!' : 'Copy Overlay URL'}
                                </span>
                            </button>
                            <button
                                onClick={() => copyToClipboard('mod')}
                                className="w-full flex items-center gap-4 p-3 rounded-xl transition-all text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800"
                            >
                                <div className="shrink-0">
                                    {copyState === 'mod' ? <Check size={20} className="text-green-500" /> : <LinkIcon size={20} />}
                                </div>
                                <span className="hidden md:block text-sm font-medium">
                                    {copyState === 'mod' ? 'Copied!' : 'Copy Mod Link'}
                                </span>
                            </button>
                        </>
                    )}
                </nav>

                <div className="mt-auto space-y-4">
                    <button
                        onClick={logout}
                        className="w-full flex items-center gap-3 p-3 text-zinc-400 hover:text-red-400 hover:bg-zinc-800 rounded-xl transition-all"
                    >
                        <LogOut size={20} />
                        <span className="hidden md:block text-sm font-medium">Logout</span>
                    </button>

                    <div className="pt-4 border-t border-zinc-800 flex items-center gap-3 px-2">
                        <img src={user.photoURL} alt="" className="w-8 h-8 rounded-full border border-zinc-700" />
                        <div className="hidden md:block overflow-hidden">
                            <p className="text-xs font-bold truncate">{user.displayName}</p>
                            <p className="text-[10px] text-zinc-500 truncate uppercase tracking-tighter">
                                {isModeratorMode ? 'Moderator' : 'Broadcaster'}
                            </p>
                        </div>
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 p-6 md:p-10 overflow-y-auto">
                <header className="mb-8 flex justify-between items-start">
                    <div>
                        <h2 className="text-2xl font-bold md:text-3xl text-zinc-100 mb-2">
                            {activeTab === 'chat' && 'Moderation Dashboard'}
                            {activeTab === 'history' && 'Message History'}
                            {activeTab === 'settings' && 'Overlay Customization'}
                        </h2>
                        <p className="text-zinc-500 text-sm md:text-base">
                            {activeTab === 'chat' && 'Listen to your Twitch chat and send messages to your stream overlay.'}
                            {activeTab === 'history' && 'Review and re-send previous messages to the screen.'}
                            {activeTab === 'settings' && 'Configure colors, animations, and display behavior.'}
                        </p>
                    </div>

                    {isModeratorMode && (
                        <div className="bg-purple-600/20 border border-purple-500/30 rounded-full px-4 py-1.5 flex items-center gap-2 text-purple-400 text-xs font-bold animate-transition">
                            <ShieldAlert size={14} />
                            MODERATOR MODE ACTIVE
                        </div>
                    )}
                </header>

                <div className="max-w-4xl">
                    {verifyingMod ? (
                        <div className="flex flex-col items-center justify-center p-20 space-y-4">
                            <div className="w-10 h-10 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" />
                            <p className="text-zinc-500 font-medium">Verifying moderator credentials...</p>
                        </div>
                    ) : !isModAuthorized ? (
                        <div className="bg-zinc-900 border border-red-500/20 rounded-3xl p-12 text-center space-y-6 shadow-2xl">
                            <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mx-auto border border-red-500/20">
                                <ShieldAlert size={40} className="text-red-500" />
                            </div>
                            <div className="space-y-2">
                                <h3 className="text-2xl font-bold">Access Restricted</h3>
                                <p className="text-zinc-500 max-w-sm mx-auto">
                                    You are not currently a moderator for this channel. If you were recently modded, try refreshing.
                                </p>
                            </div>
                            <button
                                onClick={logout}
                                className="px-8 py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl transition-all shadow-lg active:scale-95 flex items-center gap-2 mx-auto"
                            >
                                <LogOut size={18} />
                                Logout of StreamCast
                            </button>
                        </div>
                    ) : (
                        <>
                            <div className={activeTab === 'chat' ? 'contents' : 'hidden'}>
                                <Chat targetUid={targetUid} isModeratorMode={isModeratorMode} isModAuthorized={isModAuthorized} />
                            </div>
                            {activeTab === 'history' && <History targetUid={targetUid} isModeratorMode={isModeratorMode} isModAuthorized={isModAuthorized} />}
                            {activeTab === 'settings' && <Settings targetUid={targetUid} isModeratorMode={isModeratorMode} />}
                        </>
                    )}
                </div>
            </main>
        </div>
    );
}

export default function DashboardPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
                <div className="w-12 h-12 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" />
            </div>
        }>
            <DashboardContent />
        </Suspense>
    );
}

function TabButton({ active, onClick, icon, label }) {
    return (
        <button
            onClick={onClick}
            className={`w-full flex items-center gap-4 p-3 rounded-xl transition-all ${active
                ? 'bg-purple-600/10 text-purple-500 border border-purple-500/20'
                : 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 border border-transparent'
                }`}
        >
            {React.cloneElement(icon, { size: 20 })}
            <span className="hidden md:block font-medium text-sm">{label}</span>
        </button>
    );
}
