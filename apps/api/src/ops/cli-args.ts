/** Minimal `--key value` / `--flag` parser for the operator CLIs — no
 * dependency for a dozen lines (AGENTS.md §9). */
export function parseArgs(argv: string[]): Record<string, string | true> {
  const out: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      out[key] = true;
    } else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
}

export function requireArg(args: Record<string, string | true>, key: string): string {
  const v = args[key];
  if (typeof v !== 'string' || v.trim() === '') {
    throw new Error(`--${key} is required.`);
  }
  return v.trim();
}

/** The operator acting must be a live Software Admin — the CLI is the
 * same authority as the platform console, not a way around it. */
export async function assertSoftwareAdmin(
  prisma: { user: { findFirst(args: unknown): Promise<unknown> } },
  userId: string,
): Promise<void> {
  const admin = await prisma.user.findFirst({
    where: {
      id: userId,
      status: 'ACTIVE',
      platformRoleAssignments: { some: { status: 'ACTIVE', role: 'SOFTWARE_ADMIN' } },
    },
    select: { id: true },
  });
  if (!admin) throw new Error(`--actor ${userId} is not an active Software Admin.`);
}
