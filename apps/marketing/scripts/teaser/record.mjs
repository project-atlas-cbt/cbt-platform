// Records the tour video's scenes from the real app on the fictional demo school: screencast
// frames plus a timeline of cursor moves, clicks, keys, zooms, captions and sounds. The cursor
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
  async click(target, { ms = 650, dx, dy, sound = 'click' } = {}) {
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
  /** A caption at the foot of the frame, or at its head when the action happens low down. */
  caption(text, place = 'bottom') {
    this.log({ kind: 'caption', text, place });
  }
  captionOff() {
    this.log({ kind: 'caption', text: null });
  }
  sound(name) {
    this.log({ kind: 'sound', name });
  }
}

// --- 1. HOD approves a question --------------------------------------------
if (want('review')) {
  const p = await newPage();
  await signIn(p, o.hod);
  await p.goto(
    url(`/hod/question-review/${o.pendingQuestionIds[Number(process.env.REVIEW_INDEX ?? 2)]}`),
  );
  await p.waitForLoadState('networkidle');
  await sleep(1200);
  const s = new Scene(p, 'review', [VW * 0.55, VH * 0.75]);
  await s.start();
  s.caption('HODs check every question before it can go into an exam.');
  await sleep(700);
  const q = p.getByText(/^Solve|^Expand|^Simplify|^Find|^What|^If|^Factorise|^Evaluate/).first();
  const qb = await q.boundingBox();
  const head = p.getByRole('heading', { name: /Mathematics/ }).first();
  const approve = p.getByRole('button', { name: 'Approve' });
  const ab = await approve.boundingBox();
  // the question, its options and the review actions, left-aligned where the content sits
  const area = [qb.x - 16, qb.y - 40, 820, ab.y + ab.height + 30 - (qb.y - 40)];
  await s.zoom([area], 1.45, 1100);
  await s.move(q, 1000, 0.6, 0.5);
  await sleep(2000);
  await s.move(approve, 900);
  await sleep(300);
  await s.click(null);
  s.sound('success');
  await sleep(250);
  s.unzoom(800);
  await sleep(2600);
  await s.stop();
  await p.context().close();
}

// --- 2. Exam Control Center ------------------------------------------------
if (want('control')) {
  const p = await newPage();
  await signIn(p, o.teacher);
  await p.goto(url(`/teacher/exam-control/${o.liveExamId}`));
  await p.waitForLoadState('networkidle');
  await sleep(1500);
  const s = new Scene(p, 'control', [VW * 0.5, VH * 0.6]);
  await s.start();
  s.caption('One screen shows every student in the sitting, live.');
  await sleep(800);
  await s.move(p.getByText(/^Submitted$/).first(), 900).catch(() => {});
  await sleep(2400);
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
  await sleep(2600);
  await s.unzoom(800);
  await sleep(900);
  await s.stop();
  await p.context().close();
}

// --- 3. Student signs in and sits the paper --------------------------------
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
  s2.caption('Each student sits the paper on their own timer.', 'top');
  await sleep(500);
  await s2.click(start, { ms: 800 });
  await p.getByRole('heading', { name: /question 1 of/i }).waitFor({ timeout: 30000 });
  await sleep(700);
  await s2.zoom(p.locator('#exam-main'), 1.12, 900);
  for (let n = 0; n < 3; n++) {
    await sleep(700);
    await s2.click(await correctOption(p), { ms: 600 });
    await sleep(650);
    await s2.click(p.getByRole('button', { name: 'Next' }), { ms: 650 });
  }
  await sleep(500);
  await s2.stop();

  // --- 4. The network drops ------------------------------------------------
  const s3 = new Scene(p, 'offline', [s2.cx, s2.cy]);
  await s3.start();
  await p.context().setOffline(true);
  s3.sound('offline');
  s3.caption('If the network drops, answers are kept on the computer.');
  await sleep(700);
  const banner = p.getByText(/You.re offline/).first();
  const bb = await banner.boundingBox();
  // the banner's words and the start of the question beneath them
  const top = [0, 0, Math.min(VW, bb.x + bb.width / 2 + 390), 330];
  await s3.zoom([top], 1.6, 800);
  await sleep(2000);
  await s3.unzoom(700);
  for (let n = 0; n < 2; n++) {
    await sleep(450);
    await s3.click(await correctOption(p), { ms: 600 });
    await sleep(550);
    await s3.click(p.getByRole('button', { name: 'Next' }), { ms: 600 });
  }
  await s3.zoom([top], 1.6, 700);
  await sleep(900);
  await p.context().setOffline(false);
  s3.caption('When it returns, they are sent to the server on their own.');
  s3.sound('online');
  await sleep(2600);
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

  // --- 5. Submit ------------------------------------------------------------
  const s4 = new Scene(p, 'submit', [s3.cx, s3.cy]);
  await s4.start();
  s4.caption('Objective answers are marked the moment the paper is submitted.');
  await s4.click(p.getByRole('button', { name: 'Submit assessment' }), { ms: 800 });
  const dialog = p.getByRole('dialog');
  await dialog.waitFor({ timeout: 10000 });
  await sleep(500);
  await s4.zoom(dialog, 1.3, 800);
  await sleep(1300);
  await s4.click(dialog.getByRole('button', { name: /^Submit/ }).last(), { ms: 700 });
  s4.sound('success');
  await sleep(800);
  s4.unzoom(700);
  await sleep(2400);
  await s4.stop();
  await p.context().close();
}

// --- 6. Results and publication -------------------------------------------
if (want('results')) {
  const p = await newPage();
  await signIn(p, o.teacher);
  await p.goto(url(`/teacher/results/${o.caExamId}`));
  await p.waitForLoadState('networkidle');
  await sleep(1200);
  const s = new Scene(p, 'results', [VW * 0.6, VH * 0.7]);
  await s.start();
  s.caption('Results are graded and kept until the school publishes them.');
  await sleep(700);
  await s.click(p.getByText('SS2B', { exact: true }).first(), { ms: 900 });
  await sleep(1600);
  const pub = p.getByRole('button', { name: 'Publish results' });
  await pub.scrollIntoViewIfNeeded().catch(() => {});
  await sleep(300);
  const box = pub.locator('xpath=ancestor::*[contains(@class,"border")][1]');
  await s.zoom((await box.count()) ? box : pub, 1.4, 900);
  await s.move(pub, 900);
  await sleep(500);
  await s.click(null);
  s.sound('success');
  await sleep(2600);
  await s.unzoom(700);
  await sleep(700);
  await s.stop();
  await p.context().close();
}

await browser.close();
