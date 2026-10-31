export type SupportedAiProvider =
  | 'google'
  | 'openai'
  | 'anthropic'
  | 'deepseek'
  | 'groq'
  | 'openrouter'
  | 'nvidia'
  | 'unknown';

export interface ProviderMeta {
  id: SupportedAiProvider;
  name: string;
  defaultModel: string;
  models: string[];
  placeholder: string;
  description: string;
}

export const AI_PROVIDERS: ProviderMeta[] = [
  {
    id: 'google',
    name: 'Google Gemini',
    defaultModel: 'gemini-1.5-flash',
    models: ['gemini-1.5-flash', 'gemini-2.0-flash', 'gemini-1.5-pro'],
    placeholder: 'AIzaSy...',
    description: 'Bắt đầu bằng "AIzaSy" (39 ký tự) từ Google AI Studio.',
  },
  {
    id: 'openai',
    name: 'OpenAI (GPT-4o)',
    defaultModel: 'gpt-4o-mini',
    models: ['gpt-4o-mini', 'gpt-4o', 'gpt-3.5-turbo'],
    placeholder: 'sk-proj-... hoặc sk-...',
    description: 'Bắt đầu bằng "sk-proj-" hoặc "sk-" từ OpenAI Platform.',
  },
  {
    id: 'anthropic',
    name: 'Anthropic Claude',
    defaultModel: 'claude-3-5-sonnet-20241022',
    models: ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022'],
    placeholder: 'sk-ant-...',
    description: 'Bắt đầu bằng "sk-ant-" từ Anthropic Console.',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    defaultModel: 'deepseek-chat',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    placeholder: 'sk-0123456789abcdef...',
    description: 'Khóa 32 ký tự hex bắt đầu bằng "sk-" từ DeepSeek Platform.',
  },
  {
    id: 'groq',
    name: 'Groq (Ultra-fast)',
    defaultModel: 'llama-3.3-70b-versatile',
    models: ['llama-3.3-70b-versatile', 'mixtral-8x7b-32768', 'llama-3.1-8b-instant'],
    placeholder: 'gsk_...',
    description: 'Bắt đầu bằng "gsk_" từ Groq Console.',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    defaultModel: 'openai/gpt-4o-mini',
    models: ['openai/gpt-4o-mini', 'anthropic/claude-3.5-sonnet', 'deepseek/deepseek-chat'],
    placeholder: 'sk-or-v1-...',
    description: 'Bắt đầu bằng "sk-or-v1-" từ OpenRouter Dashboard.',
  },
  {
    id: 'nvidia',
    name: 'NVIDIA NIM',
    defaultModel: 'meta/llama-3.1-70b-instruct',
    models: ['meta/llama-3.1-70b-instruct', 'mistralai/mixtral-8x22b-instruct-v0.1'],
    placeholder: 'nvapi-...',
    description: 'Bắt đầu bằng "nvapi-" từ NVIDIA Build.',
  },
];

export interface UserAiConfig {
  apiKey: string;
  provider: SupportedAiProvider;
  providerName: string;
  model: string;
  isValidated: boolean;
  validatedAt?: number;
  responseTimeMs?: number;
  details?: Record<string, any>;
}

export const USER_AI_CONFIG_KEY = 'examtrust:user-ai-config';

export function detectAiProvider(key: string): {
  provider: SupportedAiProvider;
  providerName: string;
  confidence: 'high' | 'medium' | 'low';
  recommendedModel: string;
} {
  const trimmed = (key || '').trim();
  if (!trimmed) {
    return {
      provider: 'unknown',
      providerName: 'Chưa nhập khóa',
      confidence: 'low',
      recommendedModel: 'gemini-1.5-flash',
    };
  }

  if (trimmed.startsWith('AIzaSy')) {
    return {
      provider: 'google',
      providerName: 'Google Gemini',
      confidence: 'high',
      recommendedModel: 'gemini-1.5-flash',
    };
  }

  if (trimmed.startsWith('sk-ant-')) {
    return {
      provider: 'anthropic',
      providerName: 'Anthropic Claude',
      confidence: 'high',
      recommendedModel: 'claude-3-5-sonnet-20241022',
    };
  }

  if (trimmed.startsWith('sk-or-v1-')) {
    return {
      provider: 'openrouter',
      providerName: 'OpenRouter',
      confidence: 'high',
      recommendedModel: 'openai/gpt-4o-mini',
    };
  }

  if (trimmed.startsWith('gsk_')) {
    return {
      provider: 'groq',
      providerName: 'Groq',
      confidence: 'high',
      recommendedModel: 'llama-3.3-70b-versatile',
    };
  }

  if (trimmed.startsWith('nvapi-')) {
    return {
      provider: 'nvidia',
      providerName: 'NVIDIA NIM',
      confidence: 'high',
      recommendedModel: 'meta/llama-3.1-70b-instruct',
    };
  }

  if (trimmed.startsWith('sk-proj-')) {
    return {
      provider: 'openai',
      providerName: 'OpenAI (Project Key)',
      confidence: 'high',
      recommendedModel: 'gpt-4o-mini',
    };
  }

  if (/^sk-[a-f0-9]{32}$/i.test(trimmed)) {
    return {
      provider: 'deepseek',
      providerName: 'DeepSeek',
      confidence: 'high',
      recommendedModel: 'deepseek-chat',
    };
  }

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

export function getUserAiConfig(): UserAiConfig | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(USER_AI_CONFIG_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.apiKey === 'string' && parsed.apiKey.trim()) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function saveUserAiConfig(config: UserAiConfig): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(USER_AI_CONFIG_KEY, JSON.stringify(config));
  } catch (err) {
    console.error('Không thể lưu AI config vào localStorage:', err);
  }
}

export function clearUserAiConfig(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(USER_AI_CONFIG_KEY);
  } catch (err) {
    console.error('Không thể xóa AI config:', err);
  }
}
