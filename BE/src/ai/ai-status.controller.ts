import { BadRequestException, Body, Controller, ForbiddenException, Get, Headers, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';
import { AiService } from './ai.service';
import { AiTelemetryService } from './telemetry.service';

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a ?? '', 'utf8');
  const bufB = Buffer.from(b ?? '', 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

@ApiTags('AI')
@Controller('ai-status')
export class AiStatusController {
  constructor(
    private readonly aiService: AiService,
    private readonly configService: ConfigService,
    private readonly telemetryService: AiTelemetryService,
  ) {}

  // Unauthenticated on purpose: only exposes which AI provider/model is
  // active (no keys, no user data) so ops tooling (e.g. the Zalo bot) can
  // display it.
  @Get()
  getStatus() {
    return this.aiService.getProviderStatus();
  }

  @Get('telemetry')
  getTelemetry() {
    return this.telemetryService.getSummary();
  }

  // Authenticated by a shared-secret header (AI_SWITCH_SECRET), not JWT —
  // the caller is the Zalo bot's Lambda, not a logged-in user, mirroring how
  // the Lambda itself verifies ZALO_WEBHOOK_SECRET for inbound messages.
  @Post('switch-provider')
  async switchProvider(
    @Headers('x-ai-switch-secret') secret: string,
    @Body('provider') provider: string,
  ) {
    const expected = this.configService.get<string>('AI_SWITCH_SECRET');
    if (!expected || !secret || !safeEqual(secret, expected)) {
      throw new ForbiddenException('Invalid or missing switch secret.');
    }
    if (!provider) {
      throw new BadRequestException('Missing "provider" in request body.');
    }
    try {
      await this.aiService.setProvider(provider);
    } catch (error: any) {
      throw new BadRequestException(error?.message || 'Could not switch AI provider.');
    }
    return this.aiService.getProviderStatus();
  }
}
