'use client';

import { useRef, useEffect } from 'react';
import { useChatData } from '@/hooks/useChatData';
import Badge from '@/components/ui/Badge';
import StatusDot from '@/components/ui/StatusDot';
import SuggestionChip from '@/components/ui/SuggestionChip';
import ChatMessageRow from '@/components/dashboard/ChatMessageRow';
import { XCircle, HandHelping } from 'lucide-react';

export default function Chat({ targetUid, isModeratorMode, isModAuthorized, userRole }) {
    const scrollRef = useRef(null);

    const {
        displayMessages,
        connectionStatus,
        channelName,
        suggestions,
        activeMessage,
        hideOverlay,
        sendToScreen,
        approveSuggestion,
        denySuggestion,
    } = useChatData({ targetUid, userRole });

    useEffect(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, [displayMessages]);

    return (
        <div className="flex flex-col flex-1 min-h-0 bg-transparent relative">
            {/* Hide Button (Floating) */}
            {activeMessage && (userRole === 'broadcaster' || userRole === 'mod') && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50">
                    <button
                        onClick={hideOverlay}
                        className="btn-awesome !bg-zinc-800 !text-white !shadow-none hover:!bg-zinc-700"
                    >
                        <XCircle size={14} />
                        Hide Overlay
                    </button>
                </div>
            )}

            <div className="p-4 border-b border-zinc-800 bg-zinc-900/50 flex justify-between items-center group">
                <h3 className="text-zinc-100 font-semibold flex items-center gap-2">
                    <StatusDot state={
                        connectionStatus === 'connected' ? 'connected' :
                            connectionStatus === 'connecting' ? 'connecting' :
                                connectionStatus === 'error' ? 'error' : 'idle'
                    } />
                    <span className="tracking-tight">Twitch Chat</span>
                    {connectionStatus === 'connected' && <span className="text-[10px] text-zinc-500 font-normal opacity-70">({channelName})</span>}
                </h3>
                <div className="flex items-center gap-2">
                    <Badge
                        size="sm"
                        tone={userRole === 'broadcaster' ? 'accent' : userRole === 'mod' ? 'success' : 'neutral'}
                    >
                        {userRole}
                    </Badge>
                </div>
            </div>

            {/* Suggestions Pool (Mods/Broadcasters Only) */}
            {userRole !== 'viewer' && suggestions.length > 0 && (
                <div className="bg-primary-600/10 border-b border-primary-500/20 overflow-x-auto">
                    <div className="p-3 flex items-center gap-3 min-w-max">
                        <div className="flex items-center gap-2 text-primary-400 font-bold text-[10px] uppercase tracking-widest px-2 border-r border-primary-500/20">
                            <HandHelping size={14} /> Suggestions
                        </div>
                        {suggestions.map(sug => (
                            <SuggestionChip
                                key={sug.id}
                                username={sug.username}
                                avatarUrl={sug.avatarUrl}
                                color={sug.color}
                                text={sug.fragments[0]?.content}
                                onApprove={() => approveSuggestion(sug)}
                                onDeny={() => denySuggestion(sug.id)}
                            />
                        ))}
                    </div>
                </div>
            )}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
                {displayMessages.map((msg) => (
                    <ChatMessageRow
                        key={msg.id}
                        msg={msg}
                        userRole={userRole}
                        onShow={() => sendToScreen(msg)}
                        onShowPermanent={() => sendToScreen(msg, true)}
                    />
                ))}
            </div>
        </div>
    );
}
