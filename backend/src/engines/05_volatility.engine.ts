import { ParsedOptionChain } from '../fetchers/optionChain';
import { getCache, setCache } from '../config/redis';
import { DataStatus } from '../store/state';

export type VIXClassification = 'LOW_VOLATILITY' | 'NORMAL_VOLATILITY' | 'HIGH_VOLATILITY' | 'EXTREME_VOLATILITY';
export type StrategyRec = 'SELL_OPTIONS' | 'BUY_OPTIONS' | 'NEUTRAL_STRATEGIES';
export type SkewType = 'PUT_SKEW' | 'CALL_SKEW' | 'FLAT_SKEW';
export type TermStructure = 'CONTANGO' | 'BACKWARDATION' | 'FLAT';
export type IVDivergence = 'BULLISH_DIVERGENCE' | 'BEARISH_DIVERGENCE' | 'NONE';

export interface VolatilityResult {
  data_status: DataStatus;
  symbol: string;
  vix: number;
  vixClassification: VIXClassification;
  atmIV: number;
  hv10: number;
  hv20: number;
  ivDivergence: IVDivergence;
  ivRank: number;
  ivPercentile: number;
  strategyRecommendation: StrategyRec;
  ivSkewType: SkewType;
  ivSkewSlope: number;
  termStructure: TermStructure;
  expectedMove: number;
  expectedMovePercentage: number;
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

export async function runVolatilityEngine(
  symbol: string,
  data: ParsedOptionChain,
  vix: number
): Promise<VolatilityResult> {
  const defaults: VolatilityResult = {
    data_status: 'NO_DATA', symbol, vix, vixClassification: 'NORMAL_VOLATILITY',
    atmIV: 0, hv10: 0, hv20: 0, ivDivergence: 'NONE', ivRank: 0, ivPercentile: 0, strategyRecommendation: 'NEUTRAL_STRATEGIES',
    ivSkewType: 'FLAT_SKEW', ivSkewSlope: 0, termStructure: 'FLAT', expectedMove: 0, expectedMovePercentage: 0, signal: 'NEUTRAL',
    formulaBreakdown: { title: 'Volatility Analysis', steps: [{ label: 'Status', value: 'No Data' }] },
  };

  if (!data || !data.strikes || data.strikes.length === 0) return defaults;

  const { strikes, spotPrice } = data;
  let data_status: DataStatus = 'LIVE';

  // Find ATM strike and the 3 strikes around it for VWIV
  const currentExpiry = data.selectedExpiry || data.expiryDates[0];
  const currentStrikes = strikes.filter(s => s.expiryDate === currentExpiry);
  let atmIdxLocal = 0;
  let minDiff = Infinity;
  for (let i = 0; i < currentStrikes.length; i++) {
    const diff = Math.abs(currentStrikes[i].strikePrice - spotPrice);
    if (diff < minDiff) { minDiff = diff; atmIdxLocal = i; }
  }
  const atmStrike = currentStrikes[atmIdxLocal] || strikes[0];
  
  let atmIV = 0;
  if (currentStrikes.length > 0) {
    const nearStrikes = currentStrikes.slice(Math.max(0, atmIdxLocal - 1), atmIdxLocal + 2);
    let totalVolume = 0;
    let weightSumIV = 0;
    for (const s of nearStrikes) {
      const vol = s.CE.volume + s.PE.volume;
      const iv = (s.CE.iv + s.PE.iv) / 2;
      if (vol > 0 && iv > 0) {
        totalVolume += vol;
        weightSumIV += (iv * vol);
      }
    }
    if (totalVolume > 0) {
      atmIV = weightSumIV / totalVolume;
    } else {
      atmIV = atmStrike ? (atmStrike.CE.iv + atmStrike.PE.iv) / 2 : 0;
    }
  }

  // Term Structure Check across expiries
  let termStructure: TermStructure = 'FLAT';
  if (data.expiryDates.length >= 2) {
    const nextExpiry = data.expiryDates[1];
    const nextStrikes = strikes.filter(s => s.expiryDate === nextExpiry);
    let nextAtmStrike = nextStrikes[0];
    let nextMinDiff = Infinity;
    for (const s of nextStrikes) {
      const diff = Math.abs(s.strikePrice - spotPrice);
      if (diff < nextMinDiff) { nextMinDiff = diff; nextAtmStrike = s; }
    }
    if (nextAtmStrike) {
      const nextAtmIV = (nextAtmStrike.CE.iv + nextAtmStrike.PE.iv) / 2;
      const diffIV = nextAtmIV - atmIV;
      if (diffIV > 0.5) termStructure = 'CONTANGO'; // Normal
      else if (diffIV < -0.5) termStructure = 'BACKWARDATION'; // Stress
    }
  }

  // IV Rank (using stored history or defaults)
  const ivHistKey = `iv:history:${symbol}`;
  const ivHistory = (await getCache<number[]>(ivHistKey)) || [];
  const updatedIvHistory = [...ivHistory, atmIV].slice(-100);
  await setCache(ivHistKey, updatedIvHistory, 86400 * 7);
  const allIVs = updatedIvHistory;

  if (allIVs.length <= 1) {
    data_status = 'WARMING_UP';
  }

  const ivMin = Math.min(...allIVs);
  const ivMax = Math.max(...allIVs);
  const ivRank = (ivMax > ivMin && data_status === 'LIVE') ? parseFloat((((atmIV - ivMin) / (ivMax - ivMin)) * 100).toFixed(1)) : 0;

  // IV Percentile
  const daysBelow = allIVs.filter(iv => iv < atmIV).length;
  const ivPercentile = (allIVs.length > 0 && data_status === 'LIVE') ? parseFloat(((daysBelow / allIVs.length) * 100).toFixed(1)) : 0;

  // Expected Move
  const expiryDate = new Date(currentExpiry);
  const diffTime = expiryDate.getTime() - Date.now();
  const dte = Math.max(diffTime / (1000 * 60 * 60 * 24), 1);
  const expectedMove = spotPrice * (atmIV / 100) * Math.sqrt(dte / 365);
  const expectedMovePercentage = (expectedMove / spotPrice) * 100;

  if (data_status === 'WARMING_UP') {
    return { ...defaults, atmIV, ivRank, ivPercentile, expectedMove, expectedMovePercentage, formulaBreakdown: { title: 'Volatility Analysis', steps: [{ label: 'Status', value: data_status === 'WARMING_UP' ? 'Warming Up (Insufficient history)' : 'No Data' }] } };
  }

  // HV_10, HV_20 & IV Divergence
  const priceHistory = await getCache<{ close: number }[]>(`price:history:${symbol}`) || [];
  let hv10 = 0;
  let hv20 = 0;
  let ivDivergence: IVDivergence = 'NONE';
  
  if (priceHistory.length >= 21) {
    const closes = priceHistory.map(p => p.close).slice(-21);
    const returns: number[] = [];
    for (let i = 1; i < closes.length; i++) {
      returns.push(Math.log(closes[i] / closes[i - 1]));
    }
    
    // Calculate StdDev for last 10 and 20 periods
    const calcHV = (n: number) => {
      const slice = returns.slice(-n);
      const mean = slice.reduce((a, b) => a + b, 0) / n;
      const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1);
      // Assuming 125 periods/day (3min candles) * 252 days = 31500 periods/year
      return Math.sqrt(variance) * Math.sqrt(31500) * 100; 
    };
    hv10 = parseFloat(calcHV(10).toFixed(2));
    hv20 = parseFloat(calcHV(20).toFixed(2));

    // IV Divergence (compare last 5 price trends with last 5 IV trends)
    if (priceHistory.length >= 5 && allIVs.length >= 5) {
      const p1 = priceHistory[priceHistory.length - 5].close;
      const p2 = priceHistory[priceHistory.length - 1].close;
      const iv1 = allIVs[allIVs.length - 5];
      const iv2 = allIVs[allIVs.length - 1];

      if (p2 > p1 && iv2 > iv1) ivDivergence = 'BEARISH_DIVERGENCE'; // Price up, puts getting expensive
      else if (p2 < p1 && iv2 < iv1) ivDivergence = 'BULLISH_DIVERGENCE'; // Price down, puts getting cheaper
    }
  }

  const vixClassification = classifyVIX(vix);
  const strategyRecommendation = recommendStrategy(ivRank);

  // IV Skew Analysis (ATM ±5 strikes)
  const atmIdx = strikes.findIndex(s => s.strikePrice === atmStrike?.strikePrice);
  const skewStrikes = strikes.slice(Math.max(0, atmIdx - 5), atmIdx + 6);

  let ivSkewSlope = 0;
  let ivSkewType: SkewType = 'FLAT_SKEW';

  if (skewStrikes.length >= 3) {
    // Volume-Weighted Linear Regression (WLS): strike vs average IV
    let sumW = 0, sumWX = 0, sumWY = 0;
    
    for (const s of skewStrikes) {
      const w = (s.CE.volume + s.PE.volume) || 1; // fallback to 1 if 0 volume
      const x = s.strikePrice;
      const y = (s.CE.iv + s.PE.iv) / 2;
      sumW += w;
      sumWX += w * x;
      sumWY += w * y;
    }
    
    if (sumW > 0) {
      const xMean = sumWX / sumW;
      const yMean = sumWY / sumW;
      
      let num = 0;
      let den = 0;
      for (const s of skewStrikes) {
        const w = (s.CE.volume + s.PE.volume) || 1;
        const x = s.strikePrice;
        const y = (s.CE.iv + s.PE.iv) / 2;
        num += w * (x - xMean) * (y - yMean);
        den += w * Math.pow(x - xMean, 2);
      }
      
      ivSkewSlope = den !== 0 ? parseFloat((num / den).toFixed(6)) : 0;
    }

    if (ivSkewSlope < -0.005) ivSkewType = 'PUT_SKEW';
    else if (ivSkewSlope > 0.005) ivSkewType = 'CALL_SKEW';
    else ivSkewType = 'FLAT_SKEW';
  }

  // Overall signal
  let signal = 'NEUTRAL';
  if (vixClassification === 'LOW_VOLATILITY' && ivRank < 30) signal = 'LOW_VOL_BUY';
  else if (vixClassification === 'HIGH_VOLATILITY' && ivRank > 70) signal = 'HIGH_VOL_SELL';
  else if (vixClassification === 'EXTREME_VOLATILITY') signal = 'EXTREME_CAUTION';

  return {
    data_status,
    symbol, vix, vixClassification, atmIV: parseFloat(atmIV.toFixed(2)),
    hv10, hv20, ivDivergence,
    ivRank, ivPercentile, strategyRecommendation,
    ivSkewType, ivSkewSlope, termStructure, expectedMove: parseFloat(expectedMove.toFixed(2)), expectedMovePercentage: parseFloat(expectedMovePercentage.toFixed(2)), signal,
    formulaBreakdown: {
      title: 'Volatility Analysis',
      steps: [
        { step: 0, label: 'Data Status', formula: 'Validating history length', value: data_status },
        { step: 1, label: 'India VIX', formula: 'From NSE allIndices API', value: vix.toFixed(2) },
        { step: 2, label: 'ATM IV', formula: `Volume-weighted IV across 3 strikes near ${atmStrike?.strikePrice}`, value: atmIV.toFixed(2) },
        { step: 3, label: 'Expected Move', formula: `Spot * IV * sqrt(DTE/365)`, value: `±${expectedMove.toFixed(2)} (${expectedMovePercentage.toFixed(2)}%)` },
        { step: 4, label: 'Term Structure', formula: `Near IV vs Next IV`, value: termStructure },
        { step: 5, label: 'HV (10/20)', formula: `Annualized historical volatility`, value: `${hv10}% / ${hv20}%` },
        { step: 6, label: 'IV Divergence', formula: `Price trend vs IV trend (5 periods)`, value: ivDivergence },
        { step: 7, label: 'IV Rank', formula: `(${atmIV.toFixed(1)} - ${ivMin.toFixed(1)}) / (${ivMax.toFixed(1)} - ${ivMin.toFixed(1)}) × 100`, value: `${ivRank}%` },
        { step: 8, label: 'IV Percentile', formula: `${daysBelow} days below current / ${allIVs.length} total × 100`, value: `${ivPercentile}%` },
        { step: 9, label: 'IV Skew', formula: `Volume-weighted WLS slope: ${ivSkewSlope.toFixed(6)}`, value: ivSkewType },
      ],
    },
  };
}
