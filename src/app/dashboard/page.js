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
    Shield,
    RefreshCw,
    Copy,
    Check,
    Link as LinkIcon,
    Users,
    Clock
} from 'lucide-react';
import UsersTab from '@/components/dashboard/Users';
import Broadcasters from '@/components/dashboard/Broadcasters';
import { onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import Link from 'next/link';

function DashboardContent() {
    const { user, twitchToken, loginWithTwitch, logout, isMasterAdmin, loading } = useAuth();
    const [activeTab, setActiveTab] = useState('chat');
    const [copyState, setCopyState] = useState(null); // 'overlay' | 'mod'
    const [isModAuthorized, setIsModAuthorized] = useState(false); // Default to false for security
    const [userRole, setUserRole] = useState(null); // 'broadcaster', 'mod', 'viewer', 'denied'
    const [broadcasterStatus, setBroadcasterStatus] = useState('waiting'); // 'waiting', 'approved', 'denied'
    const [verifyingMod, setVerifyingMod] = useState(true);
    const searchParams = useSearchParams();
    const hostParam = searchParams.get('host');

    const targetUid = hostParam || user?.uid;
    const isModeratorMode = hostParam && hostParam !== user?.uid;

    // Verifying Moderator Permissions
    useEffect(() => {
        if (!user) return;
        let ignore = false;
        let unsubscribeRole = () => { };
        let unsubscribeBroadcasterStatus = () => { };

        // Master Admin bypass
        if (isMasterAdmin) {
            console.log('Permission Check: Master Admin detected. Full Access Granted.');
            setIsModAuthorized(true);
            setUserRole('broadcaster'); // Master admin effectively has broadcaster rights
            setVerifyingMod(false);
            setBroadcasterStatus('approved'); // Master admin is always approved
            return; // Skip further permission checks
        }

        // Broadcaster check: If no host param or I am the owner of this UID
        if (!isModeratorMode || !hostParam || hostParam === user.uid) {
            console.log('Permission Check: Broadcaster/Local detected. Access Granted.');
            setIsModAuthorized(true);
            setUserRole('broadcaster');
            setVerifyingMod(false);

            // Listen for broadcaster status if it's the user's own dashboard
            unsubscribeBroadcasterStatus = onSnapshot(doc(db, 'users', user.uid), (docSnap) => {
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    setBroadcasterStatus(data.status || 'waiting'); // Default to 'waiting'
                } else {
                    setBroadcasterStatus('waiting'); // User doc doesn't exist, default to waiting
                }
            });
        } else {
            // NEW: Permission Listener (Manual Roles) for moderator mode
            setVerifyingMod(true);
            const roleRef = doc(db, 'users', hostParam, 'permissions', user.uid);
            unsubscribeRole = onSnapshot(roleRef, (doc) => {
                const data = doc.data();
                const role = data?.role || 'viewer'; // Default to viewer if invited
                setUserRole(role);
                setIsModAuthorized(role === 'mod' || role === 'broadcaster');
                setVerifyingMod(false);
                console.log('Current User Role:', role);
            });
        }

        // NEW: Presence Heartbeat (Track logged-in users)
        let heartbeatInterval;
        if (user && hostParam) {
            const presenceRef = doc(db, 'users', hostParam, 'online', user.uid);
            const updatePresence = async () => {
                // Fetch own profile for best name data
                const myProfile = await getDoc(doc(db, 'users', user.uid));
                const myData = myProfile.data();

                await setDoc(presenceRef, {
                    lastSeen: serverTimestamp(),
                    displayName: myData?.displayName || user.displayName,
                    photoURL: myData?.photoURL || user.photoURL,
                    twitchUsername: myData?.twitchUsername || user.displayName?.toLowerCase()
                }, { merge: true });
            };
            updatePresence();
            heartbeatInterval = setInterval(updatePresence, 30000); // 30s heartbeat
        }

        return () => {
            ignore = true;
            if (heartbeatInterval) clearInterval(heartbeatInterval);
            unsubscribeRole();
            unsubscribeBroadcasterStatus();
        };
    }, [user, hostParam, isModeratorMode, isMasterAdmin]);

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
                    <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center shadow-lg shadow-purple-500/20 shrink-0 overflow-hidden">
                        <img src="/logo.png" alt="StreamCast Logo" className="w-full h-full object-cover" />
                    </div>
                    <span className="hidden md:block font-bold text-xl tracking-tight">STREAMCAST</span>
                </div>

                <nav className="flex-1 space-y-2">
                    <button
                        onClick={() => setActiveTab('chat')}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'chat' ? 'bg-indigo-600 text-white shadow-lg' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'}`}
                    >
                        <MessageSquare size={20} />
                        <span className="font-medium">Live Chat</span>
                    </button>

                    {isModAuthorized && (
                        <button
                            onClick={() => setActiveTab('history')}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'history' ? 'bg-indigo-600 text-white shadow-lg' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'}`}
                        >
                            <HistoryIcon size={20} />
                            <span className="font-medium">History</span>
                        </button>
                    )}

                    {isModAuthorized && (
                        <button
                            onClick={() => setActiveTab('users')}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'users' ? 'bg-indigo-600 text-white shadow-lg' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'}`}
                        >
                            <Users size={20} />
                            <span className="font-medium">Users</span>
                        </button>
                    )}

                    {userRole === 'broadcaster' && (
                        <button
                            onClick={() => setActiveTab('settings')}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'settings' ? 'bg-indigo-600 text-white shadow-lg' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'}`}
                        >
                            <SettingsIcon size={20} />
                            <span className="font-medium">Settings</span>
                        </button>
                    )}

                    {isMasterAdmin && (
                        <button
                            onClick={() => setActiveTab('broadcasters')}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'broadcasters' ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/40' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'}`}
                        >
                            <Shield size={20} />
                            <span className="font-medium">Broadcasters</span>
                        </button>
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
                        <div className="relative">
                            <img src={user.photoURL} alt="" className="w-9 h-9 rounded-full border border-zinc-700 object-cover bg-zinc-800" />
                            <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-green-500 border-2 border-zinc-900 rounded-full" />
                        </div>
                        <div className="hidden md:block overflow-hidden">
                            <p className="text-[11px] font-bold truncate text-zinc-100">{user.displayName}</p>
                            <p className={`text-[9px] font-black truncate uppercase tracking-[0.1em] ${userRole === 'broadcaster' ? 'text-indigo-400' :
                                userRole === 'mod' ? 'text-emerald-400' :
                                    userRole === 'denied' ? 'text-red-400' :
                                        'text-zinc-500'
                                }`}>
                                {verifyingMod ? 'Verifying...' : userRole}
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
                            {activeTab === 'users' && 'Manage Users'}
                            {activeTab === 'settings' && 'Overlay Customization'}
                            {activeTab === 'broadcasters' && 'Manage Broadcasters'}
                        </h2>
                        <p className="text-zinc-500 text-sm md:text-base">
                            {activeTab === 'chat' && 'Listen to your Twitch chat and send messages to your stream overlay.'}
                            {activeTab === 'history' && 'Review and re-send previous messages to the screen.'}
                            {activeTab === 'users' && 'Manage moderators, viewers, and restricted accounts.'}
                            {activeTab === 'settings' && 'Configure colors, animations, and display behavior.'}
                            {activeTab === 'broadcasters' && 'Approve or deny broadcaster access to StreamCast.'}
                        </p>
                    </div>

                    <div className="flex items-center gap-2">
                        {isMasterAdmin && (
                            <div className="px-3 py-1 bg-purple-600/10 border border-purple-500/20 rounded-full flex items-center gap-2">
                                <Shield size={12} className="text-purple-400" />
                                <span className="text-[10px] font-black uppercase tracking-widest text-purple-400">Master Admin</span>
                            </div>
                        )}
                        <div className={`px-4 py-1.5 rounded-full border flex items-center gap-2 text-[10px] md:text-xs font-bold transition-all shadow-sm ${userRole === 'broadcaster' ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' :
                            userRole === 'mod' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                                userRole === 'denied' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                                    'bg-zinc-500/10 text-zinc-400 border-zinc-500/20'
                            }`}>
                            {!verifyingMod && userRole === 'broadcaster' && <LayoutDashboard size={14} />}
                            {!verifyingMod && userRole === 'mod' && <Shield size={14} />}
                            {!verifyingMod && userRole === 'viewer' && <Users size={14} />}
                            {(verifyingMod || userRole === 'denied') && <ShieldAlert size={14} />}
                            <span className="uppercase tracking-widest whitespace-nowrap">
                                {verifyingMod ? 'Verifying Mode...' : `${userRole} Mode`}
                            </span>
                        </div>
                    </div>
                </header>

                <div className="max-w-4xl">
                    {/* Verifying Moderator Permissions UI */}
                    {isModeratorMode && verifyingMod && !isMasterAdmin && (
                        <div className="flex flex-col items-center justify-center p-20 space-y-4">
                            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500 mb-4"></div>
                            <h2 className="text-xl font-bold">Verifying Security...</h2>
                            <p className="text-zinc-500">Performing deep identity handshake with Twitch.</p>
                        </div>
                    )}

                    {/* Suggestion Mode Header Strip (Viewers only) */}
                    {userRole === 'viewer' && !verifyingMod && !isMasterAdmin && (
                        <div className="mb-4 bg-indigo-600/10 border border-indigo-500/20 rounded-xl p-3 flex items-center justify-between animate-in fade-in slide-in-from-top-2 duration-700">
                            <div className="flex items-center gap-3">
                                <div className="p-1.5 bg-indigo-500/20 rounded-lg">
                                    <Users size={16} className="text-indigo-400" />
                                </div>
                                <p className="text-xs text-indigo-100/80">
                                    <span className="font-bold text-indigo-400">Suggestion Mode</span> – Your messages will be sent to the moderation pool for review.
                                </p>
                            </div>
                        </div>
                    )}

                    {userRole === 'broadcaster' && !isModeratorMode && !verifyingMod && broadcasterStatus === 'waiting' && !isMasterAdmin && (
                        <div className="bg-zinc-900 border border-yellow-500/20 rounded-3xl p-12 text-center space-y-6 shadow-2xl">
                            <div className="w-20 h-20 bg-yellow-500/10 rounded-full flex items-center justify-center mx-auto border border-yellow-500/20">
                                <Clock size={40} className="text-yellow-500" />
                            </div>
                            <div className="space-y-2">
                                <h3 className="text-2xl font-bold">Access Pending</h3>
                                <p className="text-zinc-500 max-w-sm mx-auto">
                                    Your application as a broadcaster is currently under review by Sandschi. You will have access once approved.
                                </p>
                            </div>
                        </div>
                    )}

                    {userRole === 'broadcaster' && !isModeratorMode && !verifyingMod && broadcasterStatus === 'denied' && !isMasterAdmin && (
                        <div className="bg-zinc-900 border border-red-500/20 rounded-3xl p-12 text-center space-y-6 shadow-2xl">
                            <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mx-auto border border-red-500/20">
                                <ShieldAlert size={40} className="text-red-500" />
                            </div>
                            <div className="space-y-2">
                                <h3 className="2xl font-bold">Access Denied</h3>
                                <p className="text-zinc-500 max-w-sm mx-auto">
                                    Your broadcaster access has been restricted. You can still use the dashboard as a viewer if invited by others.
                                </p>
                            </div>
                        </div>
                    )}

                    {userRole === 'denied' && !isMasterAdmin && (
                        <div className="bg-zinc-900 border border-red-500/20 rounded-3xl p-12 text-center space-y-6 shadow-2xl">
                            <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mx-auto border border-red-500/20">
                                <ShieldAlert size={40} className="text-red-500" />
                            </div>
                            <div className="space-y-2">
                                <h3 className="text-2xl font-bold">Access Denied</h3>
                                <p className="text-zinc-500 max-w-sm mx-auto">
                                    Your access to this dashboard has been restricted by the broadcaster.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Dashboard Content - only shown if Broadcaster (Approved) OR Authorized Mod OR Viewer (Suggestion Mode) */}
                    {((userRole === 'broadcaster' && (broadcasterStatus === 'approved' || isMasterAdmin)) || isModAuthorized || (userRole === 'viewer' && activeTab === 'chat') || isMasterAdmin) && !verifyingMod && userRole !== 'denied' && (broadcasterStatus !== 'denied' || isMasterAdmin) && (
                        <>
                            <div className={activeTab === 'chat' ? 'contents' : 'hidden'}>
                                <Chat targetUid={targetUid} isModeratorMode={isModeratorMode} isModAuthorized={isModAuthorized} userRole={userRole} />
                            </div>
                            {activeTab === 'history' && <History targetUid={targetUid} isModeratorMode={isModeratorMode} isModAuthorized={isModAuthorized} userRole={userRole} />}
                            {activeTab === 'users' && isModAuthorized && <UsersTab targetUid={targetUid} user={user} />}
                            {activeTab === 'settings' && <Settings targetUid={targetUid} isModeratorMode={isModeratorMode} />}
                            {activeTab === 'broadcasters' && isMasterAdmin && <Broadcasters />}
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
