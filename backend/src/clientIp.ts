import { BlockList, isIP } from 'node:net';

/**
 * T2 (#7): the only place that decides a request's client IP.
 * - Express `trust proxy` is off; X-Forwarded-For / X-Real-IP / True-Client-IP are never read.
 * - `CF-Connecting-IP` is used only when the raw socket peer is a trusted proxy
 *   (TRUSTED_PROXY_CIDRS, default loopback = cloudflared on the same host).
 * - LAN peers (e.g. HOST=0.0.0.0 in dev) are never trusted for headers.
 */

type ReqLike = {
  socket?: { remoteAddress?: string | null } | null;
  headers: Record<string, string | string[] | undefined>;
};

export const DEFAULT_TRUSTED_PROXY_CIDRS = '127.0.0.1/32,::1/128';

/** Lowercase, compressed, `::ffff:a.b.c.d` → `a.b.c.d`. Null if not an IP. */
export function normalizeIp(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let v = raw.trim().toLowerCase();
  if (v.startsWith('[') && v.endsWith(']')) v = v.slice(1, -1);
  const zone = v.indexOf('%');
  if (zone >= 0) v = v.slice(0, zone);
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(v);
  if (mapped) v = mapped[1];
  const family = isIP(v);
  if (family === 4) return v;
  if (family === 6) {
    try {
      // URL host parsing yields the canonical compressed form.
      const canon = new URL(`http://[${v}]/`).hostname.slice(1, -1);
      const m = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(canon);
      if (m) {
        const hi = parseInt(m[1], 16);
        const lo = parseInt(m[2], 16);
        return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
      }
      return canon;
    } catch {
      return null;
    }
  }
  return null;
}

/** Parses "a/b,c/d". Throws on any invalid entry (startup must fail fast). */
export function parseTrustedProxyCidrs(value: string | undefined = process.env.TRUSTED_PROXY_CIDRS) {
  const raw = (value ?? '').trim() || DEFAULT_TRUSTED_PROXY_CIDRS;
  const list = new BlockList();
  const entries = raw.split(',').map((s) => s.trim()).filter(Boolean);
  if (!entries.length) throw new Error('TRUSTED_PROXY_CIDRS is empty.');
  for (const entry of entries) {
    const [addr, bitsRaw, extra] = entry.split('/');
    const ip = normalizeIp(addr);
    const family = ip ? isIP(ip) : 0;
    const max = family === 4 ? 32 : 128;
    const bits = bitsRaw === undefined ? max : Number(bitsRaw);
    if (!ip || extra !== undefined || !/^\d+$/.test(String(bits)) || bits < 0 || bits > max) {
      throw new Error(`Invalid TRUSTED_PROXY_CIDRS entry: "${entry}"`);
    }
    list.addSubnet(ip, bits, family === 4 ? 'ipv4' : 'ipv6');
  }
  return list;
}

let trusted: BlockList | null = null;
/** Call at startup so a bad TRUSTED_PROXY_CIDRS stops the process. */
export function loadTrustedProxies(value?: string) {
  trusted = parseTrustedProxyCidrs(value);
  return trusted;
}
function trustedList() {
  return trusted ?? loadTrustedProxies();
}

export function isTrustedPeer(ip: string | null, list: BlockList = trustedList()) {
  if (!ip) return false;
  return list.check(ip, isIP(ip) === 4 ? 'ipv4' : 'ipv6');
}

export function isLoopback(ip: string | null) {
  if (!ip) return false;
  return ip === '::1' || (isIP(ip) === 4 && ip.startsWith('127.'));
}

/** Raw TCP peer, normalised. Never a header. */
export function socketIp(req: ReqLike) {
  return normalizeIp(req.socket?.remoteAddress ?? null);
}

function singleHeader(req: ReqLike, name: string) {
  const v = req.headers[name];
  if (Array.isArray(v)) return v.length === 1 ? v[0] : null;
  return typeof v === 'string' ? v : null;
}

export function hasCloudflareHeaders(req: ReqLike) {
  return Boolean(req.headers['cf-connecting-ip'] || req.headers['cf-ray']);
}

export function getClientIp(req: ReqLike, list?: BlockList): string {
  const peer = socketIp(req);
  if (isTrustedPeer(peer, list)) {
    const cf = singleHeader(req, 'cf-connecting-ip');
    const parsed = cf && !cf.includes(',') ? normalizeIp(cf) : null;
    if (parsed) return parsed;
  }
  return peer || 'unknown';
}

/** Rate-limit bucket: IPv4 as-is, IPv6 by /64 (one subscriber usually owns a /64). */
export function rateLimitIpKey(ip: string) {
  if (isIP(ip) !== 6) return ip;
  const canon = normalizeIp(ip) || ip;
  const [head, tail = ''] = canon.split('::');
  const h = head ? head.split(':') : [];
  const t = tail ? tail.split(':') : [];
  const groups = canon.includes('::') ? [...h, ...Array(8 - h.length - t.length).fill('0'), ...t] : h;
  return `${groups.slice(0, 4).map((g) => parseInt(g || '0', 16).toString(16)).join(':')}::/64`;
}
