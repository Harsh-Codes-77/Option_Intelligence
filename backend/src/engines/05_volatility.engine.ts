import { ParsedOptionChain } from '../fetchers/optionChain';

export type VIXClassification = 'LOW_VOLATILITY' | 'NORMAL_VOLATILITY' | 'HIGH_VOLATILITY' | 'EXTREME_VOLATILITY';
export type StrategyRec = 'SELL_OPTIONS' | 'BUY_OPTIONS' | 'NEUTRAL_STRATEGIES';
export type SkewType = 'PUT_SKEW' | 'CALL_SKEW' | 'FLAT_SKEW';
export type TermStructure = 'CONTANGO' | 'BACKWARDATION' | 'FLAT';

export interface VolatilityResult {
  symbol: string;
  vix: number;
  vixClassification: VIXClassification;
  atmIV: number;
  ivRank: number;
  ivPercentile: number;
  strategyRecommendation: StrategyRec;
  ivSkewType: SkewType;
  ivSkewSlope: number;
  termStructure: TermStructure;
  signal: string;
  formulaBreakdown: any;
}

function classifyVIX(vix: number): VIXClassification {
  if (vix < 12) return 'LOW_VOLATILITY';
  if (vix < 18) return 'NORMAL_VOLATILITY';
  if (vix < 25) return 'HIGH_VOLATILITY';
  return 'EXTREME_VOLATILITY';
}

function recommendStrategy(ivRank: number): StrategyRec {
  if (ivRank > 70) return 'SELL_OPTIONS';
  if (ivRank < 30) return 'BUY_OPTIONS';
  return 'NEUTRAL_STRATEGIES';
}

export function runVolatilityEngine(
  symbol: string,
  data: ParsedOptionChain,
  vix: number,
  ivHistory: number[] = []
): VolatilityResult {
  const { strikes, spotPrice } = data;

  // Find ATM strike
  let atmStrike = strikes[0];
  let minDiff = Infinity;
  for (const s of strikes) {
    const diff = Math.abs(s.strikePrice - spotPrice);
    if (diff < minDiff) { minDiff = diff; atmStrike = s; }
  }
  const atmIV = atmStrike ? (atmStrike.CE.iv + atmStrike.PE.iv) / 2 : 0;

  // IV Rank (using stored history or defaults)
  const allIVs = ivHistory.length > 0 ? ivHistory : [atmIV];
  const ivMin = Math.min(...allIVs);
  const ivMax = Math.max(...allIVs);
  const ivRank = ivMax > ivMin ? parseFloat((((atmIV - ivMin) / (ivMax - ivMin)) * 100).toFixed(1)) : 50;

  // IV Percentile
  const daysBelow = allIVs.filter(iv => iv < atmIV).length;
  const ivPercentile = allIVs.length > 0 ? parseFloat(((daysBelow / allIVs.length) * 100).toFixed(1)) : 50;

  const vixClassification = classifyVIX(vix);
  const strategyRecommendation = recommendStrategy(ivRank);

  // IV Skew Analysis (ATM ±5 strikes)
  const atmIdx = strikes.findIndex(s => s.strikePrice === atmStrike?.strikePrice);
  const skewStrikes = strikes.slice(Math.max(0, atmIdx - 5), atmIdx + 6);

  let ivSkewSlope = 0;
  let ivSkewType: SkewType = 'FLAT_SKEW';

  if (skewStrikes.length >= 3) {
    // Linear regression: strike vs average IV
    const n = skewStrikes.length;
    const xs = skewStrikes.map(s => s.strikePrice);
    const ys = skewStrikes.map(s => (s.CE.iv + s.PE.iv) / 2);
    const xMean = xs.reduce((a, b) => a + b, 0) / n;
    const yMean = ys.reduce((a, b) => a + b, 0) / n;
    const num = xs.reduce((sum, x, i) => sum + (x - xMean) * (ys[i] - yMean), 0);
    const den = xs.reduce((sum, x) => sum + (x - xMean) ** 2, 0);
    ivSkewSlope = den !== 0 ? parseFloat((num / den).toFixed(6)) : 0;

    if (ivSkewSlope < -0.005) ivSkewType = 'PUT_SKEW';
    else if (ivSkewSlope > 0.005) ivSkewType = 'CALL_SKEW';
    else ivSkewType = 'FLAT_SKEW';
  }

  // Term Structure (placeholder - needs weekly vs monthly data)
  const termStructure: TermStructure = 'FLAT';

  // Overall signal
  let signal = 'NEUTRAL';
  if (vixClassification === 'LOW_VOLATILITY' && ivRank < 30) signal = 'LOW_VOL_BUY';
  else if (vixClassification === 'HIGH_VOLATILITY' && ivRank > 70) signal = 'HIGH_VOL_SELL';
  else if (vixClassification === 'EXTREME_VOLATILITY') signal = 'EXTREME_CAUTION';

  return {
    symbol, vix, vixClassification, atmIV: parseFloat(atmIV.toFixed(2)),
    ivRank, ivPercentile, strategyRecommendation,
    ivSkewType, ivSkewSlope, termStructure, signal,
    formulaBreakdown: {
      title: 'Volatility Analysis',
      steps: [
        { step: 1, label: 'India VIX', formula: 'From NSE allIndices API', value: vix.toFixed(2) },
        { step: 2, label: 'ATM IV', formula: `Average of CE IV + PE IV at ATM strike ${atmStrike?.strikePrice}`, value: atmIV.toFixed(2) },
        { step: 3, label: 'VIX Classification', formula: '<12=Low | <18=Normal | <25=High | ≥25=Extreme', value: vixClassification },
        { step: 4, label: 'IV Rank', formula: `(${atmIV.toFixed(1)} - ${ivMin.toFixed(1)}) / (${ivMax.toFixed(1)} - ${ivMin.toFixed(1)}) × 100`, value: `${ivRank}%` },
        { step: 5, label: 'IV Percentile', formula: `${daysBelow} days below current / ${allIVs.length} total × 100`, value: `${ivPercentile}%` },
        { step: 6, label: 'Strategy', formula: 'IV Rank>70=Sell | <30=Buy | else=Neutral', value: strategyRecommendation },
        { step: 7, label: 'IV Skew', formula: `Linear regression slope: ${ivSkewSlope.toFixed(6)}`, value: ivSkewType },
      ],
    },
  };
}
