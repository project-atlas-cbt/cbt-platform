import { parseArgs } from 'node:util';
import { loadRootEnv } from '@atlas/config';
import { prisma } from '@atlas/db';
import { parseTargets } from './http.js';
import { closeObservers } from './observe.js';
import { loadManifest, provision } from './provision.js';
import { writeReport, type RunReport } from './report.js';
import { runBurst, runLabBurst, runLevel, type CommonOptions } from './scenarios.js';
import { runAnalyticsBench } from './analytics-bench.js';

/**
 * `pnpm --filter @atlas/load load <command> [options]` — see
 * docs/performance/load-testing.md for the full procedure.
 *
 *   provision  build schools/students/questions and write .state/<name>.json
 *   levels     sustained exam load at each level (20,100,500,1000 …)
 *   burst      --kind start|submit: N simultaneous starts or submissions
 *   lab        the 40-client lab burst (run under a netem network profile);
 *              --precache: F20's pre-cached lab (media cached on the preview,
 *              the burst is the bell)
 *   analytics  analytics endpoints cold/cached on the dataset school (--n samples)
 */

loadRootEnv();

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    name: { type: 'string', default: 'b21' },
    target: { type: 'string', default: process.env.LOAD_TARGET ?? 'http://127.0.0.1:3001/v1' },
    'media-host': { type: 'string' },
    schools: { type: 'string', default: '4' },
    students: { type: 'string', default: '300' },
    'per-arm': { type: 'string', default: '40' },
    questions: { type: 'string', default: '40' },
    'media-kb': { type: 'string', default: '0' },
    levels: { type: 'string', default: '20,100,500,1000' },
    ramp: { type: 'string', default: '60' },
    sustain: { type: 'string', default: '600' },
    'submit-spread': { type: 'string', default: '60' },
    'answer-interval': { type: 'string', default: '10000' },
    heartbeat: { type: 'string', default: '30000' },
    'marking-timeout': { type: 'string', default: '600000' },
    sse: { type: 'string', default: '0' },
    flood: { type: 'string', default: '0' },
    'flood-hostile': { type: 'boolean', default: false },
    series: { type: 'boolean', default: false },
    kind: { type: 'string', default: 'start' },
    n: { type: 'string', default: '500' },
    clients: { type: 'string', default: '40' },
    window: { type: 'string', default: '20' },
    precache: { type: 'boolean', default: false },
    tag: { type: 'string' },
    scenario: { type: 'string' },
    'no-fail': { type: 'boolean', default: false },
  },
});

const int = (k: keyof typeof values) => Number(values[k]);

async function main(): Promise<number> {
  const command = positionals[0];
  const target = parseTargets(values.target);
  const mediaHost = values['media-host']
    ? (() => {
        const [address, port] = values['media-host'].split(':');
        return { address: address!, port: Number(port ?? 9000) };
      })()
    : undefined;

  if (command === 'provision') {
    const manifest = await provision({
      name: values.name,
      schools: int('schools'),
      studentsPerSchool: int('students'),
      studentsPerArm: int('per-arm'),
      questions: int('questions'),
      mediaKb: int('media-kb'),
      target: target[0]!,
    });
    const students = manifest.schools.reduce((n, s) => n + s.students.length, 0);
    console.log(
      `[provision] manifest "${manifest.name}": ${manifest.schools.length} schools, ${students} students`,
    );
    return 0;
  }

  const manifest = await loadManifest(values.name);
  const common: CommonOptions = {
    manifest,
    target,
    heartbeatMs: int('heartbeat'),
    answerIntervalMs: int('answer-interval'),
    mediaHost,
  };
  const reports: RunReport[] = [];

  if (command === 'levels') {
    for (const level of values.levels.split(',').map(Number)) {
      const report = await runLevel({
        ...common,
        level,
        rampSeconds: int('ramp'),
        sustainSeconds: int('sustain'),
        submitSpreadSeconds: int('submit-spread'),
        markingTimeoutMs: int('marking-timeout'),
        sseClients: int('sse'),
        reportingFlood: int('flood'),
        floodHostile: values['flood-hostile'],
        windowSeries: values.series,
        scenario: values.scenario ?? 'levels',
      });
      reports.push(report);
      const file = await writeReport(report, values.tag ? `${level}-${values.tag}` : String(level));
      console.log(
        `[levels] ${level}: ${report.checks.every((c) => c.pass) ? 'PASS' : 'FAIL'} → ${file}`,
      );
      // Let marking, sweeps and autovacuum settle between levels.
      await new Promise((r) => setTimeout(r, 15_000));
    }
  } else if (command === 'burst') {
    const kind = values.kind === 'submit' ? 'submit' : 'start';
    const report = await runBurst({
      ...common,
      kind,
      n: int('n'),
      markingTimeoutMs: int('marking-timeout'),
    });
    reports.push(report);
    console.log(
      `[burst] ${kind}: ${report.checks.every((c) => c.pass) ? 'PASS' : 'FAIL'} → ${await writeReport(report, values.tag)}`,
    );
  } else if (command === 'lab') {
    const report = await runLabBurst({
      ...common,
      clients: int('clients'),
      arrivalWindowSeconds: int('window'),
      precache: values.precache,
    });
    reports.push(report);
    console.log(
      `[lab] ${report.checks.every((c) => c.pass) ? 'PASS' : 'FAIL'} → ${await writeReport(report, values.tag)}`,
    );
  } else if (command === 'analytics') {
    const report = await runAnalyticsBench(manifest, target[0]!, int('n'));
    reports.push(report);
    console.log(
      `[analytics] ${report.checks.every((c) => c.pass) ? 'PASS' : 'FAIL'} → ${await writeReport(report, values.tag)}`,
    );
  } else {
    console.error(`unknown command "${command}" — provision | levels | burst | lab | analytics`);
    return 2;
  }

  for (const r of reports) {
    for (const c of r.checks.filter((x) => !x.pass))
      console.log(`  FAIL ${r.scenario}: ${c.name} — ${c.actual} (budget ${c.budget})`);
  }
  const failed = reports.some((r) => r.checks.some((c) => !c.pass));
  return failed && !values['no-fail'] ? 1 : 0;
}

main()
  .then(async (code) => {
    await closeObservers();
    await prisma.$disconnect();
    process.exit(code);
  })
  .catch(async (err: unknown) => {
    console.error(err);
    await closeObservers().catch(() => undefined);
    process.exit(1);
  });
