import { ConfigService } from '@nestjs/config';
import { AiCapability } from '../enums/ai-capability.enum';
import { AiProviderName } from '../enums/ai-provider-name.enum';
import { AiConcurrencyService } from './ai-concurrency.service';

describe('AiConcurrencyService', () => {
  it('queues twenty submissions behind provider and capability ceilings', async () => {
    const service = new AiConcurrencyService(configService());
    let active = 0;
    let peak = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const operations = Array.from({ length: 20 }, () =>
      service.run(
        AiProviderName.VERTEX,
        AiCapability.REPORT_GENERATION,
        async () => {
          active += 1;
          peak = Math.max(peak, active);
          await gate;
          active -= 1;
        },
      ),
    );

    await Promise.resolve();
    expect(peak).toBe(2);
    expect(service.snapshot().queued).toBe(18);
    release();
    await Promise.all(operations);
    expect(peak).toBe(2);
    expect(service.snapshot().queued).toBe(0);
  });

  it('enforces the one-video provider and capability ceiling', async () => {
    const service = new AiConcurrencyService(configService());
    let active = 0;
    let peak = 0;
    const operations = Array.from({ length: 4 }, (_, index) =>
      service.run(
        AiProviderName.VERTEX,
        AiCapability.VIDEO_UNDERSTANDING,
        async () => {
          active += 1;
          peak = Math.max(peak, active);
          await new Promise((resolve) => setTimeout(resolve, index + 1));
          active -= 1;
        },
      ),
    );
    await Promise.all(operations);
    expect(peak).toBe(1);
  });
});

function configService(): ConfigService {
  return new ConfigService({
    ai: {
      concurrency: {
        text: 5,
        report: 2,
        localization: 2,
        media: 2,
        audio: 2,
        video: 1,
      },
      vertex: { textConcurrency: 4, mediaConcurrency: 2 },
      bedrock: { textConcurrency: 2 },
      groq: { textConcurrency: 4, mediaConcurrency: 2 },
      gemini: { textConcurrency: 2, mediaConcurrency: 1 },
      openRouter: { textConcurrency: 2, mediaConcurrency: 1 },
    },
  });
}
