/**
 * API process entry. server.ts only builds the Express apps (importable by tests
 * without side effects); this file binds the port and starts background sweeps.
 */
import { app } from './server';
import { paymentsEnabled } from './razorpay';
import { startAwaitingExpirySweep } from './awaitingExpiry';
import { startAccountPurgeSweep } from './accountPurge';

const port = Number(process.env.PORT || 4000);

// Bind all interfaces so Cloudflare Tunnel / LAN devices can reach the API (T2 #7 changes this).
app.listen(port, '0.0.0.0', () =>
  console.log(`CUTLY API listening on 0.0.0.0:${port} · payments=${paymentsEnabled() ? 'razorpay-test' : 'off'}`)
);
// Auto-expire missed AWAITING_SHOP while API is awake; expire-on-read covers app open.
startAwaitingExpirySweep(60_000);
// T3: anonymise accounts past the deletion grace window (single runner via advisory lock).
startAccountPurgeSweep(60 * 60_000);
