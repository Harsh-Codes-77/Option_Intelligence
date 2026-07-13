import { fetchOptionChain } from './src/fetchers/optionChain';
import { runVolatilityEngine } from './src/engines/05_volatility.engine';

async function test() {
  const data = await fetchOptionChain('NIFTY');
  if (!data) {
    console.log('Failed to fetch option chain');
    return;
  }
  const vix = 12.25;
  console.log('Spot price:', data.spotPrice);
  console.log('Expiry dates:', data.expiryDates);
  console.log('Selected expiry:', data.selectedExpiry);
  console.log('Total strikes:', data.strikes.length);
  if (data.strikes.length > 0) {
    console.log('First strike:', data.strikes[0]);
    const matched = data.strikes.filter(s => s.expiryDate === data.selectedExpiry);
    console.log('Strikes matching selected expiry:', matched.length);
  }
  
  const result = await runVolatilityEngine('NIFTY', data, vix);
  console.log('Volatility Engine Result:', JSON.stringify(result, null, 2));
}

test().catch(console.error);
