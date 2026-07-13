import { runDataCycle } from '../scheduler/cron';
async function test() {
  await runDataCycle();
  console.log("Done");
  process.exit(0);
}
test();
