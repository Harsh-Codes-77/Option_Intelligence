import { getCache, setCache } from '../config/redis';
import { DataStatus } from '../store/state';

export interface TechnicalResult {
  data_status: DataStatus;
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

export async function runTechnicalEngine(
  symbol: string, 
  spotPrice: number, 
  futuresVolume: number, 
  indexData: any
): Promise<TechnicalResult> {
  let data_status: DataStatus = 'LIVE';

  // Get price history from Redis
  const priceHistoryKey = `price:history:${symbol}`;
  const history = await getCache<{ close: number; high: number; low: number; volume: number; timestamp: number }[]>(priceHistoryKey) || [];

  // Construct 1-min candle approximation
  // (In a true production environment, we would aggregate ticks, but here we take the snapshot)
  const currentCandle = { 
    close: spotPrice, 
    high: spotPrice, 
    low: spotPrice, 
    volume: futuresVolume, 
    timestamp: Date.now() 
  };
  
  const updatedHistory = [...history, currentCandle].slice(-300);
  await setCache(priceHistoryKey, updatedHistory, 86400 * 30);

  if (updatedHistory.length < 14) {
    data_status = 'WARMING_UP';
  }

  if (data_status === 'WARMING_UP') {
    return {
      data_status, symbol, ema20: 0, ema50: 0, ema200: 0, vwap: spotPrice,
      rsi: 50, macdLine: 0, signalLine: 0, histogram: 0, atr: 0,
      trendScore: 0, momentumScore: 0, pivot: 0, r1: 0, r2: 0, s1: 0, s2: 0,
      signal: 'NEUTRAL',
      formulaBreakdown: { title: 'Technical Analysis', steps: [{ label: 'Status', value: data_status === 'WARMING_UP' ? 'Warming Up...' : 'No Data' }] }
    };
  }

  const closes = updatedHistory.map(h => h.close);
  const highs = updatedHistory.map(h => h.high);
  const lows = updatedHistory.map(h => h.low);

  // EMAs
  const ema20 = parseFloat(calculateEMA(closes, 20).toFixed(2));
  const ema50 = parseFloat(calculateEMA(closes, 50).toFixed(2));
  const ema200 = parseFloat(calculateEMA(closes, 200).toFixed(2));

  // VWAP (Volume Weighted Average Price) intraday
  let cumulativeVP = 0;
  let cumulativeV = 0;
  // Get candles for today only
  const todayStr = new Date().toDateString();
  const todayCandles = updatedHistory.filter(h => new Date(h.timestamp).toDateString() === todayStr);
  
  todayCandles.forEach(c => {
    // Approx typical price for the candle
    const typicalPrice = (c.high + c.low + c.close) / 3;
    cumulativeVP += typicalPrice * c.volume;
    cumulativeV += c.volume;
  });
  
  const vwap = cumulativeV > 0 ? parseFloat((cumulativeVP / cumulativeV).toFixed(2)) : spotPrice;

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

  // Pivot Points using real daily High/Low from indicesData
  const dh = indexData?.high || spotPrice;
  const dl = indexData?.low || spotPrice;
  const dc = indexData?.previousClose || spotPrice; // Traditional pivots use PREVIOUS day's close
  
  const pivot = parseFloat(((dh + dl + dc) / 3).toFixed(2));
  const r1 = parseFloat(((2 * pivot) - dl).toFixed(2));
  const r2 = parseFloat((pivot + (dh - dl)).toFixed(2));
  const s1 = parseFloat(((2 * pivot) - dh).toFixed(2));
  const s2 = parseFloat((pivot - (dh - dl)).toFixed(2));

  let signal = 'NEUTRAL';
  if (trendScore >= 80 && momentumScore >= 75) {
    signal = 'STRONG_BULLISH';
  } else if (trendScore >= 60) {
    signal = 'BULLISH';
  } else if (trendScore <= 20 && momentumScore <= 25) {
    signal = 'STRONG_BEARISH';
  } else if (trendScore <= 40) {
    signal = 'BEARISH';
  }

  return {
    data_status,
    symbol, ema20, ema50, ema200, vwap, rsi, macdLine, signalLine, histogram, atr,
    trendScore, momentumScore, pivot, r1, r2, s1, s2, signal,
    formulaBreakdown: {
      title: 'Technical Analysis',
      steps: [
        { label: 'Data Status', formula: 'Checking cache', value: data_status },
        { label: 'EMA 20/50/200', formula: 'Exponential Moving Average', value: `${ema20} / ${ema50} / ${ema200}` },
        { label: 'VWAP', formula: '∑(Price * Vol) / ∑(Vol)', value: vwap },
        { label: 'RSI (14)', formula: '100 - 100/(1 + avg_gain/avg_loss)', value: rsi },
        { label: 'MACD', formula: `EMA12(${ema12.toFixed(1)}) - EMA26(${ema26.toFixed(1)})`, value: `Line: ${macdLine} | Signal: ${signalLine} | Hist: ${histogram}` },
        { label: 'Trend Score', formula: 'Price>EMA20(+20) + Price>EMA50(+20) + Price>EMA200(+20) + EMA20>EMA50(+20) + MACD>0(+20)', value: `${trendScore}/100` },
        { label: 'Momentum Score', formula: 'RSI>50(+25) + RSI>60(+25) + Histogram>0(+25) + Price>VWAP(+25)', value: `${momentumScore}/100` },
        { label: 'Pivot Points', formula: 'P=(PrevH+PrevL+PrevC)/3', value: `P:${pivot} R1:${r1} R2:${r2} S1:${s1} S2:${s2}` },
      ],
    },
  };
}
