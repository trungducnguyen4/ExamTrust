import { Module, forwardRef } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';
import { AiStatusController } from './ai-status.controller';
import { AiJobsService } from './ai-jobs.service';
import { EmbeddingService } from './embedding.service';
import { AiTelemetryService } from './telemetry.service';
import { PrismaModule } from '../prisma/prisma.module';
import { QueueModule } from '../queue/queue.module';
import { AccessPolicyService } from '../common/services/access-policy.service';

@Module({
  imports: [PrismaModule, forwardRef(() => QueueModule)],
  controllers: [AiController, AiStatusController],
  providers: [AiService, AiJobsService, AccessPolicyService, EmbeddingService, AiTelemetryService],
  exports: [AiService, AiJobsService, EmbeddingService, AiTelemetryService],
})
export class AiModule {}
