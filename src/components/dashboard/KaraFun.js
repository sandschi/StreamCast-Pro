'use client';

import { Music, RefreshCw, AlertCircle, Play, ListMusic, User, Save, Monitor, Type, Move, Eye, EyeOff } from 'lucide-react';
import { useKaraFunData } from '@/hooks/useKaraFunData';
import StatusDot from '@/components/ui/StatusDot';
import ToggleSwitch from '@/components/ui/ToggleSwitch';
import Select from '@/components/ui/Select';
import RangeSlider from '@/components/ui/RangeSlider';

const FONTS = [
    'Inter', 'Roboto', 'Poppins', 'Montserrat', 'Oswald',
    'Ubuntu', 'Raleway', 'Playfair Display', 'Bangers', 'Pacifico', 'Monoton'
];

export default function KaraFun({ targetUid, userSettings }) {
    const {
        queueData, loading, error, lastUpdated, tempPartyId, setTempPartyId, isSavingId, partyId,
        handleReconnect, handleSavePartyId, handleToggleSetting, handleShowNowPlaying, handleHideNowPlaying,
    } = useKaraFunData({ targetUid, userSettings });

    if (!userSettings?.karafunEnabled) {
        return (
            <div className="flex flex-col items-center justify-center p-20 text-zinc-500">
                <Music size={48} className="mb-4 opacity-20" />
                <p>KaraFun integration is disabled.</p>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-500 max-w-4xl pb-32 flex-1 overflow-y-auto pr-2">
            {/* ID CONFIGURATION SECTION */}
            <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-3xl space-y-4 flex-shrink-0">
                <div className="flex items-center gap-3 mb-2">
                    <div className="bg-primary-500/20 p-2 rounded-lg">
                        <Music className="text-primary-400" size={18} />
                    </div>
                    <h4 className="text-sm font-bold text-zinc-100 uppercase tracking-wider">Party Configuration</h4>
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                    <input
                        type="text"
                        placeholder="Enter KaraFun Party ID (e.g. 727383)"
                        value={tempPartyId}
                        onChange={(e) => setTempPartyId(e.target.value)}
                        className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-100 outline-none focus:ring-2 focus:ring-primary-600 transition-all font-medium"
                    />
                    <button
                        onClick={handleSavePartyId}
                        disabled={isSavingId || tempPartyId === partyId}
                        className="px-8 py-3 bg-primary-500 hover:bg-primary-400 disabled:opacity-50 rounded-full font-black uppercase text-xs tracking-widest text-black shadow-[0_0_15px_rgba(7,252,3,0.3)] transition-all active:scale-95"
                    >
                        <Save size={16} />
                        {isSavingId ? 'Saving...' : 'Save Party ID'}
                    </button>
                </div>
                {!partyId && (
                    <p className="text-xs text-zinc-500 italic">Enter your Party ID to start tracking the queue.</p>
                )}
            </div>



            {/* Header / Info (Only shown if ID is set) */}
            {partyId && (
                <div className="flex justify-between items-center bg-zinc-900/50 p-4 rounded-2xl border border-zinc-800">
                    <div className="flex items-center gap-3">
                        <div className="bg-primary-500/20 p-2 rounded-lg">
                            <Music className="text-primary-400" size={20} />
                        </div>
                        <div>
                            <h3 className="font-bold text-zinc-100">KaraFun Party: {partyId}</h3>
                            <p className="text-xs text-zinc-500">
                                {lastUpdated ? `Last updated: ${lastUpdated.toLocaleTimeString()}` : 'Connecting...'}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <StatusDot
                            size={10}
                            state={error ? 'error' : lastUpdated ? 'connected' : 'connecting'}
                            className="cursor-default"
                            title={error ? 'Disconnected' : lastUpdated ? 'Connected' : 'Connecting...'}
                        />
                        <button
                            onClick={handleReconnect}
                            className="p-2 hover:bg-zinc-800 rounded-lg transition-colors text-zinc-400 hover:text-zinc-100"
                            title="Force Reconnect"
                        >
                            <RefreshCw size={16} className={loading && !lastUpdated ? 'animate-spin' : ''} />
                        </button>
                    </div>
                </div>
            )}

            {error && (
                <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-xl flex items-center gap-3 text-red-200 text-sm">
                    <AlertCircle size={18} />
                    {error}
                </div>
            )}

            {loading && !queueData && partyId && (
                <div className="flex justify-center p-12">
                    <RefreshCw className="animate-spin text-primary-500" size={32} />
                </div>
            )}

            {queueData && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Now Playing */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 flex items-center gap-2">
                                <Play size={12} className="text-green-500" /> Now Playing
                            </h4>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={handleShowNowPlaying}
                                    title="Manually trigger the Now Playing popup on the overlay"
                                    className="btn-awesome"
                                >
                                    <Eye size={13} /> Show
                                </button>
                                <button
                                    onClick={handleHideNowPlaying}
                                    title="Dismiss the Now Playing popup immediately"
                                    className="btn-awesome !bg-zinc-800 !text-white !shadow-none hover:!bg-zinc-700"
                                >
                                    <EyeOff size={13} /> Dismiss
                                </button>
                            </div>
                        </div>

                        {queueData.currentSong ? (
                            <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-3xl relative overflow-hidden group">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-primary-500/10 blur-3xl -mr-16 -mt-16 group-hover:bg-primary-500/20 transition-colors" />
                                <div className="relative">
                                    <h5 className="text-2xl font-black text-white mb-1">{queueData.currentSong.title}</h5>
                                    <p className="text-primary-400 font-bold mb-4">{queueData.currentSong.artist}</p>

                                    {queueData.currentSong.singer && (
                                        <div className="flex items-center gap-2 bg-zinc-800/50 w-max px-3 py-1.5 rounded-full border border-white/5">
                                            <User size={14} className="text-zinc-400" />
                                            <span className="text-sm font-medium text-zinc-300">Singer: {queueData.currentSong.singer}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="bg-zinc-900/30 border border-zinc-800 border-dashed p-12 rounded-3xl text-center text-zinc-600">
                                {queueData.playState === 'infoscreen' ? 'Waiting for a song to start...' : 'No song playing currently'}
                            </div>
                        )}
                    </div>

                    {/* Up Next */}
                    <div className="space-y-4">
                        <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 flex items-center gap-2">
                            <ListMusic size={12} /> Upcoming Queue
                        </h4>

                        <div className="space-y-2">
                            {queueData.upcoming && queueData.upcoming.length > 0 ? (
                                queueData.upcoming.map((song, i) => (
                                    <div key={i} className="bg-zinc-900/50 border border-zinc-800 p-3 rounded-xl flex items-center justify-between hover:bg-zinc-800/50 transition-colors">
                                        <div className="flex items-center gap-4">
                                            <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-500">
                                                {i + 1}
                                            </div>
                                            <div>
                                                <p className="font-bold text-zinc-200 text-sm">{song.title}</p>
                                                <p className="text-xs text-zinc-500">{song.artist}</p>
                                            </div>
                                        </div>
                                        {song.singer && (
                                            <div className="text-[10px] bg-primary-500/10 text-primary-300 px-2 py-1 rounded-md border border-primary-500/20">
                                                {song.singer}
                                            </div>
                                        )}
                                    </div>
                                ))
                            ) : (
                                <p className="text-sm text-zinc-600 italic p-4">Queue is empty.</p>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* OVERLAY CONFIGURATION SECTION */}
            <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-3xl space-y-4">
                <div className="flex items-center gap-3 mb-2">
                    <div className="bg-primary-500/20 p-2 rounded-lg">
                        <Monitor className="text-primary-400" size={18} />
                    </div>
                    <h4 className="text-sm font-bold text-zinc-100 uppercase tracking-wider">Overlay Settings</h4>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex items-center justify-between bg-zinc-950 p-4 rounded-xl border border-zinc-800 hover:border-zinc-700 transition-colors">
                        <span className="font-medium text-zinc-300 text-sm">Show Queue Overlay</span>
                        <ToggleSwitch
                            ariaLabel="Show Queue Overlay"
                            checked={!!userSettings?.karafunOverlayQueueEnabled}
                            onChange={(v) => handleToggleSetting('karafunOverlayQueueEnabled', v)}
                            className="shrink-0"
                        />
                    </div>

                    <div className="flex items-center justify-between bg-zinc-950 p-4 rounded-xl border border-zinc-800 hover:border-zinc-700 transition-colors">
                        <span className="font-medium text-zinc-300 text-sm">Now Playing Popup</span>
                        <ToggleSwitch
                            ariaLabel="Now Playing Popup"
                            checked={!!userSettings?.karafunOverlayNowPlayingEnabled}
                            onChange={(v) => handleToggleSetting('karafunOverlayNowPlayingEnabled', v)}
                            className="shrink-0"
                        />
                    </div>

                    <div className="md:col-span-2 bg-zinc-950 p-4 rounded-xl border border-zinc-800 flex items-center justify-between">
                        <span className="font-medium text-zinc-300">Overlay Theme</span>
                        <Select
                            className="w-auto"
                            value={userSettings?.karafunOverlayTheme || 'classic'}
                            onChange={(v) => handleToggleSetting('karafunOverlayTheme', v)}
                            options={[
                                { value: 'classic', label: 'Classic' },
                                { value: 'glass', label: 'Glass' },
                                { value: 'neon', label: 'Neon' },
                                { value: 'minimal', label: 'Minimal' },
                                { value: 'cyberpunk', label: 'Cyberpunk' },
                                { value: 'retro', label: 'Retro' },
                                { value: 'comic', label: 'Comic' },
                                { value: 'future', label: 'Future' },
                            ]}
                        />
                    </div>
                </div>

                {/* OVERLAY STYLING & POSITIONING SECTION */}
                <div className="pt-6 border-t border-zinc-800">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="bg-blue-500/20 p-2 rounded-lg">
                            <Type className="text-blue-400" size={18} />
                        </div>
                        <h4 className="text-sm font-bold text-zinc-100 uppercase tracking-wider">Typography & Colors</h4>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <Select
                            className="select-none"
                            label="Font Family"
                            value={userSettings?.karafunFontFamily || 'Inter'}
                            options={FONTS}
                            onChange={(v) => handleToggleSetting('karafunFontFamily', v)}
                        />
                        <div className="space-y-2 select-none">
                            <label className="text-xs font-bold text-zinc-400 uppercase">Primary Text Color</label>
                            <div className="flex gap-2">
                                <input
                                    type="color"
                                    value={userSettings?.karafunTextColor || '#ffffff'}
                                    onChange={(e) => handleToggleSetting('karafunTextColor', e.target.value)}
                                    className="w-10 h-10 rounded-lg bg-zinc-950 border-none cursor-pointer p-0"
                                />
                                <input
                                    type="text"
                                    value={userSettings?.karafunTextColor || '#ffffff'}
                                    readOnly
                                    className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 text-[10px] text-zinc-500 uppercase font-mono"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="pt-6 border-t border-zinc-800">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="bg-green-500/20 p-2 rounded-lg">
                            <Move className="text-green-400" size={18} />
                        </div>
                        <h4 className="text-sm font-bold text-zinc-100 uppercase tracking-wider">Precision Positioning</h4>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 select-none">
                        {/* Queue Position */}
                        <div className="space-y-4 bg-zinc-950 p-4 rounded-2xl border border-zinc-800">
                            <h5 className="text-xs font-bold text-zinc-300 uppercase flex items-center gap-2 mb-2">
                                <ListMusic size={14} className="text-zinc-500" /> Queue Overlay
                            </h5>
                            <RangeSlider label="Horizontal (X)" value={userSettings?.karafunQueuePosX ?? 5} unit="%" valueTone="accent" onChange={(v) => handleToggleSetting('karafunQueuePosX', v)} />
                            <RangeSlider label="Vertical (Y)" value={userSettings?.karafunQueuePosY ?? 5} unit="%" valueTone="accent" onChange={(v) => handleToggleSetting('karafunQueuePosY', v)} />
                        </div>

                        {/* Now Playing Position */}
                        <div className="space-y-4 bg-zinc-950 p-4 rounded-2xl border border-zinc-800">
                            <h5 className="text-xs font-bold text-zinc-300 uppercase flex items-center gap-2 mb-2">
                                <Play size={14} className="text-zinc-500" /> Now Playing Overlay
                            </h5>
                            <RangeSlider label="Horizontal (X)" value={userSettings?.karafunNowPlayingPosX ?? 50} unit="%" valueTone="accent" onChange={(v) => handleToggleSetting('karafunNowPlayingPosX', v)} />
                            <RangeSlider label="Vertical (Y)" value={userSettings?.karafunNowPlayingPosY ?? 90} unit="%" valueTone="accent" onChange={(v) => handleToggleSetting('karafunNowPlayingPosY', v)} />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
