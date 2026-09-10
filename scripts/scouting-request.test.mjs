import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

function load(fetch = () => { throw new Error('Unexpected fetch'); }, timers = {}) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL('../lib/scouting-request.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  runInNewContext(code, { exports, fetch, setTimeout, clearTimeout, AbortController, ...timers });
  return exports;
}
const profile = (detailed, status = 'collecting', total = 3000) => ({
  status, player: { playerId: 'p1', listDone: true }, data: {}, progress: { total, detailed },
});
const alive = () => true;
const pause = async () => {};

test('deep scan completes a large history across more than 80 successful chunks', async () => {
  let calls = 0;
  const { finishDeepScout } = load();
  const result = await finishDeepScout(profile(0), async () => {
    calls++;
    return profile(calls * 30, calls === 100 ? 'ready' : 'collecting');
  }, () => {}, alive, pause);
  assert.equal(calls, 100);
  assert.equal(result.status, 'ready');
});

test('temporary failed chunks retry and do not publish partial completion', async () => {
  const { finishDeepScout } = load();
  const replies = [null, profile(0, 'error'), profile(3000, 'ready')];
  const result = await finishDeepScout(profile(0), async () => replies.shift(), () => {}, alive, pause);
  assert.equal(result.status, 'ready');
});

test('authentication failure stops immediately with an authentication message', async () => {
  const { finishDeepScout, scoutRequest } = load(async () => ({ status: 401, ok: false }));
  const denied = await scoutRequest('/api/scouting/advance');
  assert.equal(denied.status, 'unauthorized');
  let calls = 0;
  const result = await finishDeepScout(profile(0), async () => { calls++; return denied; }, () => {}, alive, pause);
  assert.equal(calls, 1);
  assert.equal(result.status, 'unauthorized');
});

test('long provider outages and flat progress resume without restarting the search', async () => {
  for (const reply of [null, profile(0), profile(0, 'error')]) {
    let calls = 0;
    const delays = [];
    const result = await load().finishDeepScout(profile(0), async () => {
      calls++;
      return calls <= 12 ? reply : profile(3000, 'ready');
    }, () => {}, alive, async ms => { delays.push(ms); });
    assert.equal(calls, 13);
    assert.equal(result.status, 'ready');
    assert.deepEqual(delays.slice(0, 5), [2500, 5000, 10000, 20000, 30000]);
    assert.equal(Math.max(...delays), 30000);
  }
});

test('initial lookup survives repeated failures before resolving a player', async () => {
  let calls = 0;
  const result = await load().finishDeepScout({ status: 'collecting', player: null, data: null }, async () => {
    if (++calls <= 8) throw new Error('network unavailable');
    return profile(3000, 'ready');
  }, () => {}, alive, pause);
  assert.equal(calls, 9);
  assert.equal(result.status, 'ready');
});

test('cancelling during retry backoff prevents further requests', async () => {
  let mounted = true;
  let calls = 0;
  const result = await load().finishDeepScout(profile(0), async () => { calls++; return null; },
    () => assert.fail('published a failure'), () => mounted, async () => { mounted = false; });
  assert.equal(result, null);
  assert.equal(calls, 1);
});

test('unmount cancels a pending scan without publishing its response', async () => {
  let mounted = true;
  const result = await load().finishDeepScout(profile(0), async () => {
    mounted = false;
    return profile(3000, 'ready');
  }, () => assert.fail('published after unmount'), () => mounted, pause);
  assert.equal(result, null);
});

test('hung requests time out and release their timer so the scan can retry', async () => {
  let expire;
  let cleared = false;
  const { scoutRequest } = load(async (_path, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(new Error('timeout')));
  }), {
    setTimeout: (callback, ms) => { assert.equal(ms, 45000); expire = callback; return 1; },
    clearTimeout: id => { assert.equal(id, 1); cleared = true; },
  });
  const pending = scoutRequest('/api/scouting/advance');
  expire();
  assert.equal(await pending, null);
  assert.equal(cleared, true);
});

test('real terminal results stop retries even before a player is resolved', async () => {
  for (const status of ['unauthorized', 'not_found', 'not_configured']) {
    const result = await load().finishDeepScout({ status: 'collecting', player: null, data: null },
      async () => ({ status, player: null, data: null }), () => {}, alive,
      () => assert.fail('retried a terminal result'));
    assert.equal(result.status, status);
  }
});
