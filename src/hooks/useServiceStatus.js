'use client';

import { useEffect, useState } from 'react';

const REFRESH_MS = 60000;

export default function useServiceStatus() {
    const [status, setStatus] = useState(null);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            try {
                const res = await fetch('/api/status');
                const data = await res.json();
                if (!cancelled) setStatus(data.ok ? data : null);
            } catch {
                if (!cancelled) setStatus(null);
            }
        };
        load();
        const interval = setInterval(load, REFRESH_MS);
        return () => { cancelled = true; clearInterval(interval); };
    }, []);

    return status;
}
