import { IsNumber, IsObject, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class GenerateQuestionDto {
  @IsString()
  @MaxLength(2000)
  prompt: string;

  @IsOptional()
  @IsString()
  questionType?: string; // MULTIPLE_CHOICE, TRUE_FALSE, ESSAY, etc.

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  difficulty?: number;

  @IsOptional()
  @IsString()
  language?: string; // UI/response preference; question output follows the explicit prompt language request.

  @IsOptional()
  @IsString()
  courseName?: string;

  @IsOptional()
  @IsString()
  useCase?: string; // 'exam' | 'question_bank'

  @IsOptional()
  @IsObject()
  context?: Record<string, any>;
}

export class GenerateExamQuestionsDto {
  @IsString()
  @MaxLength(2000)
  prompt: string;

  @IsNumber()
  @Min(1)
  @Max(50)
  questionCount: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  difficulty?: number; // 0.3 | 0.5 | 0.7

  @IsOptional()
  @IsString()
  questionType?: string;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsString()
  courseName?: string;

  @IsOptional()
  @IsString()
  useCase?: string; // 'exam' | 'question_bank'

  @IsOptional()
  @IsString()
  courseId?: string;

  @IsOptional()
  @IsObject()
  context?: Record<string, any>;
}

export class SuggestSimilarTopicsDto {
  @IsUUID()
  courseId: string;

  @IsString()
  topicName: string;

  @IsOptional()
  @IsString()
  topicDescription?: string;

  @IsOptional()
  @IsString()
  language?: string;

}
