'use strict';

// No-op in production (Dokploy injects real env vars directly, and dotenv
// never overwrites an existing process.env value) - only matters for local
// dev, reading relay/.env per relay/README.md.
require('dotenv').config();

const { PartyManager } = require('./partyManager');

async function main() {
    const manager = new PartyManager();
    await manager.start();
    console.log('[relay] started');

    let shuttingDown = false;
    const shutdown = async (signal) => {
        if (shuttingDown) return;
        shuttingDown = true;
        console.log(`[relay] received ${signal}, shutting down`);
        try {
            await manager.stop();
        } finally {
            process.exit(0);
        }
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
    console.error('[relay] fatal error during startup', err);
    process.exit(1);
});
