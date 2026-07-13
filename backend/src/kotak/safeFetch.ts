/**
 * Safe Fetch Wrapper — Data Status Layer
 * 
 * Every fetcher call goes through safeFetch() which provides:
 *   - data_status: 'LIVE' | 'STALE' | 'NO_DATA' | 'WARMING_UP'
 *   - last_fetched timestamp
 *   - Automatic Redis caching
 *   - Graceful fallback to cached data on failure
 */

import { DataStatus } from '../store/state';
import { setCache, getCache } from '../config/redis';

export interface FetchResult<T> {
  data: T | null;
  data_status: DataStatus;
  last_fetched: number;
  source: 'KOTAK' | 'NSE' | 'CACHE' | 'MANUAL' | 'DEFAULT';
  error?: string;
}

/**
 * Wrap any fetcher call with caching and status tracking
 */
export async function safeFetch<T>(
  fetchFn: () => Promise<T>,
  cacheKey: string,
  moduleName: string,
  cacheTTL: number = 600 // 10 minutes default
): Promise<FetchResult<T>> {
  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Fetch timeout exceeded')), 5000);
    });
    const result = await Promise.race([fetchFn(), timeoutPromise]);
    const fetchResult: FetchResult<T> = {
      data: result,
      data_status: 'LIVE',
      last_fetched: Date.now(),
      source: 'KOTAK',
    };

    // Cache the result
    await setCache(cacheKey, fetchResult, cacheTTL);

    return fetchResult;
  } catch (err: any) {
    console.warn(`[safeFetch] ${moduleName} fetch failed:`, err.message);

    // Try cached data
    const cached = await getCache<FetchResult<T>>(cacheKey);
    if (cached && cached.data) {
      const age = Date.now() - cached.last_fetched;
      const status: DataStatus = age < 120_000 ? 'STALE' : 'NO_DATA';
      return {
        ...cached,
        data_status: status,
        source: 'CACHE',
        error: err.message,
      };
    }

    // No cache available
    return {
      data: null,
      data_status: 'NO_DATA',
      last_fetched: 0,
      source: 'DEFAULT',
      error: err.message,
    };
  }
}

/**
 * Helper to sleep between API calls (rate limit protection)
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
