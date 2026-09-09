import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createRequire } from 'node:module';
import { drizzle } from 'drizzle-orm/d1';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
const require = createRequire(import.meta.url);
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
    if (id === '@/lib/session-cookie-migration') return load('../lib/session-cookie-migration.ts', mocks);
    if (id.startsWith('@/')) return {};
    return require(id);
  }, process, console, Buffer, fetch, AbortSignal, Headers, Request, Response, URL });
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


test('database-backed session remains valid after the short cookie cache expires', async () => {
  const sqlite = new DatabaseSync(':memory:', { enableDoubleQuotedStringLiterals: true });
  for (const name of readdirSync(new URL('../drizzle/', import.meta.url)).filter(n => n.endsWith('.sql')).sort()) {
    sqlite.exec(readFileSync(new URL('../drizzle/' + name, import.meta.url), 'utf8'));
  }
  const schema = load('../db/schema.ts', {});
  const client = {
    prepare(sql) {
      return { bind(...params) {
        return {
          async raw() { const stmt = sqlite.prepare(sql); stmt.setReturnArrays(true); return stmt.all(...params); },
          async all() { return { results: sqlite.prepare(sql).all(...params), meta: {} }; },
          async run() { return { meta: sqlite.prepare(sql).run(...params) }; },
        };
      } };
    },
  };
  const db = drizzle(client, { schema });
  const env = {
    BETTER_AUTH_SECRET: 'test-only-stable-secret-for-session-regression-12345',
    BETTER_AUTH_URL: 'https://commons.fault.foundation',
  };
  const { getAuth } = load('../lib/auth.ts', {
    react: { cache: f => f }, 'better-auth': { betterAuth },
    'better-auth/next-js': { nextCookies },
    'better-auth/adapters/drizzle': { drizzleAdapter },
    'better-auth/plugins/generic-oauth': {},
    'better-auth/plugins/two-factor': { twoFactor },
    '@opennextjs/cloudflare': { getCloudflareContext: () => ({ env }) },
    '@/lib/db': { getDb: () => db },
  });
  try {
    const signup = await getAuth().handler(new Request(`${env.BETTER_AUTH_URL}/api/auth/sign-up/email`, {
      method: 'POST', headers: { 'content-type': 'application/json', origin: env.BETTER_AUTH_URL },
      body: JSON.stringify({ name: 'Test', email: 'd1-session@example.com', password: 'test-password-123456' }),
    }));
    assert.equal(signup.status, 200, await signup.text());
    const cookie = signup.headers.getSetCookie().find(c => c.includes('better-auth.session_token='))?.split(';')[0];
    assert.ok(cookie);
    // Omit the one-minute cache cookie to force the same lookup as cache expiry.
    const response = await getAuth().handler(new Request(`${env.BETTER_AUTH_URL}/api/auth/get-session`, {
      headers: { cookie },
    }));
    assert.equal(response.status, 200);
    assert.ok((await response.json())?.session, 'valid D1 session must survive cookie cache expiry');
  } finally { sqlite.close(); }
});

test('two-factor login survives a stale host cookie after its session cache expires', async () => {
  const { createOTP } = await import('@better-auth/utils/otp');
  const { base32 } = await import('@better-auth/utils/base32');
  const db = { user: [], session: [], account: [], verification: [], twoFactor: [] };
  const env = { BETTER_AUTH_SECRET: 'test-only-stable-secret-for-session-regression-12345', BETTER_AUTH_URL: 'https://commons.fault.foundation' };
  const { getAuth } = load('../lib/auth.ts', {
    react: { cache: f => f }, 'better-auth': { betterAuth },
    'better-auth/next-js': { nextCookies },
    'better-auth/adapters/drizzle': { drizzleAdapter: () => memoryAdapter(db) },
    'better-auth/plugins/generic-oauth': {}, 'better-auth/plugins/two-factor': { twoFactor },
    '@opennextjs/cloudflare': { getCloudflareContext: () => ({ env }) }, '@/lib/db': { getDb: () => db },
  });
  const jar = new Map();
  async function call(path, body) {
    const response = await getAuth().handler(new Request(`${env.BETTER_AUTH_URL}/api/auth${path}`, {
      method: body ? 'POST' : 'GET', headers: { cookie: [...jar].map(([k,v]) => `${k}=${v}`).join('; '), origin: env.BETTER_AUTH_URL, 'content-type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }));
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(';')[0]; const at = pair.indexOf('=');
      if (/max-age=0/i.test(cookie)) jar.delete(pair.slice(0,at));
      else jar.set(pair.slice(0,at), pair.slice(at+1));
    }
    const data = await response.json();
    assert.equal(response.status, 200, `${path}: ${JSON.stringify(data)}`);
    return data;
  }
  const credentials = { email: 'two-factor@example.com', password: 'test-password-123456' };
  await call('/sign-up/email', { name: 'Test', ...credentials });
  const oldToken = [...jar].find(([k]) => k.endsWith('.session_token'));
  const enabled = await call('/two-factor/enable', { password: credentials.password });
  const secret = new TextDecoder().decode(base32.decode(new URL(enabled.totpURI).searchParams.get('secret')));
  await call('/two-factor/verify-totp', { code: await createOTP(secret).totp() });
  await call('/sign-out', {});
  const challenge = await call('/sign-in/email', credentials);
  assert.equal(challenge.twoFactorRedirect, true);
  assert.equal(await call('/get-session'), null, 'password alone must not authenticate');
  await call('/two-factor/verify-totp', { code: await createOTP(secret).totp(), trustDevice: true });
  assert.ok((await call('/get-session'))?.session);
  // A pre-domain-migration host cookie is sent ahead of the newer parent-domain
  // cookie. Its signature is still valid, but sign-out revoked its database row.
  const duplicateHeaders = () => new Headers({ cookie: `${oldToken[0]}=${oldToken[1]}; ` + [...jar].map(([k,v]) => `${k}=${v}`).join('; ') });
  const cachedHeaders = duplicateHeaders();
  const cached = await getAuth().handler(new Request(`${env.BETTER_AUTH_URL}/api/auth/get-session`, { headers: cachedHeaders }));
  assert.ok((await cached.json())?.session, 'cache initially masks the stale token');
  for (const key of jar.keys()) if (key.includes('session_data')) jar.delete(key);
  const { GET } = load('../app/api/auth/[...all]/route.ts', { '@/lib/auth': { getAuth } });
  const uncached = await GET(new Request(`${env.BETTER_AUTH_URL}/api/auth/get-session`, { headers: duplicateHeaders() }));
  assert.ok((await uncached.json())?.session, 'new login must survive the stale host-only cookie after cache expiry');
  assert.equal(uncached.headers.get('cache-control'), 'private, no-store');
  const issued = uncached.headers.getSetCookie();
  assert.ok(issued.some(c => c.startsWith(oldToken[0]+'=') && c.includes('Domain=.fault.foundation') && !c.includes('Max-Age=0;')), 'preserve the validated parent-domain session');
  assert.ok(issued.some(c => c.startsWith(oldToken[0]+'=;') && c.includes('Max-Age=0;') && !c.includes('Domain=')), 'expire only the obsolete host-only token');
  const { getSessionCached } = load('../lib/session.ts', {
    react: { cache: f => f }, 'next/headers': { headers: async () => duplicateHeaders() }, '@/lib/auth': { getAuth },
  });
  assert.ok(await getSessionCached(), 'server-rendered pages use the same migration before redirecting');
  const signedOut = await GET(new Request(`${env.BETTER_AUTH_URL}/api/auth/sign-out`, {
    method: 'POST', headers: { cookie: duplicateHeaders().get('cookie'), origin: env.BETTER_AUTH_URL, 'content-type': 'application/json' }, body: '{}',
  }));
  assert.equal(signedOut.status, 200);
  assert.ok(signedOut.headers.getSetCookie().filter(c => c.startsWith(oldToken[0]+'=')).every(c => c.includes('Max-Age=0;')), 'migration must not undo explicit sign-out');
  assert.ok(signedOut.headers.getSetCookie().some(c => c.startsWith(oldToken[0]+'=;') && !c.includes('Domain=')), 'sign-out also clears the old host scope');
  // The migration never revives a revoked session, even with a signed cache.
  db.session.length = 0;
  const revoked = await GET(new Request(`${env.BETTER_AUTH_URL}/api/auth/get-session`, { headers: cachedHeaders }));
  assert.equal(await revoked.json(), null);

});


test('cookie cleanup waits for a replacement and never changes its domain or lifetime', () => {
  const { clearLegacySessionCookies } = load('../lib/session-cookie-migration.ts', {});
  const request = new Request('https://commons.fault.foundation/api/auth/get-session');
  const cached = new Response('{}');
  clearLegacySessionCookies(request, cached);
  assert.deepEqual(cached.headers.getSetCookie(), [], 'a legacy-only login must not be deleted by a cache read');
  const cookie = '__Secure-better-auth.session_token=test; Max-Age=604800; Domain=.fault.foundation; Path=/; HttpOnly; Secure; SameSite=Lax';
  const renewed = new Response('{}', { headers: { 'set-cookie': cookie } });
  clearLegacySessionCookies(request, renewed);
  assert.equal(renewed.headers.getSetCookie()[0], cookie);
  assert.ok(renewed.headers.getSetCookie().slice(1).every(c => !c.includes('Domain=')));
});
