// 로그인은 가짜 카카오(토큰 확인 주소)를 띄워 실제 /api/auth/login 경로로 한다. 이미 떠 있는 서버를 쓸 땐 E2E_TOKEN(로그인 토큰)이 필요하다.
// 앱의 큐 전송 로직(app/src/domain/sync.ts 의 순수 부분)으로 실제 Go 서버와 왕복을 확인한다.
//   cd app && node_modules/.bin/tsx ../scripts/e2e-server.mjs            # 서버를 직접 띄운다(임의 포트, 인메모리 SQLite, mock AI)
//   E2E_URL=http://localhost:8080 node_modules/.bin/tsx ../scripts/e2e-server.mjs   # 이미 떠 있는 서버를 쓴다
import { spawn, execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync } from 'node:fs';
import { createServer as createHttp } from 'node:http';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

import { toMealBackup } from '../app/src/domain/logging.ts';
import {
  couponItem, drainQueue, enqueueAll, gymItem, lockItem, removeSent, sleepItem, toSettingsBody, toLockEventBody,
} from '../app/src/domain/sync.ts';

const here = dirname(fileURLToPath(import.meta.url));
const contract = (n) => JSON.parse(readFileSync(join(here, '../docs/contract', n), 'utf8'));
const settings = contract('settings.json');
const meal = contract('meal.json');
const events = contract('sync-events.json');

const freePort = () => new Promise((res) => { const s = createServer().listen(0, () => { const p = s.address().port; s.close(() => res(p)); }); });

let child = null;
let fakeKakao = null;
let token = process.env.E2E_TOKEN;
let base = process.env.E2E_URL;
if (!base) {
  fakeKakao = createHttp((req, res) => {
    const ok = req.headers.authorization === 'Bearer e2e-kakao';
    res.writeHead(ok ? 200 : 401, { 'Content-Type': 'application/json' });
    res.end(ok ? JSON.stringify({ id: 777001, expires_in: 7199, app_id: 4242 }) : '{}');
  });
  await new Promise((r) => fakeKakao.listen(0, '127.0.0.1', r));
  const port = await freePort();
  const bin = join(mkdtempSync(join(tmpdir(), 'fitdoing-e2e-')), 'server');
  execFileSync('go', ['build', '-o', bin, './cmd/server'], { cwd: join(here, '../server'), stdio: 'inherit' });
  child = spawn(bin, [], { env: {
    ...process.env, DB_URL: 'sqlite::memory:', AI_PROVIDER: 'mock', PORT: String(port),
    KAKAO_APP_ID: '4242', KAKAO_TOKEN_INFO_URL: `http://127.0.0.1:${fakeKakao.address().port}/token-info`,
  }, stdio: 'inherit' });
  base = `http://127.0.0.1:${port}`;
}
for (let i = 0; ; i++) {
  try { if ((await fetch(`${base}/healthz`)).ok) break; } catch {}
  if (i > 100) throw new Error('server not up');
  await new Promise((r) => setTimeout(r, 100));
}

if (!token) {
  if (!fakeKakao) throw new Error('이미 떠 있는 서버를 쓰려면 E2E_TOKEN(로그인 토큰)을 넘겨 주세요');
  const login = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider: 'kakao', token: 'e2e-kakao' }) });
  assert.equal(login.status, 200, 'login');
  token = (await login.json()).token;
}
const auth = { Authorization: `Bearer ${token}` };
const calls = [];
// 앱의 client.ts 와 같은 방식: 헤더 + JSON, 상태만 돌려준다.
const send = async (req) => {
  const res = await fetch(base + req.path, { method: req.method, headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify(req.body) });
  calls.push(`${req.method} ${req.path} -> ${res.status}`);
  if (!res.ok) console.log('  body:', await res.text());
  return res.status;
};

let queue = [];
const io = { read: async () => queue, remove: async (items) => { queue = removeSent(queue, items); }, send, warn: (m, d) => console.warn('WARN', m, d) };

const byJson = (a) => [...a].sort((x, y) => JSON.stringify(x).localeCompare(JSON.stringify(y))); // 서버는 날짜순으로 돌려준다
let ok = false;
try {
  // 계약 예제와 같은 값을 앱 로직으로 큐에 넣는다.
  const items = [
    { kind: 'settings', key: 'settings', body: toSettingsBody(settings) },
    { kind: 'meal', key: `meal:${meal.date}:${meal.index}`, body: toMealBackup({ ...meal, loggedAt: Date.parse(meal.loggedAt) }) },
    ...events.gymLogs.map(gymItem),
    ...events.sleepLogs.map(sleepItem),
    ...events.lockEvents.map((e) => lockItem({ ...toLockEventBody(e), date: e.date })),
    ...events.couponUses.map(couponItem),
  ];
  queue = enqueueAll([], items).queue;
  const res = await drainQueue(io);
  console.log('flush:', res, '\n ', calls.join('\n  '));
  assert.deepEqual(res, { sent: items.length, dropped: 0, failed: false, unauthorized: false });
  assert.equal(queue.length, 0);

  // 멱등: 같은 큐를 다시 보내도 같다.
  queue = enqueueAll([], items).queue;
  assert.equal((await drainQueue(io)).failed, false);

  const snap = await (await fetch(`${base}/api/sync/snapshot`, { headers: auth })).json();
  assert.deepEqual(snap.settings, settings, 'settings round trip');
  assert.equal(snap.meals.length, 1);
  assert.equal(snap.meals[0].index, meal.index);
  console.log('  meal view:', JSON.stringify(snap.meals[0].nutrition));
  assert.deepEqual(snap.meals[0].items, meal.ai.items);
  assert.equal(Date.parse(snap.meals[0].loggedAt), Date.parse(meal.loggedAt));
  assert.deepEqual(byJson(snap.gymLogs), byJson(events.gymLogs), 'gymLogs');
  assert.deepEqual(byJson(snap.sleepLogs), byJson(events.sleepLogs), 'sleepLogs');
  assert.deepEqual(byJson(snap.lockEvents), byJson(events.lockEvents), 'lockEvents');
  assert.deepEqual(byJson(snap.couponUses), byJson(events.couponUses), 'couponUses');

  // 4xx 는 버린다(깨진 이벤트), 연결 불가면 큐에 남는다.
  queue = [{ kind: 'event', key: 'gym:bad', table: 'gymLogs', body: { date: 'nope', verifiedBy: 'x', checkInAt: null } }];
  const bad = await drainQueue(io);
  assert.equal(bad.dropped, 1);
  const down = await drainQueue({ ...io, send: async () => { throw new Error('ECONNREFUSED'); }, read: async () => [gymItem(events.gymLogs[0])] });
  assert.equal(down.failed, true);

  console.log('E2E OK: settings -> meals -> events -> snapshot');
  ok = true;
} catch (e) {
  console.error('E2E FAILED:', e);
} finally {
  child?.kill();
  fakeKakao?.close();
}
process.exit(ok ? 0 : 1);
