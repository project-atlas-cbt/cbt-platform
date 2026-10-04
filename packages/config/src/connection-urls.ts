/**
 * B23: on AWS the database passwords and the cache auth token live in Secrets Manager (generated and
 * rotated there) and ECS injects each one as its own variable — a secret
 * cannot be templated into a connection URL. When `DATABASE_HOST` is set,
 * the three role URLs the schema requires are composed here from parts
 * (and `REDIS_URL` from `REDIS_HOST` + `REDIS_AUTH_TOKEN`, below);
 * an explicitly-set URL always wins, so local `.env` files and CI are
 * unaffected.
 *
 * The owner (migration) URL may target a different host: migrations go to
 * the instance directly (`DATABASE_OWNER_HOST`), while the running
 * application goes through RDS Proxy (`DATABASE_HOST`).
 */
const ROLES = [
  { url: 'DATABASE_URL', prefix: 'DATABASE_OWNER', defaultUser: 'atlas', ownerHost: true },
  { url: 'DATABASE_APP_URL', prefix: 'DATABASE_APP', defaultUser: 'atlas_app', ownerHost: false },
  {
    url: 'DATABASE_AUDIT_READER_URL',
    prefix: 'DATABASE_AUDIT_READER',
    defaultUser: 'atlas_audit_reader',
    ownerHost: false,
  },
] as const;

export function composeDatabaseUrls(env: NodeJS.ProcessEnv = process.env): void {
  const host = env.DATABASE_HOST;
  if (!host) return;
  const port = env.DATABASE_PORT || '5432';
  const name = env.DATABASE_NAME || 'atlas';
  const sslmode = env.DATABASE_SSLMODE || 'require';
  for (const role of ROLES) {
    if (env[role.url]) continue;
    const password = env[`${role.prefix}_PASSWORD`];
    if (!password) continue; // the schema then reports the missing URL by name
    const user = env[`${role.prefix}_USER`] || role.defaultUser;
    const roleHost = role.ownerHost ? env.DATABASE_OWNER_HOST || host : host;
    env[role.url] =
      `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}` +
      `@${roleHost}:${port}/${encodeURIComponent(name)}?sslmode=${encodeURIComponent(sslmode)}`;
  }
}

/** ElastiCache (Valkey) with in-transit encryption and an AUTH token. */
export function composeRedisUrl(env: NodeJS.ProcessEnv = process.env): void {
  if (env.REDIS_URL || !env.REDIS_HOST || !env.REDIS_AUTH_TOKEN) return;
  const port = env.REDIS_PORT || '6379';
  env.REDIS_URL = `rediss://:${encodeURIComponent(env.REDIS_AUTH_TOKEN)}@${env.REDIS_HOST}:${port}`;
}

/** Everything `loadRootEnv` composes, in one call. */
export function composeConnectionUrls(env: NodeJS.ProcessEnv = process.env): void {
  composeDatabaseUrls(env);
  composeRedisUrl(env);
}
