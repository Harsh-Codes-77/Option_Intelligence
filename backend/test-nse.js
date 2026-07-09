const { NseIndia } = require('stock-nse-india');
const nse = new NseIndia();
nse.getMarketStatus().then(console.log).catch(console.error);
