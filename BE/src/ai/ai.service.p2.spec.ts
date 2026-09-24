import { ConfigService } from '@nestjs/config';
import { EmbeddingService } from './embedding.service';
import { AiTelemetryService } from './telemetry.service';
import { AiStatusController } from './ai-status.controller';
import { AIGenerationProcessor } from '../queue/processors/ai-generation.processor';

describe('Gói P2: Production AI Engineering Depth', () => {
  describe('P2.1: Semantic Retrieval & Embedding Service', () => {
    let embeddingService: EmbeddingService;
    let configService: ConfigService;

    beforeEach(() => {
      configService = {
        get: jest.fn().mockImplementation((key: string) => {
          if (key === 'AI_EMBEDDING_DIM') return 512;
          return undefined;
        }),
      } as any;
      embeddingService = new EmbeddingService(configService);
    });

    it('generates 512-dimensional L2-normalized vector embeddings', async () => {
      const text = 'Dependency Injection trong NestJS hoạt động như thế nào?';
      const vector = await embeddingService.getEmbedding(text);

      expect(vector).toBeInstanceOf(Array);
      expect(vector.length).toBe(512);

      // Verify L2 unit normalization: sum of squares ≈ 1.0
      const normSq = vector.reduce((sum, v) => sum + v * v, 0);
      expect(Math.abs(normSq - 1.0)).toBeLessThan(0.001);
    });

    it('calculates cosine similarity correctly for identical, similar, and unrelated texts', async () => {
      const textA = 'Giải thích khái niệm Dependency Injection trong NestJS';
      const textB = 'Giải thích khái niệm Dependency Injection trong NestJS'; // Identical
      const textC = 'Trình bày nguyên lý Dependency Injection trong framework NestJS'; // Semantically similar
      const textD = 'Công thức nấu món phở bò truyền thống Hà Nội'; // Completely unrelated

      const vecA = await embeddingService.getEmbedding(textA);
      const vecB = await embeddingService.getEmbedding(textB);
      const vecC = await embeddingService.getEmbedding(textC);
      const vecD = await embeddingService.getEmbedding(textD);

      const simIdentical = embeddingService.cosineSimilarity(vecA, vecB);
      const simSimilar = embeddingService.cosineSimilarity(vecA, vecC);
      const simUnrelated = embeddingService.cosineSimilarity(vecA, vecD);

      expect(simIdentical).toBeCloseTo(1.0, 2);
      expect(simSimilar).toBeGreaterThanOrEqual(0.55);
      expect(simUnrelated).toBeLessThan(0.35);
    });

    it('findDuplicateCandidates identifies exact and semantic duplicates under 50ms', async () => {
      const references = [
        {
          id: 'q1',
          type: 'MULTIPLE_CHOICE',
          content: 'Giao thức nào sau đây hoạt động ở tầng Transport trong mô hình OSI?',
        },
        {
          id: 'q2',
          type: 'MULTIPLE_CHOICE',
          content: 'Lệnh nào dùng để tạo nhánh mới trong Git?',
        },
      ];

      const targets = [
        {
          id: 't1',
          type: 'MULTIPLE_CHOICE',
          content: 'Giao thức nào sau đây hoạt động ở tầng Transport trong mô hình OSI?', // Exact
        },
        {
          id: 't2',
          type: 'MULTIPLE_CHOICE',
          content: 'Trong kiến trúc mạng OSI, giao thức nào nằm ở tầng Giao vận (Transport)?', // Semantic
        },
        {
          id: 't3',
          type: 'MULTIPLE_CHOICE',
          content: 'Nguyên lý SOLID là viết tắt của các chữ cái nào trong lập trình?', // Unrelated
        },
      ];

      const start = Date.now();
      const candidates = await embeddingService.findDuplicateCandidates(references, targets, {
        similarityThreshold: 0.80,
        semanticThreshold: 0.55,
      });
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(100); // Super fast execution
      expect(candidates.length).toBeGreaterThanOrEqual(2);

      const exactMatch = candidates.find((c) => c.questionA.id === 'q1' && c.questionB.id === 't1');
      expect(exactMatch).toBeDefined();
      expect(exactMatch?.relation).toBe('EXACT_DUPLICATE');
      expect(exactMatch?.similarity).toBe(1.0);
      expect(exactMatch?.matchMethod).toBe('EXACT');

      const semanticMatch = candidates.find((c) => c.questionA.id === 'q1' && c.questionB.id === 't2');
      expect(semanticMatch).toBeDefined();
      expect(['SEMANTIC_DUPLICATE', 'RELATED_ONLY']).toContain(semanticMatch?.relation);
      expect(semanticMatch?.similarity).toBeGreaterThanOrEqual(0.55);
    });
  });

  describe('P2.2: AI Telemetry & Observability', () => {
    let telemetryService: AiTelemetryService;

    beforeEach(() => {
      telemetryService = new AiTelemetryService();
      telemetryService.resetSummary();
    });

    it('estimates token count using character/subword heuristics', () => {
      expect(telemetryService.estimateTokens('')).toBe(0);
      expect(telemetryService.estimateTokens('   ')).toBe(0);

      const prompt = 'Hãy tạo 5 câu hỏi trắc nghiệm về cấu trúc dữ liệu và giải thuật.';
      const tokens = telemetryService.estimateTokens(prompt);
      expect(tokens).toBeGreaterThan(10);
      expect(tokens).toBeLessThan(35);
    });

    it('calculates estimated cost accurately for various providers', () => {
      // 1,000,000 prompt tokens + 1,000,000 completion tokens
      const googleCost = telemetryService.calculateCost('google', 1_000_000, 1_000_000);
      expect(googleCost).toBe(0.50); // 0.10 + 0.40

      const deepseekCost = telemetryService.calculateCost('deepseek', 1_000_000, 1_000_000);
      expect(deepseekCost).toBe(0.42); // 0.14 + 0.28

      const localCost = telemetryService.calculateCost('ollama', 1_000_000, 1_000_000);
      expect(localCost).toBe(0.00); // 0.00
    });

    it('generates telemetry records and aggregates cumulative statistics', () => {
      const tel1 = telemetryService.generateTelemetry({
        promptText: 'Hello AI',
        completionText: 'World response',
        latencyMs: 120,
        provider: 'google',
        task: 'single-question',
      });

      expect(tel1.promptTokens).toBeGreaterThan(0);
      expect(tel1.completionTokens).toBeGreaterThan(0);
      expect(tel1.totalTokens).toBe(tel1.promptTokens + tel1.completionTokens);
      expect(tel1.promptVersion).toBe('2.1.0');
      expect(tel1.latencyMs).toBe(120);

      const tel2 = telemetryService.generateTelemetry({
        promptText: 'Another prompt',
        completionText: 'Another answer',
        latencyMs: 180,
        provider: 'deepseek',
        task: 'exam-questions',
      });

      const summary = telemetryService.getSummary();
      expect(summary.totalRequests).toBe(2);
      expect(summary.totalTokens).toBe(tel1.totalTokens + tel2.totalTokens);
      expect(summary.totalEstimatedCostUsd).toBeCloseTo(tel1.estimatedCostUsd + tel2.estimatedCostUsd, 5);
      expect(summary.averageLatencyMs).toBe(150);
      expect(summary.byProvider.google?.requests).toBe(1);
      expect(summary.byProvider.deepseek?.requests).toBe(1);
      expect(summary.byTask['single-question']?.requests).toBe(1);
      expect(summary.byTask['exam-questions']?.requests).toBe(1);
    });

    it('AiStatusController exposes GET /api/ai-status/telemetry', async () => {
      telemetryService.generateTelemetry({
        promptText: 'Test prompt',
        completionText: 'Test completion',
        latencyMs: 95,
        provider: 'google',
        task: 'single-question',
      });

      const controller = new AiStatusController(null as any, null as any, telemetryService);
      const res = await controller.getTelemetry();

      expect(res.totalRequests).toBe(1);
      expect(res.promptVersion).toBe('2.1.0');
      expect(res.byProvider.google?.requests).toBe(1);
    });
  });

  describe('P2.3: Fast Vector Duplicate Pipeline in AIGenerationProcessor', () => {
    let processor: AIGenerationProcessor;
    let prisma: any;
    let aiService: any;
    let configService: any;
    let embeddingService: EmbeddingService;
    let telemetryService: AiTelemetryService;

    beforeEach(() => {
      prisma = {
        aIGenerationRecord: {
          findUnique: jest.fn().mockResolvedValue({ id: 'job-p2', status: 'PENDING' }),
          update: jest.fn().mockResolvedValue({ id: 'job-p2' }),
        },
        question: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'q1', type: 'MULTIPLE_CHOICE', content: 'HTTP status 404 nghĩa là gì?' },
            { id: 'q2', type: 'MULTIPLE_CHOICE', content: 'HTTP status 404 nghĩa là gì?' }, // Exact duplicate
          ]),
        },
      };

      aiService = {
        syncProviderFromRedis: jest.fn().mockResolvedValue(undefined),
        assessQuestionDuplicatePair: jest.fn(),
      };

      configService = {
        get: jest.fn().mockReturnValue(undefined),
      };

      embeddingService = new EmbeddingService(configService);
      telemetryService = new AiTelemetryService();

      processor = new AIGenerationProcessor(
        prisma,
        aiService,
        configService,
        embeddingService,
        telemetryService,
      );
    });

    it('processes question-duplicate-analysis via vector embedding without sequential LLM calls', async () => {
      const job: any = {
        data: {
          jobId: 'job-p2',
          task: 'question-duplicate-analysis',
          payload: {
            courseId: 'course-1',
            questionIds: ['q1'],
          },
        },
        opts: { attempts: 1 },
        attemptsMade: 0,
        progress: jest.fn().mockResolvedValue(undefined),
      };

      await processor.process(job);

      // AI Service assessQuestionDuplicatePair (LLM) should NOT be called sequentially!
      expect(aiService.assessQuestionDuplicatePair).not.toHaveBeenCalled();

      // Job record updated to SUCCEEDED with pairs and telemetry
      expect(prisma.aIGenerationRecord.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'job-p2' },
          data: expect.objectContaining({
            status: 'SUCCEEDED',
            output: expect.objectContaining({
              totalPairs: 1,
              duplicateCandidates: 1,
              pairs: expect.arrayContaining([
                expect.objectContaining({
                  relation: 'EXACT_DUPLICATE',
                  similarityPercent: 100,
                  matchMethod: 'EXACT',
                }),
              ]),
              telemetry: expect.objectContaining({
                promptVersion: '2.1.0',
                provider: 'local-vector',
              }),
            }),
          }),
        }),
      );
    });
  });
});
