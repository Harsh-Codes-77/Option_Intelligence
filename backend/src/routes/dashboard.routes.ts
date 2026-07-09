import { Router, Request, Response } from 'express';
import { appState } from '../store/state';
import { getCache } from '../config/redis';

const router = Router();

// GET /api/dashboard/:symbol - Full dashboard state
router.get('/dashboard/:symbol', async (req: Request, res: Response) => {
  const { symbol } = req.params;
  const state = appState.getSymbolState(symbol.toUpperCase());
  if (!state) {
    // Try Redis cache
    const cached = await getCache(`live:${symbol.toUpperCase()}`);
    if (cached) return res.json({ data: cached, cached: true });
    return res.status(202).json({ status: 'initializing', message: 'Data fetch in progress' });
  }
  res.json({ data: state, cached: false, timestamp: Date.now() });
});

// GET /api/scoring/:symbol - Scoring breakdown
router.get('/scoring/:symbol', async (req: Request, res: Response) => {
  const { symbol } = req.params;
  const scoring = appState.getEngineOutput(symbol.toUpperCase(), 'scoring');
  if (!scoring) {
    const cached = await getCache(`engine:scoring:${symbol.toUpperCase()}`);
    if (cached) return res.json({ data: cached, cached: true });
    return res.status(404).json({ error: 'No scoring data' });
  }
  res.json({ data: scoring.result, cached: false });
});

// GET /api/sectors - All sector data
router.get('/sectors', async (_req: Request, res: Response) => {
  const sectors = appState.getSectors();
  if (sectors.length === 0) {
    const cached = await getCache('engine:sectors');
    if (cached) return res.json({ data: cached, cached: true });
  }
  res.json({ data: sectors, cached: false });
});

// GET /api/alerts - Recent alerts
router.get('/alerts', (_req: Request, res: Response) => {
  const alerts = appState.getAlerts(50);
  res.json({ data: alerts });
});

// GET /api/regime/:symbol - Market regime
router.get('/regime/:symbol', async (req: Request, res: Response) => {
  const { symbol } = req.params;
  const regime = appState.getEngineOutput(symbol.toUpperCase(), 'regime');
  if (!regime) {
    const cached = await getCache(`engine:regime:${symbol.toUpperCase()}`);
    if (cached) return res.json({ data: cached, cached: true });
    return res.status(404).json({ error: 'No regime data' });
  }
  res.json({ data: regime.result, cached: false });
});

// GET /api/greeks/health/:symbol - Health check for Greeks engine
router.get('/greeks/health/:symbol', async (req: Request, res: Response) => {
  const { symbol } = req.params;
  let greeks = appState.getEngineOutput(symbol.toUpperCase(), 'greeks');
  
  if (!greeks) {
    const cached = await getCache(`engine:greeks:${symbol.toUpperCase()}`);
    if (cached) {
      greeks = { result: cached } as any;
    } else {
      return res.status(404).json({ status: 'error', error: 'No greeks data' });
    }
  }

  const result = greeks?.result;
  const isHealthy = result && result.gammaExposure !== 0 && result.gammaExposure !== null && !isNaN(result.gammaExposure);

  res.json({
    status: isHealthy ? 'healthy' : 'warming_up',
    data: result,
    cached: !appState.getEngineOutput(symbol.toUpperCase(), 'greeks')
  });
});

// GET /api/health - Health check
router.get('/health', (_req: Request, res: Response) => {
  const symbols = appState.getAllSymbolStates();
  const activeSymbols = Object.keys(symbols).filter(s => symbols[s].lastUpdated > Date.now() - 300000);
  res.json({
    status: 'ok',
    activeSymbols,
    totalSymbols: Object.keys(symbols).length,
    timestamp: Date.now(),
  });
});

export default router;
