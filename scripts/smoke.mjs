/** Boot smoke test.
 *
 *  Typecheck and build both pass happily while a sprite generator throws at
 *  runtime, because all of the art is produced when the game boots rather
 *  than when it compiles. That class of bug reaches a player without ever
 *  touching CI unless something actually starts the thing.
 *
 *  So: serve the built game, open it in headless Chromium, wait for the
 *  first frame, and fail on any console error or uncaught exception. */

import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { chromium } from 'playwright';

const PORT = 4173;
const URL = `http://localhost:${PORT}/`;

// The room server has to be up too. Without it the client falls back to
// solo play, which is correct behaviour but means the smoke test would
// never touch the proxy — and the proxy is exactly the piece that breaks
// silently and only shows up when somebody tries to invite a friend.
const room = spawn(
  'npx',
  ['tsx', 'src/server/index.ts'],
  {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    // Exercise the full room protocol without creating anonymous CI rows in
    // the production Supabase project.
    env: { ...process.env, SENJA_DISABLE_PERSISTENCE: '1' },
  },
);

const preview = spawn(
  'npx',
  ['vite', 'preview', '--port', String(PORT), '--strictPort'],
  { stdio: 'inherit', shell: process.platform === 'win32' },
);

let browser;
let failed = false;

try {
  // Wait for the preview server to answer rather than sleeping a fixed
  // amount — CI machines vary wildly in how fast that is.
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(URL);
      if (res.ok) break;
    } catch {
      // not up yet
    }
    await sleep(500);
    if (i === 59) throw new Error('preview server never came up');
  }

  browser = await chromium.launch();
  const page = await browser.newPage();

  const problems = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') problems.push(`console.error: ${msg.text()}`);
  });
  page.on('pageerror', (err) => problems.push(`uncaught: ${err.message}`));

  await page.goto(URL, { waitUntil: 'load' });

  // The boot veil is removed only after the first frame is drawn, which
  // means the atlas built and the shaders compiled.
  await page.waitForFunction(() => !document.getElementById('veil'), null, {
    timeout: 30_000,
  });

  // Let a second of frames run so per-frame work gets exercised too.
  await sleep(1000);

  // Sanity: the canvas has a real size and the world actually generated.
  const info = await page.evaluate(() => {
    const c = document.getElementById('game');
    const map = window.__map ? window.__map() : null;
    const dbg = window.__dbg ? window.__dbg() : null;
    return {
      w: c?.width ?? 0,
      h: c?.height ?? 0,
      props: map ? map.props.length : 0,
      spots: map ? map.spots.length : 0,
      net: dbg ? dbg.net : 'unknown',
    };
  });

  if (info.w < 64 || info.h < 64) problems.push(`canvas too small: ${info.w}x${info.h}`);
  if (info.props < 100) problems.push(`world looks empty: ${info.props} props`);
  if (info.spots < 1) problems.push('no fishing spots generated');
  // Multiplayer reaches the room server through the /room proxy. If this
  // regresses, solo play still works and nothing else in CI would notice.
  if (info.net !== 'online') problems.push(`room socket not connected (net=${info.net})`);

  if (problems.length) {
    failed = true;
    console.error('\nSmoke test failed:');
    for (const p of problems) console.error(`  - ${p}`);
  } else {
    console.log(`\nSmoke test OK — ${info.w}x${info.h}, ${info.props} props, ${info.spots} spots.`);
  }
} catch (err) {
  failed = true;
  console.error(`\nSmoke test failed: ${err.message}`);
} finally {
  await browser?.close();
  preview.kill();
  room.kill();
}

process.exit(failed ? 1 : 0);
