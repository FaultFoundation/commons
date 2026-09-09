import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { betterAuth } from 'better-auth';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { twoFactor } from 'better-auth/plugins/two-factor';
import { nextCookies } from 'better-auth/next-js';

function load(file, mocks) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  runInNewContext(code, { exports, require: id => {
    if (id in mocks) return mocks[id];
    if (id.startsWith('@/')) return {};
    throw new Error(`Unexpected import: ${id}`);
  }, process, console, Buffer, fetch, AbortSignal });
  return exports;
}

test('render reads leave renewal to the browser; session survives a fresh auth instance', async () => {
  const db = { user: [], session: [], account: [], verification: [] };
  const env = {
    BETTER_AUTH_SECRET: 'test-only-stable-secret-for-session-regression-12345',
    BETTER_AUTH_URL: 'https://commons.fault.foundation',
  };
  const { getAuth } = load('../lib/auth.ts', {
    react: { cache: f => f },
    'better-auth': { betterAuth },
    'better-auth/next-js': { nextCookies },
    'better-auth/adapters/drizzle': { drizzleAdapter: () => memoryAdapter(db) },
    'better-auth/plugins/generic-oauth': {},
    'better-auth/plugins/two-factor': { twoFactor },
    '@opennextjs/cloudflare': { getCloudflareContext: () => ({ env }) },
    '@/lib/db': { getDb: () => db },
  });
  const auth = getAuth();
  const signup = await auth.handler(new Request(`${env.BETTER_AUTH_URL}/api/auth/sign-up/email`, {
    method: 'POST', headers: { 'content-type': 'application/json', origin: env.BETTER_AUTH_URL },
    body: JSON.stringify({ name: 'Test', email: 'session@example.com', password: 'test-password-123456' }),
  }));
  assert.equal(signup.status, 200);
  const cookie = signup.headers.getSetCookie().find(c => c.includes('better-auth.session_token='))?.split(';')[0];
  assert.ok(cookie);
  const headers = new Headers({ cookie });
  const day = 86400000;
  // A two-day-old session is due for rolling renewal, with five days left.
  const expiry = new Date(Date.now() + 5 * day);
  db.session[0].expiresAt = expiry;
  db.session[0].updatedAt = new Date(Date.now() - 2 * day);
  const { getSessionCached } = load('../lib/session.ts', {
    react: { cache: f => f },
    'next/headers': { headers: async () => headers },
    '@/lib/auth': { getAuth },
  });
  assert.ok(await getSessionCached());
  assert.equal(db.session[0].expiresAt.valueOf(), expiry.valueOf(), 'SSR must not consume the renewal without delivering a cookie');
  const response = await getAuth().handler(new Request(`${env.BETTER_AUTH_URL}/api/auth/get-session`, { headers }));
  assert.equal(response.status, 200);
  assert.ok((await response.json()).session);
  assert.ok(db.session[0].expiresAt.valueOf() > expiry.valueOf());
  const renewedCookie = response.headers.getSetCookie().find(c => c.includes('better-auth.session_token='));
  assert.match(renewedCookie, /Max-Age=604800/i);
  const restarted = await getAuth().handler(new Request(`${env.BETTER_AUTH_URL}/api/auth/get-session`, {
    headers: { cookie: renewedCookie.split(';')[0] },
  }));
  assert.ok((await restarted.json()).session, 'fresh instance validates the existing persistent session');
  db.session[0].expiresAt = new Date(Date.now() - day);
  const expired = await getAuth().handler(new Request(`${env.BETTER_AUTH_URL}/api/auth/get-session`, { headers }));
  assert.equal(await expired.json(), null, 'expired sessions remain rejected');
});
