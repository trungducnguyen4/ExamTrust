import {
  IsArray,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum QuestionDraftMode {
  MANUAL = 'MANUAL',
  AI_ASSISTED = 'AI_ASSISTED',
  DUPLICATE = 'DUPLICATE',
}

export enum QuestionDraftStepKey {
  INTENT = 'intent',
  CONTENT = 'content',
  ANSWERS = 'answers',
  CLASSIFICATION = 'classification',
  REVIEW = 'review',
}

export enum AISection {
  CONTENT = 'CONTENT',
  ANSWERS = 'ANSWERS',
  EXPLANATION = 'EXPLANATION',
  CLASSIFICATION = 'CLASSIFICATION',
  QUALITY_REVIEW = 'QUALITY_REVIEW',
  RISK_ASSESSMENT = 'RISK_ASSESSMENT',
}

export enum DraftValidationLevel {
  SOFT = 'SOFT',
  STRICT = 'STRICT',
}

export enum DraftPublishMode {
  IN_REVIEW = 'IN_REVIEW',
  PUBLISHED = 'PUBLISHED',
}

export class CreateQuestionDraftDto {
  @IsEnum(QuestionDraftMode)
  mode: QuestionDraftMode;

  @IsOptional()
  @IsString()
  questionType?: string;

  @IsOptional()
  @IsString()
  sourceQuestionId?: string;

  @IsOptional()
  @IsObject()
  initialContext?: Record<string, any>;
}

export class SaveDraftStepDto {
  @IsInt()
  @Min(1)
  autosaveVersion: number;

  @IsObject()
  data: Record<string, any>;
}

export class AIGenerationConstraintsDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  difficulty?: number;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(8)
  optionCount?: number;

  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(4000)
  maxLength?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  forbiddenTerms?: string[];
}

export class AIGenerateSectionDto {
  @IsEnum(AISection)
  section: AISection;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  instruction?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => AIGenerationConstraintsDto)
  constraints?: AIGenerationConstraintsDto;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3)
  variants?: number;
}

export class ApplyAICandidateDto {
  @IsString()
  jobId: string;

  @IsString()
  candidateId: string;

  @IsEnum(AISection)
  section: AISection;
}

export class ValidateQuestionDraftDto {
  @IsOptional()
  @IsEnum(DraftValidationLevel)
  level?: DraftValidationLevel;
}

export class PublishQuestionDraftDto {
  @IsInt()
  @Min(1)
  expectedAutosaveVersion: number;

  @IsOptional()
  @IsEnum(DraftPublishMode)
  publishMode?: DraftPublishMode;
}
