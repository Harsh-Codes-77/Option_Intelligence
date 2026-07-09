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
}

export const nseFetcher = new NSEFetcher();
