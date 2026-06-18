import { Router, Request, Response } from 'express';
import { appState } from '../store/state';

const router = Router();

// GET /api/explain/:symbol/:engine - Formula explanation for any engine
router.get('/explain/:symbol/:engine', (req: Request, res: Response) => {
  const { symbol, engine: engineName } = req.params;
  const engineOutput = appState.getEngineOutput(symbol.toUpperCase(), engineName);

  if (!engineOutput) {
    return res.status(404).json({ error: `No data for engine "${engineName}" on symbol "${symbol}"` });
  }

  res.json({
    engine: engineName,
    symbol: symbol.toUpperCase(),
    signal: engineOutput.signal,
    score: engineOutput.score,
    formulaBreakdown: engineOutput.formulaBreakdown,
    timestamp: engineOutput.timestamp,
    rawResult: engineOutput.result,
  });
});

// GET /api/explain-all/:symbol - All engine explanations
router.get('/explain-all/:symbol', (req: Request, res: Response) => {
  const { symbol } = req.params;
  const state = appState.getSymbolState(symbol.toUpperCase());
  if (!state) {
    return res.status(404).json({ error: `No data for symbol "${symbol}"` });
  }

  const explanations: Record<string, any> = {};
  for (const [name, engine] of Object.entries(state.engines)) {
    explanations[name] = {
      signal: engine.signal,
      score: engine.score,
      formulaBreakdown: engine.formulaBreakdown,
      timestamp: engine.timestamp,
    };
  }

  res.json({ symbol: symbol.toUpperCase(), engines: explanations });
});

export default router;
