// Eyeballs the gift/sell UI in a real browser: signs in as the seeded tester, then checks that
//   - clicking a making piece crafts immediately, with no "what do you want to make" picker
//   - handmade cards show the piece's own art, and carry Sell and Gift buttons
//   - storage cards carry a Gift button
//   - picking Gift hides the coin count on the housemate buttons and says "Give"
// Usage: node scripts/e2e-ui.js [username] [password]
import { chromium } from 'playwright';

const url = process.env.URL ?? 'http://localhost:5199';
const username = process.argv[2] ?? 'devtester';
const password = process.argv[3] ?? 'dev-60fab78a126e';

const ok = (label, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? `  (${extra})` : ''}`); if (!cond) process.exitCode = 1; };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !/503|snapshots/.test(t)) errors.push(t); });
page.on('requestfailed', (r) => { if (!r.url().includes('/api/snapshots')) errors.push(`request failed: ${r.url()} ${r.failure()?.errorText ?? ''}`); });
page.on('response', (r) => { if (r.status() >= 400 && !r.url().includes('/api/snapshots')) errors.push(`${r.status()} ${r.url()}`); });

try {
  await page.goto(url, { waitUntil: 'networkidle' });

  // Sign in (#authForm, in login mode).
  const mode = page.locator('[data-mode="login"]');
  if (await page.locator('#authForm').isVisible().catch(() => false)) {
    if (await mode.count()) { await mode.first().click(); await page.waitForTimeout(300); }
    await page.locator('#authUser').fill(username);
    await page.locator('#authPass').fill(password);
    await page.locator('#authForm button[type="submit"]').first().click();
    await page.waitForTimeout(3000);
  }
  ok('signed in', await page.locator('canvas').count() > 0, `canvases: ${await page.locator('canvas').count()}`);
  const houseNames = await page.evaluate(() => {
    const el = document.querySelector('#dock');
    return el ? el.getAttribute('data-house') : null;
  });
  const memberNames = await page.locator('.members li').allInnerTexts().catch(() => []);
  console.log('   house:', houseNames, '| members in panel:', JSON.stringify(memberNames));

  // Open the Decorate panel.
  const decorate = page.locator('[data-panel="decorate"], button:has-text("Decorate")').first();
  if (await decorate.count()) { await decorate.click(); await page.waitForTimeout(800); }

  // --- handmade cards: art + Sell + Gift ---
  const handmade = page.locator('.card.crafted');
  const n = await handmade.count();
  ok('handmade cards are listed', n > 0, `${n} cards`);
  if (n > 0) {
    const first = handmade.first();
    const art = first.locator('img');
    ok('each handmade card renders art', (await art.count()) > 0 && !!(await art.first().getAttribute('src'))?.startsWith('data:image'),
      (await art.first().getAttribute('src'))?.slice(0, 24));
    ok('handmade cards have a Sell button', (await first.locator('[data-act="sellCrafted"]').count()) > 0,
      await first.locator('[data-act="sellCrafted"]').innerText().catch(() => ''));
    ok('handmade cards have a Gift button', (await first.locator('[data-act="giftCrafted"]').count()) > 0);
    ok('the handmade card no longer shows a bare colour swatch', (await first.locator('span.swatch').count()) === 0);
  }

  // --- storage cards carry a Gift button ---
  const storage = page.locator('.grid .card').filter({ has: page.locator('[data-act="place"]') });
  const giftable = page.locator('[data-act="giftItem"]');
  ok('storage cards offer Gift when there is a housemate', (await giftable.count()) > 0, `${await giftable.count()} gift buttons`);

  // --- picking Gift hides the coin count and says "Give" ---
  await page.locator('[data-act="giftCrafted"]').first().click();
  await page.waitForTimeout(900);
  const memberButtons = page.locator('.members [data-act="gift"]');
  const labels = await memberButtons.allInnerTexts();
  ok('the housemate buttons drop the coin count while gifting', labels.every((t) => !/\d/.test(t)), JSON.stringify(labels));
  ok('the housemate buttons say "Give" while gifting', labels.some((t) => /give/i.test(t)), JSON.stringify(labels));
  await page.screenshot({ path: 'scripts/out-ui-gifting.png', fullPage: true });

  // --- clicking a making piece crafts at once, with no picker ---
  // The panel covers the room, so close it while hunting for the piece, then reopen to count.
  const openCount = async () => {
    await page.locator('[data-panel="decorate"]').first().click();
    await page.waitForTimeout(600);
    return page.locator('.card.crafted').count();
  };
  const closePanel = async () => {
    const on = page.locator('#dock button.on');
    if (await on.count()) { await on.first().click(); await page.waitForTimeout(400); }
  };
  await closePanel();
  const before = await openCount();
  await closePanel();
  const room = page.locator('#game');
  const box = await room.boundingBox();
  let hit = null;
  const seenLabels = new Set();
  if (box) {
    // Sweep the room until the hover label names a making piece, then click exactly there.
    outer: for (let gy = 0.2; gy <= 0.9; gy += 0.06) {
      for (let gx = 0.08; gx <= 0.94; gx += 0.04) {
        await page.mouse.move(box.x + box.width * gx, box.y + box.height * gy);
        await page.waitForTimeout(35);
        const label = (await page.locator('#tip').innerText().catch(() => '')).trim();
        if (label && !seenLabels.has(label)) seenLabels.add(label);
        if (/^make /i.test(label)) { hit = { x: box.x + box.width * gx, y: box.y + box.height * gy, label }; break outer; }
      }
    }
  }
  ok('a making piece can be found in the room', !!hit, hit?.label ?? `not found; labels seen: ${JSON.stringify([...seenLabels].slice(0, 12))}`);
  if (hit) {
    await page.mouse.click(hit.x, hit.y);
    // The character walks to the piece before it is used, so give it a few seconds.
    for (let i = 0; i < 20; i++) {
      await page.waitForTimeout(400);
      if ((await page.locator('.card.crafted').count()) > before) break;
      if (i === 19) await page.mouse.click(hit.x, hit.y);
    }
    const after = await openCount();
    ok('clicking it makes something straight away', after > before, `${before} -> ${after} handmade`);
  }
  ok('no "choose what to make" picker appeared', (await page.locator('[data-act="craft"]').count()) === 0);

  await page.screenshot({ path: 'scripts/out-ui-decorate.png', fullPage: true });
  ok('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} finally {
  await browser.close();
}
console.log('\nDone.');