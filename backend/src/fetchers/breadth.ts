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
  const data = await nseFetcher.fetch<any>(NIFTY_500_URL);
  if (!data || !data.data) return null;

  const entries = data.data as any[];
  // Skip the first entry (index summary)
  const stocks: StockData[] = entries.slice(1).map((entry: any) => ({
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
  }));

  const advancing = stocks.filter((s) => s.change > 0 || s.lastPrice > s.previousClose).length;
  const declining = stocks.filter((s) => s.change < 0 || s.lastPrice < s.previousClose).length;
  const unchanged = stocks.filter((s) => s.change === 0 && s.lastPrice === s.previousClose).length;

  return {
    totalStocks: stocks.length,
    advancing,
    declining,
    unchanged,
    stocks,
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
