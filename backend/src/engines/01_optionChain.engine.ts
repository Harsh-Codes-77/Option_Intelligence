import { ParsedOptionChain, ParsedStrike } from '../fetchers/optionChain';
import { getCache } from '../config/redis';
import { DataStatus } from '../store/state';

// OI Activity classifications
export type OIActivity = 'LONG_BUILDUP' | 'SHORT_BUILDUP' | 'SHORT_COVERING' | 'LONG_UNWINDING' | 'NEUTRAL';

export interface StrikeAnalysis {
  strikePrice: number;
  CE: {
    oi: number;
    oiChange: number;
    oiChangePct: number;
    volume: number;
    iv: number;
    ltp: number;
    theta: number;
    activity: OIActivity;
    oiChange1m: number;
    oiChange5m: number;
    oiChange15m: number;
    oiChange30m: number;
    oiChange60m: number;
  };
  PE: {
    oi: number;
    oiChange: number;
    oiChangePct: number;
    volume: number;
    iv: number;
    ltp: number;
    theta: number;
    activity: OIActivity;
    oiChange1m: number;
    oiChange5m: number;
    oiChange15m: number;
    oiChange30m: number;
    oiChange60m: number;
  };
  ivSkew: number;
  ivSkewSignal: string;
}

export interface StrikeMigration {
  detected: boolean;
  side: 'CE' | 'PE';
  oldStrike: number;
  newStrike: number;
  direction: 'RESISTANCE_MOVING_UP' | 'RESISTANCE_MOVING_DOWN' | 'SUPPORT_MOVING_UP' | 'SUPPORT_MOVING_DOWN';
}

export interface OptionChainEngineResult {
  data_status: DataStatus;
  symbol: string;
  spotPrice: number;
  timestamp: string;
  selectedExpiry: string;
  expiryDates: string[];
  strikes: StrikeAnalysis[];
  atmStrike: number;
  highestCE_OI_Strike: number;
  highestPE_OI_Strike: number;
  strikeMigrations: StrikeMigration[];
  totalCE_OI: number;
  totalPE_OI: number;
  formulaBreakdown: any;
}

function classifyOIActivity(priceChange: number, oiChange: number): OIActivity {
  if (oiChange === 0 && priceChange === 0) return 'NEUTRAL';
  if (priceChange > 0 && oiChange > 0) return 'LONG_BUILDUP';
  if (priceChange < 0 && oiChange > 0) return 'SHORT_BUILDUP';
  if (priceChange > 0 && oiChange < 0) return 'SHORT_COVERING';
  if (priceChange < 0 && oiChange < 0) return 'LONG_UNWINDING';
  return 'NEUTRAL';
}

function findATMStrike(strikes: ParsedStrike[], spotPrice: number): number {
  if (strikes.length === 0) return 0;
  let closest = strikes[0].strikePrice;
  let minDiff = Math.abs(strikes[0].strikePrice - spotPrice);
  for (const s of strikes) {
    const diff = Math.abs(s.strikePrice - spotPrice);
    if (diff < minDiff) {
      minDiff = diff;
      closest = s.strikePrice;
    }
  }
  return closest;
}

// Normal CDF approximation
function standardNormalCDF(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp(-x * x / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}

function calculateTheta(spotPrice: number, strike: number, dte: number, iv: number, type: 'CE' | 'PE'): number {
  if (dte <= 0 || iv <= 0) return 0;
  const t = dte / 365;
  const r = 0.07; // 7% risk-free rate assumption
  const vol = iv / 100;
  const d1 = (Math.log(spotPrice / strike) + (r + (vol * vol) / 2) * t) / (vol * Math.sqrt(t));
  const d2 = d1 - vol * Math.sqrt(t);
  const Nd1 = Math.exp(-0.5 * d1 * d1) / Math.sqrt(2 * Math.PI);
  
  const part1 = -(spotPrice * Nd1 * vol) / (2 * Math.sqrt(t));
  if (type === 'CE') {
    const part2 = r * strike * Math.exp(-r * t) * standardNormalCDF(d2);
    return parseFloat(((part1 - part2) / 365).toFixed(2));
  } else {
    const part2 = r * strike * Math.exp(-r * t) * standardNormalCDF(-d2);
    return parseFloat(((part1 + part2) / 365).toFixed(2));
  }
}

export async function runOptionChainEngine(
  symbol: string,
  data: ParsedOptionChain
): Promise<OptionChainEngineResult> {
  const defaultRes: OptionChainEngineResult = {
    data_status: 'NO_DATA', symbol, spotPrice: data?.spotPrice || 0, timestamp: data?.timestamp || '', selectedExpiry: data?.selectedExpiry || '', expiryDates: data?.expiryDates || [],
    strikes: [], atmStrike: 0, highestCE_OI_Strike: 0, highestPE_OI_Strike: 0, strikeMigrations: [], totalCE_OI: 0, totalPE_OI: 0,
    formulaBreakdown: { title: 'Option Chain Analysis', steps: [{ label: 'Status', value: 'No Data' }] }
  };
  if (!data || !data.strikes || data.strikes.length === 0) return defaultRes;

  const { spotPrice, strikes, timestamp, selectedExpiry, expiryDates } = data;
  const atmStrike = findATMStrike(strikes, spotPrice);

  const expiryDate = new Date(selectedExpiry || expiryDates[0]);
  const diffTime = expiryDate.getTime() - Date.now();
  const dte = Math.max(diffTime / (1000 * 60 * 60 * 24), 1);

  // Get previous snapshots from Redis for multi-timeframe analysis
  const snap1m = await getCache<ParsedOptionChain>(`oi:snapshot:${symbol}:1min`);
  const snap5m = await getCache<ParsedOptionChain>(`oi:snapshot:${symbol}:5min`);
  const snap15m = await getCache<ParsedOptionChain>(`oi:snapshot:${symbol}:15min`);
  const snap30m = await getCache<ParsedOptionChain>(`oi:snapshot:${symbol}:30min`);
  const snap60m = await getCache<ParsedOptionChain>(`oi:snapshot:${symbol}:60min`);

  const getOIFromSnapshot = (
    snapshot: ParsedOptionChain | null,
    strikePrice: number,
    side: 'CE' | 'PE'
  ): number => {
    if (!snapshot) return 0;
    const s = snapshot.strikes.find((st) => st.strikePrice === strikePrice);
    return s ? s[side].oi : 0;
  };

  // Process each strike
  const analyzedStrikes: StrikeAnalysis[] = strikes.map((s) => {
    const ceOiPrev = s.CE.oi - s.CE.oiChange;
    const peOiPrev = s.PE.oi - s.PE.oiChange;

    const ceOiChangePct = ceOiPrev > 0 ? ((s.CE.oiChange) / ceOiPrev) * 100 : 0;
    const peOiChangePct = peOiPrev > 0 ? ((s.PE.oiChange) / peOiPrev) * 100 : 0;

    // Classify activity based on price change and OI change
    const ceActivity = classifyOIActivity(s.CE.change, s.CE.oiChange);
    const peActivity = classifyOIActivity(-s.PE.change, s.PE.oiChange);

    // Multi-timeframe OI changes
    const ceOi1m = s.CE.oi - getOIFromSnapshot(snap1m, s.strikePrice, 'CE');
    const ceOi5m = s.CE.oi - getOIFromSnapshot(snap5m, s.strikePrice, 'CE');
    const ceOi15m = s.CE.oi - getOIFromSnapshot(snap15m, s.strikePrice, 'CE');
    const ceOi30m = s.CE.oi - getOIFromSnapshot(snap30m, s.strikePrice, 'CE');
    const ceOi60m = s.CE.oi - getOIFromSnapshot(snap60m, s.strikePrice, 'CE');

    const peOi1m = s.PE.oi - getOIFromSnapshot(snap1m, s.strikePrice, 'PE');
    const peOi5m = s.PE.oi - getOIFromSnapshot(snap5m, s.strikePrice, 'PE');
    const peOi15m = s.PE.oi - getOIFromSnapshot(snap15m, s.strikePrice, 'PE');
    const peOi30m = s.PE.oi - getOIFromSnapshot(snap30m, s.strikePrice, 'PE');
    const peOi60m = s.PE.oi - getOIFromSnapshot(snap60m, s.strikePrice, 'PE');

    // IV Skew
    const ivSkew = s.CE.iv - s.PE.iv;
    let ivSkewSignal = 'NEUTRAL';
    if (ivSkew > 3) ivSkewSignal = 'CALL_SKEW';
    else if (ivSkew < -3) ivSkewSignal = 'PUT_SKEW';

    return {
      strikePrice: s.strikePrice,
      CE: {
        oi: s.CE.oi,
        oiChange: s.CE.oiChange,
        oiChangePct: parseFloat(ceOiChangePct.toFixed(2)),
        volume: s.CE.volume,
        iv: s.CE.iv,
        ltp: s.CE.ltp,
        theta: calculateTheta(spotPrice, s.strikePrice, dte, s.CE.iv, 'CE'),
        activity: ceActivity,
        oiChange1m: ceOi1m,
        oiChange5m: ceOi5m,
        oiChange15m: ceOi15m,
        oiChange30m: ceOi30m,
        oiChange60m: ceOi60m,
      },
      PE: {
        oi: s.PE.oi,
        oiChange: s.PE.oiChange,
        oiChangePct: parseFloat(peOiChangePct.toFixed(2)),
        volume: s.PE.volume,
        iv: s.PE.iv,
        ltp: s.PE.ltp,
        theta: calculateTheta(spotPrice, s.strikePrice, dte, s.PE.iv, 'PE'),
        activity: peActivity,
        oiChange1m: peOi1m,
        oiChange5m: peOi5m,
        oiChange15m: peOi15m,
        oiChange30m: peOi30m,
        oiChange60m: peOi60m,
      },
      ivSkew: parseFloat(ivSkew.toFixed(2)),
      ivSkewSignal,
    };
  });

  // Find highest OI strikes
  const highestCE = [...analyzedStrikes].sort((a, b) => b.CE.oi - a.CE.oi)[0];
  const highestPE = [...analyzedStrikes].sort((a, b) => b.PE.oi - a.PE.oi)[0];

  // Strike Migration Detection
  const previousHighestCE = snap1m
    ? [...(snap1m.strikes || [])].sort((a, b) => b.CE.oi - a.CE.oi)[0]
    : null;
  const previousHighestPE = snap1m
    ? [...(snap1m.strikes || [])].sort((a, b) => b.PE.oi - a.PE.oi)[0]
    : null;

  const migrations: StrikeMigration[] = [];
  if (previousHighestCE && highestCE && previousHighestCE.strikePrice !== highestCE.strikePrice) {
    migrations.push({
      detected: true,
      side: 'CE',
      oldStrike: previousHighestCE.strikePrice,
      newStrike: highestCE.strikePrice,
      direction: highestCE.strikePrice > previousHighestCE.strikePrice
        ? 'RESISTANCE_MOVING_UP' : 'RESISTANCE_MOVING_DOWN',
    });
  }
  if (previousHighestPE && highestPE && previousHighestPE.strikePrice !== highestPE.strikePrice) {
    migrations.push({
      detected: true,
      side: 'PE',
      oldStrike: previousHighestPE.strikePrice,
      newStrike: highestPE.strikePrice,
      direction: highestPE.strikePrice > previousHighestPE.strikePrice
        ? 'SUPPORT_MOVING_UP' : 'SUPPORT_MOVING_DOWN',
    });
  }

  return {
    data_status: 'LIVE',
    symbol,
    spotPrice,
    timestamp,
    selectedExpiry,
    expiryDates,
    strikes: analyzedStrikes,
    atmStrike,
    highestCE_OI_Strike: highestCE?.strikePrice || 0,
    highestPE_OI_Strike: highestPE?.strikePrice || 0,
    strikeMigrations: migrations,
    totalCE_OI: data.totalCE_OI,
    totalPE_OI: data.totalPE_OI,
    formulaBreakdown: {
      title: 'Option Chain Analysis',
      steps: [
        { label: 'ATM Strike', formula: `Closest strike to spot ${spotPrice}`, value: atmStrike },
        { label: 'Highest CE OI', formula: `Strike with max Call OI`, value: `${highestCE?.strikePrice || 0} (OI: ${highestCE?.CE.oi.toLocaleString() || 0})` },
        { label: 'Highest PE OI', formula: `Strike with max Put OI`, value: `${highestPE?.strikePrice || 0} (OI: ${highestPE?.PE.oi.toLocaleString() || 0})` },
        { label: 'OI Activity', formula: 'Price↑ + OI↑ = Long Buildup | Price↓ + OI↑ = Short Buildup | Price↑ + OI↓ = Short Covering | Price↓ + OI↓ = Long Unwinding', value: 'Per strike' },
      ],
    },
  };
}
