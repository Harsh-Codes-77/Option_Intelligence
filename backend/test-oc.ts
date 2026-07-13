import { nseFetcher } from './src/fetchers/nse.fetcher';

async function run() {
  const raw: any = await nseFetcher.getIndexOptionChain('NIFTY');
  if (!raw || !raw.records) {
    console.log('Failed to fetch raw option chain');
    return;
  }
  console.log('Raw expiryDates[0]:', raw.records.expiryDates?.[0]);
  const firstDataWithCE = raw.records.data.find((d: any) => d.CE?.expiryDate);
  console.log('Raw CE expiryDate:', firstDataWithCE?.CE?.expiryDate);
  const firstFilteredWithCE = raw.filtered?.data?.find((d: any) => d.CE?.expiryDate);
  console.log('Raw Filtered CE expiryDate:', firstFilteredWithCE?.CE?.expiryDate);
}
run();
