#!/usr/bin/env node
/**
 * F20 DoD 6 — bundle budgets, with the exam route the smallest.
 *
 * Measures what a browser actually downloads on first load: the module
 * `<script src>` chunks in each route's served HTML (gzip level 9, as a CDN
 * compresses static assets), read from this build's `.next/static`. Next's
 * client-reference manifests list chunks from sibling entries too, so they
 * over-count; the HTML is the ground truth. `nomodule` polyfills are
 * excluded — every supported browser (browserslist) runs modules.
 *
 * Needs the production server running (`next start`); pages render without
 * a session (authentication is client-side), so no sign-in is needed.
 *
 *   node scripts/check-bundle-budget.mjs --base http://<school>.localhost:3000
 *
 * Writes a table to stdout and exits non-zero on any breach. Budgets are
 * set from the measured F20 baseline plus headroom — raise one only with a
 * reason in the commit message.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import http from 'node:http';

const KB = 1024;
const STATIC_DIR = path.resolve(import.meta.dirname, '../.next');
const SAMPLE_ID = '00000000-0000-7000-8000-000000000000';

/**
 * Route → first-load JS budget (gzip KB): the F20 baseline (2026-10-04)
 * plus ~4 % headroom. The exam route must also be the smallest of the
 * signed-in routes. The sign-in page is budgeted but not in that
 * comparison: it is the pre-authentication entry, with no attempt engine
 * (IndexedDB, sync, timer), so it is smaller by construction.
 */
const BUDGETS = [
  { route: `/student/exam/${SAMPLE_ID}`, budget: 285, exam: true },
  { route: '/login', budget: 250, preAuth: true },
  { route: '/student', budget: 345 },
  { route: `/student/assessment/${SAMPLE_ID}`, budget: 350 },
  { route: '/teacher', budget: 315 },
  { route: '/teacher/question-bank/new', budget: 470 },
  { route: `/teacher/exam-control/${SAMPLE_ID}`, budget: 335 },
  { route: '/school', budget: 320 },
  { route: '/hod/question-review', budget: 325 },
  { route: '/admin', budget: 315 },
];

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}

/** GET via 127.0.0.1 with the real Host header (`*.localhost` need not
 * resolve in Node — see e2e/support.ts `fetchViaLoopback`). */
function get(url) {
  const target = new URL(url);
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port: target.port || 80,
        path: target.pathname,
        headers: { host: target.host, 'accept-encoding': 'identity' },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () =>
          resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString() }),
        );
      },
    );
    req.on('error', reject);
    req.end();
  });
}

function scriptChunks(html) {
  const out = new Set();
  for (const match of html.matchAll(/<script\b([^>]*)>/g)) {
    const attrs = match[1];
    if (/\bnoModule\b|\bnomodule\b/i.test(attrs)) continue;
    const src = /\bsrc="\/_next\/([^"]+\.js)"/.exec(attrs)?.[1];
    if (src) out.add(decodeURIComponent(src));
  }
  return [...out];
}

const gzCache = new Map();
function gzipKb(file) {
  if (!gzCache.has(file)) {
    gzCache.set(file, gzipSync(readFileSync(path.join(STATIC_DIR, file)), { level: 9 }).length);
  }
  return gzCache.get(file) / KB;
}

const base = arg('base', process.env.BUNDLE_BUDGET_BASE ?? 'http://localhost:3000');
const rows = [];
let failed = false;
for (const entry of BUDGETS) {
  const res = await get(`${base}${entry.route}`);
  if (res.status !== 200) {
    console.error(`${entry.route}: HTTP ${res.status}`);
    failed = true;
    continue;
  }
  const chunks = scriptChunks(res.body);
  const kb = chunks.reduce((sum, file) => sum + gzipKb(file), 0);
  rows.push({ ...entry, kb, chunks: chunks.length });
}

const exam = rows.find((r) => r.exam);
console.log('route'.padEnd(52), 'chunks', 'gzip KB', 'budget', '');
for (const r of rows) {
  const over = r.kb > r.budget;
  failed ||= over;
  console.log(
    r.route.padEnd(52),
    String(r.chunks).padStart(6),
    r.kb.toFixed(1).padStart(7),
    String(r.budget).padStart(6),
    over ? 'OVER BUDGET' : 'ok',
  );
}
if (exam) {
  const smaller = rows.filter((r) => !r.exam && !r.preAuth && r.kb <= exam.kb);
  if (smaller.length > 0) {
    failed = true;
    console.error(
      `The exam route (${exam.kb.toFixed(1)} KB) must be the smallest; not larger than: ${smaller
        .map((r) => r.route)
        .join(', ')}`,
    );
  }
}
process.exit(failed ? 1 : 0);
