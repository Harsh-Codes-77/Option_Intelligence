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
  try {
    // Since /api/quote-derivative is blocked by NSE, we approximate futures using spot price
    // from the option chain or equity indices endpoint.
    let spotPrice = 0;
    try {
      const ocData = await nseFetcher.getIndexOptionChain(symbol);
      if (ocData && ocData.records && ocData.records.underlyingValue) {
        spotPrice = ocData.records.underlyingValue;
      }
    } catch (err: any) {
      // fallback to getEquityStockIndices for stocks, or getAllIndices for indices
      const indexSymbols = ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY'];
      if (indexSymbols.includes(symbol)) {
        const { fetchIndices } = await import('./indices');
        const indices = await fetchIndices();
        const indexMatch = indices.allIndices.find(i => 
          i.indexName.toUpperCase().includes(symbol) || 
          (symbol === 'FINNIFTY' && i.indexName.toUpperCase().includes('NIFTY FIN'))
        );
        if (indexMatch) {
          spotPrice = indexMatch.lastPrice;
        }
      } else {
        const indexData = await nseFetcher.getEquityStockIndices(symbol);
        if (indexData && indexData.data && indexData.data.length > 0) {
          spotPrice = indexData.data[0].lastPrice || (indexData.data[0] as any).last || 0;
        }
      }
    }

    if (!spotPrice) return null;

    const futuresPrice = spotPrice; // approximate
    const basis = 0;
    const basisPct = 0;

    // Approximate expiry to next Thursday
    const now = new Date();
    const dayOfWeek = now.getDay();
    const daysUntilThursday = (4 + 7 - dayOfWeek) % 7;
    const expiryDateObj = new Date(now.getTime() + daysUntilThursday * 24 * 60 * 60 * 1000);
    const expiryDate = expiryDateObj.toISOString().split('T')[0];
    const daysToExpiry = daysUntilThursday || 7;

    return {
      symbol,
      futuresPrice,
      spotPrice,
      basis,
      basisPct,
      oi: 0,
      oiChange: 0,
      volume: 0,
      expiryDate,
      daysToExpiry,
      change: 0,
      changePct: 0,
    };
  } catch (err: any) {
    console.error(`[Futures] Fetch failed for ${symbol}:`, err.message);
    return null;
  }
}
