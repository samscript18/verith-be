import type { JobsOptions } from 'bullmq';

/**
 * MongoDB owns durable workflow history. BullMQ retains only a small,
 * short-lived diagnostic window and performs one bounded transient retry.
 */
export const coordinationJobOptions = {
  attempts: 2,
  backoff: { type: 'exponential', delay: 15_000 },
  removeOnComplete: { age: 3_600, count: 50 },
  removeOnFail: { age: 86_400, count: 100 },
} satisfies JobsOptions;
