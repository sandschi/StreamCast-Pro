'use client';

import { useEffect, useRef, useState } from 'react';

// Same idea as ResizableBox but for width, with the handle on the left edge —
// used for the inspector column on the right side of Chat/KaraFun/Settings/
// Remote/Broadcasters panes. Sharing one storageKey across panes means
// resizing it once keeps every pane consistent without any cross-pane state.
export default function ResizableWidth({ t, storageKey, defaultWidth = 250, minWidth = 180, maxWidth = 520, children, style }) {
    const [width, setWidth] = useState(defaultWidth);
    const dragRef = useRef(null);

    useEffect(() => {
        if (!storageKey) return;
        try {
            const saved = window.localStorage.getItem(storageKey);
            if (saved) {
                const n = parseInt(saved, 10);
                if (!Number.isNaN(n)) setWidth(Math.min(maxWidth, Math.max(minWidth, n)));
            }
        } catch (e) { /* storage unavailable — keep default */ }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [storageKey]);

    const startDrag = (e) => {
        e.preventDefault();
        const startX = e.clientX;
        const startWidth = dragRef.current?.offsetWidth ?? width;
        let liveWidth = startWidth;
        const onMove = (ev) => {
            // Handle sits on the left edge of a right-side column, so dragging
            // left (negative delta) should grow it.
            liveWidth = Math.min(maxWidth, Math.max(minWidth, startWidth - (ev.clientX - startX)));
            setWidth(liveWidth);
        };
        const onUp = () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
            if (storageKey) {
                try { window.localStorage.setItem(storageKey, String(liveWidth)); } catch (e) { /* ignore */ }
            }
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    };

    return (
        <div ref={dragRef} style={{ position: 'relative', width, flex: 'none', ...style }}>
            <div
                onMouseDown={startDrag}
                title="Drag to resize"
                style={{
                    position: 'absolute', top: 0, bottom: 0, left: -5, width: 9, cursor: 'ew-resize', zIndex: 5,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
            >
                <div style={{ width: 3, height: 28, borderRadius: 2, background: t.edge }} />
            </div>
            {children}
        </div>
    );
}
