'use client';
export const dynamic = 'force-dynamic';

import { useSearchParams, useRouter } from 'next/navigation';
import React, { Suspense, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { db } from '@/lib/firebase';
import { doc, getDoc, onSnapshot, setDoc, serverTimestamp, collection, query, orderBy, limit, getDocs } from 'firebase/firestore';

import { TREATMENTS } from '@/components/dashboard-shell/treatments';
import { NAV, ROLE_TABS } from '@/components/dashboard-shell/nav';
import TitleBar from '@/components/dashboard-shell/TitleBar';
import MenuBar from '@/components/dashboard-shell/MenuBar';
import NavTabStrip from '@/components/dashboard-shell/NavTabStrip';
import NavRail from '@/components/dashboard-shell/NavRail';
import NavList from '@/components/dashboard-shell/NavList';
import StatusBar from '@/components/dashboard-shell/StatusBar';
import AlertBar from '@/components/dashboard-shell/AlertBar';
import LoginWindow from '@/components/dashboard-shell/LoginWindow';
import ReviewWindow from '@/components/dashboard-shell/ReviewWindow';
import ChatPane from '@/components/dashboard-shell/ChatPane';
import HistoryPane from '@/components/dashboard-shell/HistoryPane';
import UsersPane from '@/components/dashboard-shell/UsersPane';
import KaraFunPane from '@/components/dashboard-shell/KaraFunPane';
import SettingsPane from '@/components/dashboard-shell/SettingsPane';
import SectionTabs from '@/components/dashboard-shell/SectionTabs';
import ApiPane from '@/components/dashboard-shell/ApiPane';
import BroadcastersPane from '@/components/dashboard-shell/BroadcastersPane';
import ChangelogModal from '@/components/dashboard/ChangelogModal';
import { useChatData } from '@/hooks/useChatData';

const PANES = { history: HistoryPane, users: UsersPane, karafun: KaraFunPane, settings: SettingsPane, api: ApiPane, broadcasters: BroadcastersPane };

function VerifyingBlock({ t }) {
    return (
        <div style={{ flex: 1, minHeight: 0, display: 'grid', placeItems: 'center', gap: 12, textAlign: 'center', padding: 24 }}>
            <div style={{ width: 40, height: 40, border: `3px solid ${t.hair}`, borderTopColor: t.accent, borderRadius: '50%', animation: 'sc-spin 0.8s linear infinite' }} />
            <div>
                <div style={{ fontFamily: 'var(--font-sans)', fontSize: 15, fontWeight: 700, color: t.text }}>Verifying Security…</div>
                <div style={{ marginTop: 4, fontFamily: 'var(--font-sans)', fontSize: 12.5, color: t.dim }}>Performing deep identity handshake with Twitch.</div>
            </div>
            <style>{`@keyframes sc-spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}

function DashboardContent() {
    const { user, userData, loginWithTwitch, logout, isMasterAdmin, setIsMasterAdmin, loading } = useAuth();
    const router = useRouter();
    const searchParams = useSearchParams();

    const activeTab = searchParams.get('tab') || 'chat';
    const hostParam = searchParams.get('host');

    const setActiveTab = (tab) => {
        const params = new URLSearchParams(searchParams);
        params.set('tab', tab);
        router.push(`?${params.toString()}`);
    };

    const [copyState, setCopyState] = useState(null);
    const [isModAuthorized, setIsModAuthorized] = useState(false);
    const [userRole, setUserRole] = useState(null);
    const [broadcasterStatus, setBroadcasterStatus] = useState('waiting');
    const [verifyingMod, setVerifyingMod] = useState(true);
    const [userSettings, setUserSettings] = useState({ karafunEnabled: false });
    const [privateConfig, setPrivateConfig] = useState({ apiToken: null });
    const [showChangelog, setShowChangelog] = useState(false);
    const [suggestionsMuted, setSuggestionsMuted] = useState(false);
    const [settingsSection, setSettingsSection] = useState('dashboard');

    // A viewer's own legibility preference (like their browser zoom level),
    // not a broadcaster-wide style choice, so it lives in localStorage rather
    // than settings/config alongside treatment/nav/density.
    const [uiScale, setUiScaleState] = useState(100);
    useEffect(() => {
        try {
            const saved = window.localStorage.getItem('sc-ui-scale');
            if (saved) {
                const n = parseInt(saved, 10);
                if (!Number.isNaN(n)) setUiScaleState(n);
            }
        } catch (e) { /* storage unavailable — keep default */ }
    }, []);
    const setUiScale = (n) => {
        setUiScaleState(n);
        try { window.localStorage.setItem('sc-ui-scale', String(n)); } catch (e) { /* ignore */ }
    };
    useEffect(() => {
        document.documentElement.style.zoom = uiScale !== 100 ? `${uiScale}%` : '';
        return () => { document.documentElement.style.zoom = ''; };
    }, [uiScale]);

    const targetUid = hostParam || user?.uid;
    const isModeratorMode = hostParam && hostParam !== user?.uid;

    const hasVerifiedAccess = isMasterAdmin ||
        (userRole === 'broadcaster' && broadcasterStatus === 'approved') ||
        (userRole === 'mod' && isModAuthorized) ||
        (userRole === 'viewer');

    // Verifying Moderator Permissions
    useEffect(() => {
        if (!user) return;
        let unsubscribeRole = () => { };
        let unsubscribeBroadcasterStatus = () => { };

        if (isMasterAdmin) {
            console.log('Permission Check: Master Admin detected. Full Access Granted.');
            setTimeout(() => {
                setIsModAuthorized(true);
                setUserRole('broadcaster');
                setVerifyingMod(false);
                setBroadcasterStatus('approved');
            }, 0);
            return;
        }

        if (!isModeratorMode || !hostParam || hostParam === user.uid) {
            console.log('Permission Check: Broadcaster/Local detected. Access Granted.');
            setTimeout(() => {
                setIsModAuthorized(true);
                setUserRole('broadcaster');
                setVerifyingMod(false);
            }, 0);

            unsubscribeBroadcasterStatus = onSnapshot(doc(db, 'users', user.uid), (docSnap) => {
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    let status = data?.status;
                    // Master-admin detection uses twitchUsername (Firestore), not
                    // user.displayName — Firebase's OIDC integration never actually
                    // populates displayName for the Twitch provider (confirmed always
                    // null at runtime), so that check silently failed on every
                    // returning session. twitchUsername is set once from the raw OAuth
                    // response at login and locked from further client writes in
                    // firestore.rules, so it's safe to trust here.
                    const isSandschi = data?.twitchUsername?.toLowerCase() === 'sandschi';

                    console.log('Admin Security Check (Dashboard):', { isSandschi, twitchUsername: data?.twitchUsername });

                    setIsMasterAdmin(isSandschi);

                    if (!status || (isSandschi && status !== 'approved')) {
                        status = isSandschi ? 'approved' : 'waiting';
                    }
                    setBroadcasterStatus(status || 'waiting');
                } else {
                    setBroadcasterStatus('waiting');
                }
            });
        } else {
            setTimeout(() => setVerifyingMod(true), 0);
            const roleRef = doc(db, 'users', hostParam, 'permissions', user.uid);
            unsubscribeRole = onSnapshot(roleRef, (doc) => {
                const data = doc.data();
                const role = data?.role || 'viewer';
                setUserRole(role);
                setIsModAuthorized(role === 'mod' || role === 'broadcaster');
                setVerifyingMod(false);
                console.log('Current User Role:', role);
            });
        }

        let heartbeatInterval;
        if (user && hostParam) {
            const presenceRef = doc(db, 'users', hostParam, 'online', user.uid);
            const updatePresence = async () => {
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
            heartbeatInterval = setInterval(updatePresence, 30000);
        }

        return () => {
            if (heartbeatInterval) clearInterval(heartbeatInterval);
            unsubscribeRole();
            unsubscribeBroadcasterStatus();
        };
    }, [user, hostParam, isModeratorMode, isMasterAdmin, setIsMasterAdmin, targetUid]);

    // Stable Settings Listener
    useEffect(() => {
        if (!targetUid) return;

        const settingsRef = doc(db, 'users', targetUid, 'settings', 'config');
        const unsubscribe = onSnapshot(settingsRef, (docSnap) => {
            if (docSnap.exists()) {
                setUserSettings(docSnap.data());
            } else {
                setUserSettings({ karafunEnabled: false });
            }
        });

        const fetchPrivateConfig = async () => {
            if (!user || (!isMasterAdmin && userRole !== 'broadcaster')) {
                setPrivateConfig({ apiToken: null });
                return;
            }
            try {
                const privateRef = doc(db, 'users', targetUid, 'private', 'config');
                const privateSnap = await getDoc(privateRef);
                if (privateSnap.exists()) {
                    setPrivateConfig(privateSnap.data());
                } else {
                    setPrivateConfig({ apiToken: null });
                }
            } catch (err) {
                console.error("Error fetching private config:", err);
                setPrivateConfig({ apiToken: null });
            }
        };

        fetchPrivateConfig();

        return () => unsubscribe();
    }, [targetUid, user, isMasterAdmin, userRole]);

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

    // Chat is lifted to this level (instead of living inside ChatPane) so the
    // tmi.js connection survives tab switches, exactly like the classic
    // Chat.js stayed mounted (hidden via CSS) regardless of active tab — and
    // so the title/status bar chrome can show its real connection state.
    const chatEnabled = hasVerifiedAccess && !verifyingMod;
    const chat = useChatData({ targetUid: chatEnabled ? targetUid : null, userRole, enabled: chatEnabled });

    const allowed = useMemo(() => {
        // userRole is set to 'broadcaster' optimistically the moment someone reaches
        // their own dashboard, before broadcasterStatus (waiting/approved/denied) is
        // known — without this check, a pending or denied broadcaster would see the
        // full tab strip even though the body correctly shows the gate screen.
        if (!hasVerifiedAccess) return [];
        const base = ROLE_TABS[userRole] || [];
        const extra = [];
        if ((userRole === 'broadcaster' || isMasterAdmin) && userSettings?.karafunEnabled) extra.push('karafun');
        if (isMasterAdmin) extra.push('broadcasters');
        return NAV.map(n => n.id).filter(id => base.includes(id) || extra.includes(id));
    }, [hasVerifiedAccess, userRole, isMasterAdmin, userSettings?.karafunEnabled]);

    // Cmd/Ctrl+1-9 tab switching
    useEffect(() => {
        const h = (e) => {
            if (!(e.metaKey || e.ctrlKey)) return;
            const n = parseInt(e.key, 10);
            if (n >= 1 && n <= allowed.length) { e.preventDefault(); setActiveTab(allowed[n - 1]); }
        };
        window.addEventListener('keydown', h);
        return () => window.removeEventListener('keydown', h);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [allowed]);

    const treatment = userSettings?.dashboardTreatment || 'carbon';
    const t = TREATMENTS[treatment] || TREATMENTS.carbon;
    const navVariant = userSettings?.dashboardNav || 'tabs';
    const density = userSettings?.dashboardDensity || 'compact';
    const compact = density === 'compact';
    const menubar = userSettings?.dashboardMenubar !== false;
    const statusbar = userSettings?.dashboardStatusbar !== false;
    const d = {
        compact, title: 38, menu: menubar ? 29 : 0, tabs: 34, status: statusbar ? 25 : 0,
        rail: compact ? 46 : 52, list: compact ? 178 : 202, toolbar: compact ? 29 : 34, row: compact ? 28 : 34,
        pad: compact ? 12 : 16, gap: compact ? 12 : 16, gutter: compact ? 8 : 12, inspector: compact ? 250 : 290,
    };

    const conn = chat.connectionStatus === 'connected' ? 'connected' : chat.connectionStatus === 'connecting' ? 'reconnecting' : 'disconnected';

    const updateAppearance = async (key, value) => {
        if (!targetUid) return;
        try {
            await setDoc(doc(db, 'users', targetUid, 'settings', 'config'), { [key]: value }, { merge: true });
        } catch (e) { console.error(`Error saving ${key}:`, e); }
    };

    const exportHistory = async () => {
        if (!targetUid) return;
        try {
            const q = query(collection(db, 'users', targetUid, 'history'), orderBy('timestamp', 'desc'), limit(200));
            const snap = await getDocs(q);
            const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `streamcast-history-${Date.now()}.json`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        } catch (e) { console.error('Error exporting history:', e); }
    };

    const showLastMessage = async () => {
        if (!targetUid) return;
        try {
            const q = query(collection(db, 'users', targetUid, 'history'), orderBy('timestamp', 'desc'), limit(1));
            const snap = await getDocs(q);
            if (snap.empty) return;
            const last = { ...snap.docs[0].data() };
            delete last.id;
            await setDoc(doc(db, 'users', targetUid, 'active_message', 'current'), { ...last, timestamp: serverTimestamp() });
        } catch (e) { console.error('Error showing last message:', e); }
    };

    const handleMenuSelect = (menu, item) => {
        switch (item) {
            case 'Copy Overlay URL': return copyToClipboard('overlay');
            case 'Copy Moderator Link': return copyToClipboard('mod');
            case 'Export Message History…': return exportHistory();
            case 'Sign Out': return logout();
            case 'Show Last Message': return showLastMessage();
            case 'Show Permanently  ∞': return chat.activeMessage && chat.sendToScreen(chat.activeMessage, true);
            case 'Hide Overlay': return chat.hideOverlay();
            case 'Send Test Message': return chat.sendToScreen({
                username: user?.displayName || 'Test User', login: 'test', color: '#07fc03', avatarUrl: user?.photoURL || null,
                fragments: [{ type: 'text', content: 'This is a test message from the dashboard.' }],
            });
            case 'Save Settings': return setActiveTab('settings');
            case 'Reconnect to Twitch': return chat.reconnect();
            case 'Clear Log': return chat.clearMessages();
            case 'Approve All Suggestions': return chat.suggestions.forEach(s => chat.approveSuggestion(s));
            case 'Mute Suggestions': return setSuggestionsMuted(m => !m);
            case 'Compact Density': return updateAppearance('dashboardDensity', 'compact');
            case 'Comfortable Density': return updateAppearance('dashboardDensity', 'comfortable');
            case 'Full Screen': return document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
            case 'Changelog': return setShowChangelog(true);
            case 'Remote API Reference': return setActiveTab('api');
            case 'About StreamCast Pro': return setShowChangelog(true);
            default: return;
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
                <div className="w-12 h-12 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (!user) {
        return <LoginWindow t={TREATMENTS.carbon} onLogin={loginWithTwitch} />;
    }

    const current = allowed.includes(activeTab) ? activeTab : (allowed[0] || activeTab);
    const Body = PANES[current];
    const isVerifying = verifyingMod && isModeratorMode && !isMasterAdmin;
    const showChrome = hasVerifiedAccess && !verifyingMod;

    const navUser = { photoURL: userData?.photoURL || user?.photoURL, username: userData?.twitchUsername || user?.displayName };

    let gate = null;
    if (!hasVerifiedAccess && !isVerifying) {
        if (userRole === 'broadcaster' && !isModeratorMode && broadcasterStatus === 'waiting') {
            gate = { tone: 'waiting', title: 'Access Pending', status: 'Waiting for approval', body: <>Your application as a broadcaster is currently under review by <strong style={{ color: t.text }}>Sandschi</strong>. You will have access once approved.</> };
        } else if (userRole === 'broadcaster' && !isModeratorMode && broadcasterStatus === 'denied') {
            gate = { tone: 'denied', title: 'Access Denied', status: 'Access restricted', body: 'Your broadcaster access has been restricted. You can still use the dashboard as a viewer if invited by others.' };
        } else if (userRole === 'denied') {
            gate = { tone: 'denied', title: 'Access Denied', status: 'Access restricted', body: 'Your access to this dashboard has been restricted by the broadcaster.' };
        }
    }

    return (
        <div style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', background: t.app, color: t.text, fontFamily: 'var(--font-sans)', overflow: 'hidden' }}>
            <TitleBar t={t} d={d} conn={conn} channel={chat.channelName || navUser.username || 'Not connected'}
                role={showChrome ? (isMasterAdmin ? 'Master admin' : (userRole || '')) : ''} isMasterAdmin={isMasterAdmin} />
            {menubar && <MenuBar t={t} d={d} onSelect={handleMenuSelect} restricted={!hasVerifiedAccess} />}
            {navVariant === 'tabs' && <NavTabStrip t={t} d={d} tab={current} set={setActiveTab} allowed={allowed} />}
            <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
                {navVariant === 'rail' && <NavRail t={t} d={d} tab={current} set={setActiveTab} allowed={allowed} onSignOut={logout} />}
                {navVariant === 'list' && <NavList t={t} d={d} tab={current} set={setActiveTab} allowed={allowed} role={isMasterAdmin ? 'Master admin' : (userRole || '')} user={navUser} />}
                <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                    {showChrome && current === 'settings' && (
                        <div style={{ flex: 'none', display: 'flex', alignItems: 'center', padding: `0 ${d.pad}px`, height: compact ? 34 : 40, borderBottom: `1px solid ${t.hair}` }}>
                            <SectionTabs t={t} active={settingsSection} onChange={setSettingsSection} />
                        </div>
                    )}
                    <AlertBar t={t} d={d} alert="none" />
                    <div style={{ flex: 1, minHeight: 0, display: 'flex', padding: d.gutter }}>
                        {isVerifying ? (
                            <VerifyingBlock t={t} />
                        ) : gate ? (
                            <ReviewWindow t={t} d={d} {...gate} />
                        ) : (
                            <>
                                <ChatPane t={t} d={d} userRole={userRole} chat={chat} hidden={current !== 'chat'} muted={suggestionsMuted} />
                                {current !== 'chat' && Body && (
                                    <Body
                                        t={t} d={d} targetUid={targetUid} userRole={userRole} user={user}
                                        userSettings={userSettings} privateConfig={privateConfig} setPrivateConfig={setPrivateConfig}
                                        isMasterAdmin={isMasterAdmin} isModeratorMode={isModeratorMode}
                                        uiScale={uiScale} setUiScale={setUiScale}
                                        activeSection={settingsSection}
                                    />
                                )}
                            </>
                        )}
                    </div>
                </div>
            </div>
            {statusbar && (
                <StatusBar
                    t={t} d={d} tab={current} onAir={chat.activeMessage} conn={conn}
                    role={isMasterAdmin ? 'broadcaster' : (userRole || 'waiting')}
                    queueDepth={chat.suggestions?.length || 0} partyId={userSettings?.karafunPartyId}
                    blocked={isVerifying || !!gate}
                />
            )}
            <ChangelogModal open={showChangelog} onClose={() => setShowChangelog(false)} />
        </div>
    );
}

export default function DashboardPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
                <div className="w-12 h-12 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
            </div>
        }>
            <DashboardContent />
        </Suspense>
    );
}
