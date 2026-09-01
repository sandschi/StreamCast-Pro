'use client';

import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import Modal from '@/components/ui/Modal';

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

    return (
        <Modal open={open} onClose={onClose} title="Changelog" icon={<Sparkles size={18} />}>
            {error && <p className="text-sm text-red-400">{error}</p>}
            {!error && !content && (
                <p className="text-sm text-zinc-500">Loading...</p>
            )}
            {content && (
                <div className="space-y-1">
                    {content.split('\n').map(renderChangelogLine)}
                </div>
            )}
        </Modal>
    );
}
