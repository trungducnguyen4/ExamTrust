import { detectAiProvider, verifyApiKeyWithProvider } from './ai-key-verifier';

describe('AI Key Verifier & Auto-Detector', () => {
  describe('detectAiProvider', () => {
    it('detects Google Gemini key by AIzaSy prefix with high confidence', () => {
      const res = detectAiProvider('AIzaSyD-dummy-google-api-key-1234567890');
      expect(res.provider).toBe('google');
      expect(res.confidence).toBe('high');
      expect(res.providerName).toBe('Google Gemini');
      expect(res.recommendedModel).toBe('gemini-1.5-flash');
    });

    it('detects Anthropic Claude key by sk-ant- prefix', () => {
      const res = detectAiProvider('sk-ant-api03-dummy-anthropic-key');
      expect(res.provider).toBe('anthropic');
      expect(res.confidence).toBe('high');
      expect(res.providerName).toBe('Anthropic Claude');
    });

    it('detects OpenRouter key by sk-or-v1- prefix', () => {
      const res = detectAiProvider('sk-or-v1-dummy-openrouter-key');
      expect(res.provider).toBe('openrouter');
      expect(res.confidence).toBe('high');
      expect(res.providerName).toBe('OpenRouter');
    });

    it('detects Groq key by gsk_ prefix', () => {
      const res = detectAiProvider('gsk_dummy_groq_key_abcdef123456');
      expect(res.provider).toBe('groq');
      expect(res.confidence).toBe('high');
      expect(res.providerName).toBe('Groq');
    });

    it('detects NVIDIA NIM key by nvapi- prefix', () => {
      const res = detectAiProvider('nvapi-dummy-nvidia-nim-token');
      expect(res.provider).toBe('nvidia');
      expect(res.confidence).toBe('high');
      expect(res.providerName).toBe('NVIDIA NIM');
    });

    it('detects OpenAI project key by sk-proj- prefix', () => {
      const res = detectAiProvider('sk-proj-dummy-openai-project-key');
      expect(res.provider).toBe('openai');
      expect(res.confidence).toBe('high');
      expect(res.providerName).toContain('OpenAI');
    });

    it('detects DeepSeek key by 32-char hex after sk-', () => {
      const res = detectAiProvider('sk-0123456789abcdef0123456789abcdef');
      expect(res.provider).toBe('deepseek');
      expect(res.confidence).toBe('high');
      expect(res.providerName).toBe('DeepSeek');
    });

    it('handles empty or blank key gracefully', () => {
      const res = detectAiProvider('   ');
      expect(res.provider).toBe('unknown');
      expect(res.confidence).toBe('low');
    });
  });

  describe('verifyApiKeyWithProvider', () => {
    const originalFetch = global.fetch;

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it('returns error when apiKey is empty', async () => {
      const res = await verifyApiKeyWithProvider({ apiKey: '' });
      expect(res.valid).toBe(false);
      expect(res.message).toContain('không được để trống');
    });

    it('verifies Google Gemini key successfully when API responds 200', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ models: [{ name: 'models/gemini-1.5-flash' }, { name: 'models/gemini-pro' }] }),
      } as any);

      const res = await verifyApiKeyWithProvider({
        apiKey: 'AIzaSyDummyValidGoogleKey',
      });

      expect(res.valid).toBe(true);
      expect(res.provider).toBe('google');
      expect(res.details?.modelsCount).toBe(2);
      expect(res.message).toContain('Google Gemini thành công');
    });

    it('handles Google Gemini failure gracefully when API responds 400', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: { message: 'API_KEY_INVALID' } }),
      } as any);

      const res = await verifyApiKeyWithProvider({
        apiKey: 'AIzaSyDummyInvalidGoogleKey',
      });

      expect(res.valid).toBe(false);
      expect(res.provider).toBe('google');
      expect(res.error).toBe('API_KEY_INVALID');
      expect(res.message).toContain('Không thể kết nối');
    });

    it('verifies OpenAI key successfully when API responds 200', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: [{ id: 'gpt-4o' }] }),
      } as any);

      const res = await verifyApiKeyWithProvider({
        apiKey: 'sk-proj-DummyValidOpenAIKey',
      });

      expect(res.valid).toBe(true);
      expect(res.provider).toBe('openai');
      expect(res.message).toContain('OpenAI thành công');
    });

    it('handles request timeout gracefully', async () => {
      const timeoutError = new Error('The operation was aborted');
      timeoutError.name = 'TimeoutError';
      global.fetch = jest.fn().mockRejectedValue(timeoutError);

      const res = await verifyApiKeyWithProvider({
        apiKey: 'AIzaSyDummyTimeoutKey',
      });

      expect(res.valid).toBe(false);
      expect(res.message).toContain('Quá thời gian chờ');
    });
  });
});
