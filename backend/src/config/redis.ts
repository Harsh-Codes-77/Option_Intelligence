import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

export const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: 3,
  retryStrategy(times: number) {
    const delay = Math.min(times * 200, 3000);
    console.log(`[Redis] Reconnecting in ${delay}ms (attempt ${times})`);
    return delay;
  },
  lazyConnect: false,
});

redis.on('connect', () => {
  console.log('[Redis] Connected successfully');
});

redis.on('error', (err) => {
  console.error('[Redis] Connection error:', err.message);
});

// Helper: Get JSON from Redis
export async function getCache<T = any>(key: string): Promise<T | null> {
  try {
    const data = await redis.get(key);
    if (!data) return null;
    return JSON.parse(data) as T;
  } catch {
    return null;
  }
}

// Helper: Set JSON in Redis with TTL (seconds)
export async function setCache(key: string, value: any, ttlSeconds: number = 120): Promise<void> {
  try {
    await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  } catch (err: any) {
    console.error(`[Redis] Failed to set key ${key}:`, err.message);
  }
}

// Helper: Push to a Redis list (with max length trimming)
export async function pushToList(key: string, value: any, maxLength: number = 200): Promise<void> {
  try {
    await redis.lpush(key, JSON.stringify(value));
    await redis.ltrim(key, 0, maxLength - 1);
  } catch (err: any) {
    console.error(`[Redis] Failed to push to list ${key}:`, err.message);
  }
}

// Helper: Get list from Redis
export async function getList<T = any>(key: string, start: number = 0, stop: number = -1): Promise<T[]> {
  try {
    const items = await redis.lrange(key, start, stop);
    return items.map((item) => JSON.parse(item) as T);
  } catch {
    return [];
  }
}

export async function testRedisConnection(): Promise<boolean> {
  try {
    await redis.ping();
    console.log('[Redis] Ping successful');
    return true;
  } catch (err: any) {
    console.error('[Redis] Ping failed:', err.message);
    return false;
  }
}
