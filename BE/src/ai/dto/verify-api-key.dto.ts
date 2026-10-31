import { IsOptional, IsString, MaxLength } from 'class-validator';

export class VerifyApiKeyDto {
  @IsString()
  @MaxLength(1000)
  apiKey: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  provider?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  model?: string;
}

export interface VerifyApiKeyResult {
  valid: boolean;
  provider: string;
  providerName: string;
  detectedProvider?: string;
  model?: string;
  responseTimeMs: number;
  message: string;
  error?: string;
  details?: Record<string, any>;
}
