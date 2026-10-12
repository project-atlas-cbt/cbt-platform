// Renders /get-started to public/downloads/<name>-get-started.pdf, so the PDF
// and the page share one source (lib/get-started.ts). Needs the site running:
//   pnpm --filter @atlas/marketing build && pnpm --filter @atlas/marketing start
//   node scripts/get-started-pdf.mjs [baseUrl]
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
await page.pdf({
  path: out,
  format: 'A4',
  printBackground: true,
  margin: { top: '14mm', bottom: '14mm', left: '12mm', right: '12mm' },
});
await browser.close();
console.log('wrote', out);
