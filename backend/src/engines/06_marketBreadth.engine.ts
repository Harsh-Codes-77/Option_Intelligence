import { BreadthData } from '../fetchers/breadth';
import { getCache, setCache } from '../config/redis';

export type MarketHealth = 'HEALTHY_BULL' | 'NEUTRAL' | 'WEAK_MARKET' | 'BEAR_MARKET';

export interface BreadthResult {
  advancing: number;
  declining: number;
  unchanged: number;
  adRatio: number;
  adLine: number;
  hlIndex: number;
  mcClellanOsc: number;
  breadthScore: number;
  marketHealth: MarketHealth;
  signal: string;
  formulaBreakdown: any;
}

function calculateEMA(values: number[], period: number): number {
  if (values.length === 0) return 0;
  const multiplier = 2 / (period + 1);
  let ema = values.slice(0, Math.min(period, values.length)).reduce((a, b) => a + b, 0) /
    Math.min(period, values.length);
  for (let i = Math.min(period, values.length); i < values.length; i++) {
    ema = (values[i] - ema) * multiplier + ema;
  }
  return ema;
}

export async function runBreadthEngine(data: BreadthData | null): Promise<BreadthResult> {
  const defaults: BreadthResult = {
    advancing: 0, declining: 0, unchanged: 0, adRatio: 1,
    adLine: 0, hlIndex: 50, mcClellanOsc: 0, breadthScore: 50,
    marketHealth: 'NEUTRAL', signal: 'NEUTRAL',
    formulaBreakdown: { title: 'Market Breadth', steps: [{ label: 'Status', value: 'No data' }] },
  };
  if (!data) return defaults;

  const { advancing, declining, unchanged } = data;
  const adRatio = declining > 0 ? parseFloat((advancing / declining).toFixed(2)) : advancing > 0 ? 99 : 1;

  // AD Line (cumulative)
  const prevADLine = (await getCache<number>('breadth:adLine')) || 0;
  const adLine = prevADLine + (advancing - declining);
  await setCache('breadth:adLine', adLine, 86400);

  // Advances percentage history for McClellan
  const advPct = (advancing + declining) > 0 ? (advancing / (advancing + declining)) * 100 : 50;
  const advHistory = (await getCache<number[]>('breadth:advHistory')) || [];
  const newAdvHistory = [...advHistory, advPct].slice(-50);
  await setCache('breadth:advHistory', newAdvHistory, 86400);

  // McClellan Oscillator
  const ema19 = calculateEMA(newAdvHistory, 19);
  const ema39 = calculateEMA(newAdvHistory, 39);
  const mcClellanOsc = parseFloat((ema19 - ema39).toFixed(2));

  // High-Low Index (simplified - using percentage of stocks near highs)
  const nearHighs = data.stocks.filter(s => s.previousClose > 0 && s.lastPrice >= s.high * 0.98).length;
  const nearLows = data.stocks.filter(s => s.previousClose > 0 && s.lastPrice <= s.low * 1.02).length;
  const hlIndex = (nearHighs + nearLows) > 0
    ? parseFloat(((nearHighs / (nearHighs + nearLows)) * 100).toFixed(1))
    : 50;

  // Breadth Score (0-100)
  const adNorm = Math.min(adRatio / 3, 1) * 100;
  const mcNorm = Math.max(Math.min((mcClellanOsc + 100) / 200 * 100, 100), 0);
  const breadthScore = parseFloat(((adNorm * 0.4) + (hlIndex * 0.3) + (mcNorm * 0.3)).toFixed(1));

  let marketHealth: MarketHealth = 'NEUTRAL';
  if (breadthScore >= 70) marketHealth = 'HEALTHY_BULL';
  else if (breadthScore >= 50) marketHealth = 'NEUTRAL';
  else if (breadthScore >= 30) marketHealth = 'WEAK_MARKET';
  else marketHealth = 'BEAR_MARKET';

  return {
    advancing, declining, unchanged, adRatio, adLine,
    hlIndex, mcClellanOsc, breadthScore, marketHealth,
    signal: marketHealth,
    formulaBreakdown: {
      title: 'Market Breadth Analysis',
      steps: [
        { step: 1, label: 'A/D Count', formula: `Advancing / Declining`, value: `${advancing} / ${declining}` },
        { step: 2, label: 'A/D Ratio', formula: `${advancing} / ${declining}`, value: adRatio },
        { step: 3, label: 'A/D Line', formula: `Previous (${prevADLine}) + (${advancing} - ${declining})`, value: adLine },
        { step: 4, label: 'McClellan', formula: `EMA19(${ema19.toFixed(1)}) - EMA39(${ema39.toFixed(1)})`, value: mcClellanOsc },
        { step: 5, label: 'H/L Index', formula: `Near Highs / (Near Highs + Near Lows) × 100`, value: `${hlIndex}%` },
        { step: 6, label: 'Breadth Score', formula: `AD_norm(${adNorm.toFixed(1)})×0.4 + HL(${hlIndex})×0.3 + MC_norm(${mcNorm.toFixed(1)})×0.3`, value: breadthScore },
        { step: 7, label: 'Market Health', formula: '≥70=Healthy Bull | ≥50=Neutral | ≥30=Weak | <30=Bear', value: marketHealth },
      ],
    },
  };
}
