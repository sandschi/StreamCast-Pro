'use client';

import React, { useEffect, useState } from 'react';
import { X, Sparkles } from 'lucide-react';

function renderChangelogLine(line, i) {
    if (line.startsWith('## ')) {
        return <h3 key={i} className="text-lg font-bold text-zinc-100 mt-6 first:mt-0">{line.slice(3)}</h3>;
    }
    if (line.startsWith('### ')) {
        return <h4 key={i} className="text-xs font-black uppercase tracking-[0.15em] text-primary-400 mt-4 mb-1">{line.slice(4)}</h4>;
    }
    if (line.startsWith('# ')) {
        return null; // top-level title, already shown in the modal header
    }
    if (line.startsWith('- ')) {
        return (
            <li key={i} className="text-sm text-zinc-400 leading-relaxed ml-4 list-disc">
                {line.slice(2)}
            </li>
        );
    }
    if (line.trim() === '') {
        return null;
    }
    return <p key={i} className="text-sm text-zinc-500 italic">{line}</p>;
}

export default function ChangelogModal({ open, onClose }) {
    const [content, setContent] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!open || content) return;
        fetch('/api/changelog')
            .then(res => res.json())
            .then(data => {
                if (data.content) setContent(data.content);
                else setError('Changelog unavailable.');
            })
            .catch(() => setError('Failed to load changelog.'));
    }, [open, content]);

    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200"
            onClick={onClose}
        >
            <div
                className="bg-zinc-900 border border-zinc-800 rounded-3xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 duration-300"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between px-6 py-5 border-b border-zinc-800">
                    <div className="flex items-center gap-3">
                        <div className="bg-primary-500/20 p-2 rounded-lg">
                            <Sparkles className="text-primary-400" size={18} />
                        </div>
                        <h2 className="text-lg font-bold text-zinc-100">Changelog</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-zinc-800 rounded-lg transition-colors text-zinc-400 hover:text-zinc-100"
                    >
                        <X size={18} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-5">
                    {error && <p className="text-sm text-red-400">{error}</p>}
                    {!error && !content && (
                        <p className="text-sm text-zinc-500">Loading...</p>
                    )}
                    {content && (
                        <div className="space-y-1">
                            {content.split('\n').map(renderChangelogLine)}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
