import { DataStatus } from '../store/state';

export type MarketBias = 'BULLISH' | 'MILDLY_BULLISH' | 'NEUTRAL' | 'MILDLY_BEARISH' | 'BEARISH';

export interface ComponentScore {
  name: string;
  rawValue: number;
  normalizedScore: number;
  rawWeight: number;
  renormalizedWeight: number;
  weightedScore: number;
  formula: string;
  signal: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
}

export interface ScoringResult {
  data_status: DataStatus;
  symbol: string;
  directionalBiasScore: number;
  marketBias: MarketBias;
  optionBuyingEdgeScore: number;
  components: ComponentScore[];
  formulaBreakdown: any;
}

const RAW_WEIGHTS = {
  OI_CHANGE: 0.15,
  FUTURES_OI: 0.15,
  SECTOR_ROTATION: 0.15,
  MARKET_BREADTH: 0.10,
  VOLUME: 0.10,
  VOLATILITY: 0.10,
  TECHNICAL: 0.10,
  INSTITUTIONAL: 0.05,
  GREEKS: 0.10,
};

function classifyBias(score: number): MarketBias {
  if (score >= 65) return 'BULLISH';
  if (score >= 55) return 'MILDLY_BULLISH';
  if (score >= 45) return 'NEUTRAL';
  if (score >= 35) return 'MILDLY_BEARISH';
  return 'BEARISH';
}

function signalFromScore(s: number): 'BULLISH' | 'BEARISH' | 'NEUTRAL' {
  if (s >= 60) return 'BULLISH';
  if (s <= 40) return 'BEARISH';
  return 'NEUTRAL';
}

export function runScoringEngine(symbol: string, engines: {
  pcr: { data_status: DataStatus; score?: number; signal?: string };
  futures: { data_status: DataStatus; signal?: string; basisPositive?: boolean; volumeRatio?: number; priceChangePositive?: boolean };
  sectors: { data_status: DataStatus; topAvg?: number; bottomAvg?: number; bankLeading?: boolean };
  breadth: { data_status: DataStatus; score?: number };
  volatility: { data_status: DataStatus; vix?: number; ivRankFalling?: boolean };
  technical: { data_status: DataStatus; trendScore?: number; momentumScore?: number };
  institutional: { data_status: DataStatus; signal?: string };
  greeks: { data_status: DataStatus; gammaExposure?: number; vanna?: number; signal?: string };
}): ScoringResult {
  const components: ComponentScore[] = [];
  let totalValidWeight = 0;

  // 1. OI Change Score
  if (engines.pcr.data_status === 'LIVE') {
    // PCR Level Score
    let oiScore = Math.min(Math.max(((engines.pcr.score || 1) - 0.5) / 1.5 * 100, 0), 100);
    
    // 4Quadrant OI Change (Trend + Level)
    const sig = engines.pcr.signal;
    if (sig === 'STRONG_BULLISH') oiScore = Math.min(oiScore + 15, 100);
    else if (sig === 'STRONG_BEARISH') oiScore = Math.max(oiScore - 15, 0);
    else if (sig === 'BULLISH') oiScore = Math.min(oiScore + 5, 100);
    else if (sig === 'BEARISH') oiScore = Math.max(oiScore - 5, 0);

    components.push({
      name: 'OI Change', rawValue: engines.pcr.score || 0, normalizedScore: parseFloat(oiScore.toFixed(1)),
      rawWeight: RAW_WEIGHTS.OI_CHANGE, renormalizedWeight: 0, weightedScore: 0,
      formula: `PCR ${(engines.pcr.score || 0).toFixed(2)} + Trend(${sig}) → ${oiScore.toFixed(1)}`,
      signal: signalFromScore(oiScore),
    });
    totalValidWeight += RAW_WEIGHTS.OI_CHANGE;
  }

  // 2. Futures OI Score
  if (engines.futures.data_status === 'LIVE') {
    let futScore = 50;
    const fs = engines.futures.signal;
    if (fs === 'LONG_BUILDUP') futScore = 80;
    else if (fs === 'SHORT_COVERING') futScore = 65;
    else if (fs === 'LONG_UNWINDING') futScore = 35;
    else if (fs === 'SHORT_BUILDUP') futScore = 20;
    
    if (engines.futures.basisPositive) futScore = Math.min(futScore + 10, 100);
    else futScore = Math.max(futScore - 10, 0);

    components.push({
      name: 'Futures OI', rawValue: futScore, normalizedScore: futScore,
      rawWeight: RAW_WEIGHTS.FUTURES_OI, renormalizedWeight: 0, weightedScore: 0,
      formula: `Signal=${fs || 'NEUTRAL'} → ${futScore}${engines.futures.basisPositive ? ' + 10 (positive basis)' : ' - 10 (negative basis)'}`,
      signal: signalFromScore(futScore),
    });
    totalValidWeight += RAW_WEIGHTS.FUTURES_OI;
  }

  // 3. Sector Rotation Score
  if (engines.sectors.data_status === 'LIVE') {
    const topAvg = engines.sectors.topAvg || 50;
    const botAvg = engines.sectors.bottomAvg || 50;
    // Map the difference between top and bottom sectors to a 0-100 score
    // Max reasonable difference is ~40. Divide by 40 instead of 100 to get a more sensitive score.
    const diff = topAvg - botAvg;
    let sectorScore = Math.min(Math.max((diff / 40) * 50 + 50, 0), 100);
    
    if (engines.sectors.bankLeading) sectorScore = Math.min(sectorScore + 10, 100);
    components.push({
      name: 'Sector Rotation', rawValue: sectorScore, normalizedScore: parseFloat(sectorScore.toFixed(1)),
      rawWeight: RAW_WEIGHTS.SECTOR_ROTATION, renormalizedWeight: 0, weightedScore: 0,
      formula: `(TopAvg(${topAvg.toFixed(1)}) - BotAvg(${botAvg.toFixed(1)})) / 100 × 100 + 50${engines.sectors.bankLeading ? ' + 10 (Bank leading)' : ''}`,
      signal: signalFromScore(sectorScore),
    });
    totalValidWeight += RAW_WEIGHTS.SECTOR_ROTATION;
  }

  // 4. Market Breadth Score
  if (engines.breadth.data_status === 'LIVE') {
    const bScore = engines.breadth.score || 50;
    components.push({
      name: 'Market Breadth', rawValue: bScore, normalizedScore: bScore,
      rawWeight: RAW_WEIGHTS.MARKET_BREADTH, renormalizedWeight: 0, weightedScore: 0,
      formula: `Direct from Breadth Engine`, signal: signalFromScore(bScore),
    });
    totalValidWeight += RAW_WEIGHTS.MARKET_BREADTH;
  }

  // 5. Volume Score
  if (engines.futures.data_status === 'LIVE') {
    const vr = engines.futures.volumeRatio || 1;
    let volBase = vr > 2.0 ? 90 : vr > 1.5 ? 75 : vr > 1.0 ? 55 : vr > 0.7 ? 40 : 25;
    const volScore = engines.futures.priceChangePositive ? volBase : volBase * 0.7;
    components.push({
      name: 'Volume', rawValue: vr, normalizedScore: parseFloat(volScore.toFixed(1)),
      rawWeight: RAW_WEIGHTS.VOLUME, renormalizedWeight: 0, weightedScore: 0,
      formula: `Ratio ${vr.toFixed(2)} → base ${volBase}${engines.futures.priceChangePositive ? '' : ' × 0.7 (negative price)'}`,
      signal: signalFromScore(volScore),
    });
    totalValidWeight += RAW_WEIGHTS.VOLUME;
  }

  // 6. Volatility Score
  if (engines.volatility.data_status === 'LIVE') {
    const vix = engines.volatility.vix || 15;
    let vixScore = vix < 14 ? 80 : vix < 18 ? 65 : vix < 22 ? 45 : vix < 27 ? 30 : 15;
    if (engines.volatility.ivRankFalling) vixScore = Math.min(vixScore + 10, 100);
    components.push({
      name: 'Volatility', rawValue: vix, normalizedScore: vixScore,
      rawWeight: RAW_WEIGHTS.VOLATILITY, renormalizedWeight: 0, weightedScore: 0,
      formula: `VIX=${vix.toFixed(1)} → ${vixScore}${engines.volatility.ivRankFalling ? ' + 10 (IV rank falling)' : ''}`,
      signal: signalFromScore(vixScore),
    });
    totalValidWeight += RAW_WEIGHTS.VOLATILITY;
  }

  // 7. Technical Score
  if (engines.technical.data_status === 'LIVE') {
    const techScore = ((engines.technical.trendScore || 50) + (engines.technical.momentumScore || 50)) / 2;
    components.push({
      name: 'Technical', rawValue: techScore, normalizedScore: parseFloat(techScore.toFixed(1)),
      rawWeight: RAW_WEIGHTS.TECHNICAL, renormalizedWeight: 0, weightedScore: 0,
      formula: `(Trend(${engines.technical.trendScore || 50}) + Momentum(${engines.technical.momentumScore || 50})) / 2`,
      signal: signalFromScore(techScore),
    });
    totalValidWeight += RAW_WEIGHTS.TECHNICAL;
  }

  // 8. Institutional Score
  if (engines.institutional.data_status === 'LIVE') {
    let instScore = 50;
    const is = engines.institutional.signal;
    if (is === 'INSTITUTIONAL_LONG_BUILDUP') instScore = 85;
    else if (is === 'INSTITUTIONAL_SHORT_COVERING') instScore = 70;
    else if (is === 'INSTITUTIONAL_HEDGING') instScore = 50;
    else if (is === 'INSTITUTIONAL_LONG_UNWINDING') instScore = 30;
    else if (is === 'INSTITUTIONAL_SHORT_BUILDUP') instScore = 15;
    components.push({
      name: 'Institutional', rawValue: instScore, normalizedScore: instScore,
      rawWeight: RAW_WEIGHTS.INSTITUTIONAL, renormalizedWeight: 0, weightedScore: 0,
      formula: `Signal=${is || 'NEUTRAL'} → ${instScore}`, signal: signalFromScore(instScore),
    });
    totalValidWeight += RAW_WEIGHTS.INSTITUTIONAL;
  }

  // 9. Greeks Score
  if (engines.greeks.data_status === 'LIVE') {
    let greekScore = 50;
    const gs = engines.greeks.signal;
    if (gs === 'MAGNET_TO_UPSIDE') greekScore = 85;
    else if (gs === 'VOLATILE_DOWNSIDE') greekScore = 15;
    else if (gs === 'LONG_GAMMA_SUPPRESSION') greekScore = 50;
    else if (gs === 'SHORT_GAMMA_EXPANSION') greekScore = 30;

    components.push({
      name: 'Greeks', rawValue: engines.greeks.gammaExposure || 0, normalizedScore: greekScore,
      rawWeight: RAW_WEIGHTS.GREEKS, renormalizedWeight: 0, weightedScore: 0,
      formula: `Signal=${gs || 'NEUTRAL'} → ${greekScore}`, signal: signalFromScore(greekScore),
    });
    totalValidWeight += RAW_WEIGHTS.GREEKS;
  }

  // Renormalize weights
  let directionalBiasScore = 50;
  if (totalValidWeight > 0) {
    components.forEach(c => {
      c.renormalizedWeight = parseFloat((c.rawWeight / totalValidWeight).toFixed(3));
      c.weightedScore = parseFloat((c.normalizedScore * c.renormalizedWeight).toFixed(2));
    });
    directionalBiasScore = parseFloat(components.reduce((sum, c) => sum + c.weightedScore, 0).toFixed(1));
  } else {
    // Edge case: all data sources NO_DATA
    components.push({
      name: 'Fallback', rawValue: 50, normalizedScore: 50,
      rawWeight: 1, renormalizedWeight: 1, weightedScore: 50,
      formula: 'No data available', signal: 'NEUTRAL'
    });
  }

  const marketBias = classifyBias(directionalBiasScore);
  
  // Option Buying Edge Score (Phase 4)
  // Higher score = better conditions for option buying
  let optionBuyingEdgeScore = 50;
  let obFormula = 'Insufficient Data';
  
  if (engines.volatility.data_status === 'LIVE' && engines.technical.data_status === 'LIVE') {
    const momentum = engines.technical.momentumScore || 50;
    const trendStrength = Math.abs(momentum - 50) * 2; // 0 to 100, measures strength of trend regardless of direction
    
    const isFallingIV = engines.volatility.ivRankFalling ? 15 : -10;
    
    let volBoost = 0;
    if (engines.futures.data_status === 'LIVE') {
      const vr = engines.futures.volumeRatio || 1;
      volBoost = vr > 1.5 ? 15 : (vr < 0.8 ? -10 : 0);
    }
    
    let greeksBoost = 0;
    if (engines.greeks.data_status === 'LIVE') {
       const gex = engines.greeks.gammaExposure || 0;
       if (gex > 10000000) greeksBoost = -25; // Long gamma suppression (Theta crush)
       else if (gex < 0) greeksBoost = +25; // Short gamma expansion (Fast moves)
    }
    
    optionBuyingEdgeScore = Math.min(Math.max(trendStrength + isFallingIV + volBoost + greeksBoost, 0), 100);
    obFormula = `TrendStrength(${trendStrength}) + IVFalling(${isFallingIV}) + VolRatio(${volBoost}) + Greeks(${greeksBoost})`;
  }

  return {
    data_status: totalValidWeight > 0 ? 'LIVE' : 'NO_DATA',
    symbol, directionalBiasScore, marketBias, optionBuyingEdgeScore, components,
    formulaBreakdown: {
      title: 'Dual-Score Architecture',
      steps: components.map((c, i) => ({
        step: i + 1, label: c.name, formula: c.formula,
        value: `${c.normalizedScore.toFixed(1)} × ${(c.renormalizedWeight * 100).toFixed(1)}% = ${c.weightedScore.toFixed(2)}`,
      })),
      finalScore: `Directional Bias: ${directionalBiasScore} (${marketBias}) | Option Buying Edge: ${optionBuyingEdgeScore}`,
      weights: { rawTotal: totalValidWeight.toFixed(2), renormalizedTotal: 1.0 },
    },
  };
}
