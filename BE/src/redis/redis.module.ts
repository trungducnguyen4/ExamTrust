import { Module, Global } from '@nestjs/common';
import { RedisModule } from '@liaoliaots/nestjs-redis';
import { buildRedisOptions } from './redis-options';

@Global()
@Module({
  imports: [
    RedisModule.forRoot({
      config: {
        ...buildRedisOptions(),
        retryStrategy: (times: number) => Math.min(times * 50, 2000),
      },
    }),
  ],
  exports: [RedisModule],
})
export class SharedRedisModule {}
