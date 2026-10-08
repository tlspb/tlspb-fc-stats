import test from 'node:test';
import assert from 'node:assert/strict';
import { openOlePage } from './navigation.mjs';

const url = 'https://olesports.ru/tournament/69c44cb97ae933238d8a9943?section=stats';
const ok = { ok: () => true, status: () => 200 };
const timeout = () => Object.assign(new Error('Timeout 45000ms exceeded'), { name: 'TimeoutError' });
const options = { pause: async () => {}, warn: () => {} };

test('navigation timeout recovers and waits for football content before returning', async () => {
  let calls = 0, ready = 0;
  const delays = [];
  await openOlePage({ goto: async (target, opts) => {
    assert.equal(target, url);
    assert.equal(opts.waitUntil, 'commit');
    if (++calls === 1) throw timeout();
    return ok;
  } }, url, { ...options, pause: async ms => delays.push(ms), ready: async () => { ready++; } });
  assert.equal(calls, 2); assert.equal(ready, 1); assert.deepEqual(delays, [15000]);
});

test('a stuck source preloader retries content readiness, without returning incomplete data', async () => {
  let calls = 0, ready = 0;
  await openOlePage({ goto: async () => { calls++; return ok; } }, url,
    { ...options, ready: async () => { if (++ready < 3) throw timeout(); } });
  assert.equal(calls, 3); assert.equal(ready, 3);
});

test('persistent unavailability stops after three attempts', async () => {
  let calls = 0;
  await assert.rejects(openOlePage({ goto: async () => { calls++; throw timeout(); } }, url, options), /Timeout/);
  assert.equal(calls, 3);
});

test('temporary server errors retry; missing pages and certificate errors do not', async () => {
  let calls = 0;
  await openOlePage({ goto: async () => ++calls === 1 ? { ok: () => false, status: () => 503 } : ok }, url, options);
  assert.equal(calls, 2);
  for (const failure of [Object.assign(new Error('HTTP 404'), { httpStatus: 404 }), new Error('net::ERR_CERT_DATE_INVALID')]) {
    calls = 0;
    await assert.rejects(openOlePage({ goto: async () => { calls++; throw failure; } }, url, options));
    assert.equal(calls, 1);
  }
});

test('data validation errors are never retried or accepted', async () => {
  let calls = 0;
  await assert.rejects(openOlePage({ goto: async () => { calls++; return ok; } }, url,
    { ...options, ready: async () => { throw new Error('Unexpected club identity'); } }), /Unexpected club/);
  assert.equal(calls, 1);
});

test('unrelated destinations are rejected before navigation', async () => {
  await assert.rejects(openOlePage({ goto: async () => assert.fail('must not navigate') }, 'https://example.com/', options), /Unexpected OLE/);
});
