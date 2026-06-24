import { Router, Request, Response } from 'express';
import { appState } from '../store/state';
import { getCache } from '../config/redis';

const router = Router();

// GET /api/option-chain/:symbol
router.get('/option-chain/:symbol', async (req: Request, res: Response) => {
  const { symbol } = req.params;
  const engine = appState.getEngineOutput(symbol.toUpperCase(), 'optionChain');
  if (!engine) {
    const cached = await getCache(`live:options:${symbol.toUpperCase()}`);
    if (cached) return res.json({ data: cached, cached: true });
    return res.status(404).json({ error: 'No option chain data' });
  }
  res.json({ data: engine.result, cached: false });
});

// GET /api/strikes/:symbol - Top 5 CE + PE strikes with scores
router.get('/strikes/:symbol', async (req: Request, res: Response) => {
  const { symbol } = req.params;
  const engine = appState.getEngineOutput(symbol.toUpperCase(), 'optionChain');
  if (!engine?.result?.strikes) {
    return res.status(404).json({ error: 'No strike data' });
  }

  const strikes = engine.result.strikes;
  const spotPrice = engine.result.spotPrice;

  // Score each strike
  const scoreStrike = (s: any, side: 'CE' | 'PE') => {
    const data = s[side];
    const bidAskSpread = Math.abs((data.ask || 0) - (data.bid || 0));
    const bidAskPct = data.ltp > 0 ? (bidAskSpread / data.ltp) * 100 : 100;
    const liquidityScore = Math.max(25 - bidAskPct * 2.5, 0);
    const volScore = Math.min((data.volume || 0) / 10000 * 20, 20);
    const oiScore = Math.min((data.oi || 0) / 100000 * 20, 20);
    const oiMomentum = Math.min(Math.abs(data.oiChangePct || 0) * 3, 15);
    const distPct = Math.abs(s.strikePrice - spotPrice) / spotPrice * 100;
    const distScore = Math.max(10 - distPct * 2, 0);
    const ivScore = Math.max(10 - (data.iv || 0) / 10, 0);
    const total = liquidityScore + volScore + oiScore + oiMomentum + distScore + ivScore;
    return { strike: s.strikePrice, side, totalScore: parseFloat(total.toFixed(1)), breakdown: { liquidityScore: parseFloat(liquidityScore.toFixed(1)), volScore: parseFloat(volScore.toFixed(1)), oiScore: parseFloat(oiScore.toFixed(1)), oiMomentum: parseFloat(oiMomentum.toFixed(1)), distScore: parseFloat(distScore.toFixed(1)), ivScore: parseFloat(ivScore.toFixed(1)) } };
  };

  const ceScores = strikes.map((s: any) => scoreStrike(s, 'CE')).sort((a: any, b: any) => b.totalScore - a.totalScore).slice(0, 5);
  const peScores = strikes.map((s: any) => scoreStrike(s, 'PE')).sort((a: any, b: any) => b.totalScore - a.totalScore).slice(0, 5);

  res.json({ data: { topCE: ceScores, topPE: peScores, spotPrice } });
});

// GET /api/maxpain/:symbol
router.get('/maxpain/:symbol', async (req: Request, res: Response) => {
  const { symbol } = req.params;
  const engine = appState.getEngineOutput(symbol.toUpperCase(), 'maxPain');
  if (!engine) {
    const cached = await getCache(`engine:maxpain:${symbol.toUpperCase()}`);
    if (cached) return res.json({ data: cached, cached: true });
    return res.status(404).json({ error: 'No max pain data' });
  }
  res.json({ data: engine.result, cached: false });
});

export default router;
