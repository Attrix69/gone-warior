// Test de fumée : démarre le build (vite preview), joue une courte partie dans Chromium
// et vérifie démarrage sans erreur, menu, contrôles, combat, pause, sauvegarde,
// K.O., budget de rendu et affichage mobile. Captures dans tests/out/.
//   npm run build && npm run test:smoke        (URL=http://… pour viser un serveur existant)
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const URL_ = process.env.URL || 'http://localhost:4173/';
const OUT = new URL('./out/', import.meta.url).pathname;
const SLOW = 180000; // le rendu logiciel (SwiftShader) est lent : délais généreux
mkdirSync(OUT, { recursive: true });

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function reachable(u) { try { return (await fetch(u)).ok; } catch { return false; } }

async function withServer(fn) {
  if (await reachable(URL_)) return fn();
  const srv = spawn('npx', ['vite', 'preview', '--port', '4173', '--strictPort'], { stdio: 'ignore' });
  try {
    for (let i = 0; i < 60 && !(await reachable(URL_)); i++) await new Promise((r) => setTimeout(r, 500));
    return await fn();
  } finally { srv.kill(); }
}

async function openGame(browser, { viewport, mobile = false, quality = 'low' }) {
  const ctx = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1 });
  await ctx.addInitScript((q) => {
    if (!sessionStorage.getItem('smoke')) {
      sessionStorage.setItem('smoke', '1');
      localStorage.clear();
      localStorage.setItem('gonewarrior.options.v1', JSON.stringify({ opt: {}, quality: q, autoQ: false }));
    }
  }, quality);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  const t0 = Date.now();
  await page.goto(URL_);
  await page.waitForFunction(() => {
    const l = document.getElementById('loading');
    return l.classList.contains('done') || l.classList.contains('error');
  }, null, { timeout: SLOW * 2 });
  const failed = await page.evaluate(() => document.getElementById('loading').classList.contains('error'));
  return { ctx, page, errors, loadS: (Date.now() - t0) / 1000, failed };
}

const shot = (page, name) => page.screenshot({ path: `${OUT}${name}.png`, timeout: SLOW });
const until = (page, fn, arg) => page.waitForFunction(fn, arg, { timeout: SLOW });

async function desktop(browser) {
  const { ctx, page, errors, loadS, failed } = await openGame(browser, { viewport: { width: 960, height: 540 } });
  check('démarrage', !failed, `${loadS.toFixed(1)} s`);
  if (failed) { await ctx.close(); return; }
  check('menu affiché', await page.isVisible('#mPlay'));
  await shot(page, 'desktop-menu');

  await page.click('#mPlay');
  await until(page, () => GW.G.cine);
  check('intro lancée', true);
  await page.keyboard.press('Escape');
  await until(page, () => GW.G.running);
  check('intro passée, partie lancée', true);
  check('HUD visible', await page.isVisible('#hud'));
  await shot(page, 'desktop-play');

  const x0 = await page.evaluate(() => ({ x: GW.P.x, z: GW.P.z }));
  await page.keyboard.down('z');
  await until(page, (p) => Math.hypot(GW.P.x - p.x, GW.P.z - p.z) > 1.5, x0);
  await page.keyboard.up('z');
  check('déplacement clavier', true);

  await page.keyboard.down(' ');
  await until(page, () => GW.P.h > 0.05);
  await page.keyboard.up(' ');
  check('saut', true);
  await until(page, () => GW.P.h === 0);

  await page.evaluate(() => { const e = GW.spawn('classic', 0, 1.2); e.state = 'idle'; e.atkCd = 99; });
  const hp0 = await page.evaluate(() => GW.enemies[0].hp);
  for (let i = 0; i < 8; i++) {
    await page.keyboard.down('j'); await page.waitForTimeout(120); await page.keyboard.up('j'); await page.waitForTimeout(250);
    if (await page.evaluate((h) => !GW.enemies[0] || GW.enemies[0].hp < h, hp0)) break;
  }
  check('coup de poing touche un ennemi', await page.evaluate((h) => !GW.enemies[0] || GW.enemies[0].hp < h, hp0));
  await shot(page, 'desktop-combat');

  const info = await page.evaluate(() => GW.info);
  check('budget de rendu', info.calls < 450, `${info.calls} draw calls, ${(info.tris / 1000).toFixed(0)} k triangles, ${info.programs} shaders`);

  await page.keyboard.press('Escape');
  await until(page, () => GW.G.paused && document.getElementById('pauseScreen').classList.contains('show'));
  check('pause', true);
  await shot(page, 'desktop-pause');
  await page.keyboard.press('Escape');
  await until(page, () => !GW.G.paused);
  check('reprise', true);

  const pos = await page.evaluate(() => ({ x: GW.P.x, z: GW.P.z }));
  await page.keyboard.press('Escape');
  await until(page, () => GW.G.paused);
  await page.click('#pQuit');
  await until(page, () => !GW.G.running && document.getElementById('menu').classList.contains('show'));
  check('sauvegarder et quitter', await page.isVisible('#mContinue'));
  await page.click('#mContinue');
  await until(page, () => GW.G.running);
  const pos2 = await page.evaluate(() => ({ x: GW.P.x, z: GW.P.z }));
  check('reprise de la sauvegarde', Math.hypot(pos.x - pos2.x, pos.z - pos2.z) < 3, `écart ${Math.hypot(pos.x - pos2.x, pos.z - pos2.z).toFixed(2)} m`);

  await page.evaluate(() => { GW.P.invuln = 0; GW.P.hp = 1; GW.hurt(50); });
  await until(page, () => document.getElementById('koScreen').classList.contains('show'));
  check('K.O.', true);
  await shot(page, 'desktop-ko');
  await page.click('#koBack');
  await until(page, () => GW.G.running && GW.P.hp > 0);
  check('réapparition', true);

  check('aucune erreur JavaScript (bureau)', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

async function mobile(browser) {
  const { ctx, page, errors, failed } = await openGame(browser, { viewport: { width: 390, height: 844 }, mobile: true });
  if (failed) { check('démarrage mobile', false); await ctx.close(); return; }
  check('mode tactile détecté', await page.evaluate(() => document.body.classList.contains('touch')));
  check('pas de défilement horizontal', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await shot(page, 'mobile-menu');
  await page.tap('#mPlay');
  await until(page, () => GW.G.cine);
  await page.tap('#introSkip');
  await until(page, () => GW.G.running);
  const pad = await page.evaluate(() => ['bPunch', 'bKick', 'bJump', 'bDodge', 'bBlock'].every((id) => {
    const r = document.getElementById(id).getBoundingClientRect();
    return r.width >= 40 && r.right <= innerWidth && r.bottom <= innerHeight && r.left >= 0;
  }));
  check('boutons tactiles visibles et dans l’écran', pad);
  await shot(page, 'mobile-play');
  await ctx.close();

  const land = await openGame(browser, { viewport: { width: 844, height: 390 }, mobile: true });
  check('paysage mobile sans défilement', await land.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await shot(land.page, 'mobile-landscape-menu');
  check('aucune erreur JavaScript (mobile)', errors.length + land.errors.length === 0, [...errors, ...land.errors].slice(0, 3).join(' | '));
  await land.ctx.close();
}

await withServer(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  try {
    await desktop(browser);
    await mobile(browser);
  } catch (e) {
    check('déroulement du test', false, e.message.split('\n')[0]);
  } finally { await browser.close(); }
});

const failedN = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failedN}/${results.length} vérifications réussies. Captures : ${OUT}`);
process.exit(failedN ? 1 : 0);
