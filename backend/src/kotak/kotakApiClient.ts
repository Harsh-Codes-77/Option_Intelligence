/**
 * Kotak Neo API Client
 * 
 * Wraps the Kotak Neo v2 REST API for market data access.
 * Uses the KotakAuthManager for authentication.
 * 
 * Key endpoints:
 *   - Quotes: /Files/1.0/masterscrip/v1/file-paths (scrip master)  
 *   - Quotes: POST quotes with instrument tokens
 *   - Scrip Search: search by symbol/expiry
 *   - WebSocket: live tick data subscription
 */

import axios, { AxiosInstance } from 'axios';
import { kotakAuth } from './kotakAuth';
import { setCache, getCache } from '../config/redis';

const API_BASE = 'https://gw-napi.kotaksecurities.com';

// Known instrument tokens for major indices (NSE Cash segment)
// These are standard across all brokers for NSE indices
export const INDEX_TOKENS: Record<string, { token: string; exchange: string }> = {
  NIFTY:       { token: '26000', exchange: 'nse_cm' },
  BANKNIFTY:   { token: '26009', exchange: 'nse_cm' },
  FINNIFTY:    { token: '26037', exchange: 'nse_cm' },
  MIDCPNIFTY:  { token: '26074', exchange: 'nse_cm' },
  INDIAVIX:    { token: '26017', exchange: 'nse_cm' },
  SENSEX:      { token: '1',     exchange: 'bse_cm' },
};

// Sector index tokens
export const SECTOR_TOKENS: Record<string, { token: string; exchange: string; name: string }> = {
  BANK:          { token: '26009', exchange: 'nse_cm', name: 'NIFTY BANK' },
  IT:            { token: '26008', exchange: 'nse_cm', name: 'NIFTY IT' },
  AUTO:          { token: '26013', exchange: 'nse_cm', name: 'NIFTY AUTO' },
  PHARMA:        { token: '26018', exchange: 'nse_cm', name: 'NIFTY PHARMA' },
  METAL:         { token: '26019', exchange: 'nse_cm', name: 'NIFTY METAL' },
  PSU_BANK:      { token: '26010', exchange: 'nse_cm', name: 'NIFTY PSU BANK' },
  ENERGY:        { token: '26025', exchange: 'nse_cm', name: 'NIFTY ENERGY' },
  FMCG:          { token: '26023', exchange: 'nse_cm', name: 'NIFTY FMCG' },
  REALTY:        { token: '26028', exchange: 'nse_cm', name: 'NIFTY REALTY' },
  INFRA:         { token: '26004', exchange: 'nse_cm', name: 'NIFTY INFRA' },
  FIN_SERVICES:  { token: '26037', exchange: 'nse_cm', name: 'NIFTY FIN SERVICES' },
  DEFENCE:       { token: '26046', exchange: 'nse_cm', name: 'NIFTY DEFENCE' },
};

export interface ScripMasterEntry {
  instrumentToken: string;
  tradingSymbol: string;
  symbol: string;
  exchangeSegment: string;
  instrumentType: string;
  expiry: string;
  optionType: string;
  strikePrice: number;
  lotSize: number;
  tickSize: number;
}

export interface QuoteData {
  ltp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  oi: number;
  oiChange: number;
  netChange: number;
  percentChange: number;
  bidPrice: number;
  askPrice: number;
  bidQty: number;
  askQty: number;
  lastTradedQty: number;
  averagePrice: number;
  totalBuyQty: number;
  totalSellQty: number;
  lowerCircuit: number;
  upperCircuit: number;
  high52w: number;
  low52w: number;
}

class KotakApiClient {
  private scripMasterCache: Map<string, ScripMasterEntry[]> = new Map();
  private lastScripMasterFetch: number = 0;

  /**
   * Fetch quotes for given instrument tokens
   * quote_type: 'all' | 'ltp' | 'ohlc' | 'depth' | 'oi' | '52w' | 'circuit_limits' | 'scrip_details'
   */
  async getQuotes(
    instrumentTokens: Array<{ instrument_token: string; exchange_segment: string }>,
    quoteType: string = 'all'
  ): Promise<any> {
    if (!kotakAuth.isReady()) {
      throw new Error('Kotak API not authenticated');
    }

    try {
      const response = await kotakAuth.apiCall('POST', '/Quote/1.0/quote/v2/getquote', {
        instrument_tokens: instrumentTokens,
        quote_type: quoteType,
      });

      return response;
    } catch (err: any) {
      console.error('[KotakAPI] Quotes error:', err.response?.data?.message || err.message);
      throw err;
    }
  }

  /**
   * Fetch single index quote with normalized output
   */
  async getIndexQuote(symbol: string): Promise<QuoteData | null> {
    const tokenInfo = INDEX_TOKENS[symbol];
    if (!tokenInfo) return null;

    try {
      const response = await this.getQuotes([
        { instrument_token: tokenInfo.token, exchange_segment: tokenInfo.exchange }
      ], 'all');

      const quote = response?.data?.[0] || response?.[0];
      if (!quote) return null;

      return this.normalizeQuote(quote);
    } catch {
      return null;
    }
  }

  /**
   * Search scrip master for instruments
   */
  async searchScrip(params: {
    exchange_segment: string;
    symbol: string;
    expiry?: string;
    option_type?: string;
    strike_price?: string;
  }): Promise<any> {
    if (!kotakAuth.isReady()) {
      throw new Error('Kotak API not authenticated');
    }

    try {
      const response = await kotakAuth.apiCall('POST', '/Files/1.0/masterscrip/v1/search-scrip', params);
      return response;
    } catch (err: any) {
      console.error('[KotakAPI] Scrip search error:', err.response?.data?.message || err.message);
      throw err;
    }
  }

  /**
   * Get scrip master CSV (instrument master download)
   * This contains ALL tradeable instruments with their tokens, lot sizes, etc.
   */
  async getScripMaster(exchangeSegment?: string): Promise<any> {
    if (!kotakAuth.isReady()) {
      throw new Error('Kotak API not authenticated');
    }

    try {
      const endpoint = exchangeSegment
        ? `/Files/1.0/masterscrip/v1/file-paths?exchangeSegment=${exchangeSegment}`
        : '/Files/1.0/masterscrip/v1/file-paths';

      const response = await kotakAuth.apiCall('GET', endpoint);
      return response;
    } catch (err: any) {
      console.error('[KotakAPI] Scrip master error:', err.response?.data?.message || err.message);
      throw err;
    }
  }

  /**
   * Find futures instrument token for a symbol (nearest expiry)
   */
  async findFuturesToken(symbol: string): Promise<string | null> {
    // Check cache first
    const cached = await getCache<string>(`kotak:futures_token:${symbol}`);
    if (cached) return cached;

    try {
      const result = await this.searchScrip({
        exchange_segment: 'nse_fo',
        symbol: symbol,
      });

      // Filter for FUTIDX type with nearest expiry
      const futures = (result?.data || [])
        .filter((s: any) => 
          s.instrumentType === 'FUTIDX' || s.instrumentType === 'FUTSTK'
        )
        .sort((a: any, b: any) => 
          new Date(a.expiry).getTime() - new Date(b.expiry).getTime()
        );

      const nearestFuture = futures[0];
      if (nearestFuture) {
        const token = nearestFuture.instrumentToken || nearestFuture.pSymbol;
        await setCache(`kotak:futures_token:${symbol}`, token, 86400); // Cache 1 day
        return token;
      }

      return null;
    } catch (err: any) {
      console.error('[KotakAPI] Futures token search error:', err.message);
      return null;
    }
  }

  /**
   * Find option chain instrument tokens for a symbol
   */
  async findOptionTokens(symbol: string, expiry?: string): Promise<any[]> {
    try {
      const expiryDate = expiry || this.getNearestExpiry(symbol);

      const result = await this.searchScrip({
        exchange_segment: 'nse_fo',
        symbol: symbol,
        expiry: expiryDate,
      });

      const options = (result?.data || []).filter((s: any) =>
        s.instrumentType === 'OPTIDX' || s.instrumentType === 'OPTSTK'
      );

      return options;
    } catch (err: any) {
      console.error('[KotakAPI] Option token search error:', err.message);
      return [];
    }
  }

  /**
   * Normalize a raw Kotak quote response to our standard format
   */
  normalizeQuote(raw: any): QuoteData {
    return {
      ltp: parseFloat(raw.ltp || raw.lastTradedPrice || 0),
      open: parseFloat(raw.open || raw.openPrice || 0),
      high: parseFloat(raw.high || raw.highPrice || 0),
      low: parseFloat(raw.low || raw.lowPrice || 0),
      close: parseFloat(raw.close || raw.closePrice || raw.previousClose || 0),
      volume: parseInt(raw.volume || raw.totalTradedVolume || 0),
      oi: parseInt(raw.oi || raw.openInterest || 0),
      oiChange: parseInt(raw.oiChange || raw.changeInOpenInterest || 0),
      netChange: parseFloat(raw.netChange || raw.change || 0),
      percentChange: parseFloat(raw.percentChange || raw.pChange || 0),
      bidPrice: parseFloat(raw.bidPrice || raw.bestBidPrice || 0),
      askPrice: parseFloat(raw.askPrice || raw.bestAskPrice || 0),
      bidQty: parseInt(raw.bidQty || raw.bestBidQty || 0),
      askQty: parseInt(raw.askQty || raw.bestAskQty || 0),
      lastTradedQty: parseInt(raw.lastTradedQty || 0),
      averagePrice: parseFloat(raw.averagePrice || raw.avgPrice || 0),
      totalBuyQty: parseInt(raw.totalBuyQty || 0),
      totalSellQty: parseInt(raw.totalSellQty || 0),
      lowerCircuit: parseFloat(raw.lowerCircuit || raw.lowerCircuitLimit || 0),
      upperCircuit: parseFloat(raw.upperCircuit || raw.upperCircuitLimit || 0),
      high52w: parseFloat(raw.high52w || raw.yearlyHighPrice || 0),
      low52w: parseFloat(raw.low52w || raw.yearlyLowPrice || 0),
    };
  }

  /**
   * Get nearest weekly expiry date for a symbol
   */
  getNearestExpiry(symbol: string): string {
    const today = new Date();
    const day = today.getDay(); // 0=Sun, 4=Thu

    // NIFTY/BANKNIFTY/FINNIFTY weekly expiry is Thursday
    let daysToExpiry = (4 - day + 7) % 7;
    if (daysToExpiry === 0) {
      // If today is Thursday, check if market is still open
      const hours = today.getHours();
      if (hours >= 15) {
        daysToExpiry = 7; // Next Thursday
      }
    }

    const expiry = new Date(today);
    expiry.setDate(today.getDate() + daysToExpiry);

    // Format: DD-Mon-YYYY (e.g., "27-Mar-2025")
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const dd = expiry.getDate().toString().padStart(2, '0');
    const mon = months[expiry.getMonth()];
    const yyyy = expiry.getFullYear();

    return `${dd}-${mon}-${yyyy}`;
  }

  /**
   * Get nearest monthly expiry date (last Thursday of month)
   */
  getMonthlyExpiry(): string {
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();

    // Find last Thursday of current month
    const lastDay = new Date(year, month + 1, 0);
    let lastThursday = lastDay.getDate();
    const dayOfWeek = lastDay.getDay();

    const daysFromThursday = (dayOfWeek >= 4) ? dayOfWeek - 4 : dayOfWeek + 3;
    lastThursday -= daysFromThursday;

    // If we've passed this month's expiry, go to next month
    if (today.getDate() > lastThursday || 
        (today.getDate() === lastThursday && today.getHours() >= 15)) {
      const nextMonth = new Date(year, month + 2, 0);
      lastThursday = nextMonth.getDate();
      const nextDayOfWeek = nextMonth.getDay();
      const nextDaysFromThursday = (nextDayOfWeek >= 4) ? nextDayOfWeek - 4 : nextDayOfWeek + 3;
      lastThursday -= nextDaysFromThursday;

      const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      const dd = lastThursday.toString().padStart(2, '0');
      const mon = months[(month + 1) % 12];
      const expYear = month === 11 ? year + 1 : year;
      return `${dd}-${mon}-${expYear}`;
    }

    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const dd = lastThursday.toString().padStart(2, '0');
    const mon = months[month];
    return `${dd}-${mon}-${year}`;
  }
}

// Singleton
export const kotakApi = new KotakApiClient();
