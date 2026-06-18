export type MarketBias = 'BULLISH' | 'MILDLY_BULLISH' | 'NEUTRAL' | 'MILDLY_BEARISH' | 'BEARISH';

export interface ComponentScore {
  name: string;
  rawValue: number;
  normalizedScore: number;
  weight: number;
  weightedScore: number;
  formula: string;
  signal: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
}

export interface ScoringResult {
  symbol: string;
  bullishScore: number;
  bearishScore: number;
  marketBias: MarketBias;
  components: ComponentScore[];
  formulaBreakdown: any;
}

const WEIGHTS = {
  OI_CHANGE: 0.25,
  FUTURES_OI: 0.15,
  SECTOR_ROTATION: 0.15,
  MARKET_BREADTH: 0.10,
  VOLUME: 0.10,
  VOLATILITY: 0.10,
  TECHNICAL: 0.10,
  INSTITUTIONAL: 0.05,
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
  pcrScore?: number;
  pcrSignal?: string;
  futuresSignal?: string;
  basisPositive?: boolean;
  sectorTopAvg?: number;
  sectorBottomAvg?: number;
  bankLeading?: boolean;
  breadthScore?: number;
  volumeRatio?: number;
  priceChangePositive?: boolean;
  vix?: number;
  ivRankFalling?: boolean;
  trendScore?: number;
  momentumScore?: number;
  institutionalSignal?: string;
}): ScoringResult {
  const components: ComponentScore[] = [];

  // 1. OI Change Score
  const pcrNorm = Math.min(Math.max(((engines.pcrScore || 1) - 0.5) / 1.5 * 100, 0), 100);
  const oiScore = pcrNorm;
  components.push({
    name: 'OI Change', rawValue: engines.pcrScore || 0, normalizedScore: parseFloat(oiScore.toFixed(1)),
    weight: WEIGHTS.OI_CHANGE, weightedScore: parseFloat((oiScore * WEIGHTS.OI_CHANGE).toFixed(2)),
    formula: `PCR normalized: (${(engines.pcrScore || 0).toFixed(2)} - 0.5) / 1.5 × 100 = ${pcrNorm.toFixed(1)}`,
    signal: signalFromScore(oiScore),
  });

  // 2. Futures OI Score
  let futScore = 50;
  const fs = engines.futuresSignal;
  if (fs === 'LONG_BUILDUP') futScore = 80;
  else if (fs === 'SHORT_COVERING') futScore = 65;
  else if (fs === 'LONG_UNWINDING') futScore = 35;
  else if (fs === 'SHORT_BUILDUP') futScore = 20;
  if (engines.basisPositive) futScore = Math.min(futScore + 10, 100);
  components.push({
    name: 'Futures OI', rawValue: futScore, normalizedScore: futScore,
    weight: WEIGHTS.FUTURES_OI, weightedScore: parseFloat((futScore * WEIGHTS.FUTURES_OI).toFixed(2)),
    formula: `Signal=${fs || 'NEUTRAL'} → ${futScore}${engines.basisPositive ? ' + 10 (positive basis)' : ''}`,
    signal: signalFromScore(futScore),
  });

  // 3. Sector Rotation Score
  const topAvg = engines.sectorTopAvg || 50;
  const botAvg = engines.sectorBottomAvg || 50;
  let sectorScore = Math.min(Math.max((topAvg - botAvg) / 100 * 100 + 50, 0), 100);
  if (engines.bankLeading) sectorScore = Math.min(sectorScore + 10, 100);
  components.push({
    name: 'Sector Rotation', rawValue: sectorScore, normalizedScore: parseFloat(sectorScore.toFixed(1)),
    weight: WEIGHTS.SECTOR_ROTATION, weightedScore: parseFloat((sectorScore * WEIGHTS.SECTOR_ROTATION).toFixed(2)),
    formula: `(TopAvg(${topAvg.toFixed(1)}) - BotAvg(${botAvg.toFixed(1)})) / 100 × 100 + 50${engines.bankLeading ? ' + 10 (Bank leading)' : ''}`,
    signal: signalFromScore(sectorScore),
  });

  // 4. Breadth Score
  const bScore = engines.breadthScore || 50;
  components.push({
    name: 'Market Breadth', rawValue: bScore, normalizedScore: bScore,
    weight: WEIGHTS.MARKET_BREADTH, weightedScore: parseFloat((bScore * WEIGHTS.MARKET_BREADTH).toFixed(2)),
    formula: `Direct from Breadth Engine`, signal: signalFromScore(bScore),
  });

  // 5. Volume Score
  const vr = engines.volumeRatio || 1;
  let volBase = vr > 2.0 ? 90 : vr > 1.5 ? 75 : vr > 1.0 ? 55 : vr > 0.7 ? 40 : 25;
  const volScore = engines.priceChangePositive ? volBase : volBase * 0.7;
  components.push({
    name: 'Volume', rawValue: vr, normalizedScore: parseFloat(volScore.toFixed(1)),
    weight: WEIGHTS.VOLUME, weightedScore: parseFloat((volScore * WEIGHTS.VOLUME).toFixed(2)),
    formula: `Ratio ${vr.toFixed(2)} → base ${volBase}${engines.priceChangePositive ? '' : ' × 0.7 (negative price)'}`,
    signal: signalFromScore(volScore),
  });

  // 6. Volatility Score (inverse)
  const vix = engines.vix || 15;
  let vixScore = vix < 14 ? 80 : vix < 18 ? 65 : vix < 22 ? 45 : vix < 27 ? 30 : 15;
  if (engines.ivRankFalling) vixScore = Math.min(vixScore + 10, 100);
  components.push({
    name: 'Volatility', rawValue: vix, normalizedScore: vixScore,
    weight: WEIGHTS.VOLATILITY, weightedScore: parseFloat((vixScore * WEIGHTS.VOLATILITY).toFixed(2)),
    formula: `VIX=${vix.toFixed(1)} → ${vixScore}${engines.ivRankFalling ? ' + 10 (IV rank falling)' : ''}`,
    signal: signalFromScore(vixScore),
  });

  // 7. Technical Score
  const techScore = ((engines.trendScore || 50) + (engines.momentumScore || 50)) / 2;
  components.push({
    name: 'Technical', rawValue: techScore, normalizedScore: parseFloat(techScore.toFixed(1)),
    weight: WEIGHTS.TECHNICAL, weightedScore: parseFloat((techScore * WEIGHTS.TECHNICAL).toFixed(2)),
    formula: `(Trend(${engines.trendScore || 50}) + Momentum(${engines.momentumScore || 50})) / 2`,
    signal: signalFromScore(techScore),
  });

  // 8. Institutional Score
  let instScore = 50;
  const is = engines.institutionalSignal;
  if (is === 'INSTITUTIONAL_LONG_BUILDUP') instScore = 85;
  else if (is === 'INSTITUTIONAL_SHORT_COVERING') instScore = 70;
  else if (is === 'INSTITUTIONAL_HEDGING') instScore = 50;
  else if (is === 'INSTITUTIONAL_LONG_UNWINDING') instScore = 30;
  else if (is === 'INSTITUTIONAL_SHORT_BUILDUP') instScore = 15;
  components.push({
    name: 'Institutional', rawValue: instScore, normalizedScore: instScore,
    weight: WEIGHTS.INSTITUTIONAL, weightedScore: parseFloat((instScore * WEIGHTS.INSTITUTIONAL).toFixed(2)),
    formula: `Signal=${is || 'NEUTRAL'} → ${instScore}`, signal: signalFromScore(instScore),
  });

  // Final score
  const bullishScore = parseFloat(components.reduce((sum, c) => sum + c.weightedScore, 0).toFixed(1));
  const bearishScore = parseFloat((100 - bullishScore).toFixed(1));
  const marketBias = classifyBias(bullishScore);

  return {
    symbol, bullishScore, bearishScore, marketBias, components,
    formulaBreakdown: {
      title: 'Master Scoring Engine',
      steps: components.map((c, i) => ({
        step: i + 1, label: c.name, formula: c.formula,
        value: `${c.normalizedScore.toFixed(1)} × ${(c.weight * 100)}% = ${c.weightedScore.toFixed(2)}`,
      })),
      finalScore: `Bullish: ${bullishScore} | Bearish: ${bearishScore} | Bias: ${marketBias}`,
      weights: WEIGHTS,
    },
  };
}
