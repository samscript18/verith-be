import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AiConfig } from '../../../shared/config';
import { AiFailureClass } from '../enums/ai-failure-class.enum';
import type { AiCapability } from '../enums/ai-capability.enum';
import type { AiProviderName } from '../enums/ai-provider-name.enum';

interface CircuitState {
  consecutiveFailures: number;
  openUntil: number;
  failureClass: AiFailureClass;
}

@Injectable()
export class AiProviderCircuitService {
  private readonly logger = new Logger(AiProviderCircuitService.name);
  private readonly states = new Map<string, CircuitState>();
  private readonly config: AiConfig['circuitBreaker'];

  constructor(configService: ConfigService) {
    const configured = configService.get<AiConfig>('ai')?.circuitBreaker;
    this.config = configured ?? {
      enabled: true,
      failureThreshold: 1,
      temporaryCooldownMs: 60_000,
      rateLimitCooldownMs: 60_000,
      authenticationCooldownMs: 15 * 60_000,
      invalidRequestCooldownMs: 5 * 60_000,
    };
  }

  allows(provider: AiProviderName, capability: AiCapability): boolean {
    if (!this.config.enabled) return true;
    return [this.key(provider), this.key(provider, capability)].every((key) =>
      this.allowsKey(key),
    );
  }

  succeed(provider: AiProviderName, capability: AiCapability): void {
    this.states.delete(this.key(provider));
    this.states.delete(this.key(provider, capability));
  }

  fail(
    provider: AiProviderName,
    capability: AiCapability,
    failureClass: AiFailureClass,
  ): void {
    if (!this.config.enabled) return;
    const providerWide = [
      AiFailureClass.AUTHENTICATION,
      AiFailureClass.BILLING,
      AiFailureClass.RATE_LIMIT,
      AiFailureClass.TEMPORARY,
    ].includes(failureClass);
    const key = this.key(provider, providerWide ? undefined : capability);
    const previous = this.states.get(key);
    const consecutiveFailures = (previous?.consecutiveFailures ?? 0) + 1;
    const immediatelyOpen = [
      AiFailureClass.AUTHENTICATION,
      AiFailureClass.BILLING,
      AiFailureClass.RATE_LIMIT,
      AiFailureClass.INVALID_REQUEST,
    ].includes(failureClass);
    const open =
      immediatelyOpen || consecutiveFailures >= this.config.failureThreshold;
    this.states.set(key, {
      consecutiveFailures,
      failureClass,
      openUntil: open ? Date.now() + this.cooldown(failureClass) : 0,
    });
    if (open)
      this.logger.warn({
        event: 'ai_provider_circuit_opened',
        provider,
        capability: providerWide ? null : capability,
        failureClass,
        consecutiveFailures,
        cooldownMs: this.cooldown(failureClass),
      });
  }

  private cooldown(failureClass: AiFailureClass): number {
    if (
      [AiFailureClass.AUTHENTICATION, AiFailureClass.BILLING].includes(
        failureClass,
      )
    )
      return this.config.authenticationCooldownMs;
    if (failureClass === AiFailureClass.RATE_LIMIT)
      return this.config.rateLimitCooldownMs;
    if (failureClass === AiFailureClass.INVALID_REQUEST)
      return this.config.invalidRequestCooldownMs;
    return this.config.temporaryCooldownMs;
  }

  private allowsKey(key: string): boolean {
    const state = this.states.get(key);
    if (!state) return true;
    if (state.openUntil > Date.now()) return false;
    this.states.delete(key);
    return true;
  }

  private key(provider: AiProviderName, capability?: AiCapability): string {
    return capability ? `${provider}:${capability}` : `${provider}:*`;
  }
}
