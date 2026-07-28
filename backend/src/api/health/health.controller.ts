import { Controller, Get } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { HealthCheck, type HealthCheckResult } from '@nestjs/terminus';
import { SkipThrottle } from '@nestjs/throttler';
import { HealthService } from './health.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @HealthCheck()
  @ApiOperation({ summary: 'Check application readiness' })
  @ApiOkResponse({ description: 'All required dependencies are ready' })
  @ApiServiceUnavailableResponse({
    description: 'At least one required dependency is unavailable',
  })
  readiness(): Promise<HealthCheckResult> {
    return this.healthService.readiness();
  }

  @Get('live')
  @SkipThrottle()
  @ApiOperation({ summary: 'Check process liveness' })
  @ApiOkResponse({ description: 'The application process is alive' })
  liveness(): HealthCheckResult {
    return this.healthService.liveness();
  }

  @Get('ready')
  @HealthCheck()
  @ApiOperation({ summary: 'Check MongoDB and Redis readiness' })
  readinessAlias(): Promise<HealthCheckResult> {
    return this.healthService.readiness();
  }
}
