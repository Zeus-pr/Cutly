/**
 * API process entry. server.ts only builds the Express apps (importable by tests);
 * this file validates config, binds both listeners and starts background sweeps.
 * If either port cannot be bound, the whole process exits non-zero.
 */
import type { Server } from 'node:http';
import { adminApp, app } from './server';
import { paymentsEnabled } from './razorpay';
import { startAwaitingExpirySweep } from './awaitingExpiry';
import { startAccountPurgeSweep } from './accountPurge';
import { startEmailCleanupSweep } from './emailCleanup';
import { phoneHashKey } from './accountDeletion';
import { emailConfigProblems } from './emailCode';
import { resolveListenConfig } from './listenConfig';

function fail(message: string, error?: unknown): never {
  console.error(`[startup] ${message}`, error ?? '');
  process.exit(1);
}

// T3: without PHONE_HASH_KEY every purge would fail and PII would outlive the 14-day promise.
try {
  phoneHashKey();
} catch (error) {
  fail(error instanceof Error ? error.message : 'PHONE_HASH_KEY is invalid', error);
}

// T4: email codes / address HMACs need their keys; log transport never runs in production.
{
  const problems = emailConfigProblems();
  if (problems.length) fail(problems.join('; '));
}

let cfg: ReturnType<typeof resolveListenConfig>;
try {
  cfg = resolveListenConfig();
} catch (error) {
  fail(error instanceof Error ? error.message : 'Invalid config', error);
}

function listen(server: Server, label: string) {
  server.on('error', (error) => fail(`${label} could not listen`, error));
}

const adminServer = adminApp.listen(cfg.adminPort, cfg.adminHost, () => {
  console.log(`CUTLY admin listening on ${cfg.adminHost}:${cfg.adminPort}`);
  const api = app.listen(cfg.port, cfg.host, () =>
    console.log(`CUTLY API listening on ${cfg.host}:${cfg.port} · payments=${paymentsEnabled() ? 'razorpay-test' : 'off'}`)
  );
  listen(api, `API ${cfg.host}:${cfg.port}`);
  // Auto-expire missed AWAITING_SHOP while API is awake; expire-on-read covers app open.
  startAwaitingExpirySweep(60_000);
  // T3: anonymise accounts past the deletion grace window (single runner via advisory lock).
  startAccountPurgeSweep(60 * 60_000);
  // T4 (#9): expired email codes / pending signups (own advisory lock, DBA item 5).
  startEmailCleanupSweep(15 * 60_000);
});
listen(adminServer, `Admin ${cfg.adminHost}:${cfg.adminPort}`);
