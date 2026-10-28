import { buildRedisOptions } from './redis-options';

describe('buildRedisOptions', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.REDIS_URL;
    delete process.env.REDIS_HOST;
    delete process.env.REDIS_PORT;
    delete process.env.REDIS_PASSWORD;
    delete process.env.REDIS_TLS;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('falls back to localhost when nothing is configured', () => {
    expect(buildRedisOptions()).toEqual({
      host: 'localhost',
      port: 6379,
      password: undefined,
    });
  });

  it('keeps the legacy host/port/password settings working', () => {
    process.env.REDIS_HOST = 'redis';
    process.env.REDIS_PORT = '6380';
    process.env.REDIS_PASSWORD = 'secret';

    expect(buildRedisOptions()).toMatchObject({
      host: 'redis',
      port: 6380,
      password: 'secret',
    });
  });

  it('enables TLS for rediss:// URLs (Aiven, Upstash)', () => {
    process.env.REDIS_URL = 'rediss://default:dummy%40value@redis.example.invalid:12345';

    expect(buildRedisOptions()).toEqual({
      host: 'redis.example.invalid',
      port: 12345,
      username: 'default',
      password: 'dummy@value',
      db: undefined,
      tls: { servername: 'redis.example.invalid' },
    });
  });

  it('does not add TLS for plain redis:// URLs', () => {
    process.env.REDIS_URL = 'redis://:secret@redis.internal:6379/2';

    const options = buildRedisOptions();

    expect(options.host).toBe('redis.internal');
    expect(options.db).toBe(2);
    expect(options.tls).toBeUndefined();
  });

  it('ignores a malformed REDIS_URL instead of crashing', () => {
    process.env.REDIS_URL = 'not a url';
    process.env.REDIS_HOST = 'fallback-host';

    expect(buildRedisOptions()).toMatchObject({ host: 'fallback-host' });
  });
});
