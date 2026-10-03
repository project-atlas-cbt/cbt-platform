import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { BudgetCheck, LabelStats } from './metrics.js';
import type { SamplerSummary, StatementRow, TableSize, VerifyResult } from './observe.js';

export const RESULTS_DIR = path.resolve(
  import.meta.dirname,
  '..',
  '..',
  '..',
  'docs',
  'performance',
  'results',
);

export interface RunReport {
  scenario: string;
  title: string;
  startedAt: string;
  durationSeconds: number;
  environment: Record<string, string | number>;
  parameters: Record<string, unknown>;
  latency: LabelStats[];
  checks: BudgetCheck[];
  sampler?: SamplerSummary;
  statements?: StatementRow[];
  verification?: VerifyResult[];
  growth?: { before: TableSize[]; after: TableSize[]; attempts: number };
  series?:
    Record<string, { minute: number; count: number; p95: number; p99: number }[]> | undefined;
  notes: string[];
  extra?: Record<string, unknown>;
}

export function environment(): Record<string, string | number> {
  const cpus = os.cpus();
  return {
    host: os.hostname(),
    platform: `${os.platform()} ${os.release()}`,
    cpu: cpus[0]?.model ?? 'unknown',
    logicalCpus: cpus.length,
    memoryGb: Math.round((os.totalmem() / 1024 ** 3) * 10) / 10,
    node: process.version,
    network: process.env.LOAD_NETWORK_PROFILE ?? 'clean (loopback)',
    pooler: process.env.LOAD_POOLER ?? 'none (direct)',
    // Measured once per host with pg_test_fsync; commit latency is bounded by it.
    ...(process.env.LOAD_HOST_FSYNC ? { diskFsync: process.env.LOAD_HOST_FSYNC } : {}),
    ...(process.env.LOAD_DATABASE ? { database: process.env.LOAD_DATABASE } : {}),
  };
}

function table(headers: string[], rows: (string | number)[][]): string {
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((r) => `| ${r.join(' | ')} |`),
  ].join('\n');
}

export function renderMarkdown(r: RunReport): string {
  const passed = r.checks.every((c) => c.pass);
  const out: string[] = [];
  out.push(`# ${r.title}`);
  out.push('');
  out.push(
    `**Scenario:** \`${r.scenario}\` · **Started:** ${r.startedAt} · **Duration:** ${r.durationSeconds}s · **Budgets:** ${passed ? 'all met' : 'NOT met'}`,
  );
  out.push('');
  out.push('## Environment');
  out.push('');
  out.push(table(['Key', 'Value'], Object.entries(r.environment)));
  out.push('');
  out.push('## Parameters');
  out.push('');
  out.push('```json');
  out.push(JSON.stringify(r.parameters, null, 2));
  out.push('```');
  out.push('');
  if (r.sampler?.hostMemoryPressure) {
    out.push(
      `> **Host memory pressure:** free RAM fell to ${r.sampler.minHostFreeMemoryMb} MB during this run, so the host was paging. Latency figures here measure the workstation's page file, not the platform; correctness checks remain valid.`,
    );
    out.push('');
  }
  out.push('## Budget checks');
  out.push('');
  out.push(
    table(
      ['Check', 'Actual', 'Budget', 'Result'],
      r.checks.map((c) => [c.name, c.actual, c.budget, c.pass ? 'PASS' : 'FAIL']),
    ),
  );
  out.push('');
  out.push('## Latency by operation (client-observed)');
  out.push('');
  out.push(
    table(
      [
        'Operation',
        'Count',
        '2xx',
        'Other statuses',
        'Net fail',
        'p50 ms',
        'p95 ms',
        'p99 ms',
        'max ms',
      ],
      r.latency
        .filter((s) => s.label !== 'setup' && s.label !== 'p')
        .map((s) => [
          s.label,
          s.count,
          s.ok,
          Object.entries(s.status)
            .filter(([code]) => !code.startsWith('2'))
            .map(([code, n]) => `${code}×${n}`)
            .join(' ') || '—',
          s.networkFailures,
          s.p50,
          s.p95,
          s.p99,
          s.max,
        ]),
    ),
  );
  if (r.sampler) {
    out.push('');
    out.push('## Server resources (sampled every 5 s)');
    out.push('');
    out.push(table(['Metric', 'Value'], Object.entries(r.sampler)));
  }
  if (r.verification?.length) {
    out.push('');
    out.push('## Correctness verification (database)');
    out.push('');
    out.push(
      table(
        [
          'Exam',
          'Expected',
          'Attempts',
          'Distinct students',
          'Duplicates',
          'States',
          'Results',
          'Final',
          'Answers checked',
          'Lost/mismatched',
        ],
        r.verification.map((v) => [
          v.examId.slice(0, 8),
          v.expectedAttempts,
          v.attempts,
          v.distinctStudents,
          v.duplicateActive,
          Object.entries(v.statesByCount)
            .map(([k, n]) => `${k}:${n}`)
            .join(' '),
          v.results,
          v.resultsFinal,
          v.answersChecked,
          v.answersMismatched,
        ]),
      ),
    );
  }
  if (r.growth) {
    out.push('');
    out.push(`## Storage growth (${r.growth.attempts} attempts)`);
    out.push('');
    const before = new Map(r.growth.before.map((t) => [t.table, t]));
    out.push(
      table(
        ['Table', 'Rows added', 'Bytes added', 'Bytes / attempt'],
        r.growth.after.map((t) => {
          const b = before.get(t.table);
          const rows = t.rows - (b?.rows ?? 0);
          const bytes = t.totalBytes - (b?.totalBytes ?? 0);
          return [
            t.table,
            rows,
            bytes,
            r.growth!.attempts ? Math.round(bytes / r.growth!.attempts) : 0,
          ];
        }),
      ),
    );
  }
  if (r.series && Object.keys(r.series).length) {
    out.push('');
    out.push('## Drift over time (per minute)');
    for (const [label, rows] of Object.entries(r.series)) {
      out.push('');
      out.push(`### ${label}`);
      out.push('');
      out.push(
        table(
          ['Minute', 'Count', 'p95 ms', 'p99 ms'],
          rows.map((x) => [x.minute, x.count, x.p95, x.p99]),
        ),
      );
    }
  }
  if (r.statements?.length) {
    out.push('');
    out.push('## Top statements by total time (pg_stat_statements)');
    out.push('');
    out.push(
      table(
        ['Calls', 'Total ms', 'Mean ms', 'Query'],
        r.statements.map((s) => [
          s.calls,
          s.totalMs,
          s.meanMs,
          `\`${s.query.replace(/\|/g, '\\|').replace(/`/g, "'")}\``,
        ]),
      ),
    );
  }
  if (r.extra && Object.keys(r.extra).length) {
    out.push('');
    out.push('## Additional measurements');
    out.push('');
    out.push('```json');
    out.push(JSON.stringify(r.extra, null, 2));
    out.push('```');
  }
  if (r.notes.length) {
    out.push('');
    out.push('## Notes');
    out.push('');
    for (const n of r.notes) out.push(`- ${n}`);
  }
  out.push('');
  return out.join('\n');
}

export async function writeReport(r: RunReport, tag?: string): Promise<string> {
  await mkdir(RESULTS_DIR, { recursive: true });
  const stamp = r.startedAt.replace(/[:.]/g, '-').slice(0, 19);
  const base = `${stamp}-${r.scenario}${tag ? `-${tag}` : ''}`;
  await writeFile(path.join(RESULTS_DIR, `${base}.json`), JSON.stringify(r, null, 2));
  const file = path.join(RESULTS_DIR, `${base}.md`);
  await writeFile(file, renderMarkdown(r));
  return file;
}
