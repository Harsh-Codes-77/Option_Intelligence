import { NseIndia } from 'stock-nse-india';
const nseIndia = new NseIndia();
async function test() {
  try {
    console.log("Fetching /api/allIndices...");
    const data = await nseIndia.getDataByEndpoint('/api/allIndices');
    console.log("Success! Data length:", data?.data?.length);
  } catch (err: any) {
    console.error("Error:", err.message);
  }
}
test();
