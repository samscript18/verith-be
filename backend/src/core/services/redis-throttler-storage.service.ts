import type { ThrottlerStorage } from '@nestjs/throttler';
import type Redis from 'ioredis';

interface ThrottlerStorageResult {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
}

const INCREMENT_SCRIPT = `
local counterKey = KEYS[1]
local blockKey = KEYS[2]
local ttl = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local blockDuration = tonumber(ARGV[3])
local hits = redis.call('INCR', counterKey)
if hits == 1 then redis.call('PEXPIRE', counterKey, ttl) end
local blocked = redis.call('EXISTS', blockKey)
if hits > limit and blocked == 0 then
  redis.call('SET', blockKey, '1', 'PX', blockDuration)
  blocked = 1
end
return {hits, redis.call('PTTL', counterKey), blocked, redis.call('PTTL', blockKey)}
`;

export class RedisThrottlerStorage implements ThrottlerStorage {
  constructor(private readonly redis: Redis) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageResult> {
    const effectiveBlockDuration = blockDuration > 0 ? blockDuration : ttl;
    const result = await this.redis.eval(
      INCREMENT_SCRIPT,
      2,
      `throttle:${throttlerName}:${key}`,
      `throttle:${throttlerName}:${key}:blocked`,
      ttl,
      limit,
      effectiveBlockDuration,
    );
    if (!Array.isArray(result) || result.length !== 4) {
      throw new Error('Unexpected Redis throttler response');
    }
    const values = result.map((value) => Number(value));
    return {
      totalHits: values[0] ?? 0,
      timeToExpire: Math.max(values[1] ?? 0, 0),
      isBlocked: (values[2] ?? 0) === 1,
      timeToBlockExpire: Math.max(values[3] ?? 0, 0),
    };
  }
}
