import { Injectable, Logger } from '@nestjs/common';

export interface AITelemetry {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  latencyMs: number;
  promptVersion: string;
  provider?: string;
  model?: string;
  task?: string;
}

export interface ProviderPricing {
  promptCostPerMillion: number;
  completionCostPerMillion: number;
}

@Injectable()
export class AiTelemetryService {
  private readonly logger = new Logger(AiTelemetryService.name);
  public static readonly CURRENT_PROMPT_VERSION = '2.1.0';

  private readonly pricingTable: Record<string, ProviderPricing> = {
    google: { promptCostPerMillion: 0.10, completionCostPerMillion: 0.40 },
    deepseek: { promptCostPerMillion: 0.14, completionCostPerMillion: 0.28 },
    openrouter: { promptCostPerMillion: 0.20, completionCostPerMillion: 0.50 },
    nvidia: { promptCostPerMillion: 0.20, completionCostPerMillion: 0.50 },
    ollama: { promptCostPerMillion: 0.00, completionCostPerMillion: 0.00 },
    local: { promptCostPerMillion: 0.00, completionCostPerMillion: 0.00 },
    mock: { promptCostPerMillion: 0.00, completionCostPerMillion: 0.00 },
  };

  private cumulativeTelemetry = {
    totalRequests: 0,
    totalPromptTokens: 0,
    totalCompletionTokens: 0,
    totalTokens: 0,
    totalEstimatedCostUsd: 0,
    totalLatencyMs: 0,
    byProvider: {} as Record<string, { requests: number; tokens: number; costUsd: number; avgLatencyMs: number }>,
    byTask: {} as Record<string, { requests: number; tokens: number; costUsd: number }>,
  };

  /**
   * Approximates token count using character/subword heuristics
   * tuned for Vietnamese and English technical texts.
   */
  estimateTokens(text: string): number {
    if (!text || typeof text !== 'string') return 0;
    const trimmed = text.trim();
    if (!trimmed) return 0;

    // Fast heuristic: ~3.5 chars per token for mixed Vietnamese/English and JSON syntax
    const estimated = Math.ceil(trimmed.length / 3.5);
    return Math.max(1, estimated);
  }

  /**
   * Calculates the estimated cost in USD based on provider pricing.
   */
  calculateCost(provider: string, promptTokens: number, completionTokens: number): number {
    const key = String(provider || 'google').toLowerCase();
    const pricing = this.pricingTable[key] || this.pricingTable.google;

    const promptCost = (promptTokens / 1_000_000) * pricing.promptCostPerMillion;
    const completionCost = (completionTokens / 1_000_000) * pricing.completionCostPerMillion;

    return Number((promptCost + completionCost).toFixed(6));
  }

  /**
   * Generates a telemetry record for an AI operation.
   */
  generateTelemetry(params: {
    promptText: string;
    completionText: string;
    latencyMs: number;
    provider?: string;
    model?: string;
    task?: string;
    promptVersion?: string;
  }): AITelemetry {
    const promptTokens = this.estimateTokens(params.promptText);
    const completionTokens = this.estimateTokens(params.completionText);
    const totalTokens = promptTokens + completionTokens;
    const estimatedCostUsd = this.calculateCost(params.provider || 'google', promptTokens, completionTokens);
    const latencyMs = Math.max(0, Math.round(params.latencyMs));
    const promptVersion = params.promptVersion || AiTelemetryService.CURRENT_PROMPT_VERSION;

    const telemetry: AITelemetry = {
      promptTokens,
      completionTokens,
      totalTokens,
      estimatedCostUsd,
      latencyMs,
      promptVersion,
      provider: params.provider,
      model: params.model,
      task: params.task,
    };

    this.recordCumulative(telemetry);
    return telemetry;
  }

  private recordCumulative(telemetry: AITelemetry): void {
    this.cumulativeTelemetry.totalRequests += 1;
    this.cumulativeTelemetry.totalPromptTokens += telemetry.promptTokens;
    this.cumulativeTelemetry.totalCompletionTokens += telemetry.completionTokens;
    this.cumulativeTelemetry.totalTokens += telemetry.totalTokens;
    this.cumulativeTelemetry.totalEstimatedCostUsd = Number(
      (this.cumulativeTelemetry.totalEstimatedCostUsd + telemetry.estimatedCostUsd).toFixed(6),
    );
    this.cumulativeTelemetry.totalLatencyMs += telemetry.latencyMs;

    const providerKey = String(telemetry.provider || 'unknown').toLowerCase();
    if (!this.cumulativeTelemetry.byProvider[providerKey]) {
      this.cumulativeTelemetry.byProvider[providerKey] = { requests: 0, tokens: 0, costUsd: 0, avgLatencyMs: 0 };
    }
    const pStats = this.cumulativeTelemetry.byProvider[providerKey];
    pStats.requests += 1;
    pStats.tokens += telemetry.totalTokens;
    pStats.costUsd = Number((pStats.costUsd + telemetry.estimatedCostUsd).toFixed(6));
    pStats.avgLatencyMs = Math.round(this.cumulativeTelemetry.totalLatencyMs / this.cumulativeTelemetry.totalRequests);

    const taskKey = String(telemetry.task || 'general');
    if (!this.cumulativeTelemetry.byTask[taskKey]) {
      this.cumulativeTelemetry.byTask[taskKey] = { requests: 0, tokens: 0, costUsd: 0 };
    }
    const tStats = this.cumulativeTelemetry.byTask[taskKey];
    tStats.requests += 1;
    tStats.tokens += telemetry.totalTokens;
    tStats.costUsd = Number((tStats.costUsd + telemetry.estimatedCostUsd).toFixed(6));
  }

  /**
   * Returns a snapshot of cumulative telemetry metrics for observability dashboards.
   */
  getSummary() {
    const avgLatencyMs = this.cumulativeTelemetry.totalRequests > 0
      ? Math.round(this.cumulativeTelemetry.totalLatencyMs / this.cumulativeTelemetry.totalRequests)
      : 0;

    return {
      ...this.cumulativeTelemetry,
      averageLatencyMs: avgLatencyMs,
      promptVersion: AiTelemetryService.CURRENT_PROMPT_VERSION,
    };
  }

  resetSummary(): void {
    this.cumulativeTelemetry = {
      totalRequests: 0,
      totalPromptTokens: 0,
      totalCompletionTokens: 0,
      totalTokens: 0,
      totalEstimatedCostUsd: 0,
      totalLatencyMs: 0,
      byProvider: {},
      byTask: {},
    };
  }
}
