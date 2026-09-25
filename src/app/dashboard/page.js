'use client';
export const dynamic = 'force-dynamic';

import { useSearchParams, useRouter } from 'next/navigation';
import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { mapSettingsRowToFlat, buildSettingsUpdate } from '@/lib/settingsMapping';
import { computeExpiresAt } from '@/lib/activeMessage';

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
import KaraokePane from '@/components/dashboard-shell/KaraokePane';
import SettingsPane from '@/components/dashboard-shell/SettingsPane';
import SectionTabs from '@/components/dashboard-shell/SectionTabs';
import ApiPane from '@/components/dashboard-shell/ApiPane';
import BroadcastersPane from '@/components/dashboard-shell/BroadcastersPane';
import ChangelogModal from '@/components/dashboard/ChangelogModal';
import { useChatData } from '@/hooks/useChatData';
import { useKaraFunData } from '@/hooks/useKaraFunData';

const PANES = { history: HistoryPane, users: UsersPane, karafun: KaraFunPane, karaoke: KaraokePane, settings: SettingsPane, api: ApiPane, broadcasters: BroadcastersPane };

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
    const { user, userData, loginWithTwitch, logout, isMasterAdmin, loading } = useAuth();
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
    const [userSettings, setUserSettings] = useState({ karafunEnabled: false, karaokeEnabled: false });
    const [privateConfig, setPrivateConfig] = useState({ apiToken: null });
    const [showChangelog, setShowChangelog] = useState(false);
    const [suggestionsMuted, setSuggestionsMuted] = useState(false);
    const [settingsSection, setSettingsSection] = useState('dashboard');

    // Last-fetched raw settings row, kept alongside the flattened
    // `userSettings` state purely so updateAppearance below can merge a
    // single field into the `appearance` jsonb column without clobbering the
    // rest of it - PostgREST has no partial-jsonb-merge, so the whole column
    // has to be sent on every update.
    const settingsRowRef = useRef(null);

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

    const targetUid = hostParam || user?.id;
    const isModeratorMode = hostParam && hostParam !== user?.id;

    const hasVerifiedAccess = isMasterAdmin ||
        (userRole === 'broadcaster' && broadcasterStatus === 'approved') ||
        (userRole === 'mod' && isModAuthorized) ||
        (userRole === 'viewer') ||
        (userRole === 'singer');

    // Verifying Moderator Permissions
    useEffect(() => {
        if (!user || !supabase) return;
        let cleanup = () => { };

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

        if (!isModeratorMode || !hostParam || hostParam === user.id) {
            console.log('Permission Check: Broadcaster/Local detected. Access Granted.');
            setTimeout(() => {
                setIsModAuthorized(true);
                setUserRole('broadcaster');
                setVerifyingMod(false);
            }, 0);

            // isSandschi here only ever feeds the auto-approval decision
            // below - isMasterAdmin itself comes from AuthContext's custom-
            // claim check, not from this twitch_username field.
            const applyStatus = (data) => {
                let status = data?.status;
                const isSandschi = data?.twitch_username?.toLowerCase() === 'sandschi';
                if (!status || (isSandschi && status !== 'approved')) {
                    status = isSandschi ? 'approved' : 'waiting';
                }
                setBroadcasterStatus(status || 'waiting');
            };

            supabase.from('users').select('status, twitch_username').eq('id', user.id).maybeSingle()
                .then(({ data }) => applyStatus(data));

            const channel = supabase
                .channel(`dashboard-user-status-${user.id}`)
                .on('postgres_changes', { event: '*', schema: 'public', table: 'users', filter: `id=eq.${user.id}` }, (payload) => {
                    applyStatus(payload.eventType === 'DELETE' ? null : payload.new);
                })
                .subscribe();
            cleanup = () => supabase.removeChannel(channel);
        } else {
            setTimeout(() => setVerifyingMod(true), 0);

            const applyRole = (data) => {
                const role = data?.role || 'viewer';
                setUserRole(role);
                setIsModAuthorized(role === 'mod' || role === 'broadcaster');
                setVerifyingMod(false);
                console.log('Current User Role:', role);
            };

            supabase.from('permissions').select('role').eq('user_id', hostParam).eq('viewer_id', user.id).maybeSingle()
                .then(({ data }) => applyRole(data));

            const channel = supabase
                .channel(`dashboard-user-role-${hostParam}-${user.id}`)
                .on('postgres_changes', { event: '*', schema: 'public', table: 'permissions', filter: `user_id=eq.${hostParam}` }, (payload) => {
                    const isDelete = payload.eventType === 'DELETE';
                    const viewerId = isDelete ? payload.old?.viewer_id : payload.new?.viewer_id;
                    if (viewerId !== user.id) return;
                    applyRole(isDelete ? null : payload.new);
                })
                .subscribe();
            cleanup = () => supabase.removeChannel(channel);
        }

        return () => cleanup();
    }, [user, hostParam, isModeratorMode, isMasterAdmin, targetUid]);

    // Presence heartbeat - deliberately its own effect, not folded into the
    // permission-verification one above: that effect returns early for the
    // isMasterAdmin branch, which used to skip this heartbeat entirely for a
    // master admin viewing their own dashboard (silently made them impossible
    // to mark online/participating for karaoke rotation - see #27). Also was
    // gated on hostParam alone before, so a broadcaster viewing their own
    // dashboard (no ?host=) never wrote their own presence doc either;
    // targetUid covers both cases (self or hosted) the same way.
    useEffect(() => {
        if (!user || !targetUid || !supabase) return;
        const updatePresence = async () => {
            const { data: myData } = await supabase.from('users').select('display_name, photo_url, twitch_username').eq('id', user.id).maybeSingle();
            await supabase.from('online').upsert({
                user_id: targetUid,
                viewer_id: user.id,
                last_seen: new Date().toISOString(),
                display_name: myData?.display_name || user.user_metadata?.name,
                photo_url: myData?.photo_url || user.user_metadata?.avatar_url,
                twitch_username: myData?.twitch_username || user.user_metadata?.name?.toLowerCase(),
            }, { onConflict: 'user_id,viewer_id' });
        };
        updatePresence();
        const heartbeatInterval = setInterval(updatePresence, 30000);
        return () => clearInterval(heartbeatInterval);
    }, [user, targetUid]);

    // Stable Settings Listener
    useEffect(() => {
        if (!targetUid || !supabase) return;

        const applySettingsRow = (row) => {
            settingsRowRef.current = row;
            setUserSettings(row ? mapSettingsRowToFlat(row) : { karafunEnabled: false, karaokeEnabled: false });
        };

        supabase.from('settings').select('*').eq('user_id', targetUid).maybeSingle()
            .then(({ data }) => applySettingsRow(data));

        const settingsChannel = supabase
            .channel(`dashboard-settings-${targetUid}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'settings', filter: `user_id=eq.${targetUid}` }, (payload) => {
                applySettingsRow(payload.eventType === 'DELETE' ? null : payload.new);
            })
            .subscribe();

        // One-time fetch, not live: unlike settings above, private_config has
        // no independent write source while this tab is open besides this
        // dashboard's own token-regenerate flow, which already updates
        // `privateConfig` locally on success (see useApiSettingsData.js) - a
        // realtime channel here would only ever echo back what this same tab
        // just wrote.
        if (user && (isMasterAdmin || userRole === 'broadcaster')) {
            supabase.from('private_config').select('api_token').eq('user_id', targetUid).maybeSingle()
                .then(({ data, error }) => {
                    if (error) {
                        console.error('Error loading private config:', error);
                        setPrivateConfig({ apiToken: null });
                        return;
                    }
                    setPrivateConfig(data ? { apiToken: data.api_token } : { apiToken: null });
                });
        } else {
            setPrivateConfig({ apiToken: null });
        }

        return () => { supabase.removeChannel(settingsChannel); };
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
            ? `${baseUrl}/overlay/${user.id}`
            : `${baseUrl}/dashboard?host=${user.id}`;

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

    // Same reasoning as chat above: lifted here (rather than each of
    // KaraokePane/KaraFunPane calling useKaraFunData independently) so there's
    // one real socket instead of two components separately reconnecting on
    // every tab switch, and so the status bar can show the party's actual
    // live connection state instead of just "is it configured".
    const karaFun = useKaraFunData({ targetUid: chatEnabled ? targetUid : null, userSettings });

    const allowed = useMemo(() => {
        // userRole is set to 'broadcaster' optimistically the moment someone reaches
        // their own dashboard, before broadcasterStatus (waiting/approved/denied) is
        // known — without this check, a pending or denied broadcaster would see the
        // full tab strip even though the body correctly shows the gate screen.
        if (!hasVerifiedAccess) return [];
        const base = ROLE_TABS[userRole] || [];
        const extra = [];
        // 'karafun' ("KaraFun Mod") also now hosts karaoke request oversight,
        // the staging queue, rotation order, and playback controls (gated
        // separately on karaokeEnabled inside the pane) - open to mod here
        // too, not just broadcaster, since those are real mod actions.
        if ((userRole === 'broadcaster' || userRole === 'mod' || isMasterAdmin) && userSettings?.karafunEnabled) extra.push('karafun');
        // Open to every role (unlike 'karafun', which is broadcaster/mod-only
        // settings) - viewers and singers are exactly who this tab is for.
        if (userSettings?.karaokeEnabled) extra.push('karaoke');
        if (isMasterAdmin) extra.push('broadcasters');
        return NAV.map(n => n.id).filter(id => base.includes(id) || extra.includes(id));
    }, [hasVerifiedAccess, userRole, isMasterAdmin, userSettings?.karafunEnabled, userSettings?.karaokeEnabled]);

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
        if (!targetUid || !supabase) return;
        try {
            // upsert, not update: a brand-new broadcaster has no settings row
            // yet (no DB trigger creates one on signup) - update() would
            // silently affect 0 rows in that case.
            const update = buildSettingsUpdate(key, value, settingsRowRef.current?.appearance);
            await supabase.from('settings').upsert({ user_id: targetUid, ...update }, { onConflict: 'user_id' });
        } catch (e) { console.error(`Error saving ${key}:`, e); }
    };

    const exportHistory = async () => {
        if (!targetUid || !supabase) return;
        try {
            // Page through the whole table instead of capping at one batch —
            // a broadcaster's history can run well past a single query's
            // worth, and a silently truncated export is worse than a few
            // extra round trips.
            const PAGE_SIZE = 500;
            const rows = [];
            let from = 0;
            for (; ;) {
                const { data, error } = await supabase.from('history').select('*').eq('user_id', targetUid)
                    .order('timestamp', { ascending: false }).range(from, from + PAGE_SIZE - 1);
                if (error) throw error;
                if (!data || data.length === 0) break;
                rows.push(...data);
                if (data.length < PAGE_SIZE) break;
                from += PAGE_SIZE;
            }
            const exportPayload = { exportedAt: new Date().toISOString(), messageCount: rows.length, messages: rows };
            const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: 'application/json' });
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
        if (!targetUid || !supabase) return;
        try {
            const { data: last, error } = await supabase.from('history').select('payload').eq('user_id', targetUid)
                .order('timestamp', { ascending: false }).limit(1).maybeSingle();
            if (error || !last) return;
            await supabase.from('active_message').upsert({
                user_id: targetUid,
                payload: last.payload,
                expires_at: computeExpiresAt(userSettings?.displayDuration),
            }, { onConflict: 'user_id' });
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
                username: userData?.display_name || user?.user_metadata?.name || 'Test User', login: 'test', color: '#07fc03', avatarUrl: userData?.photo_url || user?.user_metadata?.avatar_url || null,
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
            // Opened in a new tab rather than navigated to in-place: this
            // dashboard holds a live Twitch chat connection (and any unsaved
            // settings) that navigating away would drop.
            case 'Terms': return window.open('/terms', '_blank', 'noopener,noreferrer');
            case 'Privacy': return window.open('/privacy', '_blank', 'noopener,noreferrer');
            case 'About StreamCast Pro': return window.open('/', '_blank', 'noopener,noreferrer');
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

    const navUser = { photoURL: userData?.photo_url || user?.user_metadata?.avatar_url, username: userData?.twitch_username || userData?.display_name || user?.user_metadata?.name };

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
                role={showChrome ? (isMasterAdmin ? 'Master admin' : (userRole || '')) : ''} isMasterAdmin={isMasterAdmin}
                onVersionClick={() => setShowChangelog(true)} />
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
                                        activeSection={settingsSection} karaFun={karaFun} chat={chat}
                                    />
                                )}
                            </>
                        )}
                    </div>
                </div>
            </div>
            {statusbar && (
                <StatusBar
                    t={t} d={d} tab={current} allowed={allowed} onAir={chat.activeMessage} conn={conn}
                    role={isMasterAdmin ? 'broadcaster' : (userRole || 'waiting')}
                    queueDepth={chat.suggestions?.length || 0} partyId={karaFun.partyId}
                    karafunEnabled={userSettings?.karafunEnabled}
                    karaFunConnected={karaFun.connected}
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
