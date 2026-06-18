import { Router, Request, Response } from 'express';
import { appState } from '../store/state';
import { queryDB } from '../config/db';

const router = Router();

// GET /api/timeline/:symbol
router.get('/timeline/:symbol', async (req: Request, res: Response) => {
  const { symbol } = req.params;
  const limit = parseInt(req.query.limit as string) || 200;

  // In-memory first
  const memTimeline = appState.getTimeline(symbol.toUpperCase(), limit);
  if (memTimeline.length > 0) {
    return res.json({ data: memTimeline });
  }

  // Fallback to DB
  try {
    const rows = await queryDB(
      `SELECT * FROM timeline_events WHERE symbol = $1 ORDER BY timestamp DESC LIMIT $2`,
      [symbol.toUpperCase(), limit]
    );
    res.json({ data: rows });
  } catch {
    res.json({ data: [] });
  }
});

// GET /api/history/:symbol
router.get('/history/:symbol', async (req: Request, res: Response) => {
  const { symbol } = req.params;
  const limit = parseInt(req.query.limit as string) || 100;

  try {
    const rows = await queryDB(
      `SELECT * FROM score_history WHERE symbol = $1 ORDER BY timestamp DESC LIMIT $2`,
      [symbol.toUpperCase(), limit]
    );
    res.json({ data: rows });
  } catch {
    res.json({ data: [] });
  }
});

export default router;
