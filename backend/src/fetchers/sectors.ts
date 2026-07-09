import { nseFetcher } from './nse.fetcher';
import { SECTORS } from '../store/state';

export interface SectorData {
  key: string;
  name: string;
  lastPrice: number;
  open: number;
  high: number;
  low: number;
  previousClose: number;
  change: number;
  changePct: number;
  volume: number;
  advances: number;
  declines: number;
  unchanged: number;
  constituents: StockData[];
}

export interface StockData {
  symbol: string;
  lastPrice: number;
  change: number;
  pChange: number;
  open: number;
  high: number;
  low: number;
  previousClose: number;
  totalTradedVolume: number;
  totalTradedValue: number;
}

const SECTOR_NAMES: Record<string, string> = {
  BANK: 'NIFTY BANK',
  IT: 'NIFTY IT',
  AUTO: 'NIFTY AUTO',
  PHARMA: 'NIFTY PHARMA',
  METAL: 'NIFTY METAL',
  PSU_BANK: 'NIFTY PSU BANK',
  ENERGY: 'NIFTY ENERGY',
  FMCG: 'NIFTY FMCG',
  REALTY: 'NIFTY REALTY',
  INFRA: 'NIFTY INFRA',
  FIN_SERVICES: 'NIFTY FINANCIAL SERVICES',
  DEFENCE: 'NIFTY INDIA DEFENCE',
};

function parseStockData(entry: any): StockData {
  return {
    symbol: entry.symbol || '',
    lastPrice: entry.lastPrice || 0,
    change: entry.change || 0,
    pChange: entry.pChange || 0,
    open: entry.open || 0,
    high: entry.dayHigh || entry.high || 0,
    low: entry.dayLow || entry.low || 0,
    previousClose: entry.previousClose || 0,
    totalTradedVolume: entry.totalTradedVolume || 0,
    totalTradedValue: entry.totalTradedValue || 0,
  };
}

export async function fetchAllSectors(): Promise<SectorData[]> {
  const sectors: SectorData[] = [];
  const keys = Object.keys(SECTOR_NAMES);

  let data;
  try {
    data = await nseFetcher.nseIndia.getAllIndices();
  } catch (err: any) {
    console.warn(`[Sectors] Fetch failed:`, err.message);
    return sectors;
  }
  
  if (!data || !data.data) return sectors;
  const entries = data.data as any[];

  for (const key of keys) {
    const indexName = SECTOR_NAMES[key];
    const indexEntry = entries.find(e => e.index === indexName || e.indexSymbol === indexName);
    
    if (indexEntry) {
      const sectorInfo = SECTORS.find((s) => s.key === key);
      
      const advances = parseInt(indexEntry.advances) || 0;
      const declines = parseInt(indexEntry.declines) || 0;
      const unchanged = parseInt(indexEntry.unchanged) || 0;
      
      sectors.push({
        key,
        name: sectorInfo?.name || key,
        lastPrice: indexEntry.last || indexEntry.lastPrice || 0,
        open: indexEntry.open || 0,
        high: indexEntry.high || 0,
        low: indexEntry.low || 0,
        previousClose: indexEntry.previousClose || 0,
        change: indexEntry.variation || indexEntry.change || 0,
        changePct: indexEntry.percentChange || indexEntry.pChange || 0,
        volume: 0,
        advances,
        declines,
        unchanged,
        constituents: [],
      });
    }
  }

  return sectors;
}
