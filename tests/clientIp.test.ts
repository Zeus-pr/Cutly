import { describe, expect, it } from 'vitest';
import {
  getClientIp,
  hasCloudflareHeaders,
  normalizeIp,
  parseTrustedProxyCidrs,
  rateLimitIpKey
} from '../backend/src/clientIp';
import { clientKey } from '../backend/src/rateLimit';
import { resolveListenConfig } from '../backend/src/listenConfig';
import { hashIp } from '../backend/src/partnerLeads';

const req = (peer: string, headers: Record<string, string | string[]> = {}) => ({ socket: { remoteAddress: peer }, headers });
const loop = parseTrustedProxyCidrs('');

describe('getClientIp', () => {
  it('loopback peer + CF header → CF IP', () => {
    expect(getClientIp(req('127.0.0.1', { 'cf-connecting-ip': '203.0.113.7' }), loop)).toBe('203.0.113.7');
    expect(getClientIp(req('::1', { 'cf-connecting-ip': '2001:DB8::1' }), loop)).toBe('2001:db8::1');
    expect(getClientIp(req('::ffff:127.0.0.1', { 'cf-connecting-ip': '203.0.113.7' }), loop)).toBe('203.0.113.7');
  });
  it('LAN peer + CF header → peer (LAN headers never trusted)', () => {
    expect(getClientIp(req('192.168.1.20', { 'cf-connecting-ip': '127.0.0.1' }), loop)).toBe('192.168.1.20');
  });
  it('never reads X-Forwarded-For / X-Real-IP', () => {
    const h = { 'x-forwarded-for': '127.0.0.1', 'x-real-ip': '1.2.3.4', 'true-client-ip': '1.2.3.4' };
    expect(getClientIp(req('198.51.100.9', h), loop)).toBe('198.51.100.9');
    expect(getClientIp(req('127.0.0.1', h), loop)).toBe('127.0.0.1');
  });
  it('malformed or multi-valued CF header → peer', () => {
    expect(getClientIp(req('127.0.0.1', { 'cf-connecting-ip': 'evil' }), loop)).toBe('127.0.0.1');
    expect(getClientIp(req('127.0.0.1', { 'cf-connecting-ip': '1.1.1.1, 2.2.2.2' }), loop)).toBe('127.0.0.1');
    expect(getClientIp(req('127.0.0.1', { 'cf-connecting-ip': ['1.1.1.1', '2.2.2.2'] }), loop)).toBe('127.0.0.1');
  });
  it('maps ::ffff: to IPv4', () => {
    expect(normalizeIp('::ffff:10.0.0.5')).toBe('10.0.0.5');
    expect(normalizeIp('::FFFF:0a00:0005')).toBe('10.0.0.5');
  });
  it('detects Cloudflare headers', () => {
    expect(hasCloudflareHeaders(req('127.0.0.1', { 'cf-ray': 'x' }))).toBe(true);
    expect(hasCloudflareHeaders(req('127.0.0.1'))).toBe(false);
  });
});

describe('TRUSTED_PROXY_CIDRS', () => {
  it('invalid value throws', () => {
    expect(() => parseTrustedProxyCidrs('10.0.0.0/33')).toThrow(/Invalid/);
    expect(() => parseTrustedProxyCidrs('nope')).toThrow(/Invalid/);
  });
  it('custom range is honoured', () => {
    const list = parseTrustedProxyCidrs('10.1.0.0/16');
    expect(getClientIp(req('10.1.2.3', { 'cf-connecting-ip': '8.8.8.8' }), list)).toBe('8.8.8.8');
    expect(getClientIp(req('127.0.0.1', { 'cf-connecting-ip': '8.8.8.8' }), list)).toBe('127.0.0.1');
  });
});

describe('rate-limit keys', () => {
  it('IPv6 bucketed by /64, IPv4 as-is', () => {
    expect(rateLimitIpKey('2001:db8:1:2:aaaa::1')).toBe('2001:db8:1:2::/64');
    expect(rateLimitIpKey('2001:db8:1:2:ffff:1:2:3')).toBe('2001:db8:1:2::/64');
    expect(rateLimitIpKey('203.0.113.7')).toBe('203.0.113.7');
  });
  it('rotating XFF from one peer hits the same bucket', () => {
    const keys = new Set(
      Array.from({ length: 11 }, (_, i) => clientKey(req('198.51.100.9', { 'x-forwarded-for': `10.0.0.${i}` }), 'signup'))
    );
    expect([...keys]).toEqual(['signup:198.51.100.9']);
  });
});

describe('listen config', () => {
  it('defaults to loopback', () => {
    expect(resolveListenConfig({})).toEqual({ host: '127.0.0.1', port: 4000, adminHost: '127.0.0.1', adminPort: 4001 });
  });
  it('HOST=0.0.0.0 only in development', () => {
    expect(() => resolveListenConfig({ HOST: '0.0.0.0', NODE_ENV: 'production' })).toThrow(/development/);
    expect(() => resolveListenConfig({ HOST: '0.0.0.0' })).toThrow(/development/);
    expect(resolveListenConfig({ HOST: '0.0.0.0', NODE_ENV: 'development' }).host).toBe('0.0.0.0');
  });
  it('invalid TRUSTED_PROXY_CIDRS fails startup', () => {
    expect(() => resolveListenConfig({ TRUSTED_PROXY_CIDRS: 'garbage' })).toThrow(/TRUSTED_PROXY_CIDRS/);
  });
});

describe('PartnerLead ipHash', () => {
  it('is a keyed HMAC truncated to 32 hex', () => {
    const a = hashIp('203.0.113.7', 'key-one-0123456789');
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(hashIp('203.0.113.7', 'key-two-0123456789')).not.toBe(a);
    expect(hashIp(null, 'k')).toBeNull();
  });
});
