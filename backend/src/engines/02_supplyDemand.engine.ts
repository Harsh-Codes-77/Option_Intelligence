import { OptionChainEngineResult, StrikeAnalysis } from './01_optionChain.engine';

export type StrengthRating = 'VERY_STRONG' | 'STRONG' | 'MODERATE' | 'WEAK';

export interface SupportResistanceLevel {
  strike: number;
  oi: number;
  oiChange: number;
  strength: number;
  rating: StrengthRating;
  pctFromSpot: number;
  side: 'SUPPORT' | 'RESISTANCE';
}

export interface OIWall {
  strike: number;
  side: 'CE' | 'PE';
  oi: number;
  distancePct: number;
  isFreshOI: boolean;
}

export interface SupplyDemandResult {
  symbol: string;
  spotPrice: number;
  resistanceLevels: SupportResistanceLevel[];
  supportLevels: SupportResistanceLevel[];
  ceOIWall: OIWall;
  peOIWall: OIWall;
  signal: string;
  formulaBreakdown: any;
}

function getRating(strengthPct: number): StrengthRating {
  if (strengthPct >= 15) return 'VERY_STRONG';
  if (strengthPct >= 10) return 'STRONG';
  if (strengthPct >= 5) return 'MODERATE';
  return 'WEAK';
}

export function runSupplyDemandEngine(
  symbol: string,
  optionChainResult: OptionChainEngineResult
): SupplyDemandResult {
  const { strikes, spotPrice, totalCE_OI, totalPE_OI } = optionChainResult;

  // Sort by CE OI descending for resistance
  const sortedByCE = [...strikes].sort((a, b) => b.CE.oi - a.CE.oi);
  const top3Resistance: SupportResistanceLevel[] = sortedByCE.slice(0, 3).map((s) => {
    const strength = totalCE_OI > 0 ? (s.CE.oi / totalCE_OI) * 100 : 0;
    return {
      strike: s.strikePrice,
      oi: s.CE.oi,
      oiChange: s.CE.oiChange,
      strength: parseFloat(strength.toFixed(2)),
      rating: getRating(strength),
      pctFromSpot: parseFloat(((s.strikePrice - spotPrice) / spotPrice * 100).toFixed(2)),
      side: 'RESISTANCE' as const,
    };
  });

  // Sort by PE OI descending for support
  const sortedByPE = [...strikes].sort((a, b) => b.PE.oi - a.PE.oi);
  const top3Support: SupportResistanceLevel[] = sortedByPE.slice(0, 3).map((s) => {
    const strength = totalPE_OI > 0 ? (s.PE.oi / totalPE_OI) * 100 : 0;
    return {
      strike: s.strikePrice,
      oi: s.PE.oi,
      oiChange: s.PE.oiChange,
      strength: parseFloat(strength.toFixed(2)),
      rating: getRating(strength),
      pctFromSpot: parseFloat(((s.strikePrice - spotPrice) / spotPrice * 100).toFixed(2)),
      side: 'SUPPORT' as const,
    };
  });

  // OI Wall detection
  const ceWallStrike = sortedByCE[0];
  const peWallStrike = sortedByPE[0];

  // Check for fresh OI addition (OI change > 2x average)
  const avgCEOIChange = strikes.reduce((sum, s) => sum + Math.abs(s.CE.oiChange30m), 0) / (strikes.length || 1);
  const avgPEOIChange = strikes.reduce((sum, s) => sum + Math.abs(s.PE.oiChange30m), 0) / (strikes.length || 1);

  const ceOIWall: OIWall = {
    strike: ceWallStrike?.strikePrice || 0,
    side: 'CE',
    oi: ceWallStrike?.CE.oi || 0,
    distancePct: ceWallStrike
      ? parseFloat(((ceWallStrike.strikePrice - spotPrice) / spotPrice * 100).toFixed(2))
      : 0,
    isFreshOI: ceWallStrike ? Math.abs(ceWallStrike.CE.oiChange30m) > 2 * avgCEOIChange : false,
  };

  const peOIWall: OIWall = {
    strike: peWallStrike?.strikePrice || 0,
    side: 'PE',
    oi: peWallStrike?.PE.oi || 0,
    distancePct: peWallStrike
      ? parseFloat(((peWallStrike.strikePrice - spotPrice) / spotPrice * 100).toFixed(2))
      : 0,
    isFreshOI: peWallStrike ? Math.abs(peWallStrike.PE.oiChange30m) > 2 * avgPEOIChange : false,
  };

  // Signal determination
  const nearestResistance = top3Resistance[0]?.strike || 0;
  const nearestSupport = top3Support[0]?.strike || 0;
  const resistanceDistance = nearestResistance > 0 ? ((nearestResistance - spotPrice) / spotPrice) * 100 : 999;
  const supportDistance = nearestSupport > 0 ? ((spotPrice - nearestSupport) / spotPrice) * 100 : 999;

  let signal = 'NEUTRAL';
  if (supportDistance < 0.5 && top3Support[0]?.rating === 'VERY_STRONG') {
    signal = 'AT_STRONG_SUPPORT';
  } else if (resistanceDistance < 0.5 && top3Resistance[0]?.rating === 'VERY_STRONG') {
    signal = 'AT_STRONG_RESISTANCE';
  } else if (supportDistance < resistanceDistance) {
    signal = 'CLOSER_TO_SUPPORT';
  } else {
    signal = 'CLOSER_TO_RESISTANCE';
  }

  return {
    symbol,
    spotPrice,
    resistanceLevels: top3Resistance,
    supportLevels: top3Support,
    ceOIWall,
    peOIWall,
    signal,
    formulaBreakdown: {
      title: 'Supply & Demand Analysis',
      steps: [
        { label: 'Resistance Levels', formula: 'Top 3 strikes by Call OI (supply zones)', value: top3Resistance.map(r => `${r.strike} (${r.rating})`).join(', ') },
        { label: 'Support Levels', formula: 'Top 3 strikes by Put OI (demand zones)', value: top3Support.map(s => `${s.strike} (${s.rating})`).join(', ') },
        { label: 'Strength', formula: '(Strike OI / Total OI) × 100', value: `R1: ${top3Resistance[0]?.strength}% | S1: ${top3Support[0]?.strength}%` },
        { label: 'Rating', formula: '≥15% = VERY STRONG | ≥10% = STRONG | ≥5% = MODERATE | else WEAK', value: `R1: ${top3Resistance[0]?.rating} | S1: ${top3Support[0]?.rating}` },
        { label: 'CE OI Wall', formula: 'Largest single Call OI concentration', value: `${ceOIWall.strike} (${ceOIWall.distancePct}% away)` },
        { label: 'PE OI Wall', formula: 'Largest single Put OI concentration', value: `${peOIWall.strike} (${peOIWall.distancePct}% away)` },
        { label: 'Signal', formula: 'Based on proximity to strongest levels', value: signal },
      ],
    },
  };
}
