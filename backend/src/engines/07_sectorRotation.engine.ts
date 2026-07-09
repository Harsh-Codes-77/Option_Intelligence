import { SectorData } from '../fetchers/sectors';
import { getCache, setCache } from '../config/redis';
import { DataStatus } from '../store/state';

export type RRGQuadrant = 'LEADING' | 'WEAKENING' | 'LAGGING' | 'IMPROVING';

export interface SectorAnalysis {
  key: string;
  name: string;
  price: number;
  changePct: number;
  rsRatio: number;
  rsMomentum: number;
  relativeVolume: number;
  sectorBreadth: number;
  roc5: number;
  roc20: number;
  sectorScore: number;
  rrgQuadrant: RRGQuadrant;
}

export interface SectorRotationResult {
  data_status: DataStatus;
  sectors: SectorAnalysis[];
  topSectors: SectorAnalysis[];
  bottomSectors: SectorAnalysis[];
  signal: string;
  formulaBreakdown: any;
}

function classifyRRG(rsRatio: number, rsMomentum: number): RRGQuadrant {
  if (rsRatio > 100 && rsMomentum > 0) return 'LEADING';
  if (rsRatio > 100 && rsMomentum <= 0) return 'WEAKENING';
  if (rsRatio <= 100 && rsMomentum <= 0) return 'LAGGING';
  return 'IMPROVING';
}

export async function runSectorRotationEngine(sectorDataList: SectorData[]): Promise<SectorRotationResult> {
  let data_status: DataStatus = 'LIVE';

  if (!sectorDataList || sectorDataList.length === 0) {
    data_status = 'WARMING_UP';
    return {
      data_status, sectors: [], topSectors: [], bottomSectors: [], signal: 'NEUTRAL',
      formulaBreakdown: { title: 'Sector Rotation Analysis', steps: [{ label: 'Status', value: 'No data' }] },
    };
  }

  const analyses: SectorAnalysis[] = [];

  for (const sector of sectorDataList) {
    const historyKey = `sector:history:${sector.key}`;
    const history = await getCache<{ price: number; volume: number; timestamp: number }[]>(historyKey) || [];

    // Store current data point
    const currentPoint = { price: sector.lastPrice, volume: sector.volume, timestamp: Date.now() };
    const updatedHistory = [...history, currentPoint].slice(-100);
    await setCache(historyKey, updatedHistory, 86400 * 30);

    // RS Ratio: sector performance vs baseline (100 as neutral)
    const price20ago = updatedHistory.length >= 20 ? updatedHistory[updatedHistory.length - 20].price : sector.previousClose;
    const sectorReturn = price20ago > 0 ? sector.lastPrice / price20ago : 1;
    const rsRatio = parseFloat((sectorReturn * 100).toFixed(2));

    // RS Momentum
    const rsHistory = await getCache<number[]>(`sector:rs:${sector.key}`) || [];
    const newRsHistory = [...rsHistory, rsRatio].slice(-20);
    await setCache(`sector:rs:${sector.key}`, newRsHistory, 86400 * 30);
    const rs10ago = newRsHistory.length >= 10 ? newRsHistory[newRsHistory.length - 10] : rsRatio;
    const rsMomentum = parseFloat((rsRatio - rs10ago).toFixed(2));

    // Relative Volume
    const avgVolume = updatedHistory.length >= 20
      ? updatedHistory.slice(-20).reduce((s, h) => s + h.volume, 0) / 20
      : sector.volume || 1;
    const relativeVolume = avgVolume > 0 ? parseFloat((sector.volume / avgVolume).toFixed(2)) : 1;

    // Sector Breadth
    const totalStocks = sector.advances + sector.declines + sector.unchanged;
    if (totalStocks === 0) {
      data_status = 'WARMING_UP';
    }
    const sectorBreadth = totalStocks > 0 ? parseFloat(((sector.advances / totalStocks) * 100).toFixed(1)) : 0; // Removed default 50

    // Rate of Change
    const price5ago = updatedHistory.length >= 5 ? updatedHistory[updatedHistory.length - 5].price : sector.previousClose;
    const roc5 = price5ago > 0 ? parseFloat(((sector.lastPrice - price5ago) / price5ago * 100).toFixed(2)) : 0;
    const roc20 = price20ago > 0 ? parseFloat(((sector.lastPrice - price20ago) / price20ago * 100).toFixed(2)) : 0;

    // Sector Score (0-100)
    const rsNorm = Math.min(Math.max((rsRatio - 90) / 20 * 100, 0), 100);
    const momNorm = Math.min(Math.max((rsMomentum + 5) / 10 * 100, 0), 100);
    const volNorm = Math.min(relativeVolume / 2 * 100, 100);
    const rocNorm = Math.min(Math.max((roc5 + 5) / 10 * 100, 0), 100);

    const sectorScore = parseFloat((
      (rsNorm * 0.30) + (momNorm * 0.20) + (sectorBreadth * 0.20) + (rocNorm * 0.15) + (volNorm * 0.15)
    ).toFixed(1));

    const rrgQuadrant = classifyRRG(rsRatio, rsMomentum);

    analyses.push({
      key: sector.key, name: sector.name, price: sector.lastPrice,
      changePct: sector.changePct, rsRatio, rsMomentum, relativeVolume,
      sectorBreadth, roc5, roc20, sectorScore, rrgQuadrant,
    });
  }

  if (data_status === 'WARMING_UP') {
    return {
      data_status, sectors: [], topSectors: [], bottomSectors: [], signal: 'NEUTRAL',
      formulaBreakdown: { title: 'Sector Rotation Analysis', steps: [{ label: 'Status', value: data_status === 'WARMING_UP' ? 'Warming Up...' : 'No Data' }] },
    };
  }

  // Sort by score
  analyses.sort((a, b) => b.sectorScore - a.sectorScore);
  const topSectors = analyses.slice(0, 3);
  const bottomSectors = analyses.slice(-3);

  const leadingCount = analyses.filter(s => s.rrgQuadrant === 'LEADING').length;
  const laggingCount = analyses.filter(s => s.rrgQuadrant === 'LAGGING').length;
  let signal = 'MIXED';
  if (leadingCount > laggingCount + 2) signal = 'BROAD_STRENGTH';
  else if (laggingCount > leadingCount + 2) signal = 'BROAD_WEAKNESS';

  return {
    data_status, sectors: analyses, topSectors, bottomSectors, signal,
    formulaBreakdown: {
      title: 'Sector Rotation Analysis',
      steps: [
        { label: 'Data Status', formula: 'Validating totals', value: data_status },
        { label: 'RS Ratio', formula: '(sector_price / sector_price_20d_ago) × 100', value: 'Per sector' },
        { label: 'RS Momentum', formula: 'RS_Ratio_today - RS_Ratio_10d_ago', value: 'Per sector' },
        { label: 'RRG Quadrant', formula: 'RS>100+Mom>0=Leading | RS>100+Mom<0=Weakening | RS<100+Mom<0=Lagging | RS<100+Mom>0=Improving', value: `${leadingCount} Leading, ${laggingCount} Lagging` },
        { label: 'Sector Score', formula: 'RS×0.30 + Momentum×0.20 + Breadth×0.20 + ROC5×0.15 + RelVol×0.15', value: 'Ranked' },
        { label: 'Top 3', formula: 'Highest sector scores', value: topSectors.map(s => s.key).join(', ') },
        { label: 'Bottom 3', formula: 'Lowest sector scores', value: bottomSectors.map(s => s.key).join(', ') },
      ],
    },
  };
}
