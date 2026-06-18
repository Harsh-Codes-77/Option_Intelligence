import { getCache, setCache } from '../config/redis';

export interface TechnicalResult {
  symbol: string;
  ema20: number;
  ema50: number;
  ema200: number;
  vwap: number;
  rsi: number;
  macdLine: number;
  signalLine: number;
  histogram: number;
  atr: number;
  trendScore: number;
  momentumScore: number;
  pivot: number;
  r1: number;
  r2: number;
  s1: number;
  s2: number;
  signal: string;
  formulaBreakdown: any;
}

function calculateEMA(prices: number[], period: number): number {
  if (prices.length === 0) return 0;
  if (prices.length < period) {
    return prices.reduce((a, b) => a + b, 0) / prices.length;
  }
  const multiplier = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < prices.length; i++) {
    ema = (prices[i] - ema) * multiplier + ema;
  }
  return ema;
}

function calculateRSI(closes: number[], period: number = 14): number {
  if (closes.length < period + 1) return 50;
  const changes = closes.slice(1).map((c, i) => c - closes[i]);
  const recent = changes.slice(-period);
  const gains = recent.filter(c => c > 0);
  const losses = recent.filter(c => c < 0).map(c => Math.abs(c));
  const avgGain = gains.length > 0 ? gains.reduce((a, b) => a + b, 0) / period : 0;
  const avgLoss = losses.length > 0 ? losses.reduce((a, b) => a + b, 0) / period : 0;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return parseFloat((100 - (100 / (1 + rs))).toFixed(2));
}

function calculateATR(highs: number[], lows: number[], closes: number[], period: number = 14): number {
  if (highs.length < 2) return 0;
  const trueRanges = highs.map((h, i) => {
    if (i === 0) return h - lows[i];
    return Math.max(h - lows[i], Math.abs(h - closes[i - 1]), Math.abs(lows[i] - closes[i - 1]));
  });
  const recent = trueRanges.slice(-period);
  return recent.length > 0 ? parseFloat((recent.reduce((a, b) => a + b, 0) / recent.length).toFixed(2)) : 0;
}

export async function runTechnicalEngine(symbol: string, spotPrice: number): Promise<TechnicalResult> {
  // Get price history from Redis
  const priceHistoryKey = `price:history:${symbol}`;
  const history = await getCache<{ close: number; high: number; low: number; volume: number; timestamp: number }[]>(priceHistoryKey) || [];

  // Add current price
  const updatedHistory = [...history, { close: spotPrice, high: spotPrice, low: spotPrice, volume: 0, timestamp: Date.now() }].slice(-300);
  await setCache(priceHistoryKey, updatedHistory, 86400 * 30);

  const closes = updatedHistory.map(h => h.close);
  const highs = updatedHistory.map(h => h.high);
  const lows = updatedHistory.map(h => h.low);

  // EMAs
  const ema20 = parseFloat(calculateEMA(closes, 20).toFixed(2));
  const ema50 = parseFloat(calculateEMA(closes, 50).toFixed(2));
  const ema200 = parseFloat(calculateEMA(closes, 200).toFixed(2));

  // VWAP (simplified - using average)
  const vwap = closes.length > 0 ? parseFloat((closes.reduce((a, b) => a + b, 0) / closes.length).toFixed(2)) : spotPrice;

  // RSI
  const rsi = calculateRSI(closes);

  // MACD
  const ema12 = calculateEMA(closes, 12);
  const ema26 = calculateEMA(closes, 26);
  const macdLine = parseFloat((ema12 - ema26).toFixed(2));
  // Signal line from MACD history
  const macdHistoryKey = `macd:history:${symbol}`;
  const macdHistory = await getCache<number[]>(macdHistoryKey) || [];
  const updatedMacdHistory = [...macdHistory, macdLine].slice(-50);
  await setCache(macdHistoryKey, updatedMacdHistory, 86400);
  const signalLine = parseFloat(calculateEMA(updatedMacdHistory, 9).toFixed(2));
  const histogram = parseFloat((macdLine - signalLine).toFixed(2));

  // ATR
  const atr = calculateATR(highs, lows, closes);

  // Trend Score (0-100)
  let trendScore = 0;
  if (spotPrice > ema20) trendScore += 20;
  if (spotPrice > ema50) trendScore += 20;
  if (spotPrice > ema200) trendScore += 20;
  if (ema20 > ema50) trendScore += 20;
  if (macdLine > 0) trendScore += 20;

  // Momentum Score (0-100)
  let momentumScore = 0;
  if (rsi > 50) momentumScore += 25;
  if (rsi > 60) momentumScore += 25;
  if (histogram > 0) momentumScore += 25;
  if (spotPrice > vwap) momentumScore += 25;

  // Pivot Points
  const yesterday = updatedHistory.length >= 2 ? updatedHistory[updatedHistory.length - 2] : { high: spotPrice, low: spotPrice, close: spotPrice };
  const pivot = parseFloat(((yesterday.high + yesterday.low + yesterday.close) / 3).toFixed(2));
  const r1 = parseFloat(((2 * pivot) - yesterday.low).toFixed(2));
  const r2 = parseFloat((pivot + (yesterday.high - yesterday.low)).toFixed(2));
  const s1 = parseFloat(((2 * pivot) - yesterday.high).toFixed(2));
  const s2 = parseFloat((pivot - (yesterday.high - yesterday.low)).toFixed(2));

  let signal = 'NEUTRAL';
  if (trendScore >= 80 && momentumScore >= 75) signal = 'STRONG_BULLISH';
  else if (trendScore >= 60) signal = 'BULLISH';
  else if (trendScore <= 20 && momentumScore <= 25) signal = 'STRONG_BEARISH';
  else if (trendScore <= 40) signal = 'BEARISH';

  return {
    symbol, ema20, ema50, ema200, vwap, rsi, macdLine, signalLine, histogram, atr,
    trendScore, momentumScore, pivot, r1, r2, s1, s2, signal,
    formulaBreakdown: {
      title: 'Technical Analysis',
      steps: [
        { label: 'EMA 20/50/200', formula: 'Exponential Moving Average', value: `${ema20} / ${ema50} / ${ema200}` },
        { label: 'RSI (14)', formula: '100 - 100/(1 + avg_gain/avg_loss)', value: rsi },
        { label: 'MACD', formula: `EMA12(${ema12.toFixed(1)}) - EMA26(${ema26.toFixed(1)})`, value: `Line: ${macdLine} | Signal: ${signalLine} | Hist: ${histogram}` },
        { label: 'Trend Score', formula: 'Price>EMA20(+20) + Price>EMA50(+20) + Price>EMA200(+20) + EMA20>EMA50(+20) + MACD>0(+20)', value: `${trendScore}/100` },
        { label: 'Momentum Score', formula: 'RSI>50(+25) + RSI>60(+25) + Histogram>0(+25) + Price>VWAP(+25)', value: `${momentumScore}/100` },
        { label: 'Pivot Points', formula: 'P=(H+L+C)/3', value: `P:${pivot} R1:${r1} R2:${r2} S1:${s1} S2:${s2}` },
      ],
    },
  };
}
