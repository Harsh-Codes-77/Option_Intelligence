import { nseFetcher } from './nse.fetcher';
import { StockData } from './sectors';

export interface BreadthData {
  totalStocks: number;
  advancing: number;
  declining: number;
  unchanged: number;
  stocks: StockData[];
}

const NIFTY_500_URL = 'https://www.nseindia.com/api/equity-stockIndices?index=NIFTY%20500';

export async function fetchBreadthData(): Promise<BreadthData | null> {
  let data;
  try {
    data = await nseFetcher.nseIndia.getAllIndices();
  } catch (err: any) {
    console.warn(`[Breadth] Fetch failed for NIFTY 500:`, err.message);
    return null;
  }
  if (!data || !data.data) return null;

  const entries = data.data as any[];
  const nifty500 = entries.find(e => e.index === 'NIFTY 500' || e.indexSymbol === 'NIFTY 500');
  
  if (!nifty500) return null;

  // Since getAllIndices only provides summary stats (advances, declines, unchanged) and not constituents,
  // we will use the summary stats.
  const advancing = parseInt(nifty500.advances) || 0;
  const declining = parseInt(nifty500.declines) || 0;
  const unchanged = parseInt(nifty500.unchanged) || 0;
  const totalStocks = advancing + declining + unchanged;

  return {
    totalStocks,
    advancing,
    declining,
    unchanged,
    stocks: [], // We don't have individual stocks from getAllIndices, but we only need aggregate numbers
  };
}

// Fetch top gainers/losers for additional breadth info
export async function fetchGainersLosers(): Promise<{ gainers: any[]; losers: any[] }> {
  const [gainersData, losersData] = await Promise.all([
    nseFetcher.fetch<any>('https://www.nseindia.com/api/live-analysis-variations?index=gainers&limit=10'),
    nseFetcher.fetch<any>('https://www.nseindia.com/api/live-analysis-variations?index=loosers&limit=10'),
  ]);

  return {
    gainers: gainersData?.data || [],
    losers: losersData?.data || [],
  };
}
