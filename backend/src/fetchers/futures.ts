import { nseFetcher } from './nse.fetcher';

export interface FuturesData {
  symbol: string;
  futuresPrice: number;
  spotPrice: number;
  basis: number;
  basisPct: number;
  oi: number;
  oiChange: number;
  volume: number;
  expiryDate: string;
  daysToExpiry: number;
  change: number;
  changePct: number;
}

export async function fetchFuturesData(symbol: string): Promise<FuturesData | null> {
  // Futures data is embedded in the option chain response or can be fetched from equity-stockIndices
  // For index futures, we'll extract from the option chain or use a dedicated endpoint
  try {
    const url = `https://www.nseindia.com/api/equity-stockIndices?index=${encodeURIComponent(symbol === 'NIFTY' ? 'NIFTY 50' : symbol === 'BANKNIFTY' ? 'NIFTY BANK' : symbol)}`;
    const data = await nseFetcher.fetch<any>(url);

    if (!data || !data.data) return null;

    // Find the index entry
    const indexEntry = data.data.find((d: any) =>
      d.symbol === symbol || d.symbol === 'NIFTY 50' || d.symbol === 'NIFTY BANK'
    );

    if (!indexEntry) return null;

    const spotPrice = indexEntry.lastPrice || indexEntry.open || 0;

    // Futures data might not be directly available from this endpoint
    // We'll construct a basic futures data object from market data
    return {
      symbol,
      futuresPrice: spotPrice, // Will be overridden by option chain futures data
      spotPrice,
      basis: 0,
      basisPct: 0,
      oi: 0,
      oiChange: 0,
      volume: 0,
      expiryDate: '',
      daysToExpiry: 0,
      change: indexEntry.change || 0,
      changePct: indexEntry.pChange || 0,
    };
  } catch (err: any) {
    console.error(`[Futures] Fetch failed for ${symbol}:`, err.message);
    return null;
  }
}

// Extract futures info from option chain response when available
export function extractFuturesFromOptionChain(optionChainRaw: any, spotPrice: number, symbol: string): Partial<FuturesData> {
  // NSE option chain sometimes includes futures data in the response
  // Look for futuresData or metadata sections
  if (!optionChainRaw) return {};

  // Calculate days to expiry from nearest expiry date
  const expiryDates = optionChainRaw.records?.expiryDates || [];
  const nearestExpiry = expiryDates[0];
  let daysToExpiry = 0;

  if (nearestExpiry) {
    const expiryDate = new Date(nearestExpiry);
    const now = new Date();
    daysToExpiry = Math.max(0, Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
  }

  return {
    expiryDate: nearestExpiry || '',
    daysToExpiry,
    spotPrice,
  };
}
