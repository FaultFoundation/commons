import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

function load(fetch = () => { throw new Error('Unexpected fetch'); }) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL('../lib/scouting-request.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  runInNewContext(code, { exports, fetch, setTimeout });
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

test('stalled or repeatedly failed scans report interruption rather than collecting', async () => {
  for (const reply of [null, profile(0)]) {
    let calls = 0;
    const result = await load().finishDeepScout(profile(0), async () => { calls++; return reply; }, () => {}, alive, pause);
    assert.equal(calls, 5);
    assert.equal(result.status, 'error');
    assert.equal(result.progress.detailed, 0);
  }
});

test('unmount cancels a pending scan without publishing its response', async () => {
  let mounted = true;
  const result = await load().finishDeepScout(profile(0), async () => {
    mounted = false;
    return profile(3000, 'ready');
  }, () => assert.fail('published after unmount'), () => mounted, pause);
  assert.equal(result, null);
});
