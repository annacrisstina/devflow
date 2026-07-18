import { Redis } from 'ioredis';

export type RedisConnection = Redis;

/**
 * One factory for every BullMQ connection. maxRetriesPerRequest: null is a
 * BullMQ requirement for workers (blocking commands must not be retried by
 * ioredis); using the same options for producers keeps behavior uniform.
 */
export function createRedisConnection(redisUrl: string): Redis {
  return new Redis(redisUrl, { maxRetriesPerRequest: null });
}
