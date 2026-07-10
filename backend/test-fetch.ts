import { fetchOptionChain } from './src/fetchers/optionChain';

async function test() {
  const data = await fetchOptionChain('NIFTY');
  if (!data) return;
  console.log('Total strikes:', data.strikes.length);
  const expiries = new Set(data.strikes.map(s => s.expiryDate));
  console.log('Expiries in strikes:', Array.from(expiries));
}
test().catch(console.error);
