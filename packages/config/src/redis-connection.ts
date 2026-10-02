/**
 * B20 (08 §16 "encrypt sensitive traffic in transit"): BullMQ connection
 * options derived from REDIS_URL *completely* — host, port, credentials,
 * database index, and TLS for `rediss://`. Every queue/worker previously
 * hand-built `{ host, port }`, silently dropping the password and the TLS
 * requirement production enforces (env.schema.ts), so queue traffic would
 * have been the one Redis path left unauthenticated and in plaintext.
 */
export interface RedisConnectionOptions {
  host: string;
  port: number;
  username?: string;
  password?: string;
  db?: number;
  tls?: Record<string, never>;
}

export function redisConnectionFromUrl(redisUrl: string): RedisConnectionOptions {
  const url = new URL(redisUrl);
  const db = url.pathname.length > 1 ? Number(url.pathname.slice(1)) : undefined;
  return {
    host: url.hostname,
    port: Number(url.port) || 6379,
    ...(url.username && { username: decodeURIComponent(url.username) }),
    ...(url.password && { password: decodeURIComponent(url.password) }),
    ...(db !== undefined && Number.isInteger(db) && { db }),
    ...(url.protocol === 'rediss:' && { tls: {} }),
  };
}
