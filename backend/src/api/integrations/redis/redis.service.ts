import {
  Inject,
  Injectable,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';

@Injectable()
export class RedisService implements OnModuleInit, OnApplicationShutdown {
  constructor(@Inject(REDIS_CLIENT) private readonly client: Redis) {}

  async onModuleInit(): Promise<void> {
    if (process.env.OPENAPI_EXPORT === 'true') return;
    await this.client.connect();
  }

  async onApplicationShutdown(): Promise<void> {
    if (process.env.OPENAPI_EXPORT === 'true') return;
    await this.client.quit();
  }

  async ping(): Promise<boolean> {
    return (await this.client.ping()) === 'PONG';
  }

  get status(): string {
    return this.client.status;
  }
}
