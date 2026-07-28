import { ConfigService } from '@nestjs/config';
import { GroqTranscriptionService } from './groq-transcription.service';

describe('GroqTranscriptionService', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('requests verbose segment timestamps and derives confidence from log probability', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          text: 'A verified transcript.',
          language: 'en',
          duration: 2,
          segments: [
            {
              start: 0,
              end: 2,
              text: 'A verified transcript.',
              avg_logprob: Math.log(0.8),
            },
          ],
        }),
        { status: 200 },
      ),
    );
    const service = new GroqTranscriptionService(
      new ConfigService({
        ai: {
          groq: {
            apiKey: 'secret',
            baseUrl: 'https://api.groq.com/openai/v1',
            timeoutMs: 1000,
            models: { transcription: 'whisper-large-v3' },
          },
        },
      }),
    );
    const result = await service.transcribe(
      'https://res.cloudinary.com/verith/video/upload/audio.webm',
    );
    const [, init] = (global.fetch as jest.Mock).mock.calls[0] as [
      string,
      RequestInit,
    ];
    const form = init.body as FormData;
    expect(form.get('model')).toBe('whisper-large-v3');
    expect(form.get('response_format')).toBe('verbose_json');
    expect(form.get('timestamp_granularities[]')).toBe('segment');
    expect(result.segments[0]?.confidence).toBeCloseTo(0.8);
  });

  it('fails explicitly without a transcription model', async () => {
    const service = new GroqTranscriptionService(
      new ConfigService({
        ai: {
          groq: {
            apiKey: '',
            baseUrl: 'https://api.groq.com/openai/v1',
            timeoutMs: 1000,
            models: {},
          },
        },
      }),
    );
    await expect(
      service.transcribe('https://example.com/audio'),
    ).rejects.toMatchObject({ code: 'TRANSCRIPTION_PROVIDER_NOT_CONFIGURED' });
  });
});
