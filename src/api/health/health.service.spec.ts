import type {
  HealthCheckResult,
  HealthCheckService,
  HealthIndicatorResult,
} from '@nestjs/terminus';
import type { DatabaseService } from '../database/database.service';
import type { RedisService } from '../integrations/redis/redis.service';
import { HealthService } from './health.service';

describe('HealthService', () => {
  it('keeps liveness dependency-free and caches readiness Redis probes', async () => {
    const ping = jest.fn().mockResolvedValue(true);
    const healthCheck = jest.fn(
      async (
        indicators: Array<
          () => Promise<HealthIndicatorResult> | HealthIndicatorResult
        >,
      ): Promise<HealthCheckResult> => {
        const results = await Promise.all(
          indicators.map(async (indicator) => indicator()),
        );
        const details = results.reduce<HealthIndicatorResult>(
          (combined, result) => ({ ...combined, ...result }),
          {},
        );
        return { status: 'ok', info: details, error: {}, details };
      },
    );
    const service = new HealthService(
      { check: healthCheck } as unknown as HealthCheckService,
      {
        isReady: () => true,
        getState: () => 1,
      } as unknown as DatabaseService,
      {
        ping,
        status: 'ready',
      } as unknown as RedisService,
    );

    expect(service.liveness()).toMatchObject({
      status: 'ok',
      details: { application: { status: 'up' } },
    });
    expect(ping).not.toHaveBeenCalled();

    await service.readiness();
    await service.readiness();

    expect(ping).toHaveBeenCalledTimes(1);
  });
});
