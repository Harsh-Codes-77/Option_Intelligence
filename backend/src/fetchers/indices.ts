import { nseFetcher } from './nse.fetcher';

export interface IndexData {
  indexName: string;
  lastPrice: number;
  open: number;
  high: number;
  low: number;
  previousClose: number;
  change: number;
  changePct: number;
  timestamp: string;
}

export interface IndicesResponse {
  nifty: IndexData | null;
  bankNifty: IndexData | null;
  finNifty: IndexData | null;
  vix: number;
  marketStatus: 'PRE_OPEN' | 'OPEN' | 'CLOSED';
  allIndices: IndexData[];
}

const ALL_INDICES_URL = 'https://www.nseindia.com/api/allIndices';
const MARKET_STATUS_URL = 'https://www.nseindia.com/api/marketStatus';

function parseIndexEntry(entry: any): IndexData {
  return {
    indexName: entry.index || entry.indexSymbol || '',
    lastPrice: entry.last || entry.lastPrice || 0,
    open: entry.open || 0,
    high: entry.high || 0,
    low: entry.low || 0,
    previousClose: entry.previousClose || 0,
    change: entry.variation || entry.change || 0,
    changePct: entry.percentChange || entry.pChange || 0,
    timestamp: entry.timeVal || new Date().toISOString(),
  };
}

export async function fetchIndices(): Promise<IndicesResponse> {
  const result: IndicesResponse = {
    nifty: null,
    bankNifty: null,
    finNifty: null,
    vix: 0,
    marketStatus: 'CLOSED',
    allIndices: [],
  };

  let data;
  try {
    data = await nseFetcher.getAllIndices();
  } catch (err) {
    console.warn('[Indices] fetch failed:', err);
    return result;
  }
  
  if (!data || !data.data) return result;

  const indices = data.data as any[];
  result.allIndices = indices.map(parseIndexEntry);

  // Find specific indices
  for (const entry of indices) {
    const name = (entry.index || entry.indexSymbol || '').toUpperCase();

    if (name.includes('NIFTY 50') && !name.includes('BANK') && !name.includes('FIN')) {
      result.nifty = parseIndexEntry(entry);
    }
    if (name.includes('NIFTY BANK')) {
      result.bankNifty = parseIndexEntry(entry);
    }
    if (name.includes('NIFTY FIN') || name.includes('FINNIFTY')) {
      result.finNifty = parseIndexEntry(entry);
    }
    if (name.includes('INDIA VIX')) {
      result.vix = entry.last || entry.lastPrice || 0;
    }
  }

  // Fetch market status
  const statusData = await nseFetcher.getMarketStatus();
  if (statusData && statusData.marketState) {
    const states = Array.isArray(statusData.marketState) ? statusData.marketState : [statusData.marketState];
    for (const s of states) {
      const market = (s.market || '').toLowerCase();
      if (market.includes('capital') || market.includes('equity')) {
        const status = (s.marketStatus || '').toUpperCase();
        if (status.includes('OPEN')) {
          result.marketStatus = 'OPEN';
        } else if (status.includes('PRE') || status.includes('CLOSE ORDER')) {
          result.marketStatus = 'PRE_OPEN';
        } else {
          result.marketStatus = 'CLOSED';
        }
        break;
      }
    }
  }

  return result;
}

export async function fetchIndexData(indexName: string): Promise<IndexData | null> {
  const data = await nseFetcher.getEquityStockIndices(indexName);

  if (!data || !data.data || data.data.length === 0) return null;

  // First entry is usually the index itself
  const indexEntry = data.data[0];
  return parseIndexEntry(indexEntry);
}
