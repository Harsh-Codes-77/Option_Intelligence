/**
 * Kotak Neo Option Chain Fetcher
 * 
 * Replaces NSE scraping for option chain data.
 * Uses Kotak Neo quotes API to fetch OI, IV, LTP for CE/PE at each strike.
 * 
 * Output format matches ParsedOptionChain exactly so engines work unchanged.
 */

import { kotakAuth } from '../kotakAuth';
import { kotakApi, INDEX_TOKENS } from '../kotakApiClient';
import { ParsedOptionChain, ParsedStrike } from '../../fetchers/optionChain';

/**
 * Fetch option chain via Kotak Neo API
 * Falls back to NSE fetcher if Kotak is not authenticated
 */
export async function fetchOptionChainKotak(symbol: string): Promise<ParsedOptionChain | null> {
  if (!kotakAuth.isReady()) {
    // Fall back to existing NSE fetcher
    const { fetchOptionChain } = await import('../../fetchers/optionChain');
    return fetchOptionChain(symbol);
  }

  try {
    // Step 1: Get spot price from index quote
    const indexQuote = await kotakApi.getIndexQuote(symbol);
    const spotPrice = indexQuote?.ltp || 0;

    if (!spotPrice) {
      console.warn(`[KotakOC] No spot price for ${symbol}`);
      return null;
    }

    // Step 2: Find option instruments for nearest expiry
    const nearestExpiry = kotakApi.getNearestExpiry(symbol);
    const optionInstruments = await kotakApi.findOptionTokens(symbol, nearestExpiry);

    if (!optionInstruments || optionInstruments.length === 0) {
      console.warn(`[KotakOC] No option instruments found for ${symbol} expiry ${nearestExpiry}`);
      // Fall back to NSE
      const { fetchOptionChain } = await import('../../fetchers/optionChain');
      return fetchOptionChain(symbol);
    }

    // Step 3: Group instruments by strike price
    const strikeMap: Map<number, { CE?: any; PE?: any }> = new Map();
    
    for (const inst of optionInstruments) {
      const strike = parseFloat(inst.strikePrice || inst.strikePrice || 0);
      const optType = (inst.optionType || inst.optType || '').toUpperCase();
      
      if (!strikeMap.has(strike)) {
        strikeMap.set(strike, {});
      }
      
      const entry = strikeMap.get(strike)!;
      if (optType === 'CE' || optType === 'CA') {
        entry.CE = inst;
      } else if (optType === 'PE' || optType === 'PA') {
        entry.PE = inst;
      }
    }

    // Step 4: Filter to 20 strikes around ATM
    const allStrikes = Array.from(strikeMap.keys()).sort((a, b) => a - b);
    const atmIndex = allStrikes.findIndex(s => s >= spotPrice);
    const startIdx = Math.max(0, atmIndex - 20);
    const endIdx = Math.min(allStrikes.length, atmIndex + 20);
    const relevantStrikes = allStrikes.slice(startIdx, endIdx);

    // Step 5: Fetch quotes for relevant option instruments
    const instrumentTokens = relevantStrikes.flatMap(strike => {
      const entry = strikeMap.get(strike)!;
      const tokens: Array<{ instrument_token: string; exchange_segment: string }> = [];
      if (entry.CE?.instrumentToken || entry.CE?.pSymbol) {
        tokens.push({
          instrument_token: entry.CE.instrumentToken || entry.CE.pSymbol,
          exchange_segment: 'nse_fo',
        });
      }
      if (entry.PE?.instrumentToken || entry.PE?.pSymbol) {
        tokens.push({
          instrument_token: entry.PE.instrumentToken || entry.PE.pSymbol,
          exchange_segment: 'nse_fo',
        });
      }
      return tokens;
    });

    // Kotak allows batching quotes — fetch in chunks of 50
    const quoteResponses: any[] = [];
    for (let i = 0; i < instrumentTokens.length; i += 50) {
      const batch = instrumentTokens.slice(i, i + 50);
      try {
        const response = await kotakApi.getQuotes(batch, 'all');
        const quotes = response?.data || response || [];
        quoteResponses.push(...(Array.isArray(quotes) ? quotes : [quotes]));
      } catch (err: any) {
        console.warn(`[KotakOC] Quote batch ${i / 50} failed:`, err.message);
      }
    }

    // Step 6: Map quotes back to strikes
    const quoteMap = new Map<string, any>();
    for (const q of quoteResponses) {
      const token = q.instrument_token || q.instrumentToken || q.pSymbol;
      if (token) quoteMap.set(String(token), q);
    }

    // Step 7: Build ParsedStrike array
    let totalCE_OI = 0;
    let totalPE_OI = 0;
    let totalCE_Volume = 0;
    let totalPE_Volume = 0;

    const parsedStrikes: ParsedStrike[] = relevantStrikes.map(strike => {
      const entry = strikeMap.get(strike)!;
      const ceToken = entry.CE?.instrumentToken || entry.CE?.pSymbol;
      const peToken = entry.PE?.instrumentToken || entry.PE?.pSymbol;
      const ceQuote = ceToken ? quoteMap.get(String(ceToken)) : null;
      const peQuote = peToken ? quoteMap.get(String(peToken)) : null;

      const ceData = parseOptionQuote(ceQuote, spotPrice);
      const peData = parseOptionQuote(peQuote, spotPrice);

      totalCE_OI += ceData.oi;
      totalPE_OI += peData.oi;
      totalCE_Volume += ceData.volume;
      totalPE_Volume += peData.volume;

      return {
        strikePrice: strike,
        expiryDate: nearestExpiry,
        CE: ceData,
        PE: peData,
      };
    });

    console.log(`[KotakOC] ✅ ${symbol}: ${parsedStrikes.length} strikes, spot=${spotPrice}, expiry=${nearestExpiry}`);

    return {
      symbol,
      spotPrice,
      timestamp: new Date().toISOString(),
      expiryDates: [nearestExpiry],
      selectedExpiry: nearestExpiry,
      strikes: parsedStrikes,
      totalCE_OI,
      totalPE_OI,
      totalCE_Volume,
      totalPE_Volume,
    };
  } catch (err: any) {
    console.error(`[KotakOC] Error fetching ${symbol}:`, err.message);
    // Fall back to NSE
    try {
      const { fetchOptionChain } = await import('../../fetchers/optionChain');
      return fetchOptionChain(symbol);
    } catch {
      return null;
    }
  }
}

/**
 * Parse a single option quote into our standard format
 */
function parseOptionQuote(quote: any, spotPrice: number) {
  if (!quote) {
    return {
      oi: 0, oiChange: 0, volume: 0, iv: 0,
      ltp: 0, change: 0, pChange: 0, bid: 0, ask: 0,
      underlyingValue: spotPrice,
    };
  }

  return {
    oi: parseInt(quote.oi || quote.openInterest || 0),
    oiChange: parseInt(quote.oiChange || quote.changeInOpenInterest || 0),
    volume: parseInt(quote.volume || quote.totalTradedVolume || 0),
    iv: parseFloat(quote.iv || quote.impliedVolatility || 0),
    ltp: parseFloat(quote.ltp || quote.lastTradedPrice || 0),
    change: parseFloat(quote.netChange || quote.change || 0),
    pChange: parseFloat(quote.percentChange || quote.pChange || 0),
    bid: parseFloat(quote.bidPrice || quote.bestBidPrice || 0),
    ask: parseFloat(quote.askPrice || quote.bestAskPrice || 0),
    underlyingValue: spotPrice,
  };
}
