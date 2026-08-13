import { ConfigService } from '@nestjs/config';
import { AiCapability } from '../enums/ai-capability.enum';
import { GeminiProvider } from './gemini.provider';
import { GroqProvider } from './groq.provider';
import { OpenRouterProvider } from './openrouter.provider';
import { VertexProvider, vertexOutputSchema } from './vertex.provider';
import { BedrockProvider } from './bedrock.provider';
import { GoogleAuth } from 'google-auth-library';
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';

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

  it('switches to the next Groq key after a key-specific rate limit', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response('', { status: 429 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            model: 'configured-model',
            choices: [{ message: { content: '{"value":"recovered"}' } }],
          }),
          { status: 200 },
        ),
      );
    const config = configService();
    config.set('ai.groq.apiKeys', ['groq-one', 'groq-two', 'groq-three']);
    const provider = new GroqProvider(config);

    await expect(provider.execute(baseRequest)).resolves.toMatchObject({
      output: { value: 'recovered' },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
      authorization: 'Bearer groq-one',
    });
    expect(fetchMock.mock.calls[1]?.[1]?.headers).toMatchObject({
      authorization: 'Bearer groq-two',
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
    expect(provider.modelFor(AiCapability.IMAGE_UNDERSTANDING)).toBe(
      'vision-model',
    );
    await provider.execute({
      ...baseRequest,
      capability: AiCapability.IMAGE_UNDERSTANDING,
      media: { mimeType: 'image/png', base64Data: 'aW1hZ2U=' },
      reasoningEffort: 'none',
    });
    const body = parseBody(fetchMock.mock.calls[0]?.[1]);
    expect(body.provider).toEqual({ require_parameters: true });
    expect(body.reasoning).toEqual({ effort: 'none', exclude: true });
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

  it('accepts text content parts returned by an OpenAI-compatible provider', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          model: 'configured-model',
          choices: [
            {
              message: {
                content: [
                  { type: 'text', text: '{"value":' },
                  { type: 'text', text: '"ok"}' },
                ],
              },
            },
          ],
        }),
        { status: 200 },
      ),
    );
    const provider = new OpenRouterProvider(configService());

    await expect(provider.execute(baseRequest)).resolves.toMatchObject({
      output: { value: 'ok' },
    });
  });

  it('diagnoses an OpenRouter reasoning-only response without exposing content', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'openrouter-request',
          choices: [
            {
              finish_reason: 'length',
              native_finish_reason: 'MAX_TOKENS',
              message: { content: '', reasoning: 'internal reasoning' },
            },
          ],
          usage: { completion_tokens: 8000 },
        }),
        { status: 200 },
      ),
    );
    const provider = new OpenRouterProvider(configService());

    await expect(provider.execute(baseRequest)).rejects.toMatchObject({
      code: 'OPENROUTER_INVALID_RESPONSE',
      details: null,
      operatorDetails: {
        providerRequestId: 'openrouter-request',
        finishReason: 'length',
        nativeFinishReason: 'MAX_TOKENS',
        reasoningCharacters: 18,
        completionTokens: 8000,
      },
    });
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
    expect(body.generationConfig).not.toHaveProperty('temperature');
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

  it('does not rotate Gemini credentials for an invalid adapter request', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('{"error":{}}', { status: 400 }));
    const config = configService();
    config.set('ai.gemini.apiKeys', [
      'gemini-one',
      'gemini-two',
      'gemini-three',
    ]);
    const provider = new GeminiProvider(config);

    await expect(provider.execute(baseRequest)).rejects.toMatchObject({
      code: 'GEMINI_INVALID_REQUEST',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('uses Vertex ADC and its configured structured-output model', async () => {
    jest.spyOn(GoogleAuth.prototype, 'getClient').mockResolvedValue({
      getAccessToken: jest.fn().mockResolvedValue({ token: 'vertex-token' }),
    });
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: '{"value":"ok"}' }] } }],
          usageMetadata: {
            promptTokenCount: 6,
            candidatesTokenCount: 2,
            totalTokenCount: 8,
          },
        }),
        { status: 200, headers: { 'x-goog-request-id': 'vertex-request' } },
      ),
    );
    const provider = new VertexProvider(configService());

    await expect(provider.execute(baseRequest)).resolves.toMatchObject({
      output: { value: 'ok' },
      usage: { inputTokens: 6, outputTokens: 2, totalTokens: 8 },
      providerRequestId: 'vertex-request',
    });
    expect(fetchMock.mock.calls[0]?.[0]).toContain(
      '/publishers/google/models/configured-model:generateContent',
    );
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
      authorization: 'Bearer vertex-token',
    });
    expect(parseBody(fetchMock.mock.calls[0]?.[1])).toMatchObject({
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: vertexOutputSchema(baseRequest.outputJsonSchema),
      },
    });
    expect(fetchMock.mock.calls[0]?.[0]).toContain('/v1/projects/');
  });

  it('bounds Vertex Gemini thinking and reports reasoning-token usage', async () => {
    jest.spyOn(GoogleAuth.prototype, 'getClient').mockResolvedValue({
      getAccessToken: jest.fn().mockResolvedValue({ token: 'vertex-token' }),
    });
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: '{"value":"ok"}' }] } }],
          usageMetadata: {
            promptTokenCount: 4151,
            candidatesTokenCount: 150,
            thoughtsTokenCount: 1024,
            totalTokenCount: 5325,
          },
        }),
        { status: 200 },
      ),
    );
    const provider = new VertexProvider(configService());

    await expect(
      provider.execute({
        ...baseRequest,
        model: 'gemini-2.5-flash',
        maxOutputTokens: 7000,
        reasoningEffort: 'low',
      }),
    ).resolves.toMatchObject({
      usage: {
        inputTokens: 4151,
        outputTokens: 150,
        reasoningTokens: 1024,
        totalTokens: 5325,
      },
    });
    expect(parseBody(fetchMock.mock.calls[0]?.[1])).toMatchObject({
      generationConfig: {
        maxOutputTokens: 7000,
        thinkingConfig: { thinkingBudget: 1024 },
      },
    });
    expect(fetchMock.mock.calls[0]?.[0]).toContain('/v1/projects/');
  });

  it('joins Vertex presentation parts without parsing hidden thought text', async () => {
    jest.spyOn(GoogleAuth.prototype, 'getClient').mockResolvedValue({
      getAccessToken: jest.fn().mockResolvedValue({ token: 'vertex-token' }),
    });
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            {
              finishReason: 'STOP',
              content: {
                parts: [
                  { thought: true, text: 'private reasoning' },
                  { text: '{"value":' },
                  { text: '"ok"}' },
                ],
              },
            },
          ],
        }),
        { status: 200 },
      ),
    );

    await expect(
      new VertexProvider(configService()).execute(baseRequest),
    ).resolves.toMatchObject({ output: { value: 'ok' } });
  });

  it('diagnoses a successful Vertex response that has no presentation text', async () => {
    jest.spyOn(GoogleAuth.prototype, 'getClient').mockResolvedValue({
      getAccessToken: jest.fn().mockResolvedValue({ token: 'vertex-token' }),
    });
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            {
              finishReason: 'STOP',
              content: { parts: [{ thought: true, thoughtSignature: 'safe' }] },
            },
          ],
          usageMetadata: {
            promptTokenCount: 4000,
            thoughtsTokenCount: 1024,
            totalTokenCount: 5024,
          },
        }),
        { status: 200, headers: { 'x-goog-request-id': 'vertex-empty-1' } },
      ),
    );

    await expect(
      new VertexProvider(configService()).execute(baseRequest),
    ).rejects.toMatchObject({
      code: 'VERTEX_EMPTY_RESPONSE',
      operatorDetails: {
        finishReason: 'STOP',
        candidateCount: 1,
        partCount: 1,
        textPartCount: 0,
        thoughtPartCount: 1,
        inputTokens: 4000,
        reasoningTokens: 1024,
        totalTokens: 5024,
        providerRequestId: 'vertex-empty-1',
      },
    });
  });

  it('classifies Vertex policy blocks without exposing submitted media', async () => {
    jest.spyOn(GoogleAuth.prototype, 'getClient').mockResolvedValue({
      getAccessToken: jest.fn().mockResolvedValue({ token: 'vertex-token' }),
    });
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          responseId: 'response-safe-1',
          modelVersion: 'gemini-2.5-flash-001',
          candidates: [],
          promptFeedback: {
            blockReason: 'PROHIBITED_CONTENT',
            blockReasonMessage: 'Request blocked by content policy.',
            safetyRatings: [
              {
                category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
                probability: 'HIGH',
                blocked: true,
              },
            ],
          },
        }),
        { status: 200 },
      ),
    );

    await expect(
      new VertexProvider(configService()).execute({
        ...baseRequest,
        media: { mimeType: 'video/mp4', base64Data: 'dmlkZW8=' },
      }),
    ).rejects.toMatchObject({
      code: 'VERTEX_CONTENT_BLOCKED',
      operatorDetails: {
        blockReason: 'PROHIBITED_CONTENT',
        blockReasonMessage: 'Request blocked by content policy.',
        responseId: 'response-safe-1',
        modelVersion: 'gemini-2.5-flash-001',
        candidateCount: 0,
        mediaMimeType: 'video/mp4',
        mediaBytes: 5,
        safetyRatingCount: 1,
        blockedSafetyRatingCount: 1,
        safetyCategories: 'HARM_CATEGORY_DANGEROUS_CONTENT',
      },
    });
  });

  it('sends Vertex only its supported low-complexity schema subset', () => {
    expect(
      vertexOutputSchema({
        type: 'object',
        additionalProperties: false,
        maxProperties: 4,
        properties: {
          moments: {
            type: 'array',
            maxItems: 60,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                description: {
                  type: 'string',
                  maxLength: 1000,
                  pattern: '.+',
                },
                kind: { type: 'string', enum: ['VISUAL', 'AUDIO'] },
              },
              required: ['description', 'kind'],
            },
          },
        },
        required: ['moments'],
      }),
    ).toEqual({
      type: 'object',
      properties: {
        moments: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              description: { type: 'string' },
              kind: { type: 'string', enum: ['VISUAL', 'AUDIO'] },
            },
            required: ['description', 'kind'],
          },
        },
      },
      required: ['moments'],
    });
  });

  it('uses the global Vertex API host for the global location', async () => {
    jest.spyOn(GoogleAuth.prototype, 'getClient').mockResolvedValue({
      getAccessToken: jest.fn().mockResolvedValue({ token: 'vertex-token' }),
    });
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: '{"value":"ok"}' }] } }],
        }),
        { status: 200 },
      ),
    );
    const config = configService();
    config.set('ai.vertex.location', 'global');
    const provider = new VertexProvider(config);

    await provider.execute(baseRequest);

    expect(fetchMock.mock.calls[0]?.[0]).toMatch(
      /^https:\/\/aiplatform\.googleapis\.com\/v1\/projects\//,
    );
  });

  it('normalizes Bedrock Converse output into the shared provider result', async () => {
    const send = jest
      .spyOn(BedrockRuntimeClient.prototype, 'send')
      .mockResolvedValue({
        output: { message: { content: [{ text: '{"value":"ok"}' }] } },
        usage: { inputTokens: 9, outputTokens: 3, totalTokens: 12 },
        $metadata: { requestId: 'bedrock-request' },
      } as never);
    const provider = new BedrockProvider(configService());

    await expect(provider.execute(baseRequest)).resolves.toMatchObject({
      output: { value: 'ok' },
      usage: { inputTokens: 9, outputTokens: 3, totalTokens: 12 },
      providerRequestId: 'bedrock-request',
    });
    const command = send.mock.calls[0]?.[0];
    const input = command?.input as BedrockStructuredOutputInput | undefined;
    expect(command?.input).toMatchObject({
      modelId: 'configured-model',
      outputConfig: {
        textFormat: {
          type: 'json_schema',
          structure: {
            jsonSchema: { name: 'test_output' },
          },
        },
      },
    });

    const schema = JSON.parse(
      input?.outputConfig?.textFormat?.structure?.jsonSchema?.schema ?? '{}',
    ) as Record<string, unknown>;
    expect(schema).toEqual(baseRequest.outputJsonSchema);
  });

  it('removes Bedrock-unsupported constraints from its provider-facing schema', async () => {
    const send = jest
      .spyOn(BedrockRuntimeClient.prototype, 'send')
      .mockResolvedValue({
        output: { message: { content: [{ text: '{"claims":[]}' }] } },
        $metadata: {},
      } as never);
    const provider = new BedrockProvider(configService());

    await provider.execute({
      ...baseRequest,
      outputJsonSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          claims: {
            type: 'array',
            minItems: 1,
            maxItems: 8,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                start: { type: 'integer', minimum: 0 },
              },
              required: ['start'],
            },
          },
        },
        required: ['claims'],
      },
    });

    const command = send.mock.calls[0]?.[0];
    const input = command?.input as BedrockStructuredOutputInput | undefined;
    const schema = JSON.parse(
      input?.outputConfig?.textFormat?.structure?.jsonSchema?.schema ?? '{}',
    ) as Record<string, unknown>;
    expect(schema).toEqual({
      type: 'object',
      additionalProperties: false,
      properties: {
        claims: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            additionalProperties: false,
            properties: { start: { type: 'integer' } },
            required: ['start'],
          },
        },
      },
      required: ['claims'],
    });
  });
});

interface BedrockStructuredOutputInput {
  outputConfig?: {
    textFormat?: {
      structure?: { jsonSchema?: { schema?: string } };
    };
  };
}

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
        models: {
          reasoning: 'configured-model',
          report: 'report-model',
          vision: 'vision-model',
        },
        siteUrl: 'https://verith.example',
        appName: 'Verith',
      },
      vertex: {
        enabled: true,
        projectId: 'verith-project',
        location: 'us-central1',
        credentialsJson: '',
        timeoutMs: 30000,
        models: {
          text: 'vertex-text',
          reasoning: 'vertex-reasoning',
          localization: 'vertex-localization',
          vision: 'vertex-vision',
          video: 'vertex-video',
        },
        textConcurrency: 4,
        mediaConcurrency: 2,
      },
      bedrock: {
        enabled: true,
        region: 'us-east-1',
        timeoutMs: 30000,
        models: {
          text: 'bedrock-text',
          reasoning: 'bedrock-reasoning',
          localization: 'bedrock-localization',
        },
        textConcurrency: 2,
      },
    },
  });
}

function parseBody(init: RequestInit | undefined): Record<string, unknown> {
  if (typeof init?.body !== 'string') throw new Error('Expected JSON body');
  return JSON.parse(init.body) as Record<string, unknown>;
}
