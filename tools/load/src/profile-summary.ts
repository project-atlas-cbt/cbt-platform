import { readFile } from 'node:fs/promises';

/**
 * Summarises a V8 `.cpuprofile` (from `node --cpu-prof`) by self time:
 * which packages and which functions the API's CPU actually goes to under
 * load. Usage: `tsx src/profile-summary.ts <file.cpuprofile> [topN]`.
 */

interface ProfileNode {
  id: number;
  callFrame: { functionName: string; url: string; lineNumber: number };
  children?: number[];
}

interface Profile {
  nodes: ProfileNode[];
  samples: number[];
  timeDeltas: number[];
}

function packageOf(url: string): string {
  if (!url) return '(native/idle)';
  const nm = url.lastIndexOf('node_modules/');
  if (nm >= 0) {
    const rest = url.slice(nm + 'node_modules/'.length).split('/');
    return rest[0]!.startsWith('@') ? `${rest[0]}/${rest[1]}` : rest[0]!;
  }
  if (url.startsWith('node:')) return 'node-core';
  const m = /\/(apps|packages)\/([^/]+)\//.exec(url);
  return m ? `${m[1]}/${m[2]}` : url.slice(-60);
}

async function main(): Promise<void> {
  const file = process.argv[2];
  const top = Number(process.argv[3] ?? 25);
  if (!file) throw new Error('usage: profile-summary <file.cpuprofile> [topN]');
  const profile = JSON.parse(await readFile(file, 'utf8')) as Profile;
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const self = new Map<number, number>();
  profile.samples.forEach((id, i) =>
    self.set(id, (self.get(id) ?? 0) + (profile.timeDeltas[i] ?? 0)),
  );
  const total = [...self.values()].reduce((a, b) => a + b, 0);

  const byPackage = new Map<string, number>();
  const byFunction = new Map<string, number>();
  for (const [id, us] of self) {
    const node = byId.get(id)!;
    const { functionName, url, lineNumber } = node.callFrame;
    const pkg =
      functionName === '(idle)' ||
      functionName === '(program)' ||
      functionName === '(garbage collector)'
        ? functionName
        : packageOf(url.replace(/\\/g, '/'));
    byPackage.set(pkg, (byPackage.get(pkg) ?? 0) + us);
    const key = `${functionName || '(anonymous)'} ${packageOf(url.replace(/\\/g, '/'))}:${lineNumber}`;
    byFunction.set(key, (byFunction.get(key) ?? 0) + us);
  }
  const pct = (us: number) => `${((us / total) * 100).toFixed(1)}%`;
  console.log(`total sampled: ${(total / 1e6).toFixed(1)} s`);
  console.log('\n# self time by package');
  for (const [k, v] of [...byPackage].sort((a, b) => b[1] - a[1]).slice(0, top))
    console.log(`${pct(v).padStart(6)}  ${k}`);
  console.log('\n# self time by function');
  for (const [k, v] of [...byFunction].sort((a, b) => b[1] - a[1]).slice(0, top))
    console.log(`${pct(v).padStart(6)}  ${k}`);
}

void main();
