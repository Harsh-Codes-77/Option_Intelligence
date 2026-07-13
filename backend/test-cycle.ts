import { runDataCycle } from './src/scheduler/cron';
runDataCycle().then(() => {
  console.log("CYCLE COMPLETE");
}).catch(console.error);
