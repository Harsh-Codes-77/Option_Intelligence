import { FIIDIIData } from '../fetchers/fiiDii';
import { getCache, setCache } from '../config/redis';
import { DataStatus } from '../store/state';

export type InstitutionalSignal = 'INSTITUTIONAL_LONG_BUILDUP' | 'INSTITUTIONAL_SHORT_BUILDUP' |
  'INSTITUTIONAL_SHORT_COVERING' | 'INSTITUTIONAL_LONG_UNWINDING' | 'INSTITUTIONAL_HEDGING' | 'NEUTRAL';

export interface InstitutionalFlowResult {
  data_status: DataStatus;
  fiiNet: number;
  diiNet: number;
  fiiBuy: number;
  fiiSell: number;
  diiBuy: number;
  diiSell: number;
  fii5DayNet: number;
  fiiTrend: 'BUYING' | 'SELLING' | 'NEUTRAL';
  fiiLongRatio: number;
  signal: InstitutionalSignal;
  smartMoneyIndex: number;
  smartMoneySignal: string;
  formulaBreakdown: any;
}

export async function runInstitutionalEngine(fiiDii: FIIDIIData | null): Promise<InstitutionalFlowResult> {
  const defaults: InstitutionalFlowResult = {
    data_status: 'NO_DATA',
    fiiNet: 0, diiNet: 0, fiiBuy: 0, fiiSell: 0, diiBuy: 0, diiSell: 0,
    fii5DayNet: 0, fiiTrend: 'NEUTRAL', fiiLongRatio: 0.5,
    signal: 'NEUTRAL', smartMoneyIndex: 50, smartMoneySignal: 'NEUTRAL',
    formulaBreakdown: { title: 'Institutional Flow', steps: [{ label: 'Status', value: 'No data' }] },
  };
  if (!fiiDii) return defaults;

  const { fii, dii } = fiiDii;
  const fiiNet = fii.netValue;
  const diiNet = dii.netValue;

  // Store FII history for 5-day trend
  const fiiHistoryKey = 'institutional:fiiHistory';
  const fiiHistory = await getCache<number[]>(fiiHistoryKey) || [];
  const updatedHistory = [...fiiHistory, fiiNet].slice(-10);
  await setCache(fiiHistoryKey, updatedHistory, 86400 * 15);

  const fii5DayNet = updatedHistory.slice(-5).reduce((s, v) => s + v, 0);
  const fiiTrend: 'BUYING' | 'SELLING' | 'NEUTRAL' = fii5DayNet > 100 ? 'BUYING' : fii5DayNet < -100 ? 'SELLING' : 'NEUTRAL';

  // FII Long Ratio (simplified)
  const fiiLongRatio = (fii.buyValue + fii.sellValue) > 0
    ? parseFloat((fii.buyValue / (fii.buyValue + fii.sellValue)).toFixed(3))
    : 0.5;

  // Classify institutional activity
  let signal: InstitutionalSignal = 'NEUTRAL';
  if (fiiNet > 500) signal = 'INSTITUTIONAL_LONG_BUILDUP';
  else if (fiiNet < -500) signal = 'INSTITUTIONAL_SHORT_BUILDUP';
  else if (fiiNet > 0) signal = 'INSTITUTIONAL_SHORT_COVERING';
  else if (fiiNet < 0) signal = 'INSTITUTIONAL_LONG_UNWINDING';

  // Check for hedging: FII selling cash but net positive in futures
  if (fiiNet < -200 && diiNet > 200) signal = 'INSTITUTIONAL_HEDGING';

  // Smart Money Index (simplified)
  const smartMoneyIndex = fiiLongRatio * 100;
  const smartMoneySignal = smartMoneyIndex > 60 ? 'SMART_MONEY_BUYING' : smartMoneyIndex < 40 ? 'SMART_MONEY_SELLING' : 'NEUTRAL';

  return {
    data_status: 'LIVE',
    fiiNet, diiNet,
    fiiBuy: fii.buyValue, fiiSell: fii.sellValue,
    diiBuy: dii.buyValue, diiSell: dii.sellValue,
    fii5DayNet: parseFloat(fii5DayNet.toFixed(2)),
    fiiTrend, fiiLongRatio, signal,
    smartMoneyIndex: parseFloat(smartMoneyIndex.toFixed(1)),
    smartMoneySignal,
    formulaBreakdown: {
      title: 'Institutional Flow Analysis',
      steps: [
        { step: 0, label: 'Data Status', formula: 'Validating FII/DII numbers', value: 'LIVE' },
        { step: 1, label: 'FII Net', formula: `Buy (${fii.buyValue.toFixed(0)} Cr) - Sell (${fii.sellValue.toFixed(0)} Cr)`, value: `${fiiNet.toFixed(0)} Cr` },
        { step: 2, label: 'DII Net', formula: `Buy (${dii.buyValue.toFixed(0)} Cr) - Sell (${dii.sellValue.toFixed(0)} Cr)`, value: `${diiNet.toFixed(0)} Cr` },
        { step: 3, label: 'FII 5-Day Net', formula: `Sum of last 5 daily FII net values`, value: `${fii5DayNet.toFixed(0)} Cr` },
        { step: 4, label: 'FII Trend', formula: `5-Day Net ${fii5DayNet > 100 ? '> 100 = BUYING' : fii5DayNet < -100 ? '< -100 = SELLING' : 'neutral'}`, value: fiiTrend },
        { step: 5, label: 'Long Ratio', formula: `FII Buy / (Buy + Sell)`, value: fiiLongRatio.toFixed(3) },
        { step: 6, label: 'Signal', formula: `FII Net=${fiiNet.toFixed(0)} Cr threshold check`, value: signal },
      ],
    },
  };
}
