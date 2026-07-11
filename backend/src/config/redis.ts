import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

let redisAvailable = false;
let lastErrorLog = 0;

export const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: 1,
  enableOfflineQueue: true,
  connectTimeout: 5000,
  retryStrategy(times: number) {
    if (times > 10) {
      console.warn('[Redis] Max reconnect attempts reached. Running without Redis.');
      return null; // Stop reconnecting
    }
    const delay = Math.min(times * 500, 5000);
    if (times <= 3) {
      console.log(`[Redis] Reconnecting in ${delay}ms (attempt ${times})`);
    }
    return delay;
  },
  lazyConnect: false,
});

redis.on('connect', () => {
  redisAvailable = true;
  console.log('[Redis] Connected successfully');
});

redis.on('ready', () => {
  redisAvailable = true;
});

redis.on('close', () => {
  redisAvailable = false;
});

redis.on('end', () => {
  redisAvailable = false;
});

redis.on('error', (err) => {
  redisAvailable = false;
  // Throttle error logs to once every 30 seconds
  const now = Date.now();
  if (now - lastErrorLog > 30000) {
    console.error('[Redis] Connection error:', err.message);
    lastErrorLog = now;
  }
});

export function isRedisAvailable(): boolean {
  return redisAvailable && redis.status === 'ready';
}

// Helper: Timeout wrapper
const withTimeout = <T>(promise: Promise<T>, ms: number = 2000): Promise<T> => {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Redis operation timed out')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
};

// Helper: Get JSON from Redis
export async function getCache<T = any>(key: string): Promise<T | null> {
  if (!isRedisAvailable()) return null;
  try {
    const data = await withTimeout(redis.get(key));
    if (!data) return null;
    return JSON.parse(data) as T;
  } catch {
    return null;
  }
}

// Helper: Set JSON in Redis with TTL (seconds)
export async function setCache(key: string, value: any, ttlSeconds: number = 120): Promise<void> {
  if (!isRedisAvailable()) return;
  try {
    await withTimeout(redis.set(key, JSON.stringify(value), 'EX', ttlSeconds));
  } catch (err: any) {
    // Silently ignore — Redis unavailability is already logged at connection level
  }
}

// Helper: Push to a Redis list (with max length trimming)
export async function pushToList(key: string, value: any, maxLength: number = 200): Promise<void> {
  if (!isRedisAvailable()) return;
  try {
    await withTimeout(redis.lpush(key, JSON.stringify(value)));
    await withTimeout(redis.ltrim(key, 0, maxLength - 1));
  } catch (err: any) {
    // Silently ignore
  }
}

// Helper: Get list from Redis
export async function getList<T = any>(key: string, start: number = 0, stop: number = -1): Promise<T[]> {
  if (!isRedisAvailable()) return [];
  try {
    const items = await withTimeout(redis.lrange(key, start, stop));
    return items.map((item) => JSON.parse(item) as T);
  } catch {
    return [];
  }
}

export async function testRedisConnection(): Promise<boolean> {
  try {
    await withTimeout(redis.ping(), 3000);
    console.log('[Redis] Ping successful');
    return true;
  } catch (err: any) {
    console.error('[Redis] Ping failed:', err.message);
    return false;
  }
}
