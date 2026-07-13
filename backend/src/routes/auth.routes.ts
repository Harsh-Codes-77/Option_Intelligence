/**
 * Kotak Neo Auth Routes
 * 
 * REST endpoints for the Kotak Neo authentication flow:
 *   POST /api/kotak/login       → Step 1: Generate access token + initiate TOTP
 *   POST /api/kotak/verify-totp → Step 2: Validate TOTP from authenticator app
 *   POST /api/kotak/verify-mpin → Step 3: Validate MPIN to get trading token
 *   POST /api/kotak/auto-login  → Auto-login with MPIN (if supported)
 *   GET  /api/kotak/status      → Check auth status
 *   POST /api/kotak/logout      → Terminate session
 */

import { Router, Request, Response } from 'express';
import { kotakAuth } from '../kotak/kotakAuth';

const router = Router();

// Step 1: Generate access token (no user input needed)
router.post('/kotak/login', async (_req: Request, res: Response) => {
  try {
    const result = await kotakAuth.generateAccessToken();
    if (result.success) {
      res.json({
        success: true,
        message: 'Access token generated. Please enter your TOTP from authenticator app.',
        nextStep: 'verify-totp',
      });
    } else {
      res.status(400).json({ success: false, message: result.message });
    }
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Step 2: Validate TOTP from authenticator app
router.post('/kotak/verify-totp', async (req: Request, res: Response) => {
  try {
    const { totp } = req.body;
    if (!totp || totp.length !== 6) {
      return res.status(400).json({ success: false, message: 'Please enter a valid 6-digit TOTP' });
    }

    const result = await kotakAuth.totpLogin(totp);
    if (result.success) {
      res.json({
        success: true,
        message: result.message,
        nextStep: 'verify-mpin',
      });
    } else {
      res.status(400).json({ success: false, message: result.message });
    }
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Step 3: Validate MPIN to complete authentication
router.post('/kotak/verify-mpin', async (req: Request, res: Response) => {
  try {
    const { mpin } = req.body;
    const success = await kotakAuth.validateMPIN(mpin);

    if (success) {
      const status = kotakAuth.getStatus();
      res.json({
        success: true,
        message: 'Authenticated successfully! Dashboard will now load live data.',
        expiresAt: status.expiresAt,
        expiresIn: status.expiresIn,
      });
    } else {
      res.status(400).json({ success: false, message: 'MPIN validation failed. Please try again.' });
    }
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Auto-login with MPIN (for accounts that support direct MPIN login)
router.post('/kotak/auto-login', async (_req: Request, res: Response) => {
  try {
    const success = await kotakAuth.loginWithMPIN();
    if (success) {
      const status = kotakAuth.getStatus();
      res.json({
        success: true,
        message: 'Auto-login successful',
        expiresAt: status.expiresAt,
        expiresIn: status.expiresIn,
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'Auto-login failed. Manual TOTP login required.',
        nextStep: 'login',
      });
    }
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Check current auth status
router.get('/kotak/status', (_req: Request, res: Response) => {
  const status = kotakAuth.getStatus();
  res.json(status);
});

// Logout
router.post('/kotak/logout', async (_req: Request, res: Response) => {
  try {
    await kotakAuth.logout();
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
