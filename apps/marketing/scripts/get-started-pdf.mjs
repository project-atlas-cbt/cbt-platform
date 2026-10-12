// Renders /get-started to public/downloads/<name>-get-started.pdf, so the PDF
// and the page share one source (lib/get-started.ts). Needs the site running:
//   pnpm --filter @atlas/marketing build && pnpm --filter @atlas/marketing start
//   node scripts/get-started-pdf.mjs [baseUrl]
import { readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const base = process.argv[2] ?? 'http://localhost:3100';
const out = new URL('../public/downloads/get-your-school-ready.pdf', import.meta.url).pathname;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const page = await browser.newPage();
await page.goto(`${base}/get-started`, { waitUntil: 'networkidle' });
await page.addStyleTag({
  content:
    'body > header, body > footer, header.sticky, footer { display: none !important; } li { break-inside: avoid; } h2 { break-after: avoid; } main { zoom: 0.78; } .py-14, .py-16, .py-20 { padding-block: 1.25rem !important; } .mt-16 { margin-top: 1.5rem !important; }',
});
const logo = readFileSync(
  new URL('../public/brand/examkeep-horizontal-colour-1024.png', import.meta.url),
).toString('base64');
await page.evaluate((src) => {
  const strip = document.createElement('div');
  strip.style.cssText = 'background:#fff;padding:6px 0 4px 32px';
  const img = document.createElement('img');
  img.src = src;
  img.alt = '';
  img.style.cssText = 'height:34px;width:auto;display:block';
  strip.append(img);
  document.querySelector('main')?.prepend(strip);
}, `data:image/png;base64,${logo}`);
await page.pdf({
  displayHeaderFooter: true,
  headerTemplate: '<span></span>',
  footerTemplate: `<div style="width:100%;font-size:8px;color:#5b6472;padding:0 12mm;display:flex;justify-content:space-between;align-items:center"><img src="data:image/png;base64,${logo}" style="height:12px;width:auto"/><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`,
  path: out,
  format: 'A4',
  printBackground: true,
  margin: { top: '14mm', bottom: '18mm', left: '12mm', right: '12mm' },
});
await browser.close();
console.log('wrote', out);
