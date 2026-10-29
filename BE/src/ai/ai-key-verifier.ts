import { VerifyApiKeyResult } from './dto/verify-api-key.dto';

export type DetectedProvider =
  | 'google'
  | 'openai'
  | 'anthropic'
  | 'deepseek'
  | 'groq'
  | 'openrouter'
  | 'nvidia'
  | 'unknown';

export interface ProviderDetectionResult {
  provider: DetectedProvider;
  providerName: string;
  confidence: 'high' | 'medium' | 'low';
  recommendedModel: string;
}

export const PROVIDER_INFO: Record<string, { name: string; defaultModel: string }> = {
  google: { name: 'Google Gemini', defaultModel: 'gemini-1.5-flash' },
  openai: { name: 'OpenAI', defaultModel: 'gpt-4o-mini' },
  anthropic: { name: 'Anthropic Claude', defaultModel: 'claude-3-5-sonnet-20241022' },
  deepseek: { name: 'DeepSeek', defaultModel: 'deepseek-chat' },
  groq: { name: 'Groq', defaultModel: 'llama-3.3-70b-versatile' },
  openrouter: { name: 'OpenRouter', defaultModel: 'openai/gpt-4o-mini' },
  nvidia: { name: 'NVIDIA NIM', defaultModel: 'meta/llama-3.1-70b-instruct' },
};

export function detectAiProvider(key: string): ProviderDetectionResult {
  const trimmed = (key || '').trim();

  if (!trimmed) {
    return {
      provider: 'unknown',
      providerName: 'Chưa nhập API Key',
      confidence: 'low',
      recommendedModel: 'gemini-1.5-flash',
    };
  }

  // 1. Google Gemini: starts with AIzaSy (standard 39 characters)
  if (trimmed.startsWith('AIzaSy')) {
    return {
      provider: 'google',
      providerName: 'Google Gemini',
      confidence: 'high',
      recommendedModel: 'gemini-1.5-flash',
    };
  }

  // 2. Anthropic Claude: starts with sk-ant-
  if (trimmed.startsWith('sk-ant-')) {
    return {
      provider: 'anthropic',
      providerName: 'Anthropic Claude',
      confidence: 'high',
      recommendedModel: 'claude-3-5-sonnet-20241022',
    };
  }

  // 3. OpenRouter: starts with sk-or-v1-
  if (trimmed.startsWith('sk-or-v1-')) {
    return {
      provider: 'openrouter',
      providerName: 'OpenRouter',
      confidence: 'high',
      recommendedModel: 'openai/gpt-4o-mini',
    };
  }

  // 4. Groq: starts with gsk_
  if (trimmed.startsWith('gsk_')) {
    return {
      provider: 'groq',
      providerName: 'Groq',
      confidence: 'high',
      recommendedModel: 'llama-3.3-70b-versatile',
    };
  }

  // 5. NVIDIA NIM: starts with nvapi-
  if (trimmed.startsWith('nvapi-')) {
    return {
      provider: 'nvidia',
      providerName: 'NVIDIA NIM',
      confidence: 'high',
      recommendedModel: 'meta/llama-3.1-70b-instruct',
    };
  }

  // 6. OpenAI Project key: starts with sk-proj-
  if (trimmed.startsWith('sk-proj-')) {
    return {
      provider: 'openai',
      providerName: 'OpenAI (Project Key)',
      confidence: 'high',
      recommendedModel: 'gpt-4o-mini',
    };
  }

  // 7. DeepSeek: standard 32-character hex key prefixed with sk-
  if (/^sk-[a-f0-9]{32}$/i.test(trimmed)) {
    return {
      provider: 'deepseek',
      providerName: 'DeepSeek',
      confidence: 'high',
      recommendedModel: 'deepseek-chat',
    };
  }

  // 8. General sk-... prefix (Could be OpenAI standard user key, DeepSeek, or other compatible)
  if (trimmed.startsWith('sk-')) {
    return {
      provider: 'openai',
      providerName: 'OpenAI / DeepSeek (sk-...)',
      confidence: 'medium',
      recommendedModel: 'gpt-4o-mini',
    };
  }

  return {
    provider: 'unknown',
    providerName: 'Tùy chỉnh / Không xác định',
    confidence: 'low',
    recommendedModel: 'gemini-1.5-flash',
  };
}

export async function verifyApiKeyWithProvider(params: {
  apiKey: string;
  provider?: string;
  model?: string;
}): Promise<VerifyApiKeyResult> {
  const apiKey = (params.apiKey || '').trim();
  if (!apiKey) {
    return {
      valid: false,
      provider: 'unknown',
      providerName: 'Không xác định',
      responseTimeMs: 0,
      message: 'API key không được để trống.',
      error: 'API key is required.',
    };
  }

  const detected = detectAiProvider(apiKey);
  const targetProvider = (params.provider || detected.provider || 'google').toLowerCase();
  const providerMeta = PROVIDER_INFO[targetProvider] || {
    name: targetProvider.toUpperCase(),
    defaultModel: 'default',
  };
  const effectiveModel = params.model || providerMeta.defaultModel;

  const startTime = Date.now();
  const timeoutMs = 10000;

  try {
    switch (targetProvider) {
      case 'google': {
        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
        const latency = Date.now() - startTime;
        if (res.ok) {
          const data: any = await res.json().catch(() => ({}));
          const count = Array.isArray(data.models) ? data.models.length : 0;
          return {
            valid: true,
            provider: 'google',
            providerName: 'Google Gemini',
            detectedProvider: detected.provider,
            model: effectiveModel,
            responseTimeMs: latency,
            message: `Xác thực Google Gemini thành công (${count} models khả dụng, phản hồi ${latency}ms).`,
            details: { modelsCount: count },
          };
        }
        const errJson: any = await res.json().catch(() => ({}));
        const errMsg = errJson?.error?.message || `Google API trả về mã lỗi ${res.status}`;
        return {
          valid: false,
          provider: 'google',
          providerName: 'Google Gemini',
          detectedProvider: detected.provider,
          responseTimeMs: latency,
          message: `Không thể kết nối đến Google Gemini: ${errMsg}`,
          error: errMsg,
        };
      }

      case 'openai': {
        const res = await fetch('https://api.openai.com/v1/models', {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(timeoutMs),
        });
        const latency = Date.now() - startTime;
        if (res.ok) {
          const data: any = await res.json().catch(() => ({}));
          const count = Array.isArray(data.data) ? data.data.length : 0;
          return {
            valid: true,
            provider: 'openai',
            providerName: 'OpenAI',
            detectedProvider: detected.provider,
            model: effectiveModel,
            responseTimeMs: latency,
            message: `Xác thực OpenAI thành công (${count} models khả dụng, phản hồi ${latency}ms).`,
            details: { modelsCount: count },
          };
        }
        const errJson: any = await res.json().catch(() => ({}));
        const errMsg = errJson?.error?.message || `OpenAI trả về mã lỗi ${res.status}`;
        return {
          valid: false,
          provider: 'openai',
          providerName: 'OpenAI',
          detectedProvider: detected.provider,
          responseTimeMs: latency,
          message: `Không thể kết nối đến OpenAI: ${errMsg}`,
          error: errMsg,
        };
      }

      case 'deepseek': {
        const res = await fetch('https://api.deepseek.com/v1/models', {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(timeoutMs),
        });
        const latency = Date.now() - startTime;
        if (res.ok) {
          return {
            valid: true,
            provider: 'deepseek',
            providerName: 'DeepSeek',
            detectedProvider: detected.provider,
            model: effectiveModel,
            responseTimeMs: latency,
            message: `Xác thực DeepSeek thành công (phản hồi ${latency}ms).`,
          };
        }
        const errJson: any = await res.json().catch(() => ({}));
        const errMsg = errJson?.error?.message || `DeepSeek trả về mã lỗi ${res.status}`;
        return {
          valid: false,
          provider: 'deepseek',
          providerName: 'DeepSeek',
          detectedProvider: detected.provider,
          responseTimeMs: latency,
          message: `Không thể kết nối đến DeepSeek: ${errMsg}`,
          error: errMsg,
        };
      }

      case 'groq': {
        const res = await fetch('https://api.groq.com/openai/v1/models', {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(timeoutMs),
        });
        const latency = Date.now() - startTime;
        if (res.ok) {
          const data: any = await res.json().catch(() => ({}));
          const count = Array.isArray(data.data) ? data.data.length : 0;
          return {
            valid: true,
            provider: 'groq',
            providerName: 'Groq',
            detectedProvider: detected.provider,
            model: effectiveModel,
            responseTimeMs: latency,
            message: `Xác thực Groq thành công (${count} models khả dụng, phản hồi ${latency}ms).`,
            details: { modelsCount: count },
          };
        }
        const errJson: any = await res.json().catch(() => ({}));
        const errMsg = errJson?.error?.message || `Groq trả về mã lỗi ${res.status}`;
        return {
          valid: false,
          provider: 'groq',
          providerName: 'Groq',
          detectedProvider: detected.provider,
          responseTimeMs: latency,
          message: `Không thể kết nối đến Groq: ${errMsg}`,
          error: errMsg,
        };
      }

      case 'openrouter': {
        const res = await fetch('https://openrouter.ai/api/v1/auth/key', {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(timeoutMs),
        });
        const latency = Date.now() - startTime;
        if (res.ok) {
          const data: any = await res.json().catch(() => ({}));
          const keyData = data.data || {};
          return {
            valid: true,
            provider: 'openrouter',
            providerName: 'OpenRouter',
            detectedProvider: detected.provider,
            model: effectiveModel,
            responseTimeMs: latency,
            message: `Xác thực OpenRouter thành công (Hạn mức: ${keyData.limit ?? 'Không giới hạn'}, Đã dùng: ${keyData.usage ?? 0}$).`,
            details: keyData,
          };
        }
        const errJson: any = await res.json().catch(() => ({}));
        const errMsg = errJson?.error?.message || `OpenRouter trả về mã lỗi ${res.status}`;
        return {
          valid: false,
          provider: 'openrouter',
          providerName: 'OpenRouter',
          detectedProvider: detected.provider,
          responseTimeMs: latency,
          message: `Không thể kết nối đến OpenRouter: ${errMsg}`,
          error: errMsg,
        };
      }

      case 'anthropic': {
        const res = await fetch('https://api.anthropic.com/v1/models', {
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          signal: AbortSignal.timeout(timeoutMs),
        });
        const latency = Date.now() - startTime;
        if (res.ok) {
          return {
            valid: true,
            provider: 'anthropic',
            providerName: 'Anthropic Claude',
            detectedProvider: detected.provider,
            model: effectiveModel,
            responseTimeMs: latency,
            message: `Xác thực Anthropic Claude thành công (phản hồi ${latency}ms).`,
          };
        }
        const errJson: any = await res.json().catch(() => ({}));
        const errMsg = errJson?.error?.message || `Anthropic trả về mã lỗi ${res.status}`;
        return {
          valid: false,
          provider: 'anthropic',
          providerName: 'Anthropic Claude',
          detectedProvider: detected.provider,
          responseTimeMs: latency,
          message: `Không thể kết nối đến Anthropic Claude: ${errMsg}`,
          error: errMsg,
        };
      }

      case 'nvidia': {
        const res = await fetch('https://integrate.api.nvidia.com/v1/models', {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(timeoutMs),
        });
        const latency = Date.now() - startTime;
        if (res.ok) {
          return {
            valid: true,
            provider: 'nvidia',
            providerName: 'NVIDIA NIM',
            detectedProvider: detected.provider,
            model: effectiveModel,
            responseTimeMs: latency,
            message: `Xác thực NVIDIA NIM thành công (phản hồi ${latency}ms).`,
          };
        }
        const errJson: any = await res.json().catch(() => ({}));
        const errMsg = errJson?.error?.message || `NVIDIA NIM trả về mã lỗi ${res.status}`;
        return {
          valid: false,
          provider: 'nvidia',
          providerName: 'NVIDIA NIM',
          detectedProvider: detected.provider,
          responseTimeMs: latency,
          message: `Không thể kết nối đến NVIDIA NIM: ${errMsg}`,
          error: errMsg,
        };
      }

      default: {
        return {
          valid: false,
          provider: targetProvider,
          providerName: providerMeta.name,
          detectedProvider: detected.provider,
          responseTimeMs: Date.now() - startTime,
          message: `Nhà cung cấp '${targetProvider}' chưa được hỗ trợ xác thực trực tiếp.`,
          error: 'Unsupported provider',
        };
      }
    }
  } catch (error: any) {
    const latency = Date.now() - startTime;
    const isTimeout = error?.name === 'TimeoutError' || error?.name === 'AbortError';
    const message = isTimeout
      ? `Quá thời gian chờ (${timeoutMs / 1000}s) khi kết nối đến ${providerMeta.name}.`
      : `Lỗi kết nối đến ${providerMeta.name}: ${error?.message || error}`;
    return {
      valid: false,
      provider: targetProvider,
      providerName: providerMeta.name,
      detectedProvider: detected.provider,
      responseTimeMs: latency,
      message,
      error: error?.message || String(error),
    };
  }
}
