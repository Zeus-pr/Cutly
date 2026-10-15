import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

process.env.ADMIN_SECRET = 'a'.repeat(12) + 'strong-admin-secret-xyz';
process.env.JWT_SECRET = 'test';

let api = '';
let admin = '';
const servers: import('node:http').Server[] = [];

beforeAll(async () => {
  const { app, adminApp } = await import('../backend/src/server');
  for (const [a, set] of [
    [app, (u: string) => (api = u)],
    [adminApp, (u: string) => (admin = u)]
  ] as const) {
    const s = a.listen(0, '127.0.0.1');
    await new Promise((r) => s.once('listening', r));
    servers.push(s);
    set(`http://127.0.0.1:${(s.address() as AddressInfo).port}`);
  }
});
afterAll(() => servers.forEach((s) => s.close()));

const secret = () => ({ 'x-admin-secret': process.env.ADMIN_SECRET! });

describe(':4000 public listener', () => {
  it('/api/admin/* is byte-identical to an unknown route 404', async () => {
    const unknown = await fetch(`${api}/api/nope`);
    const unknownBody = await unknown.text();
    for (const p of ['/api/admin/ping', '/API/Admin/ping', '/api//admin/ping', '/api/admin/', '/api/admin']) {
      const res = await fetch(`${api}${p}`, { headers: secret() });
      expect(res.status).toBe(404);
      expect(await res.text()).toBe(unknownBody);
      expect(res.headers.get('content-type')).toBe(unknown.headers.get('content-type'));
    }
  });
  it('XFF 127.0.0.1 does not open admin', async () => {
    const res = await fetch(`${api}/api/admin/ping`, { headers: { ...secret(), 'x-forwarded-for': '127.0.0.1' } });
    expect(res.status).toBe(404);
  });
});

describe(':4001 admin listener', () => {
  it('requires x-admin-secret (401)', async () => {
    expect((await fetch(`${admin}/api/admin/ping`)).status).toBe(401);
    expect((await fetch(`${admin}/api/admin/ping`, { headers: { 'x-admin-secret': 'wrong' } })).status).toBe(401);
  });
  it('Cloudflare headers → 403', async () => {
    const res = await fetch(`${admin}/api/admin/ping`, { headers: { ...secret(), 'cf-ray': 'abc', 'cf-connecting-ip': '1.2.3.4' } });
    expect(res.status).toBe(403);
  });
  it('non-admin routes → 404', async () => {
    expect((await fetch(`${admin}/health`)).status).toBe(404);
    expect((await fetch(`${admin}/api/shops`)).status).toBe(404);
  });
});
