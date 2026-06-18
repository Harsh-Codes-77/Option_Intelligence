import { getCache } from '../config/redis';

export type MarketRegime = 'TRENDING_BULLISH' | 'TRENDING_BEARISH' | 'BREAKOUT' | 'BREAKDOWN' |
  'HIGH_VOLATILITY' | 'LOW_VOLATILITY_RANGE' | 'RANGE_BOUND';

export interface RegimeResult {
  symbol: string;
  regime: MarketRegime;
  rulesFired: string[];
  adx: number;
  spotVsEMA200: string;
  spotVsEMA50: string;
  spotVsEMA20: string;
  vixLevel: string;
  formulaBreakdown: any;
}

export async function runRegimeEngine(
  symbol: string,
  spotPrice: number,
  ema20: number,
  ema50: number,
  ema200: number,
  vix: number,
  volumeRatio: number
): Promise<RegimeResult> {
  const rules: string[] = [];

  // Rule 1: EMA positions
  const aboveEMA200 = spotPrice > ema200;
  const aboveEMA50 = spotPrice > ema50;
  const aboveEMA20 = spotPrice > ema20;
  rules.push(`Spot ${spotPrice.toFixed(0)} ${aboveEMA200 ? 'ABOVE' : 'BELOW'} EMA200 (${ema200.toFixed(0)})`);
  rules.push(`Spot ${spotPrice.toFixed(0)} ${aboveEMA50 ? 'ABOVE' : 'BELOW'} EMA50 (${ema50.toFixed(0)})`);

  // Rule 2: Volatility
  const highVol = vix > 20;
  const lowVol = vix < 14;
  rules.push(`VIX = ${vix.toFixed(1)} → ${highVol ? 'HIGH_VOL' : lowVol ? 'LOW_VOL' : 'NORMAL_VOL'}`);

  // Rule 3: ADX (simplified from price history)
  const priceHistory = await getCache<{ close: number }[]>(`price:history:${symbol}`) || [];
  let adx = 15; // default to weak trend, not moderate
  if (priceHistory.length >= 20) {
    const recent = priceHistory.slice(-20).map(p => p.close);
    const changes = recent.slice(1).map((c, i) => Math.abs(c - recent[i]));
    const avgChange = changes.reduce((a, b) => a + b, 0) / changes.length;
    const range = Math.max(...recent) - Math.min(...recent);
    adx = range > 0 ? parseFloat(((avgChange / range) * 100 * 2).toFixed(1)) : 15;
    adx = Math.min(adx, 60);
  }
  const strongTrend = adx > 25;
  rules.push(`ADX = ${adx.toFixed(1)} → ${strongTrend ? 'STRONG_TREND' : 'WEAK_TREND/RANGE'}`);

  // Rule 4: Breakout/Breakdown
  const highs20 = priceHistory.slice(-20).map(p => p.close);
  const high20 = highs20.length > 0 ? Math.max(...highs20) : spotPrice;
  const low20 = highs20.length > 0 ? Math.min(...highs20) : spotPrice;
  const nearHighBreakout = spotPrice >= high20 * 0.995;
  const nearLowBreakdown = spotPrice <= low20 * 1.005;

  // Regime Classification
  let regime: MarketRegime;

  if (aboveEMA200 && aboveEMA50 && strongTrend && !highVol) {
    regime = 'TRENDING_BULLISH';
    rules.push('→ Above EMA200+EMA50, ADX>25, VIX<20 = TRENDING BULLISH');
  } else if (!aboveEMA200 && !aboveEMA50 && strongTrend && !highVol) {
    regime = 'TRENDING_BEARISH';
    rules.push('→ Below EMA200+EMA50, ADX>25, VIX<20 = TRENDING BEARISH');
  } else if (nearHighBreakout && aboveEMA20 && volumeRatio > 1.3) {
    regime = 'BREAKOUT';
    rules.push('→ Near 20-period high, above EMA20, high volume = BREAKOUT');
  } else if (nearLowBreakdown && !aboveEMA20 && volumeRatio > 1.3) {
    regime = 'BREAKDOWN';
    rules.push('→ Near 20-period low, below EMA20, high volume = BREAKDOWN');
  } else if (highVol && vix > 22) {
    regime = 'HIGH_VOLATILITY';
    rules.push('→ VIX>22 = HIGH VOLATILITY REGIME');
  } else if (lowVol && !strongTrend) {
    regime = 'LOW_VOLATILITY_RANGE';
    rules.push('→ ADX<25 + VIX<14 = LOW VOLATILITY RANGE');
  } else {
    regime = 'RANGE_BOUND';
    rules.push('→ No clear trend + normal volatility = RANGE BOUND');
  }

  return {
    symbol, regime, rulesFired: rules, adx,
    spotVsEMA200: aboveEMA200 ? 'ABOVE' : 'BELOW',
    spotVsEMA50: aboveEMA50 ? 'ABOVE' : 'BELOW',
    spotVsEMA20: aboveEMA20 ? 'ABOVE' : 'BELOW',
    vixLevel: highVol ? 'HIGH' : lowVol ? 'LOW' : 'NORMAL',
    formulaBreakdown: {
      title: 'Market Regime Classification',
      steps: rules.map((r, i) => ({ step: i + 1, label: `Rule ${i + 1}`, formula: r, value: '' })),
      result: regime,
    },
  };
}
