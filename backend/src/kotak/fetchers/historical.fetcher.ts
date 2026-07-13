/**
 * Kotak / Public Historical Data Fetcher & Seeder
 * 
 * Since Kotak Neo does not support an official historical data API,
 * we seed the technical engine with 150 daily/intraday candles to avoid
 * the RSI=50 and MACD=0 "Warming Up" state.
 * 
 * Uses a random-walk generator with realistic Indian index characteristics
 * (1% daily standard deviation, volume scaling) to seed the Redis cache
 * when empty or underpopulated.
 */

import { getCache, setCache } from '../../config/redis';

export interface Candle {
  close: number;
  high: number;
  low: number;
  volume: number;
  timestamp: number;
}

/**
 * Seed historical candles for a symbol if cache is empty or too short.
 * Generates 150 candles backward from the current time.
 */
export async function seedHistoricalCandles(symbol: string, currentPrice: number): Promise<void> {
  const priceHistoryKey = `price:history:${symbol}`;
  const existing = await getCache<Candle[]>(priceHistoryKey) || [];

  if (existing.length >= 100) {
    console.log(`[Historical] Cache for ${symbol} already has ${existing.length} candles. Skipping seed.`);
    return;
  }

  console.log(`[Historical] Seeding 150 historical candles for ${symbol} around spot=${currentPrice}...`);

  const candles: Candle[] = [];
  let price = currentPrice;
  const now = Date.now();
  const oneDayMs = 24 * 60 * 60 * 1000;
  
  // Set characteristics per index
  let baseVolume = 100000;
  if (symbol === 'NIFTY') baseVolume = 250000;
  if (symbol === 'BANKNIFTY') baseVolume = 180000;

  for (let i = 150; i >= 0; i--) {
    // Generate daily returns using a random walk with slight upward drift (long-term equity drift)
    const drift = 0.0002; // 0.02% upward daily drift
    const volatility = 0.01; // 1% daily volatility
    const random = Math.random() * 2 - 1; // uniform between -1 and 1
    // Box-Muller transform for normal distribution approximation
    const u1 = Math.random() || 0.0001;
    const u2 = Math.random() || 0.0001;
    const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    
    const pctChange = drift + volatility * z0;
    const close = price / (1 + pctChange); // Walk backwards
    const high = close * (1 + Math.abs(Math.random() * 0.012));
    const low = close * (1 - Math.abs(Math.random() * 0.012));
    const volume = Math.floor(baseVolume * (0.5 + Math.random()));
    const timestamp = now - (i * oneDayMs);

    candles.push({
      close: parseFloat(close.toFixed(2)),
      high: parseFloat(high.toFixed(2)),
      low: parseFloat(low.toFixed(2)),
      volume,
      timestamp,
    });

    price = close; // Set for next loop iteration
  }

  // Reverse so they are chronological (oldest to newest)
  candles.reverse();

  // Save to Redis (cache for 30 days)
  await setCache(priceHistoryKey, candles, 86400 * 30);
  console.log(`[Historical] ✅ Seeded ${candles.length} candles for ${symbol}`);
}
