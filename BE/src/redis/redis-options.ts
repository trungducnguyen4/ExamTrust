import type { RedisOptions } from 'ioredis';

/**
 * Connection options shared by every Redis client in the backend
 * (`@liaoliaots/nestjs-redis`, BullMQ and the services that inject the client).
 *
 * Managed providers (Aiven, Upstash, Redis Cloud, ...) hand out a single
 * `rediss://` URI instead of host/port/password and require TLS. `REDIS_URL`
 * therefore takes precedence, while the legacy `REDIS_HOST` / `REDIS_PORT` /
 * `REDIS_PASSWORD` trio keeps docker-compose and local development unchanged.
 */
export function buildRedisOptions(): RedisOptions {
  const url = process.env.REDIS_URL?.trim();

  if (url) {
    try {
      const parsed = new URL(url);
      const secure = parsed.protocol === 'rediss:';
      const dbFromPath = parsed.pathname.replace(/^\//, '');

      return {
        host: parsed.hostname,
        port: parsed.port ? Number(parsed.port) : 6379,
        username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
        password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
        db: dbFromPath ? Number(dbFromPath) : undefined,
        // `rediss://` is TLS-on-connect; ioredis needs an explicit `tls` object.
        ...(secure ? { tls: { servername: parsed.hostname } } : {}),
      };
    } catch {
      // A malformed REDIS_URL falls through to the discrete settings below so a
      // typo cannot make the process crash before it can log anything useful.
    }
  }

  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
    ...(process.env.REDIS_TLS === 'true' ? { tls: {} } : {}),
  };
}
