import { ParsedOptionChain } from '../fetchers/optionChain';
import { LOT_SIZES } from '../store/state';

export interface MaxPainResult {
  symbol: string;
  maxPainStrike: number;
  spotPrice: number;
  distance: number;
  distancePct: number;
  signal: 'ABOVE_MAX_PAIN' | 'BELOW_MAX_PAIN' | 'AT_MAX_PAIN';
  painByStrike: { strike: number; totalPain: number }[];
  formulaBreakdown: any;
}

export function runMaxPainEngine(symbol: string, data: ParsedOptionChain): MaxPainResult {
  const { strikes, spotPrice } = data;
  const lotSize = LOT_SIZES[symbol] || 50;
  const allStrikePrices = strikes.map(s => s.strikePrice);

  let maxPainStrike = 0;
  let minTotalPain = Infinity;
  const painByStrike: { strike: number; totalPain: number }[] = [];

  for (const targetStrike of allStrikePrices) {
    let totalPain = 0;
    for (const s of strikes) {
      // Call pain: if target > strike, calls are ITM for holders, pain for writers
      if (s.strikePrice < targetStrike) {
        totalPain += s.CE.oi * (targetStrike - s.strikePrice) * lotSize;
      }
      // Put pain: if target < strike, puts are ITM for holders, pain for writers
      if (s.strikePrice > targetStrike) {
        totalPain += s.PE.oi * (s.strikePrice - targetStrike) * lotSize;
      }
    }
    painByStrike.push({ strike: targetStrike, totalPain });
    if (totalPain < minTotalPain) {
      minTotalPain = totalPain;
      maxPainStrike = targetStrike;
    }
  }

  const distance = maxPainStrike - spotPrice;
  const distancePct = spotPrice > 0 ? parseFloat(((distance / spotPrice) * 100).toFixed(2)) : 0;

  let signal: MaxPainResult['signal'] = 'AT_MAX_PAIN';
  if (spotPrice > maxPainStrike + (spotPrice * 0.01)) signal = 'ABOVE_MAX_PAIN';
  else if (spotPrice < maxPainStrike - (spotPrice * 0.01)) signal = 'BELOW_MAX_PAIN';

  // Sort painByStrike, keep top 20 around max pain for chart
  painByStrike.sort((a, b) => a.strike - b.strike);
  const maxPainIdx = painByStrike.findIndex(p => p.strike === maxPainStrike);
  const chartData = painByStrike.slice(Math.max(0, maxPainIdx - 10), maxPainIdx + 11);

  return {
    symbol, maxPainStrike, spotPrice,
    distance, distancePct, signal,
    painByStrike: chartData,
    formulaBreakdown: {
      title: 'Max Pain Calculation',
      steps: [
        { step: 1, label: 'Method', formula: 'Find strike where option buyers lose most', value: 'Iterate all strikes' },
        { step: 2, label: 'Call Pain', formula: 'If target > strike: CE_OI × (target - strike) × lot_size', value: `Lot size: ${lotSize}` },
        { step: 3, label: 'Put Pain', formula: 'If target < strike: PE_OI × (strike - target) × lot_size', value: `Lot size: ${lotSize}` },
        { step: 4, label: 'Max Pain', formula: 'Strike with minimum total pain', value: maxPainStrike },
        { step: 5, label: 'Distance', formula: `(${maxPainStrike} - ${spotPrice.toFixed(0)}) / ${spotPrice.toFixed(0)} × 100`, value: `${distancePct}%` },
        { step: 6, label: 'Signal', formula: `Spot ${spotPrice > maxPainStrike ? 'above' : spotPrice < maxPainStrike ? 'below' : 'at'} max pain (±1% buffer)`, value: signal },
      ],
    },
  };
}
