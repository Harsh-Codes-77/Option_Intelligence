import { ParsedOptionChain } from '../fetchers/optionChain';
import { DataStatus } from '../store/state';

export interface GreeksResult {
  data_status: DataStatus;
  symbol: string;
  gammaExposure: number; // Net GEX
  vanna: number; // Net Vanna
  charm: number; // Net Charm
  deltaProbability: number; // ATM Call Delta
  signal: string;
  formulaBreakdown: any;
}

// ---------------------------------------------------------------------------
// Black-Scholes Math Foundations
// ---------------------------------------------------------------------------

function standardNormalPDF(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

function standardNormalCDF(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp(-x * x / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}

function getDTE(expiryDate: string): number {
  let expiry = new Date(expiryDate).getTime();
  if (Number.isNaN(expiry) && expiryDate) {
    const parts = expiryDate.split('-');
    if (parts.length === 3 && !isNaN(Number(parts[1]))) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const year = parseInt(parts[2], 10);
      expiry = new Date(year, month, day).getTime();
    }
  }
  const now = new Date().getTime();
  const days = (expiry - now) / (1000 * 60 * 60 * 24);
  return Math.max(days, 0.001); // minimum 0.001 days to prevent div by 0
}

function bsDelta(S: number, K: number, t: number, r: number, v: number, type: 'CE' | 'PE'): number {
  if (t <= 0 || v <= 0 || S <= 0 || K <= 0 || Number.isNaN(t)) return type === 'CE' ? (S > K ? 1 : 0) : (S < K ? -1 : 0);
  const d1 = (Math.log(S / K) + (r + (v * v) / 2) * t) / (v * Math.sqrt(t));
  return type === 'CE' ? standardNormalCDF(d1) : standardNormalCDF(d1) - 1;
}

function bsGamma(S: number, K: number, t: number, r: number, v: number): number {
  if (t <= 0 || v <= 0 || S <= 0 || K <= 0 || Number.isNaN(t)) return 0;
  const d1 = (Math.log(S / K) + (r + (v * v) / 2) * t) / (v * Math.sqrt(t));
  return standardNormalPDF(d1) / (S * v * Math.sqrt(t));
}

function bsVanna(S: number, K: number, t: number, r: number, v: number): number {
  if (t <= 0 || v <= 0 || S <= 0 || K <= 0 || Number.isNaN(t)) return 0;
  const d1 = (Math.log(S / K) + (r + (v * v) / 2) * t) / (v * Math.sqrt(t));
  const d2 = d1 - v * Math.sqrt(t);
  return -standardNormalPDF(d1) * d2 / v;
}

function bsCharm(S: number, K: number, t: number, r: number, v: number, type: 'CE' | 'PE'): number {
  if (S <= 0 || K <= 0 || Number.isNaN(t)) return 0;
  const oneDay = 1 / 365;
  if (t <= oneDay) return 0;
  // Numerical Charm: Change in Delta if 1 day passes
  const deltaNow = bsDelta(S, K, t, r, v, type);
  const deltaTomorrow = bsDelta(S, K, t - oneDay, r, v, type);
  return deltaTomorrow - deltaNow;
}

// ---------------------------------------------------------------------------
// Main Engine
// ---------------------------------------------------------------------------

export async function runGreeksEngine(
  symbol: string,
  data: ParsedOptionChain
): Promise<GreeksResult> {
  const defaults: GreeksResult = {
    data_status: 'NO_DATA',
    symbol,
    gammaExposure: 0,
    vanna: 0,
    charm: 0,
    deltaProbability: 0,
    signal: 'NEUTRAL',
    formulaBreakdown: { title: 'Advanced Greeks Analysis', steps: [{ label: 'Status', value: 'No Data' }] },
  };

  if (!data || !data.strikes || data.strikes.length === 0) return defaults;

  const S = data.spotPrice;
  const r = 0.07; // 7% risk-free rate
  
  let totalGEX = 0;
  let totalVanna = 0;
  let totalCharm = 0;

  // We only care about the front expiry for ATM Delta Probability
  const currentExpiry = data.selectedExpiry || data.expiryDates[0];
  const currentDTE = getDTE(currentExpiry);
  let atmDelta = 0;
  let minDiff = Infinity;

  // Iterate over all strikes to calculate aggregate dealer Greeks
  for (const strike of data.strikes) {
    const K = strike.strikePrice;
    const strikeDTE = getDTE(strike.expiryDate);
    const t = strikeDTE / 365;

    // ----- CALLS -----
    if (strike.CE && strike.CE.iv > 0 && strike.CE.oi > 0) {
      const v = strike.CE.iv / 100;
      const gamma = bsGamma(S, K, t, r, v);
      const vanna = bsVanna(S, K, t, r, v);
      const charm = bsCharm(S, K, t, r, v, 'CE');
      
      const oi = strike.CE.oi;
      
      // Standard GEX Profile: Dealer assumes short call, long put. Wait, standard SqueezeMetrics:
      // Call GEX is positive, Put GEX is negative.
      totalGEX += (oi * gamma * 100 * S * S * 0.01) || 0;
      totalVanna += (oi * vanna * 100) || 0;
      totalCharm += (oi * charm * 100) || 0;

      // Track ATM Call Delta for probability
      if (Math.abs(strikeDTE - currentDTE) < 0.5) {
        const diff = Math.abs(K - S);
        if (diff < minDiff) {
          minDiff = diff;
          atmDelta = bsDelta(S, K, t, r, v, 'CE');
        }
      }
    }

    // ----- PUTS -----
    if (strike.PE && strike.PE.iv > 0 && strike.PE.oi > 0) {
      const v = strike.PE.iv / 100;
      const gamma = bsGamma(S, K, t, r, v);
      const vanna = bsVanna(S, K, t, r, v);
      const charm = bsCharm(S, K, t, r, v, 'PE');
      
      const oi = strike.PE.oi;
      
      // Put GEX is negative
      totalGEX -= (oi * gamma * 100 * S * S * 0.01) || 0;
      totalVanna -= (oi * vanna * 100) || 0; // Put vanna is usually opposite sign in SqueezeMetrics, but sticking to standard accumulation
      totalCharm += (oi * charm * 100) || 0;
    }
  }

  // Determine Signal
  let signal = 'NEUTRAL';
  if (totalGEX > 10000000) signal = 'LONG_GAMMA_SUPPRESSION';
  else if (totalGEX < -10000000) signal = 'SHORT_GAMMA_EXPANSION';
  
  if (totalVanna > 500000 && totalGEX > 0) signal = 'MAGNET_TO_UPSIDE';
  else if (totalVanna < -500000 && totalGEX < 0) signal = 'VOLATILE_DOWNSIDE';

  return {
    data_status: 'LIVE',
    symbol,
    gammaExposure: parseFloat(totalGEX.toFixed(2)),
    vanna: parseFloat(totalVanna.toFixed(2)),
    charm: parseFloat(totalCharm.toFixed(2)),
    deltaProbability: parseFloat((atmDelta * 100).toFixed(2)),
    signal,
    formulaBreakdown: {
      title: 'Passarelli Greeks Analysis',
      steps: [
        { step: 0, label: 'Data Status', formula: 'Validating options chain', value: 'LIVE' },
        { step: 1, label: 'Net Gamma Exposure (GEX)', formula: 'Σ(Call OI * Gamma) - Σ(Put OI * Gamma)', value: totalGEX > 1e7 ? `${(totalGEX / 1e7).toFixed(2)} Cr` : `${(totalGEX / 1e5).toFixed(2)} L` },
        { step: 2, label: 'Net Vanna', formula: 'Σ(OI * dDelta / dVol)', value: totalVanna > 1e7 ? `${(totalVanna / 1e7).toFixed(2)} Cr` : `${(totalVanna / 1e5).toFixed(2)} L` },
        { step: 3, label: 'Net Charm', formula: 'Σ(OI * dDelta / dTime)', value: totalCharm.toFixed(2) },
        { step: 4, label: 'ATM Call Probability', formula: 'ATM Call Delta ≈ ITM Probability', value: `${(atmDelta * 100).toFixed(1)}%` },
      ]
    }
  };
}
