// B21: preload for `node --import` — records a V8 CPU profile of the API
// process under load, without needing a signal to stop it (Windows-safe).
//   CPU_PROFILE_OUT=api.cpuprofile CPU_PROFILE_DELAY_MS=60000 CPU_PROFILE_MS=60000 \
//     node --import ./tools/load/scripts/cpu-profile.mjs apps/api/dist/main.js
// Summarise with: pnpm --filter @atlas/load exec tsx src/profile-summary.ts <file>
import inspector from 'node:inspector';
import { writeFileSync } from 'node:fs';

const out = process.env.CPU_PROFILE_OUT ?? `cpu-${process.pid}.cpuprofile`;
const delay = Number(process.env.CPU_PROFILE_DELAY_MS ?? 30_000);
const duration = Number(process.env.CPU_PROFILE_MS ?? 60_000);
const session = new inspector.Session();
session.connect();
setTimeout(() => {
  session.post('Profiler.enable', () => {
    session.post('Profiler.setSamplingInterval', { interval: 500 }, () => {
      session.post('Profiler.start', () => {
        setTimeout(() => {
          session.post('Profiler.stop', (err, result) => {
            if (!err) writeFileSync(out, JSON.stringify(result.profile));
            console.error(`[cpu-profile] ${err ? `failed: ${err.message}` : `written to ${out}`}`);
          });
        }, duration).unref();
      });
    });
  });
}, delay).unref();
