import * as cron from 'node-cron';
import { fetchOptionChain } from '../fetchers/optionChain';
import { fetchIndices } from '../fetchers/indices';
import { fetchAllSectors } from '../fetchers/sectors';
import { fetchFIIDII } from '../fetchers/fiiDii';
import { fetchBreadthData } from '../fetchers/breadth';
import { nseFetcher } from '../fetchers/nse.fetcher';
import { runOptionChainEngine } from '../engines/01_optionChain.engine';
import { runSupplyDemandEngine } from '../engines/02_supplyDemand.engine';
import { runPCREngine } from '../engines/03_pcr.engine';
import { runMaxPainEngine } from '../engines/04_maxPain.engine';
import { runVolatilityEngine } from '../engines/05_volatility.engine';
import { runBreadthEngine } from '../engines/06_marketBreadth.engine';
import { runSectorRotationEngine } from '../engines/07_sectorRotation.engine';
import { runInstitutionalEngine } from '../engines/08_institutionalFlow.engine';
import { runTechnicalEngine } from '../engines/09_technical.engine';
import { runFuturesEngine } from '../engines/10_futures.engine';
import { runScoringEngine } from '../engines/11_scoring.engine';
import { runRegimeEngine } from '../engines/12_marketRegime.engine';
import { appState, SYMBOLS } from '../store/state';
import { setCache, getCache } from '../config/redis';
import { insertDB } from '../config/db';
import { broadcaster } from '../websocket/broadcaster';

let isRunning = false;
let cycleCount = 0;

function isMarketHours(): boolean {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const ist = new Date(now.getTime() + istOffset);
  const day = ist.getUTCDay();
  if (day === 0 || day === 6) return false; // Weekend
  const hours = ist.getUTCHours();
  const minutes = ist.getUTCMinutes();
  const totalMinutes = hours * 60 + minutes;
  return totalMinutes >= 540 && totalMinutes <= 935; // 9:00 - 15:35
}

async function rotateOISnapshots(symbol: string, optionChainData: any): Promise<void> {
  const snapKey = (tf: string) => `oi:snapshot:${symbol}:${tf}`;

  // Rotate: 60min <- 30min <- 15min <- 5min <- 1min <- current
  if (cycleCount % 60 === 0) {
    const snap30 = await getCache(snapKey('30min'));
    if (snap30) await setCache(snapKey('60min'), snap30, 7200);
  }
  if (cycleCount % 30 === 0) {
    const snap15 = await getCache(snapKey('15min'));
    if (snap15) await setCache(snapKey('30min'), snap15, 3600);
  }
  if (cycleCount % 15 === 0) {
    const snap5 = await getCache(snapKey('5min'));
    if (snap5) await setCache(snapKey('15min'), snap5, 1800);
  }
  if (cycleCount % 5 === 0) {
    const snap1 = await getCache(snapKey('1min'));
    if (snap1) await setCache(snapKey('5min'), snap1, 600);
  }
  await setCache(snapKey('1min'), optionChainData, 120);
}

async function generateTimelineEvents(symbol: string, previousSignals: any, currentSignals: any): Promise<void> {
  if (!previousSignals) return;

  const events: any[] = [];
  const now = Date.now();

  if (previousSignals.bias !== currentSignals.bias) {
    events.push({
      timestamp: now, symbol, eventType: 'BIAS_CHANGE',
      description: `Market bias changed: ${previousSignals.bias} → ${currentSignals.bias}`,
      ruleFired: `Bullish Score crossed threshold`, previousValue: previousSignals.bias, newValue: currentSignals.bias,
    });
  }
  if (previousSignals.regime !== currentSignals.regime) {
    events.push({
      timestamp: now, symbol, eventType: 'REGIME_CHANGE',
      description: `Market regime changed: ${previousSignals.regime} → ${currentSignals.regime}`,
      ruleFired: `Regime classification rules`, previousValue: previousSignals.regime, newValue: currentSignals.regime,
    });
  }
  if (previousSignals.pcrSignal !== currentSignals.pcrSignal) {
    events.push({
      timestamp: now, symbol, eventType: 'PCR_CHANGE',
      description: `PCR signal changed: ${previousSignals.pcrSignal} → ${currentSignals.pcrSignal}`,
      ruleFired: `PCR threshold crossed`, previousValue: previousSignals.pcrSignal, newValue: currentSignals.pcrSignal,
    });
  }

  for (const event of events) {
    appState.addTimelineEvent(symbol, event);
    broadcaster.broadcast('timeline', event, symbol);
    try {
      await insertDB(
        `INSERT INTO timeline_events (symbol, event_type, description, rule_fired, previous_value, new_value) VALUES ($1,$2,$3,$4,$5,$6)`,
        [event.symbol, event.eventType, event.description, event.ruleFired, event.previousValue, event.newValue]
      );
    } catch {}
  }
}

async function runDataCycle(): Promise<void> {
  if (isRunning) return;
  isRunning = true;
  cycleCount++;

  try {
    console.log(`[Scheduler] Cycle ${cycleCount} starting...`);
    const startTime = Date.now();

    // Fetch shared data
    const indicesData = await fetchIndices();
    await nseFetcher.rateLimitDelay();
    const fiiDiiData = await fetchFIIDII();
    await nseFetcher.rateLimitDelay();
    const breadthData = await fetchBreadthData();
    await nseFetcher.rateLimitDelay();
    const sectorData = await fetchAllSectors();

    // Run breadth, sector, and institutional engines (shared across symbols)
    const e6 = await runBreadthEngine(breadthData);
    const e7 = await runSectorRotationEngine(sectorData);
    const e8 = await runInstitutionalEngine(fiiDiiData);

    appState.setSectors(e7.sectors.map(s => ({
      name: s.name, price: s.price, changePct: s.changePct,
      rsRatio: s.rsRatio, rsMomentum: s.rsMomentum, relativeVolume: s.relativeVolume,
      sectorScore: s.sectorScore, rrgQuadrant: s.rrgQuadrant, breadth: s.sectorBreadth,
    })));

    // Process each symbol
    for (const symbol of SYMBOLS) {
      try {
        const optionChainData = await fetchOptionChain(symbol);
        await nseFetcher.rateLimitDelay();

        if (!optionChainData) {
          console.warn(`[Scheduler] No data for ${symbol}, skipping`);
          continue;
        }

        await rotateOISnapshots(symbol, optionChainData);

        const vix = indicesData.vix;
        const spotPrice = optionChainData.spotPrice;

        // Store previous signals
        const prevState = appState.getSymbolState(symbol);
        const previousSignals = prevState ? {
          bias: prevState.engines.scoring?.result?.marketBias,
          regime: prevState.engines.regime?.result?.regime,
          pcrSignal: prevState.engines.pcr?.signal,
        } : null;

        // Run engines
        const e1 = await runOptionChainEngine(symbol, optionChainData);
        const e2 = runSupplyDemandEngine(symbol, e1);
        const e3 = await runPCREngine(symbol, optionChainData);
        const e4 = runMaxPainEngine(symbol, optionChainData);
        const e5 = runVolatilityEngine(symbol, optionChainData, vix);
        const e9 = await runTechnicalEngine(symbol, spotPrice);
        const e10 = await runFuturesEngine(symbol, optionChainData);
        const e11 = runScoringEngine(symbol, {
          pcrScore: e3.pcrOI,
          futuresSignal: e10.oiSignal,
          basisPositive: e10.basis > 0,
          sectorTopAvg: e7.topSectors.length > 0 ? e7.topSectors.reduce((s, sec) => s + sec.sectorScore, 0) / e7.topSectors.length : 50,
          sectorBottomAvg: e7.bottomSectors.length > 0 ? e7.bottomSectors.reduce((s, sec) => s + sec.sectorScore, 0) / e7.bottomSectors.length : 50,
          bankLeading: e7.sectors.find(s => s.key === 'BANK')?.rrgQuadrant === 'LEADING',
          breadthScore: e6.breadthScore,
          volumeRatio: e10.volumeRatio,
          priceChangePositive: (optionChainData.strikes[0]?.CE.change || 0) > 0,
          vix,
          trendScore: e9.trendScore,
          momentumScore: e9.momentumScore,
          institutionalSignal: e8.signal,
        });
        const e12 = await runRegimeEngine(symbol, spotPrice, e9.ema20, e9.ema50, e9.ema200, vix, e10.volumeRatio);

        // Update state
        const indexData = symbol === 'NIFTY' ? indicesData.nifty :
          symbol === 'BANKNIFTY' ? indicesData.bankNifty :
          symbol === 'FINNIFTY' ? indicesData.finNifty : null;

        appState.setSymbolState(symbol, {
          spotPrice,
          futuresPrice: e10.futuresPrice,
          vix,
          change: indexData?.change || 0,
          changePct: indexData?.changePct || 0,
          dayHigh: indexData?.high || spotPrice,
          dayLow: indexData?.low || spotPrice,
          dayOpen: indexData?.open || spotPrice,
          volume: 0,
          previousClose: indexData?.previousClose || spotPrice,
          engines: {
            optionChain: { engine: 'optionChain', signal: e2.signal, score: 0, result: e1, formulaBreakdown: e1.formulaBreakdown, timestamp: Date.now() },
            supplyDemand: { engine: 'supplyDemand', signal: e2.signal, score: 0, result: e2, formulaBreakdown: e2.formulaBreakdown, timestamp: Date.now() },
            pcr: { engine: 'pcr', signal: e3.signal, score: e3.pcrOI * 100, result: e3, formulaBreakdown: e3.formulaBreakdown, timestamp: Date.now() },
            maxPain: { engine: 'maxPain', signal: e4.signal, score: 0, result: e4, formulaBreakdown: e4.formulaBreakdown, timestamp: Date.now() },
            volatility: { engine: 'volatility', signal: e5.signal, score: e5.ivRank, result: e5, formulaBreakdown: e5.formulaBreakdown, timestamp: Date.now() },
            breadth: { engine: 'breadth', signal: e6.signal, score: e6.breadthScore, result: e6, formulaBreakdown: e6.formulaBreakdown, timestamp: Date.now() },
            sectors: { engine: 'sectors', signal: e7.signal, score: 0, result: e7, formulaBreakdown: e7.formulaBreakdown, timestamp: Date.now() },
            institutional: { engine: 'institutional', signal: e8.signal, score: e8.smartMoneyIndex, result: e8, formulaBreakdown: e8.formulaBreakdown, timestamp: Date.now() },
            technical: { engine: 'technical', signal: e9.signal, score: (e9.trendScore + e9.momentumScore) / 2, result: e9, formulaBreakdown: e9.formulaBreakdown, timestamp: Date.now() },
            futures: { engine: 'futures', signal: e10.signal, score: 0, result: e10, formulaBreakdown: e10.formulaBreakdown, timestamp: Date.now() },
            scoring: { engine: 'scoring', signal: e11.marketBias, score: e11.bullishScore, result: e11, formulaBreakdown: e11.formulaBreakdown, timestamp: Date.now() },
            regime: { engine: 'regime', signal: e12.regime, score: 0, result: e12, formulaBreakdown: e12.formulaBreakdown, timestamp: Date.now() },
          },
          lastUpdated: Date.now(),
          marketStatus: indicesData.marketStatus,
        });

        // Cache in Redis
        await setCache(`engine:scoring:${symbol}`, e11, 120);
        await setCache(`engine:regime:${symbol}`, e12, 120);
        await setCache(`engine:pcr:${symbol}`, e3, 120);
        await setCache(`engine:maxpain:${symbol}`, e4, 120);
        await setCache(`live:${symbol}`, appState.getSymbolState(symbol), 120);

        // Timeline events
        const currentSignals = { bias: e11.marketBias, regime: e12.regime, pcrSignal: e3.signal };
        await generateTimelineEvents(symbol, previousSignals, currentSignals);

        // Store score history
        try {
          await insertDB(
            `INSERT INTO score_history (symbol, bullish_score, bearish_score, component_breakdown) VALUES ($1,$2,$3,$4)`,
            [symbol, e11.bullishScore, e11.bearishScore, JSON.stringify(e11.components)]
          );
        } catch {}

        // Broadcast
        broadcaster.emit('update', {
          symbol,
          spotPrice,
          vix,
          marketBias: e11.marketBias,
          bullishScore: e11.bullishScore,
          regime: e12.regime,
          pcrOI: e3.pcrOI,
          maxPain: e4.maxPainStrike,
          timestamp: Date.now(),
        });

      } catch (err: any) {
        console.error(`[Scheduler] Error processing ${symbol}:`, err.message);
      }
    }

    // Cache sectors and breadth
    await setCache('engine:sectors', e7, 120);
    await setCache('engine:breadth', e6, 120);
    await setCache('engine:institutional', e8, 120);

    const elapsed = Date.now() - startTime;
    console.log(`[Scheduler] Cycle ${cycleCount} completed in ${elapsed}ms`);

  } catch (err: any) {
    console.error('[Scheduler] Cycle error:', err.message);
  } finally {
    isRunning = false;
  }
}

export function startScheduler(): void {
  console.log('[Scheduler] Starting data scheduler...');

  // Run immediately on startup
  runDataCycle().catch(console.error);

  // Then every 60 seconds
  cron.schedule('* * * * *', () => {
    if (isMarketHours()) {
      runDataCycle().catch(console.error);
    } else {
      if (cycleCount % 10 === 0) {
        console.log('[Scheduler] Market closed, skipping cycle');
      }
    }
  });

  console.log('[Scheduler] Cron job scheduled (every 60s during market hours)');
}

// Manual trigger for testing
export { runDataCycle };
