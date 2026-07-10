import { NseIndia } from 'stock-nse-india';

class NSEFetcher {
  public nseIndia: NseIndia;

  constructor() {
    this.nseIndia = new NseIndia();
  }

  async fetch<T = any>(url: string, retries: number = 3): Promise<T | null> {
    let endpoint = url;
    if (url.startsWith('http')) {
      // NseIndia.getDataByEndpoint expects relative paths like '/api/allIndices'
      const urlObj = new URL(url);
      endpoint = urlObj.pathname + urlObj.search;
    }

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const data = await this.nseIndia.getDataByEndpoint(endpoint);
        return data as T;
      } catch (err: any) {
        if (attempt === retries) {
          console.error(`[NSE] fetch failed for ${endpoint} after ${retries} attempts:`, err.message);
          return null;
        }
        await this.rateLimitDelay();
      }
    }
    return null;
  }

  async rateLimitDelay(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 500));
  }
  async getIndexOptionChain(symbol: string, retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try { return await this.nseIndia.getIndexOptionChain(symbol); }
      catch (err: any) { if (attempt === retries) throw err; await this.rateLimitDelay(); }
    }
  }

  async getAllIndices(retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try { return await this.nseIndia.getAllIndices(); }
      catch (err: any) { if (attempt === retries) throw err; await this.rateLimitDelay(); }
    }
  }

  async getEquityStockIndices(symbol: string, retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try { return await this.nseIndia.getEquityStockIndices(symbol); }
      catch (err: any) { if (attempt === retries) throw err; await this.rateLimitDelay(); }
    }
  }

  async getMarketStatus(retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try { return await this.nseIndia.getMarketStatus(); }
      catch (err: any) { if (attempt === retries) throw err; await this.rateLimitDelay(); }
    }
  }
}

export const nseFetcher = new NSEFetcher();
