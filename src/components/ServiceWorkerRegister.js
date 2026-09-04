'use client';

import { useEffect } from 'react';

export default function ServiceWorkerRegister() {
    useEffect(() => {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js').catch((e) => {
                console.warn('Service worker registration failed:', e);
            });
        }
    }, []);
    return null;
}
