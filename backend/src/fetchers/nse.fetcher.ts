import { NseIndia } from 'stock-nse-india';

class NSEFetcher {
  public nseIndia: NseIndia;

  constructor() {
    this.nseIndia = new NseIndia();
  }

  async fetch<T = any>(url: string, retries: number = 3): Promise<T | null> {
    try {
      // Extract endpoint if it's a full URL
      let endpoint = url;
      if (url.startsWith('http')) {
        const urlObj = new URL(url);
        endpoint = urlObj.pathname + urlObj.search;
      }
      
      const data = await this.nseIndia.getDataByEndpoint(endpoint);
      return data as T;
    } catch (err: any) {
      console.error(`[NSE] fetch failed for ${url}:`, err.message);
      return null;
    }
  }

  async rateLimitDelay(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 500));
  }
}

export const nseFetcher = new NSEFetcher();
