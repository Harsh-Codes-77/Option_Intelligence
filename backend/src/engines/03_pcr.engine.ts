import { ParsedOptionChain } from '../fetchers/optionChain';
import { getCache, setCache } from '../config/redis';
import { DataStatus } from '../store/state';

export type PCRClassification = 'EXTREMELY_BULLISH' | 'BULLISH' | 'NEUTRAL' | 'BEARISH' | 'EXTREMELY_BEARISH';
export type PCRTrend = 'RISING' | 'FALLING' | 'STABLE';
export type PCRSignal = 'STRONG_BULLISH' | 'BULLISH' | 'NEUTRAL' | 'BEARISH' | 'STRONG_BEARISH';

export interface PCRResult {
  data_status: DataStatus;
  symbol: string;
  pcrOI: number;
  pcrVolume: number;
  classification: PCRClassification;
  trend: PCRTrend;
  signal: PCRSignal;
  atmPCR: number;
  totalPutOI: number;
  totalCallOI: number;
  totalPutVolume: number;
  totalCallVolume: number;
  pcrHistory: number[];
  formulaBreakdown: any;
}

function classifyPCR(pcr: number): PCRClassification {
  if (pcr > 1.5) return 'EXTREMELY_BULLISH';
  if (pcr > 1.2) return 'BULLISH';
  if (pcr > 0.9) return 'NEUTRAL';
  if (pcr > 0.7) return 'BEARISH';
  return 'EXTREMELY_BEARISH';
}

function determinePCRSignal(pcr: number, trend: PCRTrend): PCRSignal {
  if (pcr > 1.2 && trend === 'RISING') return 'STRONG_BULLISH';
  if (pcr > 1.2) return 'BULLISH';
  if (pcr < 0.8 && trend === 'FALLING') return 'STRONG_BEARISH';
  if (pcr < 0.8) return 'BEARISH';
  return 'NEUTRAL';
}

export async function runPCREngine(symbol: string, data: ParsedOptionChain): Promise<PCRResult> {
  const defaults: PCRResult = {
    data_status: 'NO_DATA', symbol, pcrOI: 0, pcrVolume: 0, classification: 'NEUTRAL',
    trend: 'STABLE', signal: 'NEUTRAL', atmPCR: 0, totalPutOI: 0, totalCallOI: 0,
    totalPutVolume: 0, totalCallVolume: 0, pcrHistory: [],
    formulaBreakdown: { title: 'PCR Score Calculation', steps: [{ label: 'Status', value: 'No Data' }] }
  };

  if (!data || !data.strikes || data.strikes.length === 0) return defaults;

  const { strikes, spotPrice, totalCE_OI, totalPE_OI, totalCE_Volume, totalPE_Volume } = data;
  
  if (totalCE_OI === 0 && totalPE_OI === 0) return defaults;

  const pcrOI = totalCE_OI > 0 ? parseFloat((totalPE_OI / totalCE_OI).toFixed(4)) : 0;
  const pcrVolume = totalCE_Volume > 0 ? parseFloat((totalPE_Volume / totalCE_Volume).toFixed(4)) : 0;
  const classification = classifyPCR(pcrOI);

  const atmRange = spotPrice * 0.02;
  const atmStrikes = strikes.filter(s => Math.abs(s.strikePrice - spotPrice) <= atmRange);
  const atmPutOI = atmStrikes.reduce((sum, s) => sum + s.PE.oi, 0);
  const atmCallOI = atmStrikes.reduce((sum, s) => sum + s.CE.oi, 0);
  const atmPCR = atmCallOI > 0 ? parseFloat((atmPutOI / atmCallOI).toFixed(4)) : 0;

  const pcrHistory = await getCache<number[]>(`pcr:history:${symbol}`) || [];
  let trend: PCRTrend = 'STABLE';
  if (pcrHistory.length >= 2) {
    const prev = pcrHistory[0];
    if (pcrOI > prev + 0.03) trend = 'RISING';
    else if (pcrOI < prev - 0.03) trend = 'FALLING';
  }

  const signal = determinePCRSignal(pcrOI, trend);
  const newHistory = [pcrOI, ...pcrHistory].slice(0, 20);
  await setCache(`pcr:history:${symbol}`, newHistory, 86400);

  return {
    data_status: 'LIVE',
    symbol, pcrOI, pcrVolume, classification, trend, signal, atmPCR,
    totalPutOI: totalPE_OI, totalCallOI: totalCE_OI,
    totalPutVolume: totalPE_Volume, totalCallVolume: totalCE_Volume,
    pcrHistory: newHistory,
    formulaBreakdown: {
      title: 'PCR Score Calculation',
      steps: [
        { step: 0, label: 'Data Status', formula: 'Validating total OI', value: 'LIVE' },
        { step: 1, label: 'Total Put OI', formula: 'Sum all PE openInterest', value: totalPE_OI.toLocaleString() },
        { step: 2, label: 'Total Call OI', formula: 'Sum all CE openInterest', value: totalCE_OI.toLocaleString() },
        { step: 3, label: 'PCR OI', formula: `Put OI / Call OI`, value: pcrOI.toFixed(4) },
        { step: 4, label: 'Classification', formula: `PCR ${pcrOI.toFixed(2)} threshold check`, value: classification },
        { step: 5, label: 'PCR Trend', formula: `Current vs previous`, value: trend },
        { step: 6, label: 'ATM PCR', formula: `Strikes within ±2% of spot`, value: atmPCR.toFixed(4) },
        { step: 7, label: 'Final Signal', formula: `PCR=${pcrOI.toFixed(2)} + Trend=${trend}`, value: signal },
      ],
      threshold_used: 'Bullish: >1.2 | Neutral: 0.9-1.2 | Bearish: <0.7',
    },
  };
}
