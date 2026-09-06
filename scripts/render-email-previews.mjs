import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const root = process.cwd();
const previewDir = path.join(root, 'artifacts', 'email-previews');
const screenshotDir = path.join(previewDir, 'screenshots');
const files = fs.readdirSync(previewDir).filter((name) => name.endsWith('.html')).sort();
const productionLogoUrl = 'https://www.blinkgo.de/brand/blinkgo-email-logo.png';
const localLogo = path.join(root, 'public', 'brand', 'blinkgo-email-logo.png');
fs.mkdirSync(screenshotDir, { recursive: true });

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
try {
  for (const file of files) {
    for (const viewport of [
      { name: 'desktop', width: 760, height: 1000 },
      { name: 'mobile', width: 390, height: 844 },
    ]) {
      const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: 1 });
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.route(productionLogoUrl, (route) => route.fulfill({ path: localLogo, contentType: 'image/png' }));
      await page.goto(pathToFileURL(path.join(previewDir, file)).href, { waitUntil: 'load' });
      await page.screenshot({ path: path.join(screenshotDir, `${path.parse(file).name}-${viewport.name}.png`), fullPage: true });
      if (errors.length) throw new Error(`${file} ${viewport.name}: ${errors.join('; ')}`);
      await page.close();
    }
  }
} finally {
  await browser.close();
}

console.log(`Rendered ${files.length * 2} screenshots for ${files.length} templates without page errors.`);
