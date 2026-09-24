import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { SharedRedisModule } from './redis/redis.module';
import { AiService } from './ai/ai.service';
import { EmbeddingService } from './ai/embedding.service';
import { AiTelemetryService } from './ai/telemetry.service';
import { AIGenerationProcessor } from './queue/processors/ai-generation.processor';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../.env'],
    }),
    PrismaModule,
    SharedRedisModule,
    BullModule.forRoot({
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        password: process.env.REDIS_PASSWORD,
      },
    }),
    BullModule.registerQueue({ name: 'ai-generation' }),
  ],
  providers: [AiService, EmbeddingService, AiTelemetryService, AIGenerationProcessor],
})
export class AiWorkerModule {}
