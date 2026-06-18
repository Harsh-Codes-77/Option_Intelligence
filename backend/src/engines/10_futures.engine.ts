import { ParsedOptionChain } from '../fetchers/optionChain';
import { getCache, setCache } from '../config/redis';

export type FuturesSignal = 'LONG_BUILDUP' | 'SHORT_BUILDUP' | 'SHORT_COVERING' | 'LONG_UNWINDING' | 'NEUTRAL';

export interface FuturesEngineResult {
  symbol: string;
  futuresPrice: number;
  spotPrice: number;
  basis: number;
  basisPct: number;
  basisInterpretation: 'CONTANGO' | 'BACKWARDATION' | 'FLAT';
  costOfCarry: number;
  theoreticalFutures: number;
  oiSignal: FuturesSignal;
  rolloverPct: number;
  volumeRatio: number;
  volumeSignal: string;
  premiumDecayRate: number;
  daysToExpiry: number;
  signal: string;
  formulaBreakdown: any;
}

export async function runFuturesEngine(symbol: string, data: ParsedOptionChain): Promise<FuturesEngineResult> {
  const { spotPrice } = data;

  // Get futures data from cache or estimate
  const futuresCache = await getCache<any>(`futures:${symbol}`);
  const futuresPrice = futuresCache?.futuresPrice || spotPrice;
  const futuresOI = futuresCache?.oi || 0;
  const futuresVolume = futuresCache?.volume || 0;

  // Days to expiry from option chain
  const expiryDate = data.expiryDates[0];
  let daysToExpiry = 7;
  if (expiryDate) {
    const exp = new Date(expiryDate);
    const now = new Date();
    daysToExpiry = Math.max(0, Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
  }

  // Basis
  const basis = parseFloat((futuresPrice - spotPrice).toFixed(2));
  const basisPct = spotPrice > 0 ? parseFloat(((basis / spotPrice) * 100).toFixed(3)) : 0;
  const basisInterpretation = basis > 0.5 ? 'CONTANGO' as const : basis < -0.5 ? 'BACKWARDATION' as const : 'FLAT' as const;

  // Cost of Carry (risk-free rate ~6.5%)
  const theoreticalFutures = parseFloat((spotPrice * Math.exp(0.065 * daysToExpiry / 365)).toFixed(2));
  const costOfCarry = daysToExpiry > 0 && spotPrice > 0
    ? parseFloat(((basis / spotPrice / (daysToExpiry / 365)) * 100).toFixed(2))
    : 0;

  // Previous values for OI signal
  const prevFuturesKey = `futures:prev:${symbol}`;
  const prevFutures = await getCache<{ price: number; oi: number; basis: number }>(prevFuturesKey);
  await setCache(prevFuturesKey, { price: futuresPrice, oi: futuresOI, basis }, 3600);

  const priceChange = prevFutures ? futuresPrice - prevFutures.price : 0;
  const oiChange = prevFutures ? futuresOI - prevFutures.oi : 0;

  let oiSignal: FuturesSignal = 'NEUTRAL';
  if (priceChange > 0 && oiChange > 0) oiSignal = 'LONG_BUILDUP';
  else if (priceChange < 0 && oiChange > 0) oiSignal = 'SHORT_BUILDUP';
  else if (priceChange > 0 && oiChange < 0) oiSignal = 'SHORT_COVERING';
  else if (priceChange < 0 && oiChange < 0) oiSignal = 'LONG_UNWINDING';

  // Rollover % (simplified)
  const rolloverPct = 100;

  // Volume ratio
  const volHistKey = `futures:volHistory:${symbol}`;
  const volHistory = await getCache<number[]>(volHistKey) || [];
  const updatedVolHistory = [...volHistory, futuresVolume].slice(-20);
  await setCache(volHistKey, updatedVolHistory, 86400 * 7);
  const avgVol = updatedVolHistory.length > 0
    ? updatedVolHistory.reduce((a, b) => a + b, 0) / updatedVolHistory.length
    : futuresVolume || 1;
  const volumeRatio = avgVol > 0 ? parseFloat((futuresVolume / avgVol).toFixed(2)) : 1;
  const volumeSignal = volumeRatio > 1.5 ? 'HIGH_FUTURES_ACTIVITY' : 'NORMAL';

  // Premium Decay Rate
  const premiumDecayRate = prevFutures && prevFutures.basis !== 0
    ? parseFloat(((prevFutures.basis - basis) / Math.abs(prevFutures.basis) * 100).toFixed(2))
    : 0;

  const signal = oiSignal === 'LONG_BUILDUP' ? 'BULLISH' :
    oiSignal === 'SHORT_BUILDUP' ? 'BEARISH' :
    oiSignal === 'SHORT_COVERING' ? 'MILDLY_BULLISH' :
    oiSignal === 'LONG_UNWINDING' ? 'MILDLY_BEARISH' : 'NEUTRAL';

  return {
    symbol, futuresPrice, spotPrice, basis, basisPct, basisInterpretation,
    costOfCarry, theoreticalFutures, oiSignal, rolloverPct,
    volumeRatio, volumeSignal, premiumDecayRate, daysToExpiry, signal,
    formulaBreakdown: {
      title: 'Futures Analysis',
      steps: [
        { label: 'Basis', formula: `Futures (${futuresPrice}) - Spot (${spotPrice})`, value: `${basis} (${basisPct}%)` },
        { label: 'Interpretation', formula: 'Basis>0=Contango | <0=Backwardation', value: basisInterpretation },
        { label: 'Theoretical Price', formula: `Spot × e^(6.5% × ${daysToExpiry}/365)`, value: theoreticalFutures },
        { label: 'Cost of Carry', formula: `(Basis / Spot / DTE_years) × 100`, value: `${costOfCarry}%` },
        { label: 'OI Signal', formula: `Price ${priceChange >= 0 ? '↑' : '↓'} + OI ${oiChange >= 0 ? '↑' : '↓'}`, value: oiSignal },
        { label: 'Volume Ratio', formula: `Today Vol / 20-day avg`, value: `${volumeRatio}x` },
        { label: 'Days to Expiry', formula: `Nearest expiry: ${expiryDate || 'N/A'}`, value: daysToExpiry },
      ],
    },
  };
}
