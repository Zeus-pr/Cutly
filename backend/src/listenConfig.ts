import { isIP } from 'node:net';
import { isLoopback, loadTrustedProxies, normalizeIp } from './clientIp';

/**
 * T2 startup checks. Throws (→ non-zero exit) instead of silently falling back.
 * - HOST defaults to 127.0.0.1 (cloudflared on the same machine).
 * - A non-loopback HOST (e.g. 0.0.0.0 for Expo on a phone) is allowed only with
 *   NODE_ENV=development. LAN peers are still never trusted for CF-Connecting-IP.
 * - The admin listener is always 127.0.0.1.
 */
export function resolveListenConfig(env: NodeJS.ProcessEnv = process.env) {
  loadTrustedProxies(env.TRUSTED_PROXY_CIDRS);
  const host = (env.HOST || '127.0.0.1').trim();
  const norm = host === 'localhost' ? '127.0.0.1' : normalizeIp(host);
  if (!norm || !isIP(norm)) throw new Error(`Invalid HOST "${host}".`);
  if (!isLoopback(norm) && env.NODE_ENV !== 'development') {
    throw new Error(`HOST=${host} is only allowed with NODE_ENV=development. Production binds 127.0.0.1 behind cloudflared.`);
  }
  const port = Number(env.PORT || 4000);
  const adminPort = Number(env.ADMIN_PORT || 4001);
  for (const [name, v] of [['PORT', port], ['ADMIN_PORT', adminPort]] as const) {
    if (!Number.isInteger(v) || v < 1 || v > 65535) throw new Error(`Invalid ${name}.`);
  }
  if (port === adminPort) throw new Error('PORT and ADMIN_PORT must differ.');
  return { host: norm, port, adminHost: '127.0.0.1', adminPort };
}
