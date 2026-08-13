import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AiConfig } from '../../../shared/config';
import { AiCapability } from '../enums/ai-capability.enum';
import { AiProviderName } from '../enums/ai-provider-name.enum';

interface QueuedExecution<T> {
  provider: AiProviderName;
  capability: AiCapability;
  execute: () => Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
}

@Injectable()
export class AiConcurrencyService {
  private readonly config: AiConfig;
  private readonly providerActive = new Map<string, number>();
  private readonly capabilityActive = new Map<AiCapability, number>();
  private readonly queue: QueuedExecution<unknown>[] = [];

  constructor(configService: ConfigService) {
    this.config = configService.getOrThrow<AiConfig>('ai');
  }

  run<T>(
    provider: AiProviderName,
    capability: AiCapability,
    execute: () => Promise<T>,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        provider,
        capability,
        execute,
        resolve: resolve as (value: unknown) => void,
        reject,
      });
      this.drain();
    });
  }

  snapshot() {
    return {
      queued: this.queue.length,
      providers: Object.fromEntries(this.providerActive),
      capabilities: Object.fromEntries(this.capabilityActive),
    };
  }

  private drain(): void {
    for (let index = 0; index < this.queue.length;) {
      const item = this.queue[index]!;
      if (!this.canStart(item.provider, item.capability)) {
        index += 1;
        continue;
      }
      this.queue.splice(index, 1);
      this.increment(item.provider, item.capability);
      void item
        .execute()
        .then(item.resolve, item.reject)
        .finally(() => {
          this.decrement(item.provider, item.capability);
          this.drain();
        });
    }
  }

  private canStart(
    provider: AiProviderName,
    capability: AiCapability,
  ): boolean {
    const providerKey = this.providerKey(provider, capability);
    return (
      (this.providerActive.get(providerKey) ?? 0) <
        this.providerLimit(provider, capability) &&
      (this.capabilityActive.get(capability) ?? 0) <
        this.capabilityLimit(capability)
    );
  }

  private increment(provider: AiProviderName, capability: AiCapability): void {
    const providerKey = this.providerKey(provider, capability);
    this.providerActive.set(
      providerKey,
      (this.providerActive.get(providerKey) ?? 0) + 1,
    );
    this.capabilityActive.set(
      capability,
      (this.capabilityActive.get(capability) ?? 0) + 1,
    );
  }

  private decrement(provider: AiProviderName, capability: AiCapability): void {
    const providerKey = this.providerKey(provider, capability);
    this.providerActive.set(
      providerKey,
      Math.max(0, (this.providerActive.get(providerKey) ?? 1) - 1),
    );
    this.capabilityActive.set(
      capability,
      Math.max(0, (this.capabilityActive.get(capability) ?? 1) - 1),
    );
  }

  private providerLimit(
    provider: AiProviderName,
    capability: AiCapability,
  ): number {
    const media = this.isMedia(capability);
    if (provider === AiProviderName.VERTEX)
      return media
        ? this.config.vertex.mediaConcurrency
        : this.config.vertex.textConcurrency;
    if (provider === AiProviderName.BEDROCK)
      return this.config.bedrock.textConcurrency;
    if (provider === AiProviderName.GROQ)
      return this.config.groq.textConcurrency;
    if (provider === AiProviderName.GEMINI)
      return media
        ? this.config.gemini.mediaConcurrency
        : this.config.gemini.textConcurrency;
    return media
      ? this.config.openRouter.mediaConcurrency
      : this.config.openRouter.textConcurrency;
  }

  private capabilityLimit(capability: AiCapability): number {
    if (capability === AiCapability.VIDEO_UNDERSTANDING)
      return this.config.concurrency.video;
    if (capability === AiCapability.AUDIO_REASONING)
      return this.config.concurrency.audio;
    if (
      [AiCapability.IMAGE_UNDERSTANDING, AiCapability.OCR_FALLBACK].includes(
        capability,
      )
    )
      return this.config.concurrency.media;
    if (capability === AiCapability.TRANSLATION)
      return this.config.concurrency.localization;
    if (
      [
        AiCapability.REPORT_GENERATION,
        AiCapability.EVIDENCE_SYNTHESIS,
      ].includes(capability)
    )
      return this.config.concurrency.report;
    return this.config.concurrency.text;
  }

  private providerKey(
    provider: AiProviderName,
    capability: AiCapability,
  ): string {
    return `${provider}:${this.isMedia(capability) ? 'MEDIA' : 'TEXT'}`;
  }

  private isMedia(capability: AiCapability): boolean {
    return [
      AiCapability.IMAGE_UNDERSTANDING,
      AiCapability.OCR_FALLBACK,
      AiCapability.AUDIO_REASONING,
      AiCapability.VIDEO_UNDERSTANDING,
    ].includes(capability);
  }
}
