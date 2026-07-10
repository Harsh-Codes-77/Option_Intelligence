import { nseFetcher } from './src/fetchers/nse.fetcher';

async function test() {
  const data = await nseFetcher.nseIndia.getIndexOptionChain('NIFTY');
  if (data && data.records) {
    console.log('records.data length:', data.records.data.length);
    console.log('filtered.data length:', data.filtered?.data?.length);
  } else {
    console.log('Failed');
  }
}
test().catch(console.error);
