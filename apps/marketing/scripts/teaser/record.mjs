// Records the tour video's scenes from the real app on the fictional demo school: screencast
// frames plus a timeline of cursor moves, clicks, keys, zooms and captions. The cursor
// is not in the frames; compose.py draws it from the timeline. See README.md beside this file.
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const OUT = process.env.REC ?? `${tmpdir()}/examkeep-tour/rec`;
const state = JSON.parse(readFileSync(`${root}tools/load/.state/demo-school.json`, 'utf8'));
const o = state.oakridge;
const url = (p) => `http://${o.host}:3000${p}`;
const VW = 1366,
  VH = 768,
  DSF = 1.5;
// The seed's own question list gives the right option, so the student on camera answers well.
const seedSrc = readFileSync(`${root}tools/load/src/demo-school.ts`, 'utf8');
const KEY = [
  ...seedSrc.matchAll(/content: '((?:[^'\\]|\\.)*)',\s*options: \[([^\]]*)\],\s*correct: (\d+)/g),
].map((m) => {
  const opts = [...m[2].matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((x) => x[1].replace(/\\'/g, "'"));
  return { content: m[1].replace(/\\'/g, "'"), answer: opts[Number(m[3])] };
});
async function correctOption(p) {
  for (const k of KEY) {
    if (
      await p
        .getByText(k.content, { exact: true })
        .first()
        .isVisible()
        .catch(() => false)
    ) {
      return p.getByRole('radio', { name: k.answer, exact: true });
    }
  }
  return p.getByRole('radio').first();
}
const browser = await chromium.launch({
  // Without the flag, headless screencast frames come at CSS pixel size whatever the context's scale.
  args: [`--force-device-scale-factor=${DSF}`],
  ...(process.env.E2E_CHROMIUM_EXECUTABLE
    ? { executablePath: process.env.E2E_CHROMIUM_EXECUTABLE }
    : {}),
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const only = process.env.ONLY?.split(',');
const want = (n) => !only || only.includes(n);
const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

async function newPage() {
  const ctx = await browser.newContext({
    viewport: { width: VW, height: VH },
    deviceScaleFactor: DSF,
  });
  return ctx.newPage();
}

async function signIn(p, user) {
  await p.goto(url('/login'));
  const btn = p.getByRole('button', { name: 'Sign in' });
  for (let i = 0; i < 50 && !(await btn.isEnabled()); i++) await p.waitForTimeout(200);
  await p.getByLabel('Username or Student ID').fill(user);
  await p.getByLabel('Password').fill(state.password);
  await btn.click();
  await p.waitForURL((u) => !u.pathname.startsWith('/login') && u.pathname !== '/', {
    timeout: 30000,
  });
}

class Scene {
  constructor(page, name, cursor = [VW * 0.62, VH * 0.7]) {
    this.p = page;
    this.name = name;
    this.events = [];
    this.frames = [];
    [this.cx, this.cy] = cursor;
  }
  now() {
    return Date.now() / 1000;
  }
  log(e) {
    this.events.push({ t: this.now(), ...e });
  }
  async start() {
    const dir = `${OUT}/${this.name}`;
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    this.dir = dir;
    this.cdp = await this.p.context().newCDPSession(this.p);
    this.cdp.on('Page.screencastFrame', (f) => {
      const i = this.frames.length;
      writeFileSync(`${dir}/${i}.jpg`, Buffer.from(f.data, 'base64'));
      this.frames.push({ i, t: f.metadata.timestamp });
      this.cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
    });
    await this.cdp.send('Page.startScreencast', {
      format: 'jpeg',
      quality: 88,
      maxWidth: Math.ceil(VW * DSF),
      maxHeight: Math.ceil(VH * DSF),
    });
    await sleep(300);
    this.t0 = this.now();
    this.log({ kind: 'cursor', x: this.cx, y: this.cy });
  }
  async stop() {
    this.t1 = this.now();
    await this.cdp.send('Page.stopScreencast');
    writeFileSync(
      `${this.dir}/meta.json`,
      JSON.stringify({
        t0: this.t0,
        t1: this.t1,
        dsf: DSF,
        vw: VW,
        vh: VH,
        frames: this.frames,
        events: this.events,
      }),
    );
    console.log(
      'recorded',
      this.name,
      (this.t1 - this.t0).toFixed(1) + 's',
      this.frames.length,
      'frames',
    );
  }
  async point(target, dx = 0.5, dy = 0.5) {
    if (Array.isArray(target)) return target;
    const loc = typeof target === 'string' ? this.p.locator(target).first() : target;
    await loc.waitFor({ state: 'visible', timeout: 20000 });
    const b = await loc.boundingBox();
    return [b.x + b.width * dx, b.y + b.height * dy];
  }
  async rect(target, pad = 24) {
    const loc = typeof target === 'string' ? this.p.locator(target).first() : target;
    const b = await loc.boundingBox();
    return [b.x - pad, b.y - pad, b.width + pad * 2, b.height + pad * 2];
  }
  /** Glide the cursor to a target; the real mouse follows so hover states show. */
  async move(target, ms = 650, dx, dy) {
    const [x, y] = await this.point(target, dx, dy);
    const [x0, y0] = [this.cx, this.cy];
    this.log({ kind: 'move', x0, y0, x1: x, y1: y, dur: ms / 1000 });
    const start = Date.now();
    for (;;) {
      const k = Math.min(1, (Date.now() - start) / ms);
      const e = ease(k);
      await this.p.mouse.move(x0 + (x - x0) * e, y0 + (y - y0) * e);
      if (k >= 1) break;
      await sleep(16);
    }
    [this.cx, this.cy] = [x, y];
  }
  /** sound: 'tik' for an ordinary click, 'tuk' for an important action (see sound.py). */
  async click(target, { ms = 650, dx, dy, sound = 'tik' } = {}) {
    if (target) await this.move(target, ms, dx, dy);
    await sleep(140);
    this.log({ kind: 'click', x: this.cx, y: this.cy, sound });
    await this.p.mouse.down();
    await sleep(70);
    await this.p.mouse.up();
  }
  async type(text, base = 85) {
    for (const ch of text) {
      this.log({ kind: 'key' });
      await this.p.keyboard.type(ch);
      await sleep(base + Math.random() * 60);
    }
  }
  /** Zoom so the target (or the union of several) fills the view, never beyond maxScale. */
  async zoom(target, maxScale, ms = 900, pad = 28) {
    const list = Array.isArray(target) && typeof target[0] !== 'number' ? target : [target];
    const rs = [];
    for (const t of list) rs.push(Array.isArray(t) ? t : await this.rect(t, pad));
    const x0 = Math.min(...rs.map((r) => r[0])),
      y0 = Math.min(...rs.map((r) => r[1]));
    const x1 = Math.max(...rs.map((r) => r[0] + r[2])),
      y1 = Math.max(...rs.map((r) => r[1] + r[3]));
    const scale = Math.max(1, Math.min(maxScale, VW / (x1 - x0), VH / (y1 - y0)));
    this.log({ kind: 'zoom', cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, scale, dur: ms / 1000 });
  }
  unzoom(ms = 900) {
    this.log({ kind: 'zoom', cx: VW / 2, cy: VH / 2, scale: 1, dur: ms / 1000 });
  }
  /** An interface sound at this moment (sound.py's POINT names). */
  cue(name) {
    this.log({ kind: 'sound', name });
  }
  /** Start or stop the quiet 'data' texture under a background job or a loading table. */
  data(on) {
    this.log({ kind: 'span', name: 'data', on });
  }
  /** A caption at the foot of the frame, or at its head when the action happens low down. */
  caption(text, place = 'bottom') {
    this.log({ kind: 'caption', text, place });
  }
  captionOff() {
    this.log({ kind: 'caption', text: null });
  }
}

// --- 0. A Moderator imports a class list -------------------------------------
// A real spreadsheet built from the app's own template: thirty new SS2 students, one of whom
// reuses an existing student's ID so validation has something true to catch. Each take needs
// fresh IDs (imported students cannot be deleted), so IMPORT_BASE moves the range on.
const IMPORT_FILE = 'SS2 new students.xlsx';
const IMPORT_NAMES = [
  ['Adaeze', 'Nwosu'],
  ['Bashir', 'Lawal'],
  ['Chiamaka', 'Obi'],
  ['Damilola', 'Akande'],
  ['Emeka', 'Udeh'],
  ['Fatima', 'Sani'],
  ['Gbenga', 'Oyelaran'],
  ['Halima', 'Garba'],
  ['Ifeoma', 'Chukwu'],
  ['Jide', 'Afolabi'],
  ['Kemi', 'Adebayo'],
  ['Lami', 'Danjuma'],
  ['Musa', 'Abdullahi'],
  ['Nkechi', 'Eze'],
  ['Olumide', 'Fashola'],
  ['Precious', 'Etim'],
  ['Rukayya', 'Bello'],
  ['Segun', 'Adewale'],
  ['Tobi', 'Ogundipe'],
  ['Uche', 'Okeke'],
  ['Victoria', 'Inyang'],
  ['Wale', 'Ibrahim'],
  ['Yetunde', 'Alabi'],
  ['Zainab', 'Yusuf'],
  ['Ayodele', 'Ojo'],
  ['Bolaji', 'Salami'],
  ['Chidi', 'Anyanwu'],
  ['Dayo', 'Ilori'],
  ['Esther', 'Okon'],
];
async function workbook(sheet, header, rows) {
  const { createRequire } = await import('node:module');
  const ExcelJS = createRequire(`${root}apps/api/package.json`)('exceljs');
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheet);
  ws.addRow(['# template-version: 1']);
  ws.addRow(header);
  for (const r of rows) ws.addRow(r);
  return Buffer.from(await wb.xlsx.writeBuffer());
}
function importWorkbook() {
  const base = Number(process.env.IMPORT_BASE ?? 201);
  const rows = [];
  IMPORT_NAMES.forEach(([first, last], i) => {
    rows.push([`OKC24${base + i}`, first, last, `SS2${'ABC'[i % 3]}`, '']);
    // row 13 of the sheet repeats a student the school already has
    if (i === 10) rows.push([o.students[4].identifier, 'Ibrahim', 'Musa', 'SS2B', '']);
  });
  return workbook(
    'Students',
    ['Student ID', 'First Name', 'Last Name', 'Class', 'Department'],
    rows,
  );
}
/** A DataTransfer holding the file, for dispatching dragover and drop on the dropzone. */
function fileTransfer(p, file, name) {
  return p.evaluateHandle(
    ({ b64, name }) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const d = new DataTransfer();
      d.items.add(
        new File([bytes], name, {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }),
      );
      return d;
    },
    { b64: file.toString('base64'), name },
  );
}

if (want('import')) {
  const file = await importWorkbook();
  const p = await newPage();
  await signIn(p, o.moderator);
  await p.goto(url('/moderator/people/students/import'));
  await p.waitForLoadState('networkidle');
  const zone = p.getByRole('button', { name: /Drag a file here/ });
  await zone.waitFor({ timeout: 20000 });
  await sleep(1200);
  const dt = await fileTransfer(p, file, IMPORT_FILE);

  const s = new Scene(p, 'import', [VW * 0.9, VH * 0.92]);
  await s.start();
  s.caption('Bring a whole class list in from a spreadsheet.');
  const head = p.getByRole('heading', { name: 'Import students' });
  const hb = await head.boundingBox();
  const zb = await zone.boundingBox();
  const panel = [hb.x - 24, hb.y - 60, zb.width + 48, zb.y + zb.height + 40 - (hb.y - 60)];
  await s.zoom([panel], 1.35, 1000);
  // compose.py draws the file under the cursor from 'drag' until 'drop'
  s.log({ kind: 'drag', file: IMPORT_FILE });
  s.cue('tik');
  await sleep(300);
  const [zx, zy] = await s.point(zone);
  const halfway = s.move([zx + 120, zy + 30], 700);
  await sleep(450);
  await zone.dispatchEvent('dragover', { dataTransfer: dt });
  await halfway;
  await s.move([zx, zy], 500);
  await sleep(250);
  s.log({ kind: 'drop', x: s.cx, y: s.cy });
  s.log({ kind: 'click', x: s.cx, y: s.cy, sound: 'drop' });
  s.data(true);
  await zone.dispatchEvent('drop', { dataTransfer: dt });

  const summary = p.getByTestId('import-summary-sentence');
  await summary.waitFor({ timeout: 30000 });
  s.data(false);
  s.cue('confirm');
  s.caption('Every row is checked before anything is saved.');
  await sleep(500);
  const confirm = p.getByRole('button', { name: /^Import \d+ valid rows?$/ });
  const sb = await p.getByText('Total rows').boundingBox();
  const cb = await confirm.boundingBox();
  await s.zoom(
    // the three counts, the row that needs attention and the import button, all in view
    [[sb.x - 24, sb.y - 24, VW - sb.x + 8, cb.y + cb.height + 24 - (sb.y - 24)]],
    1.3,
    900,
  );
  await sleep(500);
  await s.move(p.getByText(/already exists at this school/).first(), 900, 0.3);
  await sleep(1300);
  s.caption('Valid rows go in now. The one to fix is kept aside.');
  await s.click(confirm, { ms: 800, sound: 'tuk' });
  s.data(true);
  // the import runs in the background; compose.py cuts the wait after a moment of progress
  await sleep(1100);
  s.log({ kind: 'skip', on: true });
  await p.getByText('Import complete').waitFor({ timeout: 60000 });
  await sleep(400);
  s.log({ kind: 'skip', on: false });
  s.data(false);
  s.cue('confirm');
  const done = p.getByText('Import complete').locator('xpath=..');
  await s.zoom(done, 1.3, 800);
  await s.move(p.getByText(/students imported/).first(), 800);
  await sleep(1300);
  s.unzoom(700);
  await sleep(700);
  await s.stop();
  await p.context().close();
}

// --- 1. A teacher imports questions and sends them for review ---------------
// Ten SS2 Mathematics questions in the app's question template, all within the teacher's own
// classes, so every row is valid. The HOD scene then approves one of these same questions.
const QUESTIONS = [
  ['Solve for x: 3x − 7 = 11.', '4', '6', '5', '3', 'B', 'Linear equations'],
  ['Simplify 2³ × 2⁴.', '2⁷', '2¹²', '4⁷', '2¹', 'A', 'Indices'],
  [
    'Find the sum of the interior angles of a hexagon.',
    '540°',
    '720°',
    '900°',
    '360°',
    'B',
    'Polygons',
  ],
  ['Evaluate log₂ 32.', '4', '5', '6', '16', 'B', 'Logarithms'],
  [
    'Find the simple interest on ₦20,000 at 5% per annum for 3 years.',
    '₦1,000',
    '₦3,000',
    '₦2,000',
    '₦3,500',
    'B',
    'Commercial arithmetic',
  ],
  [
    'Find the gradient of the line through (1, 2) and (3, 8).',
    '2',
    '3',
    '4',
    '6',
    'B',
    'Coordinate geometry',
  ],
  [
    'Factorise x² − 9.',
    '(x − 3)²',
    '(x + 3)(x − 3)',
    '(x + 9)(x − 1)',
    'x(x − 9)',
    'B',
    'Quadratic expressions',
  ],
  ['Find the mean of 4, 7, 9 and 12.', '7', '8', '9', '32', 'B', 'Statistics'],
  [
    'Find the area of a rectangle 8 cm long and 5 cm wide.',
    '13 cm²',
    '26 cm²',
    '40 cm²',
    '45 cm²',
    'C',
    'Plane shapes',
  ],
  [
    'Expand (x − 2)(x + 5).',
    'x² + 3x − 10',
    'x² − 3x − 10',
    'x² + 7x − 10',
    'x² + 3x + 10',
    'A',
    'Quadratic expressions',
  ],
];
// the question the HOD approves on camera
const REVIEWED = QUESTIONS[6][0];

if (want('qimport')) {
  const file = await workbook(
    'Questions',
    [
      'Question',
      'Option A',
      'Option B',
      'Option C',
      'Option D',
      'Correct Answer',
      'Subject',
      'Class',
      'Topic',
      'Difficulty',
      'Marks',
    ],
    QUESTIONS.map(([q, a, b, c, d, key, topic]) => [
      q,
      a,
      b,
      c,
      d,
      key,
      'Mathematics',
      'SS2A',
      topic,
      'MEDIUM',
      '1',
    ]),
  );
  const p = await newPage();
  await signIn(p, o.teacher);
  await p.goto(url('/teacher/question-bank/import'));
  await p.waitForLoadState('networkidle');
  const zone = p.getByRole('button', { name: /Drag a file here/ });
  await zone.waitFor({ timeout: 20000 });
  // dropped off camera: the student import has already shown the drag
  await zone.dispatchEvent('drop', {
    dataTransfer: await fileTransfer(p, file, 'SS2 Maths questions.xlsx'),
  });
  await p.getByTestId('import-summary-sentence').waitFor({ timeout: 30000 });
  await sleep(800);
  const confirm = p.getByRole('button', { name: /^Import \d+ valid rows?$/ });
  const s = new Scene(p, 'qimport', [VW * 0.72, VH * 0.8]);
  await s.start();
  s.caption('Teachers bring in their questions the same way.');
  const sb = await p.getByText('Total rows').boundingBox();
  const cb = await confirm.boundingBox();
  await s.zoom(
    [[sb.x - 24, sb.y - 24, VW - sb.x + 8, cb.y + cb.height + 24 - (sb.y - 24)]],
    1.3,
    800,
  );
  await sleep(700);
  await s.click(confirm, { ms: 800, sound: 'tuk' });
  s.data(true);
  await sleep(900);
  s.log({ kind: 'skip', on: true });
  await p.getByText('Import complete').waitFor({ timeout: 60000 });
  await sleep(400);
  s.log({ kind: 'skip', on: false });
  s.data(false);
  s.cue('confirm');
  await s.move(p.getByText(/questions imported/).first(), 700);
  await sleep(1700);
  await s.stop();
  await p.context().close();
}

if (want('qsubmit')) {
  const p = await newPage();
  await signIn(p, o.teacher);
  await p.goto(url('/teacher/question-bank?status=DRAFT'));
  await p.waitForLoadState('networkidle');
  const all = p.getByRole('button', { name: 'Select all on this page' });
  await all.waitFor({ timeout: 20000 });
  await sleep(1000);
  const s = new Scene(p, 'qsubmit', [VW * 0.6, VH * 0.75]);
  await s.start();
  s.caption('Then send them all to the HOD for review in one go.');
  const bar = all.locator('xpath=ancestor::div[contains(@class,"rounded-md")][1]');
  const bb = await bar.boundingBox();
  await s.zoom([[bb.x - 20, bb.y - 30, bb.width + 40, 330]], 1.35, 800);
  await s.click(all, { ms: 800 });
  await sleep(700);
  await s.click(p.getByRole('button', { name: 'Submit selected for review' }), {
    ms: 700,
    sound: 'tuk',
  });
  await p.getByText(/submitted for review\./).waitFor({ timeout: 20000 });
  s.cue('confirm');
  await sleep(1800);
  await s.stop();
  await p.context().close();
}

// --- 2. The HOD approves one of them -----------------------------------------
if (want('review')) {
  const p = await newPage();
  await signIn(p, o.hod);
  await p.goto(url('/hod/question-review'));
  const row = p.getByRole('row').filter({ hasText: REVIEWED });
  await row.waitFor({ timeout: 20000 });
  await sleep(1200);
  const s = new Scene(p, 'review', [VW * 0.55, VH * 0.75]);
  await s.start();
  s.caption('The HOD checks each question before it can go into an exam.');
  const rb = await row.boundingBox();
  await s.zoom([[rb.x - 20, rb.y - 130, rb.width + 40, 300]], 1.3, 800);
  await s.click(row.getByRole('link', { name: 'Open review' }), { ms: 900 });
  await p.waitForURL(/question-review\/[0-9a-f-]{36}/, { timeout: 20000 });
  const q = p.getByText(REVIEWED, { exact: true }).first();
  await q.waitFor({ timeout: 20000 });
  s.cue('state');
  s.unzoom(500);
  await sleep(600);
  const qb = await q.boundingBox();
  const approve = p.getByRole('button', { name: 'Approve' });
  const ab = await approve.boundingBox();
  // the question, its options and the review actions, left-aligned where the content sits
  const area = [qb.x - 16, qb.y - 40, 820, ab.y + ab.height + 30 - (qb.y - 40)];
  await s.zoom([area], 1.45, 900);
  await s.move(q, 800, 0.6, 0.5);
  await sleep(1300);
  await s.move(approve, 800);
  s.cue('hover');
  await sleep(200);
  await s.click(null, { sound: 'confirm' });
  await sleep(250);
  s.unzoom(800);
  await sleep(1800);
  await s.stop();
  await p.context().close();
}

// --- 3. Exam Control Center ------------------------------------------------
if (want('control')) {
  const p = await newPage();
  await signIn(p, o.teacher);
  await p.goto(url(`/teacher/exam-control/${o.liveExamId}`));
  await p.waitForLoadState('networkidle');
  await sleep(1500);
  const s = new Scene(p, 'control', [VW * 0.5, VH * 0.6]);
  await s.start();
  s.caption('One screen shows every student in the sitting, live.');
  s.cue('state');
  s.data(true);
  await sleep(800);
  s.data(false);
  await s.move(p.getByText(/^Submitted$/).first(), 900).catch(() => {});
  await sleep(1400);
  s.caption('A computer that goes quiet is flagged and listed first.');
  const flag = p.getByText(/disconnected/i).first();
  await p.evaluate(() => window.scrollTo({ top: 360, behavior: 'smooth' }));
  await sleep(900);
  const row = flag.locator('xpath=ancestor::tr[1]');
  const rb = await row.boundingBox();
  const fb = await flag.boundingBox();
  await s.zoom(
    [[rb.x - 10, rb.y - 70, fb.x + fb.width + 180 - rb.x, rb.height * 3 + 120]],
    1.6,
    1000,
  );
  await s.move(flag, 900);
  await sleep(1800);
  await s.unzoom(800);
  await sleep(500);
  await s.stop();
  await p.context().close();
}

// --- 4. Student signs in and sits the paper --------------------------------
if (want('student')) {
  const free = o.students.filter((x) => x.state === 'not started');
  const st = free[Number(process.env.STUDENT_INDEX ?? 0)];
  const p = await newPage();
  await p.goto(url('/login'));
  const btn = p.getByRole('button', { name: 'Sign in' });
  for (let i = 0; i < 50 && !(await btn.isEnabled()); i++) await p.waitForTimeout(200);
  await sleep(600);

  const s1 = new Scene(p, 'signin', [VW * 0.7, VH * 0.75]);
  await s1.start();
  s1.caption('Students sign in with their student ID.');
  const form = p.locator('form').first();
  await s1.zoom(form, 1.35, 900);
  await s1.click(p.getByLabel('Username or Student ID'), { ms: 800 });
  await sleep(200);
  await s1.type(st.identifier);
  await sleep(250);
  await s1.click(p.getByLabel('Password'), { ms: 450 });
  await s1.type(state.password, 45);
  await sleep(250);
  await s1.click(btn, { ms: 500 });
  await p.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30000 });
  s1.unzoom(500);
  await p.waitForLoadState('networkidle');
  await sleep(700);
  await s1.click(
    p
      .getByRole('link', { name: 'View details' })
      .or(p.getByRole('button', { name: 'View details' }))
      .first(),
    { ms: 800 },
  );
  await p.waitForURL(/assessment\//, { timeout: 20000 });
  await sleep(1200);
  await s1.stop();
  // The preview downloads the paper's media before Start enables; that wait is cut.
  const start = p.getByRole('button', { name: 'Start assessment' });
  for (let i = 0; i < 150 && !(await start.isEnabled()); i++) await p.waitForTimeout(200);
  await sleep(600);

  const s2 = new Scene(p, 'exam', [s1.cx, s1.cy]);
  await s2.start();
  await sleep(500);
  await s2.click(start, { ms: 800 });
  // after the click: a caption earlier would sit over the Start button
  s2.caption('Each student sits the paper on their own timer.');
  await p.getByRole('heading', { name: /question 1 of/i }).waitFor({ timeout: 30000 });
  s2.cue('state');
  await sleep(700);
  await s2.zoom(p.locator('#exam-main'), 1.12, 900);
  for (let n = 0; n < 1; n++) {
    await sleep(700);
    await s2.click(await correctOption(p), { ms: 600 });
    await sleep(650);
    await s2.click(p.getByRole('button', { name: 'Next' }), { ms: 650 });
  }
  await sleep(500);
  await s2.stop();

  // --- 5. The network drops ------------------------------------------------
  const s3 = new Scene(p, 'offline', [s2.cx, s2.cy]);
  await s3.start();
  await p.context().setOffline(true);
  s3.cue('interrupt');
  s3.caption('If the network drops, answers are kept on the computer.');
  await sleep(700);
  const banner = p.getByText(/You.re offline/).first();
  const bb = await banner.boundingBox();
  // the banner's words and the start of the question beneath them
  const top = [0, 0, Math.min(VW, bb.x + bb.width / 2 + 390), 330];
  await s3.zoom([top], 1.6, 800);
  await sleep(1300);
  await s3.unzoom(700);
  for (let n = 0; n < 1; n++) {
    await sleep(450);
    await s3.click(await correctOption(p), { ms: 600 });
    await sleep(550);
    await s3.click(p.getByRole('button', { name: 'Next' }), { ms: 600 });
  }
  await s3.zoom([top], 1.6, 700);
  await sleep(900);
  await p.context().setOffline(false);
  s3.cue('sync');
  s3.caption('When it returns, they are sent to the server on their own.');
  await sleep(2000);
  await s3.unzoom(700);
  await sleep(500);
  await s3.stop();

  // Off camera: the student answers the rest of the paper (one slip, for a realistic score).
  for (let i = 0; i < 12; i++) {
    const next = p.getByRole('button', { name: 'Next', exact: true });
    const opt = i === 2 ? p.getByRole('radio').first() : await correctOption(p);
    await opt.click({ timeout: 4000 }).catch(() => {});
    await sleep(250);
    if (!(await next.isVisible().catch(() => false))) break;
    await next.click();
    await sleep(350);
  }
  await sleep(800);

  // --- 6. Submit ------------------------------------------------------------
  const s4 = new Scene(p, 'submit', [s3.cx, s3.cy]);
  await s4.start();
  s4.caption('Marked on submit. Students see results only when the school publishes them.');
  await s4.click(p.getByRole('button', { name: 'Submit assessment' }), { ms: 800 });
  const dialog = p.getByRole('dialog');
  await dialog.waitFor({ timeout: 10000 });
  s4.cue('state');
  await sleep(500);
  await s4.zoom(dialog, 1.3, 800);
  await sleep(1000);
  await s4.click(dialog.getByRole('button', { name: /^Submit/ }).last(), { ms: 700, sound: 'tuk' });
  // the confirmation says the paper is in and marked, and shows no score
  const marked = p.getByText(/Your answers have been marked/);
  await marked.waitFor({ timeout: 20000 });
  s4.cue('confirm');
  await sleep(300);
  s4.cue('settle');
  await s4.zoom([p.getByRole('heading', { name: /has been submitted/ }), marked], 1.4, 800);
  await s4.move(marked, 800, 0.3);
  await sleep(1900);
  await s4.stop();
  await p.context().close();
}

// --- 7. Results and publication -------------------------------------------
if (want('results')) {
  const p = await newPage();
  await signIn(p, o.teacher);
  await p.goto(url(`/teacher/results/${o.caExamId}`));
  await p.waitForLoadState('networkidle');
  // a retake: take back an earlier take's publication off camera
  const unpub = p.getByRole('button', { name: 'Unpublish' });
  if (await unpub.isVisible().catch(() => false)) {
    await unpub.click();
    const dialog = p.getByRole('dialog');
    await dialog.getByLabel('Reason').fill('Recording the product tour again.');
    await dialog.getByRole('button', { name: 'Unpublish results' }).click();
    await p.getByRole('button', { name: 'Publish results' }).waitFor({ timeout: 20000 });
    // clears the "Unpublished" notice, which belongs to the retake, not the story
    await p.reload();
    await p.waitForLoadState('networkidle');
  }
  await sleep(1200);
  const s = new Scene(p, 'results', [VW * 0.6, VH * 0.7]);
  await s.start();
  s.caption('Results are graded and kept until the school publishes them.');
  s.data(true);
  await sleep(500);
  s.data(false);
  await s.click(p.getByText('SS2B', { exact: true }).first(), { ms: 900 });
  await sleep(1100);
  const pub = p.getByRole('button', { name: 'Publish results' });
  await pub.scrollIntoViewIfNeeded().catch(() => {});
  await sleep(300);
  const box = pub.locator('xpath=ancestor::*[contains(@class,"border")][1]');
  await s.zoom((await box.count()) ? box : pub, 1.4, 900);
  await s.move(pub, 900);
  s.cue('hover');
  await sleep(500);
  await s.click(null, { sound: 'final' });
  s.caption('One click releases them to students.');
  // rest on the confirmation, not on the Unpublish button that replaces Publish
  const done = p.getByText('Published', { exact: true }).first();
  await done.waitFor({ timeout: 20000 });
  await s.move(done, 800);
  await sleep(1500);
  await s.unzoom(700);
  await sleep(500);
  await s.stop();
  // off camera: the next scene follows a student from this table who did well (scores vary
  // from seed to seed) and has already handed in the live test, so their home page shows no
  // paper still in progress
  await p.getByText('All classes', { exact: true }).first().click();
  await p.waitForLoadState('networkidle');
  await sleep(800);
  const rows = await p
    .locator('tbody tr')
    .evaluateAll((trs) =>
      trs.map((tr) => [...tr.querySelectorAll('td')].map((td) => td.innerText.trim())),
    );
  const handedIn = new Set(o.students.filter((x) => x.state === 'submitted').map((x) => x.name));
  const good = rows.find(
    (cells) =>
      handedIn.has(cells[0].split('\n')[0]) &&
      cells.some((c) => /^\d+%$/.test(c) && parseInt(c, 10) >= 70 && parseInt(c, 10) <= 90),
  );
  if (good) writeFileSync(`${OUT}/result-student.txt`, good[0].split('\n')[0]);
  await p.context().close();
}

// --- 8. A student opens their published result ------------------------------
if (want('myresult')) {
  // a student who sat the Continuous Assessment, whose results the scene before published
  let name = process.env.RESULT_STUDENT;
  try {
    name ??= readFileSync(`${OUT}/result-student.txt`, 'utf8').trim();
  } catch {
    name ??= 'Aisha Bello';
  }
  const st = o.students.find((x) => x.name === name);
  const p = await newPage();
  await signIn(p, st.identifier);
  await p.waitForLoadState('networkidle');
  const nav = p.getByRole('link', { name: 'Results', exact: true }).first();
  await nav.waitFor({ timeout: 20000 });
  await sleep(1200);
  const s = new Scene(p, 'myresult', [VW * 0.6, VH * 0.7]);
  await s.start();
  s.caption('Each student then sees their own result.');
  await sleep(300);
  await s.click(nav, { ms: 900 });
  const item = p.getByRole('link', { name: /Continuous Assessment/ }).first();
  await item.waitFor({ timeout: 20000 });
  s.cue('state');
  await sleep(700);
  await s.click(item, { ms: 900 });
  await p.waitForURL(/results\/[0-9a-f-]{36}/, { timeout: 20000 });
  await p.waitForLoadState('networkidle');
  s.cue('state');
  await sleep(600);
  // the paper's name, the score and the counts beneath it
  await s.zoom(
    [p.getByRole('heading', { name: /Continuous Assessment/ }), p.getByText('Unanswered')],
    1.6,
    900,
  );
  await s.move(p.getByText(/^\d+ \/ \d+$/).first(), 800);
  await sleep(1700);
  s.unzoom(700);
  await sleep(500);
  await s.stop();
  await p.context().close();
}

await browser.close();
