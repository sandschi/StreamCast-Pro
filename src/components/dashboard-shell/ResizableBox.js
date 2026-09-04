'use client';

import { useEffect, useRef, useState } from 'react';
import { getZoomFactor } from './zoom';

// A panel with a real drag-to-resize handle on its bottom edge. Height is
// remembered per-viewer in localStorage (a manual layout preference, not
// broadcaster-shared state) so it survives reloads but never touches Firestore.
export default function ResizableBox({ t, storageKey, defaultHeight = 190, minHeight = 120, maxHeight = 560, children, style }) {
    const [height, setHeight] = useState(defaultHeight);
    const dragRef = useRef(null);

    useEffect(() => {
        if (!storageKey) return;
        try {
            const saved = window.localStorage.getItem(storageKey);
            if (saved) {
                const n = parseInt(saved, 10);
                if (!Number.isNaN(n)) setHeight(Math.min(maxHeight, Math.max(minHeight, n)));
            }
        } catch (e) { /* storage unavailable — keep default */ }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [storageKey]);

    const startDrag = (e) => {
        e.preventDefault();
        const startY = e.clientY;
        const startHeight = dragRef.current?.offsetHeight ?? height;
        const zoom = getZoomFactor();
        let liveHeight = startHeight;
        const onMove = (ev) => {
            liveHeight = Math.min(maxHeight, Math.max(minHeight, startHeight + (ev.clientY - startY) / zoom));
            setHeight(liveHeight);
        };
        const onUp = () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
            // Read the value this drag actually computed, not the DOM — React
            // may not have committed the last setHeight yet at this point.
            if (storageKey) {
                try { window.localStorage.setItem(storageKey, String(liveHeight)); } catch (e) { /* ignore */ }
            }
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    };

    return (
        <div ref={dragRef} style={{ position: 'relative', height, flex: 'none', display: 'flex', flexDirection: 'column', ...style }}>
            {children}
            <div
                onMouseDown={startDrag}
                title="Drag to resize"
                style={{
                    position: 'absolute', left: 0, right: 0, bottom: -4, height: 9, cursor: 'ns-resize', zIndex: 5,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
            >
                <div style={{ width: 28, height: 3, borderRadius: 2, background: t.edge }} />
            </div>
        </div>
    );
}
