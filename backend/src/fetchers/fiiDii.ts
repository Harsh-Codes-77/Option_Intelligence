import { nseFetcher } from './nse.fetcher';

export interface FIIDIIData {
  date: string;
  fii: {
    buyValue: number;
    sellValue: number;
    netValue: number;
  };
  dii: {
    buyValue: number;
    sellValue: number;
    netValue: number;
  };
}

const FII_DII_URL = 'https://www.nseindia.com/api/fiidiiTradeReact';

export async function fetchFIIDII(): Promise<FIIDIIData | null> {
  const data = await nseFetcher.fetch<any>(FII_DII_URL);
  if (!data) return null;

  // NSE returns an array of FII/DII data
  // Each entry has: category, date, buyValue, sellValue
  let fii = { buyValue: 0, sellValue: 0, netValue: 0 };
  let dii = { buyValue: 0, sellValue: 0, netValue: 0 };
  let date = '';

  const entries = Array.isArray(data) ? data : (data.data || []);

  for (const entry of entries) {
    const category = (entry.category || '').toUpperCase();

    if (category.includes('FII') || category.includes('FPI')) {
      fii.buyValue = parseFloat(entry.buyValue || entry.BUY_VALUE || '0');
      fii.sellValue = parseFloat(entry.sellValue || entry.SELL_VALUE || '0');
      fii.netValue = fii.buyValue - fii.sellValue;
      date = entry.date || entry.DATE1 || '';
    }

    if (category.includes('DII')) {
      dii.buyValue = parseFloat(entry.buyValue || entry.BUY_VALUE || '0');
      dii.sellValue = parseFloat(entry.sellValue || entry.SELL_VALUE || '0');
      dii.netValue = dii.buyValue - dii.sellValue;
    }
  }

  return { date, fii, dii };
}
