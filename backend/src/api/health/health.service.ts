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
