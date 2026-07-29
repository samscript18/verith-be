import { ConfigService } from '@nestjs/config';
import { AiCapability } from '../enums/ai-capability.enum';
import { GeminiProvider } from './gemini.provider';
import { GroqProvider } from './groq.provider';
import { OpenRouterProvider } from './openrouter.provider';

const baseRequest = {
  capability: AiCapability.STRUCTURED_EXTRACTION,
  model: 'configured-model',
  systemPrompt: 'System',
  userPrompt: 'User',
  outputSchemaName: 'test_output',
  outputJsonSchema: {
    type: 'object',
    properties: { value: { type: 'string' } },
    required: ['value'],
    additionalProperties: false,
  },
};

describe('AI provider HTTP contracts', () => {
  afterEach(() => jest.restoreAllMocks());

  it('sends Groq an OpenAI-compatible strict JSON schema request', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'groq-request',
          model: 'configured-model',
          choices: [{ message: { content: '{"value":"ok"}' } }],
          usage: { prompt_tokens: 4, completion_tokens: 3, total_tokens: 7 },
        }),
        { status: 200 },
      ),
    );
    const provider = new GroqProvider(configService());
    const result = await provider.execute(baseRequest);

    expect(result.output).toEqual({ value: 'ok' });
    const init = fetchMock.mock.calls[0]?.[1];
    const body = parseBody(init);
    expect(body).toMatchObject({
      model: 'configured-model',
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'test_output', strict: true },
      },
    });
  });

  it('requires parameter-compatible routing and sends image data to OpenRouter', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          model: 'configured-model',
          choices: [{ message: { content: '{"value":"ok"}' } }],
        }),
        { status: 200 },
      ),
    );
    const provider = new OpenRouterProvider(configService());
    await provider.execute({
      ...baseRequest,
      capability: AiCapability.IMAGE_UNDERSTANDING,
      media: { mimeType: 'image/png', base64Data: 'aW1hZ2U=' },
    });
    const body = parseBody(fetchMock.mock.calls[0]?.[1]);
    expect(body.provider).toEqual({ require_parameters: true });
    expect(body.messages).toEqual([
      { role: 'system', content: 'System' },
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: {
              url: 'data:image/png;base64,aW1hZ2U=',
            },
          },
          { type: 'text', text: 'User' },
        ],
      },
    ]);
  });

  it('uses Gemini responseJsonSchema and rejects no substitute output', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: '{"value":"ok"}' }] } }],
          usageMetadata: { totalTokenCount: 5 },
        }),
        { status: 200 },
      ),
    );
    const provider = new GeminiProvider(configService());
    const result = await provider.execute({
      ...baseRequest,
      media: { mimeType: 'image/png', base64Data: 'aW1hZ2U=' },
    });
    expect(result.output).toEqual({ value: 'ok' });
    const body = parseBody(fetchMock.mock.calls[0]?.[1]) as {
      generationConfig: Record<string, unknown>;
      contents: unknown;
    };
    expect(body.generationConfig).toMatchObject({
      responseMimeType: 'application/json',
      responseJsonSchema: baseRequest.outputJsonSchema,
    });
    expect(body.contents).toEqual([
      {
        role: 'user',
        parts: [
          {
            inlineData: {
              mimeType: 'image/png',
              data: 'aW1hZ2U=',
            },
          },
          { text: 'User' },
        ],
      },
    ]);
  });
});

function configService(): ConfigService {
  return new ConfigService({
    ai: {
      maxRetries: 0,
      healthCacheSeconds: 300,
      executionRetentionDays: 30,
      gemini: {
        apiKey: 'gemini-key',
        baseUrl: 'https://generativelanguage.googleapis.com',
        timeoutMs: 30000,
        models: { text: 'configured-model', vision: 'vision-model' },
      },
      groq: {
        apiKey: 'groq-key',
        baseUrl: 'https://api.groq.com/openai/v1',
        timeoutMs: 30000,
        models: { text: 'configured-model', transcription: '' },
      },
      openRouter: {
        apiKey: 'openrouter-key',
        baseUrl: 'https://openrouter.ai/api/v1',
        timeoutMs: 30000,
        models: { reasoning: 'configured-model', report: 'report-model' },
        siteUrl: 'https://verith.example',
        appName: 'Verith',
      },
    },
  });
}

function parseBody(init: RequestInit | undefined): Record<string, unknown> {
  if (typeof init?.body !== 'string') throw new Error('Expected JSON body');
  return JSON.parse(init.body) as Record<string, unknown>;
}
