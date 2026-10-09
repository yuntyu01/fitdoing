// 화면 스크린샷: npm run screenshots [-- <이름...>] [--url http://localhost:8081] [--no-build]
// Expo 웹(react-native-web)을 헤드리스 Chromium 으로 390x844 @3x 로 찍어 docs/screenshots/ 에 저장한다.
// 웹에서는 src/web-mocks 의 가짜 DB/알림/위치가 시안과 같은 상태를 돌려준다 (metro.config.js 참고).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

import {
  FIXED_TIME,
  LOCALE,
  SAFE_AREA,
  SCALE,
  SCREENS,
  TIMEZONE,
  VIEWPORT,
} from './screenshots.config.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DEFAULT = path.resolve(ROOT, '..', 'docs', 'screenshots');
const DIST = path.join(ROOT, 'node_modules', '.cache', 'fitdoing-web');

const args = process.argv.slice(2);
const urlArg = args.indexOf('--url') >= 0 ? args[args.indexOf('--url') + 1] : null;
const noBuild = args.includes('--no-build');
// --dark: 다크 모드로 찍는다. --width=360: 폭을 바꾼다. --out=<폴더>: docs/screenshots 대신 다른 곳에 쓴다.
const dark = args.includes('--dark');
const widthArg = Number(args.find((a) => a.startsWith('--width='))?.slice(8)) || null;
const outArg = args.find((a) => a.startsWith('--out='))?.slice(6) ?? null;
const OUT = outArg ? path.resolve(outArg) : OUT_DEFAULT;
const only = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--url');
const routePath = (r) => r.split('?')[0]; // /day?date=… 같은 쿼리는 파일 경로 확인에서 뺀다

/** src/app 파일 구조 -> 라우트. (group) 은 빼고, _layout/+특수/동적 [x] 는 건너뛴다. */
function collectRoutes(dir = path.join(ROOT, 'src', 'app'), prefix = '') {
  const routes = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      const seg = /^\(.*\)$/.test(e.name) ? '' : `/${e.name}`;
      routes.push(...collectRoutes(path.join(dir, e.name), prefix + seg));
    } else if (/\.(tsx|ts|jsx|js)$/.test(e.name)) {
      const base = e.name.replace(/\.(tsx|ts|jsx|js)$/, '');
      if (base.startsWith('_') || base.startsWith('+') || base.includes('[') || base.endsWith('.web')) continue;
      routes.push(base === 'index' ? prefix || '/' : `${prefix}/${base}`);
    }
  }
  return routes;
}

function plan() {
  const existing = new Set(collectRoutes());
  const known = new Set(SCREENS.map((s) => routePath(s.route)));
  const list = [];
  const missing = [];
  for (const s of SCREENS) (existing.has(routePath(s.route)) ? list : missing).push(s);
  for (const r of existing) {
    if (!known.has(r)) list.push({ route: r, name: r.slice(1).replace(/\//g, '-') || 'index' });
  }
  const picked = only.length ? list.filter((s) => only.includes(s.name)) : list;
  return { picked, missing };
}

function build() {
  console.log('expo export (web) ...');
  execFileSync('npx', ['expo', 'export', '--platform', 'web', '--output-dir', DIST, '--clear'], {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, CI: '1' },
  });
}

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.otf': 'font/otf', '.ttf': 'font/ttf', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};
function serve() {
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = path.join(DIST, p);
    if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      file = path.join(DIST, 'index.html'); // SPA 폴백
    }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, () => resolve(server)));
}

async function shoot(browser, base, s) {
  const fresh = s.mode === 'fresh';
  const context = await browser.newContext({
    viewport: widthArg ? { ...VIEWPORT, width: widthArg } : VIEWPORT,
    colorScheme: dark ? 'dark' : 'light',
    deviceScaleFactor: SCALE,
    isMobile: true,
    hasTouch: true,
    locale: LOCALE,
    timezoneId: TIMEZONE,
  });
  const page = await context.newPage();
  await page.clock.setFixedTime(new Date(s.time ?? FIXED_TIME));
  if (fresh) await page.addInitScript(() => { window.__FD_FRESH__ = true; });
  if (s.mode === 'loggedOut') await page.addInitScript(() => { window.__FD_LOGGED_OUT__ = true; });
  try {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: SAFE_AREA });
  } catch {
    // 지원 안 하면 인셋 0 으로 찍는다.
  }
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(base + s.route, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  try {
    await page.waitForFunction(() => document.body.innerText.trim().length > 0, null, { timeout: 15000 });
  } catch {
    await context.close();
    throw new Error(`빈 화면 ${errors[0] ?? ''}`);
  }
  await page.waitForTimeout(600);
  if (s.actions) await s.actions(page);
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, `${s.name}.png`);
  await page.screenshot({ path: file, fullPage: !!s.fullPage });
  await context.close();
  console.log(`  ${s.name}.png  ${s.route}${errors.length ? `  (page errors: ${errors[0]})` : ''}`);
}

const { picked, missing } = plan();
let server;
let base = urlArg;
if (!base) {
  if (!noBuild || !fs.existsSync(DIST)) build();
  server = await serve();
  base = `http://localhost:${server.address().port}`;
}
const browser = await chromium.launch();
try {
  console.log(`shooting ${picked.length} screens -> ${OUT}`);
  for (const s of picked) {
    try {
      await shoot(browser, base, s);
    } catch (e) {
      console.log(`  ${s.name}  FAILED: ${String(e.message).split('\n')[0]}`);
      process.exitCode = 1;
    }
  }
  if (missing.length) console.log(`skipped (route not found): ${missing.map((m) => m.route).join(', ')}`);
} finally {
  await browser.close();
  server?.close();
}
