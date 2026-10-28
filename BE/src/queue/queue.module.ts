import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { QueueService } from './queue.service';
import { IntegrityLogsProcessor } from './processors/integrity-logs.processor';
import { GradingProcessor } from './processors/grading.processor';
import { EventsProcessor } from './processors/events.processor';
import { AIGenerationProcessor } from './processors/ai-generation.processor';
import { PrismaModule } from '../prisma/prisma.module';
import { EventsModule } from '../events/events.module';
import { AiModule } from '../ai/ai.module';
import { buildRedisOptions } from '../redis/redis-options';

@Module({
  imports: [
    BullModule.forRoot({
      redis: buildRedisOptions(),
    }),
    BullModule.registerQueue(
      { name: 'integrity-logs' },
      { name: 'grading' },
      { name: 'events' },
      { name: 'ai-generation' },
    ),
    PrismaModule,
    forwardRef(() => AiModule),
    // events module used for realtime pub/sub
    EventsModule,
  ],
  providers: [
    QueueService,
    IntegrityLogsProcessor,
    GradingProcessor,
    EventsProcessor,
    AIGenerationProcessor,
  ],
  exports: [QueueService],
})
export class QueueModule {}
