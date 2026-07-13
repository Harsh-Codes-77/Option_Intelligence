/**
 * Kotak Neo WebSocket Feed Client
 * 
 * Handles real-time tick streaming using Kotak Neo's TCP/WebSocket protocol.
 * Subscribes to NIFTY, BANKNIFTY, FINNIFTY, MIDCPNIFTY index tokens.
 * 
 * Flow:
 *   1. Check if authenticated
 *   2. Connect to wss://<url>/realtime or Socket.IO feed
 *   3. Authenticate with tokens
 *   4. Broadcast live ticks to dashboard clients via local Broadcaster
 */

import WebSocket from 'ws';
import { kotakAuth } from './kotakAuth';
import { INDEX_TOKENS } from './kotakApiClient';
import { broadcaster } from '../websocket/broadcaster';
import { appState } from '../store/state';

class KotakWebsocketClient {
  private ws: WebSocket | null = null;
  private isConnecting: boolean = false;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;

  connect(): void {
    if (this.ws || this.isConnecting) return;
    if (!kotakAuth.isReady()) {
      console.log('[KotakWS] Auth not ready, skipping WebSocket connection');
      return;
    }

    this.isConnecting = true;
    const tokens = kotakAuth.getTokens();
    const token = tokens.accessToken || tokens.serverToken || '';
    const sid = tokens.sessionToken || '';

    // Standard Kotak Neo WebSocket server URL
    const wsUrl = 'wss://e21.kotaksecurities.com/realtime';

    console.log('[KotakWS] Connecting to Kotak Neo WebSocket...', wsUrl);

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.on('open', () => {
        console.log('[KotakWS] Connection established. Authenticating...');
        this.isConnecting = false;

        // Kotak Neo auth payload is text-based: type:cn,Authorization:...,Sid:...,src:WEB
        const authPayload = `type:cn,Authorization:${token},Sid:${sid},src:WEB`;
        this.ws?.send(authPayload);

        // Subscribe to indices
        this.subscribeToIndices();
        this.startHeartbeat();
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        try {
          const messageStr = data.toString();
          this.handleTickMessage(messageStr);
        } catch (err: any) {
          console.error('[KotakWS] Message handling error:', err.message);
        }
      });

      this.ws.on('close', (code, reason) => {
        console.warn(`[KotakWS] Connection closed: Code=${code}, Reason=${reason.toString() || 'none'}`);
        this.cleanup();
        this.scheduleReconnect();
      });

      this.ws.on('error', (err: any) => {
        console.error('[KotakWS] Connection error:', err.message);
        this.cleanup();
        this.scheduleReconnect();
      });

    } catch (err: any) {
      console.error('[KotakWS] Setup error:', err.message);
      this.isConnecting = false;
      this.scheduleReconnect();
    }
  }

  private subscribeToIndices(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    // Kotak Neo subscription payload: type:sb,symbols:<segment>_<token>
    // Exchange segments: nse_cm for index, nse_fo for derivatives
    const symbols = Object.keys(INDEX_TOKENS)
      .map(symbol => {
        const info = INDEX_TOKENS[symbol];
        return `${info.exchange}_${info.token}`;
      })
      .join(',');

    const subPayload = `type:sb,symbols:${symbols}`;
    this.ws.send(subPayload);
    console.log('[KotakWS] Sent subscription payload:', subPayload);
  }

  private handleTickMessage(msg: string): void {
    // Kotak Neo sends CSV or JSON-formatted tick data
    // Example CSV: "tk,nse_cm_26000,22011.50,1710147600,..."
    // Example JSON: {"type": "tk", "symbol": "nse_cm_26000", "ltp": 22011.50, ...}
    if (msg.startsWith('{')) {
      try {
        const tick = JSON.parse(msg);
        if (tick.type === 'tk' || tick.ltp) {
          this.processTick(tick.symbol, parseFloat(tick.ltp));
        }
      } catch {}
    } else {
      const parts = msg.split(',');
      if (parts[0] === 'tk') {
        const symbolToken = parts[1]; // e.g. "nse_cm_26000"
        const ltp = parseFloat(parts[2]);
        if (symbolToken && !isNaN(ltp)) {
          this.processTick(symbolToken, ltp);
        }
      }
    }
  }

  private processTick(symbolToken: string, ltp: number): void {
    // Find matching symbol
    let matchedSymbol: string | null = null;
    for (const sym of Object.keys(INDEX_TOKENS)) {
      const info = INDEX_TOKENS[sym];
      if (symbolToken === `${info.exchange}_${info.token}`) {
        matchedSymbol = sym;
        break;
      }
    }

    if (!matchedSymbol) return;

    // Update state & broadcast live tick to UI
    const state = appState.getSymbolState(matchedSymbol);
    if (state) {
      // Calculate net change and percent change
      const change = ltp - state.previousClose;
      const changePct = state.previousClose > 0 ? (change / state.previousClose) * 100 : 0;

      appState.setSymbolState(matchedSymbol, {
        ...state,
        spotPrice: ltp,
        change,
        changePct,
        lastUpdated: Date.now(),
      });

      // Broadcast tick to dashboard clients
      broadcaster.broadcast('tick', {
        symbol: matchedSymbol,
        ltp,
        change,
        changePct,
        timestamp: Date.now(),
      }, matchedSymbol);
    }
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        // Kotak Neo heartbeat payload is "ping"
        this.ws.send('ping');
      }
    }, 15000);
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimeout) return;
    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      this.connect();
    }, 10000); // Reconnect in 10s
  }

  private cleanup(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }
    this.isConnecting = false;
  }

  disconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    this.cleanup();
    console.log('[KotakWS] WebSocket disconnected');
  }
}

export const kotakWebsocket = new KotakWebsocketClient();
