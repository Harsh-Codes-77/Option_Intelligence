/**
 * Kotak Neo Futures Fetcher
 * 
 * Replaces the NSE futures fetcher that was returning basis=0 and basisPct=0.
 * Now fetches actual futures quotes from NFO segment to compute REAL basis.
 * 
 * Output format matches FuturesData interface exactly.
 */

import { kotakAuth } from '../kotakAuth';
import { kotakApi, INDEX_TOKENS } from '../kotakApiClient';
import { FuturesData } from '../../fetchers/futures';

/**
 * Fetch real futures data (LTP, OI, volume) from Kotak Neo
 * This fixes the critical basis=0 bug in the old NSE fetcher.
 */
export async function fetchFuturesDataKotak(symbol: string): Promise<FuturesData | null> {
  if (!kotakAuth.isReady()) {
    // Fall back to existing NSE fetcher
    const { fetchFuturesData } = await import('../../fetchers/futures');
    return fetchFuturesData(symbol);
  }

  try {
    // Step 1: Get spot price
    const indexQuote = await kotakApi.getIndexQuote(symbol);
    const spotPrice = indexQuote?.ltp || 0;
    if (!spotPrice) {
      console.warn(`[KotakFut] No spot price for ${symbol}`);
      return null;
    }

    // Step 2: Find nearest month futures instrument token
    const futuresToken = await kotakApi.findFuturesToken(symbol);
    if (!futuresToken) {
      console.warn(`[KotakFut] No futures token found for ${symbol}, using spot approximation`);
      return makeFallbackFutures(symbol, spotPrice);
    }

    // Step 3: Get futures quote
    const futQuotes = await kotakApi.getQuotes(
      [{ instrument_token: futuresToken, exchange_segment: 'nse_fo' }],
      'all'
    );

    const futQuote = futQuotes?.data?.[0] || futQuotes?.[0];
    if (!futQuote) {
      console.warn(`[KotakFut] No futures quote for ${symbol}`);
      return makeFallbackFutures(symbol, spotPrice);
    }

    const futuresPrice = parseFloat(futQuote.ltp || futQuote.lastTradedPrice || 0);
    const oi = parseInt(futQuote.oi || futQuote.openInterest || 0);
    const oiChange = parseInt(futQuote.oiChange || futQuote.changeInOpenInterest || 0);
    const volume = parseInt(futQuote.volume || futQuote.totalTradedVolume || 0);
    const change = parseFloat(futQuote.netChange || futQuote.change || 0);
    const changePct = parseFloat(futQuote.percentChange || futQuote.pChange || 0);

    // REAL basis calculation — the whole point of this migration
    const basis = futuresPrice - spotPrice;
    const basisPct = spotPrice > 0 ? (basis / spotPrice) * 100 : 0;

    // Calculate days to expiry
    const nearestExpiry = kotakApi.getNearestExpiry(symbol);
    const expiryDate = parseExpiryDate(nearestExpiry);
    const now = new Date();
    const daysToExpiry = Math.max(0, Math.ceil((expiryDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)));

    console.log(`[KotakFut] ✅ ${symbol}: futures=${futuresPrice}, spot=${spotPrice}, basis=${basis.toFixed(2)} (${basisPct.toFixed(3)}%), OI=${oi}`);

    return {
      symbol,
      futuresPrice,
      spotPrice,
      basis,
      basisPct,
      oi,
      oiChange,
      volume,
      expiryDate: nearestExpiry,
      daysToExpiry,
      change,
      changePct,
    };
  } catch (err: any) {
    console.error(`[KotakFut] Error fetching ${symbol}:`, err.message);
    // Fall back to NSE
    try {
      const { fetchFuturesData } = await import('../../fetchers/futures');
      return fetchFuturesData(symbol);
    } catch {
      return null;
    }
  }
}

/**
 * Fallback when futures token not found — still returns spot as approximation
 */
function makeFallbackFutures(symbol: string, spotPrice: number): FuturesData {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const daysUntilThursday = (4 + 7 - dayOfWeek) % 7 || 7;
  const expiryDateObj = new Date(now.getTime() + daysUntilThursday * 24 * 60 * 60 * 1000);

  return {
    symbol,
    futuresPrice: spotPrice,
    spotPrice,
    basis: 0,
    basisPct: 0,
    oi: 0,
    oiChange: 0,
    volume: 0,
    expiryDate: expiryDateObj.toISOString().split('T')[0],
    daysToExpiry: daysUntilThursday,
    change: 0,
    changePct: 0,
  };
}

/**
 * Parse expiry date string like "27-Mar-2025" to Date
 */
function parseExpiryDate(expiry: string): Date {
  const months: Record<string, number> = {
    Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
    Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
  };

  const parts = expiry.split('-');
  if (parts.length !== 3) return new Date();

  const day = parseInt(parts[0]);
  const month = months[parts[1]] ?? 0;
  const year = parseInt(parts[2]);

  return new Date(year, month, day);
}
