import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('API startup (review item 3)', () => {
  it('exits non-zero when PHONE_HASH_KEY is missing', () => {
    const root = path.resolve(__dirname, '..');
    const env = { ...process.env, PHONE_HASH_KEY: '', PORT: '0', DATABASE_URL: 'postgresql://x@127.0.0.1:1/x' };
    const out = spawnSync(process.execPath, [path.join(root, 'node_modules/tsx/dist/cli.mjs'), 'backend/src/main.ts'], {
      cwd: root,
      env,
      encoding: 'utf8',
      timeout: 20_000
    });
    expect(out.status).toBe(1);
    expect(out.stderr).toMatch(/PHONE_HASH_KEY/);
  }, 30_000);
});
