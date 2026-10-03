import { connect } from 'node:net';
import { Agent, request } from 'node:https';
import { hostname } from 'node:os';
import { performance } from 'node:perf_hooks';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * ADR-0032 region validation: measures round-trip time from THIS network to
 * candidate AWS regions, using each region's public EC2 API endpoint (always
 * reachable, no credentials, no data sent beyond a TLS handshake and an
 * unauthenticated HEAD). Two measures per region:
 *
 *  - TCP connect time (one network round trip — the closest to raw RTT);
 *  - HTTPS request time on a warm keep-alive connection (what an answer
 *    save actually pays per round trip once the connection is open).
 *
 * Designed to be run from school labs as well: `pnpm --filter @atlas/load
 * rtt-probe [--samples 30] [--label "School X lab, MTN 4G"]`. Writes a JSON
 * + markdown result to docs/performance/results/.
 */

const REGIONS = [
  { region: 'eu-west-1', name: 'Ireland', host: 'ec2.eu-west-1.amazonaws.com' },
  { region: 'eu-west-2', name: 'London', host: 'ec2.eu-west-2.amazonaws.com' },
  { region: 'af-south-1', name: 'Cape Town', host: 'ec2.af-south-1.amazonaws.com' },
  { region: 'eu-central-1', name: 'Frankfurt', host: 'ec2.eu-central-1.amazonaws.com' },
] as const;

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}

function tcpConnect(host: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const t0 = performance.now();
    const socket = connect({ host, port: 443, timeout: 10_000 }, () => {
      const ms = performance.now() - t0;
      socket.destroy();
      resolve(ms);
    });
    socket.on('timeout', () => {
      socket.destroy();
      reject(new Error('timeout'));
    });
    socket.on('error', reject);
  });
}

/** Resolves the request time, or undefined when the server closed the
 * previous connection (a new TCP+TLS handshake is not one round trip). */
function httpsHead(host: string, agent: Agent): Promise<number | undefined> {
  return new Promise((resolve, reject) => {
    const t0 = performance.now();
    const req = request({ host, path: '/', method: 'HEAD', agent, timeout: 10_000 }, (res) => {
      res.resume();
      res.on('end', () => resolve(req.reusedSocket ? performance.now() - t0 : undefined));
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    req.end();
  });
}

function pct(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  return (
    Math.round(sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]! * 10) /
    10
  );
}

async function main(): Promise<void> {
  const samples = Number(arg('samples', '30'));
  const label = arg('label', `${hostname()} (unlabelled network)`);
  const rows: Record<string, unknown>[] = [];
  for (const r of REGIONS) {
    const tcp: number[] = [];
    const warm: number[] = [];
    let failures = 0;
    const agent = new Agent({ keepAlive: true, maxSockets: 1 });
    try {
      await httpsHead(r.host, agent).catch(() => undefined); // open + TLS (not measured)
      for (let i = 0; i < samples; i++) {
        try {
          tcp.push(await tcpConnect(r.host));
          const w = await httpsHead(r.host, agent);
          if (w !== undefined) warm.push(w);
        } catch {
          failures += 1;
        }
        await new Promise((res) => setTimeout(res, 200));
      }
    } finally {
      agent.destroy();
    }
    tcp.sort((a, b) => a - b);
    warm.sort((a, b) => a - b);
    const row = {
      region: r.region,
      name: r.name,
      samples,
      failures,
      tcpP50: pct(tcp, 50),
      tcpP95: pct(tcp, 95),
      tcpMin: pct(tcp, 0),
      tcpP90: pct(tcp, 90),
      // A TCP connect over ~1 s means the SYN (or SYN-ACK) was lost and
      // retransmitted after the 1 s initial RTO — a direct packet-loss signal.
      synRetransmits: tcp.filter((ms) => ms > 900).length,
      httpsWarmP50: warm.length ? pct(warm, 50) : null,
    };
    rows.push(row);
    console.log(
      `${r.region.padEnd(13)} ${r.name.padEnd(10)} tcp p50 ${row.tcpP50} ms  p90 ${row.tcpP90} ms  p95 ${row.tcpP95} ms  min ${row.tcpMin} ms  SYN retransmits ${row.synRetransmits}/${samples}  (failures ${failures})`,
    );
  }
  const at = new Date().toISOString();
  const dir = path.resolve(import.meta.dirname, '..', '..', '..', 'docs', 'performance', 'results');
  await mkdir(dir, { recursive: true });
  const base = path.join(dir, `${at.replace(/[:.]/g, '-').slice(0, 19)}-rtt-probe`);
  await writeFile(`${base}.json`, JSON.stringify({ at, label, rows }, null, 2));
  const md = [
    `# ADR-0032 RTT probe — ${label}`,
    '',
    `Measured ${at}, ${samples} samples per region, one every ~200 ms per region. TCP connect ≈ one network round trip (the RTT figure ADR-0032 asks for). A connect over ~1 s is a lost SYN retransmitted after the 1 s initial RTO — counted as a packet-loss signal, and it is what drives p95 when loss is present.`,
    '',
    '| Region | Location | TCP p50 ms | TCP p90 ms | TCP p95 ms | TCP min ms | SYN retransmits | Failures |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ...rows.map(
      (x) =>
        `| ${String(x.region)} | ${String(x.name)} | ${String(x.tcpP50)} | ${String(x.tcpP90)} | ${String(x.tcpP95)} | ${String(x.tcpMin)} | ${String(x.synRetransmits)}/${String(x.samples)} | ${String(x.failures)} |`,
    ),
    '',
  ].join('\n');
  await writeFile(`${base}.md`, md);
  console.log(`→ ${base}.md`);
}

void main();
