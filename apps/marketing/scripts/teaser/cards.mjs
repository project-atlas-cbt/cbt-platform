// Renders the tour video's title and end cards and its caption overlays to PNG, in the site's
// own fonts (so build the marketing app first). See README.md beside this file.
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
const app = fileURLToPath(new URL('../../', import.meta.url));
const OUT = process.env.CARDS ?? `${tmpdir()}/examkeep-tour/cards`;
mkdirSync(OUT, { recursive: true });
const W = 1920,
  H = 1080;
const mk = `${app}.next/static`;
const css = readdirSync(`${mk}/chunks`)
  .filter((f) => f.endsWith('.css'))
  .map((f) => readFileSync(`${mk}/chunks/${f}`, 'utf8'))
  .join('');
const faces = (css.match(/@font-face\{[^}]*\}/g) ?? [])
  .filter((f) => /Inter|Literata/.test(f))
  .map((f) => f.replace(/url\(\.\.\/media\//g, `url(file://${mk}/media/`))
  .join('\n');
const logo = `data:image/svg+xml;base64,${readFileSync(`${app}public/brand/examkeep-horizontal-colour.svg`).toString('base64')}`;
const b = await chromium.launch(
  process.env.E2E_CHROMIUM_EXECUTABLE
    ? { executablePath: process.env.E2E_CHROMIUM_EXECUTABLE }
    : {},
);
async function card(name, html) {
  const p = await (await b.newContext({ viewport: { width: W, height: H } })).newPage();
  writeFileSync(
    `${OUT}/${name}.html`,
    `<!doctype html><meta charset="utf-8"><style>${faces}
    html,body{margin:0;width:${W}px;height:${H}px;font-family:Inter,sans-serif;-webkit-font-smoothing:antialiased;background:transparent}</style>${html}`,
  );
  await p.goto(`file://${OUT}/${name}.html`, { waitUntil: 'load' });
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: `${OUT}/${name}.png`, omitBackground: true });
  await p.context().close();
}
const CAPTIONS = [
  'Bring a whole class list in from a spreadsheet.',
  'Every row is checked before anything is saved.',
  'Valid rows go in now. The one to fix is kept aside.',
  'Teachers bring in their questions the same way.',
  'Then send them all to the HOD for review in one go.',
  'The HOD checks each question before it can go into an exam.',
  'One screen shows every student in the sitting, live.',
  'A computer that goes quiet is flagged and listed first.',
  'Each student sits the paper on their own timer.',
  'If the network drops, answers are kept on the computer.',
  'When it returns, they are sent to the server on their own.',
  'Marked on submit. Students see results only when the school publishes them.',
  'Results are graded and kept until the school publishes them.',
];
const map = {};
for (const [i, t] of CAPTIONS.entries()) {
  map[t] = `cap-${i}.png`;
  await card(
    `cap-${i}`,
    `<div style="position:absolute;left:50%;transform:translateX(-50%);bottom:56px;white-space:nowrap;background:rgba(17,19,24,.88);color:#fff;padding:18px 30px 20px;border-radius:12px;font-size:36px;line-height:1.3;font-weight:500;letter-spacing:-.01em;box-shadow:0 8px 30px rgba(0,0,0,.18)">${t}</div>`,
  );
}
writeFileSync(`${OUT}/captions.json`, JSON.stringify(map));
await card(
  'title',
  `<div style="width:100%;height:100%;background:#1D4ED8;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:56px;color:#fff">
  <img src="${logo}" style="width:720px;filter:brightness(0) invert(1)">
  <div style="font-size:46px;font-weight:500;letter-spacing:-.015em;text-align:center;line-height:1.3;max-width:1300px">Run your school’s exams on computers.<br>Keep every answer, even when the network drops.</div></div>`,
);
await card(
  'end',
  `<div style="width:100%;height:100%;background:#1D4ED8;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:44px;color:#fff">
  <img src="${logo}" style="width:600px;filter:brightness(0) invert(1)">
  <div style="font-size:46px;font-weight:600;letter-spacing:-.01em">examkeep.com</div>
  <div style="font-size:32px;opacity:.92">Computer-based testing for secondary schools</div></div>`,
);
// What the cursor carries in the import scene: the spreadsheet being dragged in from the desktop.
const sheetIcon = `<svg width="34" height="42" viewBox="0 0 34 42" xmlns="http://www.w3.org/2000/svg"><path d="M3 0h20l11 11v28a3 3 0 0 1-3 3H3a3 3 0 0 1-3-3V3a3 3 0 0 1 3-3z" fill="#1F7A4D"/><path d="M23 0v8a3 3 0 0 0 3 3h8z" fill="#6FBF94"/><g stroke="#fff" stroke-width="2" fill="none"><rect x="7" y="18" width="20" height="16" rx="1"/><path d="M7 23.5h20M7 28.5h20M14 18v16"/></g></svg>`;
await card(
  'file-chip',
  `<div style="position:absolute;left:40px;top:40px;display:flex;align-items:center;gap:16px;padding:14px 22px 14px 16px;background:#fff;border:1px solid #D6DAE1;border-radius:12px;box-shadow:0 2px 4px rgb(20 22 27/.08),0 14px 30px -12px rgb(20 22 27/.35)">
  ${sheetIcon}<div style="font-size:24px;font-weight:500;color:#14161B;letter-spacing:-.01em">SS2 new students.xlsx</div></div>`,
);
await b.close();
