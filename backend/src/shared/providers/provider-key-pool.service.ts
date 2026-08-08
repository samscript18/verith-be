import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';

interface KeyRecord {
  key: string;
  fingerprint: string;
  disabled: boolean;
  cooldownUntil: number;
  consecutiveFailures: number;
  inFlight: number;
  lastUsedAt: number;
  lastSuccessAt?: number;
  lastFailureAt?: number;
  lastFailureCode?: string;
}

export interface ProviderKeyPoolStatus {
  configuredKeys: number;
  healthyKeys: number;
  cooldownKeys: number;
  disabledKeys: number;
  nextAvailableAt?: Date;
}

export interface ProviderKeyLease {
  readonly key: string;
  readonly fingerprint: string;
  succeed(): void;
  fail(code: string, retryAfterMs?: number): void;
}

class ProviderKeyPool {
  private readonly logger = new Logger(ProviderKeyPool.name);
  private readonly records: KeyRecord[];

  constructor(
    private readonly provider: string,
    keys: string[],
  ) {
    this.records = [
      ...new Set(keys.map((key) => key.trim()).filter(Boolean)),
    ].map((key) => ({
      key,
      fingerprint: createHash('sha256').update(key).digest('hex').slice(0, 12),
      disabled: false,
      cooldownUntil: 0,
      consecutiveFailures: 0,
      inFlight: 0,
      lastUsedAt: 0,
    }));
  }

  acquire(): ProviderKeyLease | null {
    const now = Date.now();
    const record = this.records
      .filter((item) => !item.disabled && item.cooldownUntil <= now)
      .sort(
        (left, right) =>
          left.inFlight - right.inFlight || left.lastUsedAt - right.lastUsedAt,
      )[0];
    if (!record) return null;
    record.inFlight += 1;
    record.lastUsedAt = now;
    let released = false;
    const release = () => {
      if (released) return false;
      released = true;
      record.inFlight = Math.max(0, record.inFlight - 1);
      return true;
    };
    return {
      key: record.key,
      fingerprint: record.fingerprint,
      succeed: () => {
        if (!release()) return;
        record.consecutiveFailures = 0;
        record.lastSuccessAt = Date.now();
        delete record.lastFailureCode;
      },
      fail: (code, retryAfterMs) => {
        if (!release()) return;
        record.consecutiveFailures += 1;
        record.lastFailureAt = Date.now();
        record.lastFailureCode = code;
        if (code.endsWith('AUTHENTICATION_FAILED')) record.disabled = true;
        else if (code.endsWith('RATE_LIMITED'))
          record.cooldownUntil =
            Date.now() + Math.max(15_000, retryAfterMs ?? 60_000);
        else if (code.includes('BILLING') || code.includes('INVALID_MODEL'))
          record.disabled = true;
        else if (code.endsWith('UNAVAILABLE') || code.endsWith('TIMEOUT'))
          record.cooldownUntil =
            Date.now() + Math.min(60_000, 5_000 * record.consecutiveFailures);
        this.logger.warn({
          event: 'provider_key_failure',
          provider: this.provider,
          keyFingerprint: record.fingerprint,
          failureCode: code,
          disabled: record.disabled,
          cooldownUntil: record.cooldownUntil || undefined,
        });
      },
    };
  }

  status(): ProviderKeyPoolStatus {
    const now = Date.now();
    const available = this.records.filter(
      (item) => !item.disabled && item.cooldownUntil <= now,
    );
    const cooldown = this.records.filter(
      (item) => !item.disabled && item.cooldownUntil > now,
    );
    const next = cooldown
      .map((item) => item.cooldownUntil)
      .sort((left, right) => left - right)[0];
    return {
      configuredKeys: this.records.length,
      healthyKeys: available.length,
      cooldownKeys: cooldown.length,
      disabledKeys: this.records.filter((item) => item.disabled).length,
      ...(next ? { nextAvailableAt: new Date(next) } : {}),
    };
  }
}

@Injectable()
export class ProviderKeyPoolService {
  private readonly pools = new Map<string, ProviderKeyPool>();

  forProvider(provider: string, keys: string[]): ProviderKeyPool {
    const normalized = [
      ...new Set(keys.map((key) => key.trim()).filter(Boolean)),
    ];
    const identity = `${provider}:${normalized
      .map((key) => createHash('sha256').update(key).digest('hex'))
      .join(':')}`;
    let pool = this.pools.get(identity);
    if (!pool) {
      pool = new ProviderKeyPool(provider, normalized);
      this.pools.set(identity, pool);
    }
    return pool;
  }
}
