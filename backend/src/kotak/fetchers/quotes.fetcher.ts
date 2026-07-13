/**
 * Kotak Neo Quotes (Indices) Fetcher
 * 
 * Replaces NSE allIndices scraping with Kotak Neo quotes API.
 * Fetches OHLCV for major indices (NIFTY, BANKNIFTY, FINNIFTY, VIX).
 * 
 * Output format matches IndicesResponse interface exactly.
 */

import { kotakAuth } from '../kotakAuth';
import { kotakApi, INDEX_TOKENS } from '../kotakApiClient';
import { IndicesResponse, IndexData } from '../../fetchers/indices';

/**
 * Fetch all major indices via Kotak Neo API
 */
export async function fetchIndicesKotak(): Promise<IndicesResponse> {
  const result: IndicesResponse = {
    nifty: null,
    bankNifty: null,
    finNifty: null,
    vix: 0,
    marketStatus: 'CLOSED',
    allIndices: [],
  };

  if (!kotakAuth.isReady()) {
    // Fall back to NSE
    const { fetchIndices } = await import('../../fetchers/indices');
    return fetchIndices();
  }

  try {
    // Fetch all major indices in one batch call
    const indexSymbols = ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'INDIAVIX'];
    const instrumentTokens = indexSymbols
      .filter(s => INDEX_TOKENS[s])
      .map(s => ({
        instrument_token: INDEX_TOKENS[s].token,
        exchange_segment: INDEX_TOKENS[s].exchange,
      }));

    const response = await kotakApi.getQuotes(instrumentTokens, 'all');
    const quotes = response?.data || response || [];
    const quoteArray = Array.isArray(quotes) ? quotes : [quotes];

    for (let i = 0; i < quoteArray.length; i++) {
      const q = quoteArray[i];
      const symbol = indexSymbols[i];
      
      const indexData: IndexData = {
        indexName: symbol,
        lastPrice: parseFloat(q?.ltp || q?.lastTradedPrice || 0),
        open: parseFloat(q?.open || q?.openPrice || 0),
        high: parseFloat(q?.high || q?.highPrice || 0),
        low: parseFloat(q?.low || q?.lowPrice || 0),
        previousClose: parseFloat(q?.close || q?.previousClose || q?.closePrice || 0),
        change: parseFloat(q?.netChange || q?.change || 0),
        changePct: parseFloat(q?.percentChange || q?.pChange || 0),
        timestamp: new Date().toISOString(),
      };

      result.allIndices.push(indexData);

      switch (symbol) {
        case 'NIFTY':
          result.nifty = indexData;
          break;
        case 'BANKNIFTY':
          result.bankNifty = indexData;
          break;
        case 'FINNIFTY':
          result.finNifty = indexData;
          break;
        case 'INDIAVIX':
          result.vix = indexData.lastPrice;
          break;
      }
    }

    // Determine market status from time
    result.marketStatus = getMarketStatus();

    console.log(`[KotakIdx] ✅ NIFTY=${result.nifty?.lastPrice || 0}, VIX=${result.vix}`);
  } catch (err: any) {
    console.error('[KotakIdx] Error:', err.message);
    // Fall back to NSE
    try {
      const { fetchIndices } = await import('../../fetchers/indices');
      return fetchIndices();
    } catch {
      // Return empty result
    }
  }

  return result;
}

/**
 * Determine market status from IST time
 */
function getMarketStatus(): 'PRE_OPEN' | 'OPEN' | 'CLOSED' {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const ist = new Date(now.getTime() + istOffset);
  const day = ist.getUTCDay();
  
  if (day === 0 || day === 6) return 'CLOSED'; // Weekend

  const hours = ist.getUTCHours();
  const minutes = ist.getUTCMinutes();
  const totalMinutes = hours * 60 + minutes;

  if (totalMinutes >= 555 && totalMinutes < 570) return 'PRE_OPEN';  // 9:15 - 9:30
  if (totalMinutes >= 570 && totalMinutes <= 930) return 'OPEN';      // 9:30 - 15:30
  return 'CLOSED';
}
