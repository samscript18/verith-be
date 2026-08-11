import { Injectable } from '@nestjs/common';
import {
  HealthCheckService,
  type HealthIndicatorResult,
  type HealthCheckResult,
} from '@nestjs/terminus';
import { DatabaseService } from '../database/database.service';
import { RedisService } from '../integrations/redis/redis.service';

@Injectable()
export class HealthService {
  private redisHealthCache?: {
    expiresAt: number;
    result: HealthIndicatorResult;
  };
  private redisHealthPending?: Promise<HealthIndicatorResult>;

  constructor(
    private readonly health: HealthCheckService,
    private readonly database: DatabaseService,
    private readonly redis: RedisService,
  ) {}

  liveness(): HealthCheckResult {
    return {
      status: 'ok',
      info: { application: { status: 'up' } },
      error: {},
      details: { application: { status: 'up' } },
    };
  }

  readiness(): Promise<HealthCheckResult> {
    return this.health.check([
      () => this.databaseHealth(),
      () => this.redisHealth(),
    ]);
  }

  private databaseHealth(): HealthIndicatorResult {
    const ready = this.database.isReady();
    return {
      mongodb: {
        status: ready ? 'up' : 'down',
        readyState: this.database.getState(),
      },
    };
  }

  private async redisHealth(): Promise<HealthIndicatorResult> {
    if (this.redisHealthCache && this.redisHealthCache.expiresAt > Date.now()) {
      return this.redisHealthCache.result;
    }
    if (this.redisHealthPending) return this.redisHealthPending;
    this.redisHealthPending = this.readRedisHealth();
    try {
      const result = await this.redisHealthPending;
      const isUp = result.redis?.status === 'up';
      this.redisHealthCache = {
        result,
        expiresAt: Date.now() + (isUp ? 60_000 : 15_000),
      };
      return result;
    } finally {
      delete this.redisHealthPending;
    }
  }

  private async readRedisHealth(): Promise<HealthIndicatorResult> {
    try {
      const ready = await this.redis.ping();
      return {
        redis: { status: ready ? 'up' : 'down', connection: this.redis.status },
      };
    } catch {
      return {
        redis: { status: 'down', connection: this.redis.status },
      };
    }
  }
}
