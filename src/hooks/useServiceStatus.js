'use client';

import { useEffect, useState } from 'react';

const REFRESH_MS = 60000;

export default function useServiceStatus() {
    const [status, setStatus] = useState(null);

    useEffect(() => {
        let cancelled = false;
        let inFlight = false;
        const load = async () => {
            if (inFlight) return;
            inFlight = true;
            try {
                const res = await fetch('/api/status');
                const data = await res.json();
                if (!cancelled) setStatus(data.ok ? data : null);
            } catch {
                if (!cancelled) setStatus(null);
            } finally {
                inFlight = false;
            }
        };
        load();
        const interval = setInterval(load, REFRESH_MS);
        return () => { cancelled = true; clearInterval(interval); };
    }, []);

    return status;
}
