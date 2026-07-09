import { nseFetcher } from './nse.fetcher';

// NSE Option Chain response types
export interface NSEOptionData {
  strikePrice: number;
  expiryDate: string;
  openInterest: number;
  changeinOpenInterest: number;
  pchangeinOpenInterest: number;
  totalTradedVolume: number;
  impliedVolatility: number;
  lastPrice: number;
  change: number;
  pChange: number;
  totalBuyQuantity: number;
  totalSellQuantity: number;
  bidQty: number;
  bidprice: number;
  askQty: number;
  askPrice: number;
  underlyingValue: number;
}

export interface NSEStrikeData {
  strikePrice: number;
  expiryDate: string;
  CE?: NSEOptionData;
  PE?: NSEOptionData;
}

export interface NSEOptionChainResponse {
  records: {
    expiryDates: string[];
    strikePrices: number[];
    timestamp: string;
    underlyingValue: number;
    data: NSEStrikeData[];
  };
  filtered: {
    data: NSEStrikeData[];
    CE?: { totOI: number; totVol: number };
    PE?: { totOI: number; totVol: number };
  };
}

// Parsed option chain data used by engines
export interface ParsedStrike {
  strikePrice: number;
  expiryDate: string;
  CE: {
    oi: number;
    oiChange: number;
    volume: number;
    iv: number;
    ltp: number;
    change: number;
    pChange: number;
    bid: number;
    ask: number;
    underlyingValue: number;
  };
  PE: {
    oi: number;
    oiChange: number;
    volume: number;
    iv: number;
    ltp: number;
    change: number;
    pChange: number;
    bid: number;
    ask: number;
    underlyingValue: number;
  };
}

export interface ParsedOptionChain {
  symbol: string;
  spotPrice: number;
  timestamp: string;
  expiryDates: string[];
  selectedExpiry: string;
  strikes: ParsedStrike[];
  totalCE_OI: number;
  totalPE_OI: number;
  totalCE_Volume: number;
  totalPE_Volume: number;
}

const OPTION_CHAIN_URLS: Record<string, string> = {
  NIFTY: 'https://www.nseindia.com/api/option-chain-indices?symbol=NIFTY',
  BANKNIFTY: 'https://www.nseindia.com/api/option-chain-indices?symbol=BANKNIFTY',
  FINNIFTY: 'https://www.nseindia.com/api/option-chain-indices?symbol=FINNIFTY',
  MIDCPNIFTY: 'https://www.nseindia.com/api/option-chain-indices?symbol=MIDCPNIFTY',
};

function defaultOptionSide() {
  return { oi: 0, oiChange: 0, volume: 0, iv: 0, ltp: 0, change: 0, pChange: 0, bid: 0, ask: 0, underlyingValue: 0 };
}

function parseOptionSide(data?: NSEOptionData) {
  if (!data) return defaultOptionSide();
  return {
    oi: data.openInterest || 0,
    oiChange: data.changeinOpenInterest || 0,
    volume: data.totalTradedVolume || 0,
    iv: data.impliedVolatility || 0,
    ltp: data.lastPrice || 0,
    change: data.change || 0,
    pChange: data.pChange || 0,
    bid: data.bidprice || 0,
    ask: data.askPrice || 0,
    underlyingValue: data.underlyingValue || 0,
  };
}

export async function fetchOptionChain(symbol: string): Promise<ParsedOptionChain | null> {
  if (!OPTION_CHAIN_URLS[symbol]) {
    console.error(`[OptionChain] Unknown symbol: ${symbol}`);
    return null;
  }

  let raw: any;
  try {
    raw = await nseFetcher.nseIndia.getIndexOptionChain(symbol);
  } catch (err: any) {
    console.error(`[OptionChain] Fetch failed for ${symbol}:`, err.message);
    return null;
  }

  if (!raw || !raw.records || !raw.records.data) {
    console.error(`[OptionChain] Invalid response for ${symbol}:`, Object.keys(raw || {}), raw);
    return null;
  }

  const expiryDates = raw.records.expiryDates || [];
  const selectedExpiry = expiryDates[0] || '';
  const filteredData = raw.records.data || [];
  const firstStrike = filteredData.find((s: any) => s.CE || s.PE);
  const spotPrice = firstStrike?.CE?.underlyingValue || firstStrike?.PE?.underlyingValue || 0;

  const strikes: ParsedStrike[] = filteredData.map((s: any) => ({
    strikePrice: s.strikePrice,
    expiryDate: s.CE?.expiryDate || s.PE?.expiryDate || selectedExpiry,
    CE: parseOptionSide(s.CE),
    PE: parseOptionSide(s.PE),
  }));

  return {
    symbol,
    spotPrice,
    timestamp: new Date().toISOString(),
    expiryDates,
    selectedExpiry,
    strikes,
    totalCE_OI: raw.records.CE?.totOI || strikes.reduce((sum, s) => sum + s.CE.oi, 0),
    totalPE_OI: raw.records.PE?.totOI || strikes.reduce((sum, s) => sum + s.PE.oi, 0),
    totalCE_Volume: raw.records.CE?.totVol || strikes.reduce((sum, s) => sum + s.CE.volume, 0),
    totalPE_Volume: raw.records.PE?.totVol || strikes.reduce((sum, s) => sum + s.PE.volume, 0),
  };
}
