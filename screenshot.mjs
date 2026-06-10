import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--no-sandbox','--disable-dev-shm-usage'] });
const page = await browser.newPage();
await page.setViewportSize({ width: 1400, height: 900 });
await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded', timeout: 20000 });
await page.waitForTimeout(3000);

// find the chevron button precisely
const buttons = await page.locator('header button').all();
let chevronBtn = null;
for (const btn of buttons) {
  const box = await btn.boundingBox();
  if (box && box.width < 30 && box.height < 30 && box.x < 600) {
    chevronBtn = btn;
    console.log('chevron at', JSON.stringify(box));
    break;
  }
}

if (chevronBtn) {
  await chevronBtn.click();
  await page.waitForTimeout(700);
  // move mouse far away so chip hovers don't interfere
  await page.mouse.move(700, 400);
  await page.waitForTimeout(300);
  await page.screenshot({ path: '/tmp/final_indices_list.png', clip: { x:100, y:0, width:600, height:600 } });
  console.log('done');
}
await browser.close();
