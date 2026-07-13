/**
 * Kotak Neo Sectors Fetcher
 * 
 * Replaces NSE allIndices scraping for sector data.
 * Fetches sector index quotes via Kotak Neo API.
 * 
 * Output format matches SectorData[] interface exactly.
 */

import { kotakAuth } from '../kotakAuth';
import { kotakApi, SECTOR_TOKENS } from '../kotakApiClient';
import { SectorData } from '../../fetchers/sectors';
import { SECTORS } from '../../store/state';

/**
 * Fetch all sector index quotes via Kotak Neo
 */
export async function fetchAllSectorsKotak(): Promise<SectorData[]> {
  if (!kotakAuth.isReady()) {
    // Fall back to NSE
    const { fetchAllSectors } = await import('../../fetchers/sectors');
    return fetchAllSectors();
  }

  try {
    const sectorKeys = Object.keys(SECTOR_TOKENS);
    const instrumentTokens = sectorKeys.map(key => ({
      instrument_token: SECTOR_TOKENS[key].token,
      exchange_segment: SECTOR_TOKENS[key].exchange,
    }));

    // Fetch all sector quotes in one batch
    const response = await kotakApi.getQuotes(instrumentTokens, 'all');
    const quotes = response?.data || response || [];
    const quoteArray = Array.isArray(quotes) ? quotes : [quotes];

    const sectors: SectorData[] = sectorKeys.map((key, i) => {
      const q = quoteArray[i] || {};
      const sectorInfo = SECTORS.find(s => s.key === key);

      return {
        key,
        name: sectorInfo?.name || SECTOR_TOKENS[key].name || key,
        lastPrice: parseFloat(q?.ltp || q?.lastTradedPrice || 0),
        open: parseFloat(q?.open || q?.openPrice || 0),
        high: parseFloat(q?.high || q?.highPrice || 0),
        low: parseFloat(q?.low || q?.lowPrice || 0),
        previousClose: parseFloat(q?.close || q?.previousClose || q?.closePrice || 0),
        change: parseFloat(q?.netChange || q?.change || 0),
        changePct: parseFloat(q?.percentChange || q?.pChange || 0),
        volume: parseInt(q?.volume || q?.totalTradedVolume || 0),
        advances: parseInt(q?.advances || 0),
        declines: parseInt(q?.declines || 0),
        unchanged: parseInt(q?.unchanged || 0),
        constituents: [],
      };
    });

    console.log(`[KotakSec] ✅ Fetched ${sectors.length} sectors`);
    return sectors;
  } catch (err: any) {
    console.error('[KotakSec] Error:', err.message);
    // Fall back to NSE
    try {
      const { fetchAllSectors } = await import('../../fetchers/sectors');
      return fetchAllSectors();
    } catch {
      return [];
    }
  }
}
