'use client';

import React, { useState, useEffect } from 'react';
import { Terminal, Key, RefreshCw, Power, EyeOff, Check, Copy, AlertTriangle, Link as LinkIcon } from 'lucide-react';
import { db } from '@/lib/firebase';
import { doc, setDoc } from 'firebase/firestore';

export default function ApiSettings({ targetUid, user, privateConfig, setPrivateConfig, isMasterAdmin, userRole }) {
    const [generatingToken, setGeneratingToken] = useState(false);
    const [copyState, setCopyState] = useState(null);

    useEffect(() => {
        if (copyState) {
            const timer = setTimeout(() => setCopyState(null), 2000);
            return () => clearTimeout(timer);
        }
    }, [copyState]);

    const handleGenerateToken = async () => {
        if (!user || (!isMasterAdmin && userRole !== 'broadcaster')) return;
        setGeneratingToken(true);
        try {
            const token = crypto.randomUUID();
            await setDoc(doc(db, 'users', targetUid || user.uid, 'private', 'config'), {
                apiToken: token
            }, { merge: true });
            if (setPrivateConfig) {
                setPrivateConfig({ apiToken: token });
            }
        } catch (err) {
            console.error('Error generating token:', err);
        } finally {
            setGeneratingToken(false);
        }
    };

    const copyApiCommand = async (action) => {
        if (!user || !privateConfig?.apiToken) return;
        const baseUrl = window.location.origin;
        const uid = targetUid || user.uid;
        // Token is no longer in the URL, clients must send POST with Bearer token
        const url = `${baseUrl}/api/overlay/${uid}?action=${action}`;

        try {
            await navigator.clipboard.writeText(url);
            setCopyState(`api-${action}`);
        } catch (err) {
            console.error('Failed to copy API link!', err);
        }
    };

    const copyTokenOnly = async () => {
        if (!privateConfig?.apiToken) return;
        try {
            await navigator.clipboard.writeText(privateConfig.apiToken);
            setCopyState('token');
        } catch (err) {
            console.error('Failed to copy token!', err);
        }
    }

    if (!privateConfig?.apiToken) {
        return (
            <div className="space-y-6 animate-in fade-in duration-500 max-w-4xl pb-32 flex-1 overflow-y-auto pr-2 scrollbar-hide">
                <div className="bg-zinc-900 border border-zinc-800 p-12 rounded-3xl space-y-6 text-center shadow-2xl">
                    <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto border border-emerald-500/20 shadow-[0_0_30px_rgba(16,185,129,0.1)]">
                        <Terminal size={40} className="text-emerald-500" />
                    </div>
                    <div className="space-y-3">
                        <h2 className="text-2xl font-bold text-zinc-100">Remote API Control</h2>
                        <p className="text-zinc-400 max-w-md mx-auto leading-relaxed">
                            Generate a secure API token to trigger stream events (like hiding messages or toggling KaraFun UI) from external tools like Stream Deck, Touch Portal, or custom scripts.
                            <br /><br />
                            <span className="text-emerald-400 font-medium">Note: Requests must be sent as POST with your token in the Authorization header.</span>
                        </p>
                    </div>
                    <button
                        onClick={handleGenerateToken}
                        disabled={generatingToken}
                        className="mt-4 px-8 py-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:hover:bg-emerald-600 rounded-xl font-bold flex items-center justify-center gap-3 transition-all active:scale-95 shadow-lg shadow-emerald-900/20 text-white mx-auto"
                    >
                        <Key size={20} />
                        {generatingToken ? 'Generating Token...' : 'Generate New API Token'}
                    </button>
                    <div className="flex items-center justify-center gap-2 mt-4 text-xs font-bold text-zinc-600 uppercase tracking-widest">
                        <AlertTriangle size={14} className="text-yellow-600/80" /> Broadcaster Access Only
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-4xl pb-32 flex-1 overflow-y-auto pr-2 scrollbar-hide">

            {/* API Authorization Header Section */}
            <div className="bg-zinc-900 border border-zinc-800 p-8 rounded-3xl shadow-xl space-y-6 relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl -mr-32 -mt-32 transition-colors duration-1000" />

                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative">
                    <div className="space-y-2">
                        <div className="flex items-center gap-3">
                            <div className="bg-emerald-500/20 p-2.5 rounded-xl border border-emerald-500/30">
                                <Terminal className="text-emerald-400" size={24} />
                            </div>
                            <h3 className="text-2xl font-black tracking-tight text-white">API Connection</h3>
                        </div>
                        <p className="text-zinc-500 text-sm pl-1">Your secure token and base configuration for remote integrations.</p>
                    </div>

                    <button
                        onClick={handleGenerateToken}
                        disabled={generatingToken}
                        className="shrink-0 flex items-center gap-2 px-6 py-3 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-xl font-bold transition-all border border-red-500/20 shadow-sm text-sm"
                        title="Invalidates the current token. All previously configured external tools will need to be updated with the new links."
                    >
                        <RefreshCw size={18} className={generatingToken ? 'animate-spin' : ''} />
                        {generatingToken ? 'Revoking...' : 'Revoke & Rotate Token'}
                    </button>
                </div>

                <div className="p-4 bg-zinc-950 border border-zinc-800 rounded-2xl flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Active Authentication Token</p>
                        <div className="font-mono text-zinc-300 text-sm truncate opacity-60 hover:opacity-100 transition-opacity blur-sm hover:blur-none select-all cursor-text py-1">
                            {privateConfig.apiToken}
                        </div>
                    </div>
                    <button
                        onClick={copyTokenOnly}
                        className="shrink-0 p-3 bg-zinc-800 hover:bg-zinc-700 rounded-xl transition-colors border border-zinc-700"
                        title="Copy Raw Token"
                    >
                        {copyState === 'token' ? <Check size={20} className="text-green-400" /> : <Copy size={20} className="text-zinc-400" />}
                    </button>
                </div>
            </div>

            {/* Generated Endpoints Directory */}
            <div className="space-y-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pl-2 pr-1">
                    <h4 className="text-zinc-500 text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-2">
                        <LinkIcon size={14} /> Available POST Endpoints
                    </h4>

                    <div className="text-xs text-zinc-400 bg-zinc-800/50 px-3 py-1.5 rounded-lg border border-zinc-700/50 flex items-center gap-2 font-mono">
                        Header: <span className="text-emerald-400">Authorization: Bearer {'<Token>'}</span>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                    {/* KaraFun Queue Controls */}
                    <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-3xl space-y-5">
                        <h5 className="font-bold text-white flex items-center gap-2 text-lg">
                            <span className="w-2 h-2 rounded-full bg-blue-500" /> KaraFun Queue
                        </h5>
                        <div className="space-y-3">
                            <EndpointButton
                                label="Toggle Visibility"
                                description="Swaps the current on/off state of the queue."
                                icon={<RefreshCw size={18} className="text-blue-400" />}
                                onClick={() => copyApiCommand('toggle-karafun-queue')}
                                copied={copyState === 'api-toggle-karafun-queue'}
                            />
                            <EndpointButton
                                label="Force Turn On"
                                description="Explicitly shows the Queue overlay."
                                icon={<Power size={18} className="text-green-500" />}
                                onClick={() => copyApiCommand('karafun-queue-on')}
                                copied={copyState === 'api-karafun-queue-on'}
                            />
                            <EndpointButton
                                label="Force Turn Off"
                                description="Explicitly hides the Queue overlay."
                                icon={<Power size={18} className="text-red-500" />}
                                onClick={() => copyApiCommand('karafun-queue-off')}
                                copied={copyState === 'api-karafun-queue-off'}
                            />
                        </div>
                    </div>

                    {/* KaraFun Now Playing Controls */}
                    <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-3xl space-y-5">
                        <h5 className="font-bold text-white flex items-center gap-2 text-lg">
                            <span className="w-2 h-2 rounded-full bg-purple-500" /> Now Playing Popup
                        </h5>
                        <div className="space-y-3">
                            <EndpointButton
                                label="Toggle Visibility"
                                description="Swaps the current on/off state of the playing popup."
                                icon={<RefreshCw size={18} className="text-blue-400" />}
                                onClick={() => copyApiCommand('toggle-now-playing')}
                                copied={copyState === 'api-toggle-now-playing'}
                            />
                            <EndpointButton
                                label="Force Turn On"
                                description="Explicitly enables the Now Playing popup feature."
                                icon={<Power size={18} className="text-green-500" />}
                                onClick={() => copyApiCommand('now-playing-on')}
                                copied={copyState === 'api-now-playing-on'}
                            />
                            <EndpointButton
                                label="Force Turn Off"
                                description="Explicitly disables the Now Playing popup feature."
                                icon={<Power size={18} className="text-red-500" />}
                                onClick={() => copyApiCommand('now-playing-off')}
                                copied={copyState === 'api-now-playing-off'}
                            />
                        </div>
                    </div>

                    {/* StreamCast Messaging Controls */}
                    <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-3xl space-y-5 md:col-span-2">
                        <h5 className="font-bold text-white flex items-center gap-2 text-lg">
                            <span className="w-2 h-2 rounded-full bg-rose-500" /> Chat Messages
                        </h5>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <EndpointButton
                                label="Hide Active Message"
                                description="Immediately removes any highlighted chat message currently displayed on the stream overlay."
                                icon={<EyeOff size={18} className="text-rose-400" />}
                                onClick={() => copyApiCommand('hide-message')}
                                copied={copyState === 'api-hide-message'}
                                isDestructive
                            />
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
}

function EndpointButton({ label, description, icon, onClick, copied, isDestructive }) {
    return (
        <button
            onClick={onClick}
            className={`w-full text-left p-4 rounded-2xl border transition-all flex items-start gap-4 group hover:shadow-lg ${isDestructive
                ? 'bg-rose-500/5 border-rose-500/10 hover:bg-rose-500/10 hover:border-rose-500/30'
                : 'bg-zinc-950 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800/50'
                }`}
        >
            <div className={`p-2 rounded-xl shrink-0 mt-0.5 transition-transform group-hover:scale-110 ${isDestructive ? 'bg-rose-500/20' : 'bg-zinc-900 border border-zinc-800'
                }`}>
                {copied ? <Check size={18} className="text-green-500" /> : icon}
            </div>
            <div>
                <p className={`font-bold text-sm mb-1 ${copied ? 'text-green-400' : 'text-zinc-200'}`}>
                    {copied ? 'URL Copied to Clipboard!' : label}
                </p>
                <p className="text-xs text-zinc-500 leading-relaxed font-medium">
                    {description}
                </p>
            </div>
        </button>
    );
}
