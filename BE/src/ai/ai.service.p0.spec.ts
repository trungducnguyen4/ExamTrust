import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { AIGenerateSectionDto, AISection } from '../questions-v2/dto/question-draft.dto';
import { GenerateQuestionDto, GenerateExamQuestionsDto } from './dto/generate-question.dto';
import { AIGenerationProcessor } from '../queue/processors/ai-generation.processor';
import { AiService } from './ai.service';

describe('P0 Hotfix Verification Suite', () => {
  describe('Case 1: AI Provider Timeout Handling', () => {
    let aiService: AiService;
    const originalFetch = global.fetch;

    beforeEach(() => {
      const configService = {
        get: jest.fn((key: string) => {
          if (key === 'AI_LOCAL_URL') return 'http://127.0.0.1:11434/api/generate';
          if (key === 'AI_OLLAMA_URL') return 'http://127.0.0.1:11434';
          if (key === 'AI_PROVIDER') return 'local';
          return undefined;
        }),
      };
      const redisService = {
        getOrThrow: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(null) }),
      };

      aiService = new AiService(configService as any, redisService as any);
    });

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it('converts fetch TimeoutError into a controlled service error', async () => {
      global.fetch = jest.fn().mockRejectedValue({
        name: 'TimeoutError',
        message: 'The operation was aborted due to timeout',
      });

      await expect((aiService as any)._callLocal('Test prompt')).rejects.toThrow(
        'Máy chủ mô hình cục bộ timed out sau 60000ms',
      );
    });

    it('converts Ollama fetch AbortError into a controlled service error', async () => {
      global.fetch = jest.fn().mockRejectedValue({
        name: 'AbortError',
        message: 'The operation was aborted',
      });

      await expect((aiService as any)._callOllama('Test prompt')).rejects.toThrow(
        'Ollama request timed out after 60000ms',
      );
    });
  });

  describe('Case 2: Malformed JSON Handling (Graceful degradation)', () => {
    let aiService: AiService;

    beforeEach(() => {
      const configService = { get: jest.fn().mockReturnValue(undefined) };
      const redisService = {
        getOrThrow: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(null) }),
      };
      aiService = new AiService(configService as any, redisService as any);
    });

    it('fails gracefully when LLM returns completely invalid JSON without crashing process', async () => {
      const invalidOutput = '{ this is definitely not valid json and cannot be repaired }}}';

      await expect(
        (aiService as any).safeJsonParse(invalidOutput, 'testOperation'),
      ).rejects.toThrow('AI trả về JSON không hợp lệ trong tác vụ testOperation');
    });

    it('does not leak long/sensitive input strings in the thrown error message', async () => {
      const sensitiveAnswer = 'SECRET_STUDENT_DATA_12345'.repeat(20);
      const invalidJson = `{ ${sensitiveAnswer} is definitely invalid and broken }}}`;

      let caughtError: Error | null = null;
      try {
        await (aiService as any).safeJsonParse(invalidJson, 'gradingContext');
      } catch (error: any) {
        caughtError = error;
      }

      expect(caughtError).not.toBeNull();
      expect(caughtError?.message).not.toContain('SECRET_STUDENT_DATA_12345');
      expect(caughtError?.message).toContain('AI trả về JSON không hợp lệ');
    });
  });

  describe('Case 3: Valid and Auto-Repaired JSON Handling (Normal flow)', () => {
    let aiService: AiService;

    beforeEach(() => {
      const configService = { get: jest.fn().mockReturnValue(undefined) };
      const redisService = {
        getOrThrow: jest.fn().mockReturnValue({ get: jest.fn().mockResolvedValue(null) }),
      };
      aiService = new AiService(configService as any, redisService as any);
    });

    it('successfully parses valid pure JSON', async () => {
      const input = JSON.stringify({ question: 'What is 1+1?', answer: '2' });
      const result = await (aiService as any).safeJsonParse(input, 'test');
      expect(result).toEqual({ question: 'What is 1+1?', answer: '2' });
    });

    it('strips markdown code fences from LLM output', async () => {
      const input = '```json\n{"status": "ok", "items": [1, 2, 3]}\n```';
      const result = await (aiService as any).safeJsonParse(input, 'test');
      expect(result).toEqual({ status: 'ok', items: [1, 2, 3] });
    });

    it('auto-repairs JSON with trailing commas using jsonrepair', async () => {
      const input = '{"name": "test", "items": [1, 2, ],}';
      const result = await (aiService as any).safeJsonParse(input, 'test');
      expect(result).toEqual({ name: 'test', items: [1, 2] });
    });
  });

  describe('Case 4: Queue Job Retry Status Lifecycle', () => {
    const buildProcessor = () => {
      const prisma = {
        aIGenerationRecord: {
          findUnique: jest.fn().mockResolvedValue({ id: 'job-123', status: 'QUEUED' }),
          update: jest.fn().mockResolvedValue({}),
        },
      };
      const aiService = {
        syncProviderFromRedis: jest.fn().mockResolvedValue(undefined),
        generateExamQuestions: jest.fn().mockRejectedValue(new Error('Provider temporary 503 error')),
      };
      const config = { get: jest.fn().mockReturnValue(undefined) };
      const processor = new AIGenerationProcessor(prisma as any, aiService as any, config as any);
      return { processor, prisma, aiService };
    };

    it('does NOT set status=FAILED prematurely when attempts remain (Attempt 1 of 3)', async () => {
      const { processor, prisma } = buildProcessor();

      const job: any = {
        data: {
          jobId: 'job-123',
          task: 'exam-questions',
          payload: { prompt: 'Math quiz', count: 5 },
        },
        opts: { attempts: 3 },
        attemptsMade: 0, // First attempt (1 of 3)
      };

      await expect(processor.process(job)).rejects.toThrow('Provider temporary 503 error');

      // Must update errorMessage but NOT status: 'FAILED'
      expect(prisma.aIGenerationRecord.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'job-123' },
          data: expect.objectContaining({
            errorMessage: expect.stringContaining('Attempt 1/3 failed'),
          }),
        }),
      );

      // Verify status: 'FAILED' was NOT set on attempt 1
      const updateCalls = prisma.aIGenerationRecord.update.mock.calls;
      const failedCall = updateCalls.find((call: any) => call[0]?.data?.status === 'FAILED');
      expect(failedCall).toBeUndefined();
    });

    it('sets status=FAILED and completedAt only on the final attempt (Attempt 3 of 3)', async () => {
      const { processor, prisma } = buildProcessor();

      const job: any = {
        data: {
          jobId: 'job-123',
          task: 'exam-questions',
          payload: { prompt: 'Math quiz', count: 5 },
        },
        opts: { attempts: 3 },
        attemptsMade: 2, // 3rd attempt out of 3 -> final!
      };

      await expect(processor.process(job)).rejects.toThrow('Provider temporary 503 error');

      expect(prisma.aIGenerationRecord.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'job-123' },
          data: expect.objectContaining({
            status: 'FAILED',
            errorMessage: expect.stringContaining('Provider temporary 503 error'),
            completedAt: expect.any(Date),
          }),
        }),
      );
    });
  });

  describe('Case 5: DTO MaxLength(2000) Validation', () => {
    it('rejects AIGenerateSectionDto when instruction exceeds 2000 characters', async () => {
      const longInstruction = 'A'.repeat(2001);
      const dto = plainToInstance(AIGenerateSectionDto, {
        section: AISection.CONTENT,
        instruction: longInstruction,
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      const instructionError = errors.find((e) => e.property === 'instruction');
      expect(instructionError).toBeDefined();
      expect(instructionError?.constraints?.maxLength).toBeDefined();
    });

    it('accepts AIGenerateSectionDto when instruction is within 2000 characters', async () => {
      const validInstruction = 'A'.repeat(2000);
      const dto = plainToInstance(AIGenerateSectionDto, {
        section: AISection.CONTENT,
        instruction: validInstruction,
      });

      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('rejects GenerateQuestionDto when prompt exceeds 2000 characters', async () => {
      const longPrompt = 'B'.repeat(2001);
      const dto = plainToInstance(GenerateQuestionDto, {
        prompt: longPrompt,
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      const promptError = errors.find((e) => e.property === 'prompt');
      expect(promptError).toBeDefined();
      expect(promptError?.constraints?.maxLength).toBeDefined();
    });

    it('rejects GenerateExamQuestionsDto when prompt exceeds 2000 characters', async () => {
      const longPrompt = 'C'.repeat(2001);
      const dto = plainToInstance(GenerateExamQuestionsDto, {
        prompt: longPrompt,
        questionCount: 10,
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      const promptError = errors.find((e) => e.property === 'prompt');
      expect(promptError).toBeDefined();
      expect(promptError?.constraints?.maxLength).toBeDefined();
    });
  });
});
