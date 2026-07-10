import { fetchIndices } from './src/fetchers/indices';

async function test() {
  const data = await fetchIndices();
  console.log('Nifty:', !!data.nifty);
  console.log('BankNifty:', !!data.bankNifty);
  console.log('VIX:', data.vix);
  console.log('Market Status:', data.marketStatus);
}
test().catch(console.error);
