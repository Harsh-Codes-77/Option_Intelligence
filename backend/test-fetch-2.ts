import { nseFetcher } from './src/fetchers/nse.fetcher';

async function test() {
  const data = await nseFetcher.fetch('/api/option-chain-indices?symbol=NIFTY');
  if (data) {
    console.log('Success, keys:', Object.keys(data));
  } else {
    console.log('Failed');
  }
}
test().catch(console.error);
