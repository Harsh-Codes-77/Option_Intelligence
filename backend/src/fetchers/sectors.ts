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

const SECTOR_URLS: Record<string, string> = {
  BANK: 'https://www.nseindia.com/api/equity-stockIndices?index=NIFTY%20BANK',
  IT: 'https://www.nseindia.com/api/equity-stockIndices?index=NIFTY%20IT',
  AUTO: 'https://www.nseindia.com/api/equity-stockIndices?index=NIFTY%20AUTO',
  PHARMA: 'https://www.nseindia.com/api/equity-stockIndices?index=NIFTY%20PHARMA',
  METAL: 'https://www.nseindia.com/api/equity-stockIndices?index=NIFTY%20METAL',
  PSU_BANK: 'https://www.nseindia.com/api/equity-stockIndices?index=NIFTY%20PSU%20BANK',
  ENERGY: 'https://www.nseindia.com/api/equity-stockIndices?index=NIFTY%20ENERGY',
  FMCG: 'https://www.nseindia.com/api/equity-stockIndices?index=NIFTY%20FMCG',
  REALTY: 'https://www.nseindia.com/api/equity-stockIndices?index=NIFTY%20REALTY',
  INFRA: 'https://www.nseindia.com/api/equity-stockIndices?index=NIFTY%20INFRA',
  FIN_SERVICES: 'https://www.nseindia.com/api/equity-stockIndices?index=NIFTY%20FINANCIAL%20SERVICES',
  DEFENCE: 'https://www.nseindia.com/api/equity-stockIndices?index=NIFTY%20INDIA%20DEFENCE',
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

export async function fetchSectorData(sectorKey: string): Promise<SectorData | null> {
  const url = SECTOR_URLS[sectorKey];
  if (!url) return null;

  const data = await nseFetcher.fetch<any>(url);
  if (!data || !data.data || data.data.length === 0) return null;

  const entries = data.data as any[];
  // First entry is typically the index summary
  const indexEntry = entries[0];
  const constituents = entries.slice(1).map(parseStockData);

  const advances = constituents.filter((s) => s.change > 0).length;
  const declines = constituents.filter((s) => s.change < 0).length;
  const unchanged = constituents.filter((s) => s.change === 0).length;

  const sectorInfo = SECTORS.find((s) => s.key === sectorKey);

  return {
    key: sectorKey,
    name: sectorInfo?.name || sectorKey,
    lastPrice: indexEntry.lastPrice || indexEntry.last || 0,
    open: indexEntry.open || 0,
    high: indexEntry.dayHigh || indexEntry.high || 0,
    low: indexEntry.dayLow || indexEntry.low || 0,
    previousClose: indexEntry.previousClose || 0,
    change: indexEntry.change || 0,
    changePct: indexEntry.pChange || 0,
    volume: constituents.reduce((sum, s) => sum + s.totalTradedVolume, 0),
    advances,
    declines,
    unchanged,
    constituents,
  };
}

export async function fetchAllSectors(): Promise<SectorData[]> {
  const sectors: SectorData[] = [];
  const keys = Object.keys(SECTOR_URLS);

  for (const key of keys) {
    const data = await fetchSectorData(key);
    if (data) {
      sectors.push(data);
    }
    await nseFetcher.rateLimitDelay();
  }

  return sectors;
}
