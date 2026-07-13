import { fetchOptionChain } from './src/fetchers/optionChain';
const SYMBOLS = ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY'];
async function run() {
  for (const sym of SYMBOLS) {
    const data = await fetchOptionChain(sym);
    if (!data) console.log(`${sym} DATA IS NULL`);
    else console.log(`${sym} DATA IS NOT NULL, length:`, data.strikes.length);
  }
}
run();
