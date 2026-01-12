'use client';
export const dynamic = 'force-dynamic';

import { useSearchParams } from 'next/navigation';
import React, { useState, Suspense, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import Chat from '@/components/dashboard/Chat';
import History from '@/components/dashboard/History';
import Settings from '@/components/dashboard/Settings';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import tmi from 'tmi.js';
import {
    LayoutDashboard,
    MessageSquare,
    History as HistoryIcon,
    Settings as SettingsIcon,
    LogOut,
    ExternalLink,
    ShieldAlert,
    RefreshCw,
    Copy,
    Check,
    Link as LinkIcon
} from 'lucide-react';
import Link from 'next/link';

function DashboardContent() {
    const { user, twitchToken, loginWithTwitch, logout, loading } = useAuth();
    const [activeTab, setActiveTab] = useState('chat');
    const [copyState, setCopyState] = useState(null); // 'overlay' | 'mod'
    const [isModAuthorized, setIsModAuthorized] = useState(false); // Default to false for security
    const [verifyingMod, setVerifyingMod] = useState(false);
    const searchParams = useSearchParams();
    const hostParam = searchParams.get('host');

    const targetUid = hostParam || user?.uid;
    const isModeratorMode = hostParam && hostParam !== user?.uid;

    // Verifying Moderator Permissions
    useEffect(() => {
        if (!user) return;
        let ignore = false;

        // Broadcaster check: If no host param or I am the owner of this UID
        if (!isModeratorMode || !hostParam || hostParam === user.uid) {
            console.log('Permission Check: Broadcaster/Local detected. Access Granted.');
            setIsModAuthorized(true);
            setVerifyingMod(false);
            return;
        }

        const checkPermissions = async () => {
            console.log('--- MODERATOR SECURITY HANDSHAKE (V2) ---');
            setVerifyingMod(true);
            setIsModAuthorized(false);

            try {
                const hostDoc = await getDoc(doc(db, 'users', hostParam));
                const hostName = hostDoc.data()?.twitchUsername;

                // Wait up to 2 seconds for token to resolve from cloud if it's missing
                let currentToken = twitchToken;
                if (!currentToken) {
                    console.log('Token missing from state, checking Firestore directly...');
                    const tokenDoc = await getDoc(doc(db, 'users', user.uid, 'private', 'twitch'));
                    if (tokenDoc.exists()) {
                        currentToken = tokenDoc.data().accessToken;
                        console.log('Token recovered from Firestore directly.');
                    }
                }

                const myDoc = await getDoc(doc(db, 'users', user.uid));
                const myTwitchName = myDoc.data()?.twitchUsername || user.displayName;

                if (!hostName || !myTwitchName) {
                    console.error('Handshake Aborted: Missing user/host mapping.');
                    if (!ignore) setIsModAuthorized(false);
                    return;
                }

                console.log(`Identity: ${myTwitchName} | Target: #${hostName}`);
                console.log(`Security Context: ${currentToken ? 'IDENTIFIED (Cloud Key)' : 'ANONYMOUS (No Key)'}`);

                // SOURCE 1: TMI Diagnostic Join
                const checkTmi = async () => {
                    if (!currentToken) return false;
                    return new Promise((resolve) => {
                        const tempClient = new tmi.Client({
                            options: { debug: false, skipMembership: true, skipUpdatingEmotesets: true },
                            connection: { reconnect: false, secure: true, timeout: 5000 },
                            identity: { username: myTwitchName.toLowerCase(), password: `oauth:${currentToken}` },
                            channels: [hostName]
                        });

                        const t = setTimeout(() => {
                            console.warn('TMI Handshake: TIMEOUT ❌');
                            tempClient.disconnect();
                            resolve(false);
                        }, 5000);

                        tempClient.on('connected', () => console.log('TMI Handshake: Connected to Twitch IRC...'));

                        tempClient.on('notice', (channel, msgid, msg) => {
                            console.warn(`TMI Handshake Notice [${msgid}]: ${msg}`);
                            if (msgid === 'authentication_failed') {
                                clearTimeout(t);
                                tempClient.disconnect();
                                resolve(false);
                            }
                        });

                        tempClient.on('userstate', (channel, state) => {
                            if (channel.replace('#', '').toLowerCase() === hostName.toLowerCase()) {
                                clearTimeout(t);
                                const isMod = state.mod || state.badges?.broadcaster === '1';
                                console.log('TMI Handshake Source:', isMod ? 'VERIFIED ✅' : 'REJECTED ❌');
                                tempClient.disconnect();
                                resolve(isMod);
                            }
                        });

                        tempClient.connect().catch(err => {
                            console.error('TMI Connect Error:', err);
                            clearTimeout(t);
                            resolve(false);
                        });
                    });
                };

                // SOURCE 2: DecAPI mods list lookup (Corrected Endpoint)
                const checkDecApi = async () => {
                    try {
                        const res = await fetch(`https://decapi.me/twitch/mods/${hostName}?cb=${Date.now()}`);
                        if (!res.ok) return false;
                        const text = await res.text();
                        const modsList = text.toLowerCase().split(' ');
                        const isMod = modsList.includes(myTwitchName.toLowerCase());
                        console.log('DecAPI Source:', isMod ? 'VERIFIED ✅' : 'REJECTED ❌');
                        return isMod;
                    } catch { return false; }
                };

                // SOURCE 3: IVR API (Cache Busted)
                const checkIvr = async () => {
                    try {
                        const res = await fetch(`https://api.ivr.fi/v2/twitch/modvip/${hostName}?cb=${Date.now()}`);
                        if (!res.ok) return false;
                        const data = await res.json();
                        const isMod = data?.mods?.some(m => m.login.toLowerCase() === myTwitchName.toLowerCase());
                        console.log('IVR Source:', isMod ? 'VERIFIED ✅' : 'REJECTED ❌');
                        return isMod;
                    } catch { return false; }
                };

                // Concurrent verification
                const [tmiRes, ivrRes] = await Promise.all([checkTmi(), checkIvr()]);
                const isVerified = tmiRes || ivrRes;

                if (!ignore) {
                    console.log('Handshake Final Result:', isVerified ? 'AUTHORIZED ✅' : 'ACCESS DENIED ❌');
                    setIsModAuthorized(isVerified);
                }
            } catch (e) {
                console.error('Security Handshake Failed:', e);
                if (!ignore) setIsModAuthorized(false);
            } finally {
                if (!ignore) {
                    setVerifyingMod(false);
                    console.log('--- END MODERATOR SECURITY HANDSHAKE ---');
                }
            }
        };

        checkPermissions();
        return () => { ignore = true; };
    }, [user, hostParam, isModeratorMode, twitchToken]);

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
                    {/* Verifying Moderator Permissions UI */}
                    {isModeratorMode && verifyingMod && (
                        <div className="flex flex-col items-center justify-center p-20 space-y-4">
                            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500 mb-4"></div>
                            <h2 className="text-xl font-bold">Verifying Security...</h2>
                            <p className="text-zinc-500">Performing deep identity handshake with Twitch.</p>
                        </div>
                    )}

                    {isModeratorMode && !isModAuthorized && !verifyingMod && (
                        <div className="bg-zinc-900 border border-red-500/20 rounded-3xl p-12 text-center space-y-6 shadow-2xl">
                            <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mx-auto border border-red-500/20">
                                <ShieldAlert size={40} className="text-red-500" />
                            </div>
                            <div className="space-y-2">
                                <h3 className="text-2xl font-bold">Access Restricted</h3>
                                <p className="text-zinc-500 max-w-sm mx-auto">
                                    You are not currently recognized as a moderator for this channel.
                                    If you were recently promoted, try clicking below.
                                </p>
                            </div>
                            <div className="flex flex-col gap-3 items-center">
                                <button
                                    onClick={() => window.location.reload()}
                                    className="px-8 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl transition-all shadow-lg active:scale-95 flex items-center gap-2"
                                >
                                    <RefreshCw size={18} />
                                    Verify Again
                                </button>
                                <button
                                    onClick={() => setIsModeratorMode(false)}
                                    className="text-zinc-500 hover:text-zinc-300 text-sm underline transition-colors"
                                >
                                    Return to Broadcast Mode
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Dashboard Content - only shown if Broadcaster OR Authorized Mod */}
                    {(!isModeratorMode || isModAuthorized) && !verifyingMod && (
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
