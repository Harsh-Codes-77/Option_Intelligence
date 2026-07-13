/**
 * Kotak Neo Auth Manager
 * 
 * Implements the Kotak Neo v2 API authentication flow using REST:
 *   Step 1: TOTP Login → generates view token + session id
 *   Step 2: TOTP Validate (MPIN) → generates trading token
 *
 * Since Kotak Neo only has a Python SDK, we use direct REST calls via axios.
 */

import axios, { AxiosInstance } from 'axios';

// Kotak Neo v2 API endpoints
const KOTAK_BASE_URL = 'https://napi.kotaksecurities.com/oauth2/token';
const KOTAK_LOGIN_URL = 'https://gw-napi.kotaksecurities.com/login/1.0/login/v2/validate';
const KOTAK_SESSION_URL = 'https://napi.kotaksecurities.com/oauth2/token';
const KOTAK_QUOTES_URL = 'https://gw-napi.kotaksecurities.com/Files/1.0/masterscrip/v1/file-paths';

// Production API base
const API_BASE = 'https://gw-napi.kotaksecurities.com';

export interface KotakTokens {
  accessToken: string | null;
  sessionToken: string | null;
  serverToken: string | null;
  tokenExpiry: number;
}

export type KotakAuthStatus = 'DISCONNECTED' | 'OTP_REQUIRED' | 'MPIN_REQUIRED' | 'CONNECTED' | 'EXPIRED' | 'ERROR';

class KotakAuthManager {
  private accessToken: string | null = null;
  private sessionToken: string | null = null;
  private tradingToken: string | null = null;
  private viewToken: string | null = null;
  private serverToken: string | null = null;
  private tokenExpiry: number = 0;
  private isInitialized: boolean = false;
  private authStatus: KotakAuthStatus = 'DISCONNECTED';
  private lastError: string = '';
  private httpClient: AxiosInstance;
  private consumerKey: string;
  private consumerSecret: string;

  constructor() {
    this.consumerKey = process.env.KOTAK_CONSUMER_KEY || '';
    this.consumerSecret = process.env.KOTAK_CONSUMER_SECRET || '';

    this.httpClient = axios.create({
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });

    if (!this.consumerKey) {
      console.warn('[KotakAuth] KOTAK_CONSUMER_KEY not set. Auth will not work until configured.');
    }
  }

  /**
   * Step 1: Generate access token using consumer key/secret (OAuth2)
   */
  async generateAccessToken(): Promise<{ success: boolean; message: string }> {
    try {
      const response = await this.httpClient.post(KOTAK_BASE_URL, 
        new URLSearchParams({
          grant_type: 'client_credentials',
        }).toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${Buffer.from(`${this.consumerKey}:${this.consumerSecret}`).toString('base64')}`,
          },
        }
      );

      if (response.data?.access_token) {
        this.accessToken = response.data.access_token;
        console.log('[KotakAuth] Access token generated successfully');
        return { success: true, message: 'Access token generated' };
      }

      this.lastError = 'No access token in response';
      return { success: false, message: this.lastError };
    } catch (err: any) {
      this.lastError = err.response?.data?.message || err.message;
      console.error('[KotakAuth] Access token error:', this.lastError);
      return { success: false, message: this.lastError };
    }
  }

  /**
   * Step 2: TOTP Login — provide mobile, UCC, TOTP to get view token
   * This triggers the session creation with the authenticator TOTP.
   */
  async totpLogin(totp: string): Promise<{ success: boolean; message: string }> {
    if (!this.accessToken) {
      const tokenResult = await this.generateAccessToken();
      if (!tokenResult.success) return tokenResult;
    }

    try {
      const response = await this.httpClient.post(
        `${API_BASE}/login/1.0/login/v2/validate`,
        {
          mobileNumber: process.env.KOTAK_MOBILE_NUMBER || '',
          ucc: process.env.KOTAK_UCC || '',
          totp: totp,
        },
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const data = response.data;
      if (data?.data?.token) {
        this.viewToken = data.data.token;
        this.sessionToken = data.data.sid;
        this.authStatus = 'MPIN_REQUIRED';
        console.log('[KotakAuth] TOTP login successful. MPIN validation required.');
        return { success: true, message: 'TOTP verified. Enter MPIN to complete login.' };
      }

      this.lastError = data?.message || 'TOTP login failed';
      this.authStatus = 'ERROR';
      return { success: false, message: this.lastError };
    } catch (err: any) {
      this.lastError = err.response?.data?.message || err.message;
      this.authStatus = 'ERROR';
      console.error('[KotakAuth] TOTP login error:', this.lastError);
      return { success: false, message: this.lastError };
    }
  }

  /**
   * Step 3: MPIN Validation — completes 2FA and generates trading token
   */
  async validateMPIN(mpin?: string): Promise<boolean> {
    const mpinValue = mpin || process.env.KOTAK_MPIN || '';

    try {
      const response = await this.httpClient.post(
        `${API_BASE}/login/1.0/login/v2/validate`,
        {
          mpin: mpinValue,
        },
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'sid': this.sessionToken || '',
            'Auth': this.viewToken || '',
            'Content-Type': 'application/json',
          },
        }
      );

      const data = response.data;
      if (data?.data?.token) {
        this.tradingToken = data.data.token;
        this.serverToken = data.data.serverToken || this.tradingToken;
        this.tokenExpiry = Date.now() + (8 * 60 * 60 * 1000); // 8 hours from now
        this.isInitialized = true;
        this.authStatus = 'CONNECTED';
        console.log('[KotakAuth] ✅ Fully authenticated. Session valid for 8 hours.');
        return true;
      }

      this.lastError = data?.message || 'MPIN validation failed';
      this.authStatus = 'ERROR';
      return false;
    } catch (err: any) {
      this.lastError = err.response?.data?.message || err.message;
      this.authStatus = 'ERROR';
      console.error('[KotakAuth] MPIN validation error:', this.lastError);
      return false;
    }
  }

  /**
   * Quick login with MPIN only (skips TOTP — some accounts support this)
   */
  async loginWithMPIN(): Promise<boolean> {
    const tokenResult = await this.generateAccessToken();
    if (!tokenResult.success) return false;

    try {
      // Try TOTP login with MPIN as fallback
      const response = await this.httpClient.post(
        `${API_BASE}/login/1.0/login/v2/validate`,
        {
          mobileNumber: process.env.KOTAK_MOBILE_NUMBER || '',
          ucc: process.env.KOTAK_UCC || '',
          mpin: process.env.KOTAK_MPIN || '',
        },
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const data = response.data;
      if (data?.data?.token) {
        this.tradingToken = data.data.token;
        this.sessionToken = data.data.sid;
        this.serverToken = data.data.serverToken || this.tradingToken;
        this.tokenExpiry = Date.now() + (8 * 60 * 60 * 1000);
        this.isInitialized = true;
        this.authStatus = 'CONNECTED';
        console.log('[KotakAuth] ✅ MPIN login successful');
        return true;
      }
      return false;
    } catch (err: any) {
      this.lastError = err.response?.data?.message || err.message;
      console.error('[KotakAuth] MPIN login error:', this.lastError);
      return false;
    }
  }

  /**
   * Check if the session is still valid
   */
  isReady(): boolean {
    return this.isInitialized && Date.now() < this.tokenExpiry;
  }

  /**
   * Get auth status for the UI
   */
  getStatus(): {
    status: KotakAuthStatus;
    authenticated: boolean;
    expiresAt: number;
    expiresIn: number;
    lastError: string;
  } {
    // Check expiry
    if (this.isInitialized && Date.now() >= this.tokenExpiry) {
      this.authStatus = 'EXPIRED';
      this.isInitialized = false;
    }

    return {
      status: this.authStatus,
      authenticated: this.isReady(),
      expiresAt: this.tokenExpiry,
      expiresIn: Math.max(0, this.tokenExpiry - Date.now()),
      lastError: this.lastError,
    };
  }

  /**
   * Get authenticated headers for API calls
   */
  getAuthHeaders(): Record<string, string> {
    if (!this.isReady()) {
      throw new Error('Kotak API not authenticated. Complete login first.');
    }

    return {
      'Authorization': `Bearer ${this.accessToken}`,
      'sid': this.sessionToken || '',
      'Auth': this.tradingToken || '',
      'neo-fin-key': 'neotradeapi',
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
  }

  /**
   * Get the tokens for external use
   */
  getTokens(): KotakTokens {
    return {
      accessToken: this.accessToken,
      sessionToken: this.sessionToken,
      serverToken: this.serverToken,
      tokenExpiry: this.tokenExpiry,
    };
  }

  /**
   * Make an authenticated API call
   */
  async apiCall<T = any>(
    method: 'GET' | 'POST',
    endpoint: string,
    data?: any,
    params?: any
  ): Promise<T> {
    const headers = this.getAuthHeaders();

    const response = await this.httpClient.request<T>({
      method,
      url: `${API_BASE}${endpoint}`,
      headers,
      data,
      params,
    });

    return response.data;
  }

  /**
   * Logout and clear session
   */
  async logout(): Promise<void> {
    try {
      if (this.isReady()) {
        await this.apiCall('POST', '/login/1.0/login/v2/logout');
      }
    } catch {
      // Ignore logout errors
    } finally {
      this.accessToken = null;
      this.sessionToken = null;
      this.tradingToken = null;
      this.viewToken = null;
      this.serverToken = null;
      this.tokenExpiry = 0;
      this.isInitialized = false;
      this.authStatus = 'DISCONNECTED';
      console.log('[KotakAuth] Session terminated');
    }
  }
}

// Singleton instance
export const kotakAuth = new KotakAuthManager();
