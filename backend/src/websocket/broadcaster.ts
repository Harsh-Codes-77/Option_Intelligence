import { WebSocket, WebSocketServer } from 'ws';
import { Server } from 'http';

interface WSClient {
  ws: WebSocket;
  subscribedSymbols: Set<string>;
  lastPing: number;
}

class Broadcaster {
  private wss: WebSocketServer | null = null;
  private clients: Map<string, WSClient> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;

  initialize(server: Server): void {
    this.wss = new WebSocketServer({ server });

    this.wss.on('connection', (ws: WebSocket) => {
      const clientId = Math.random().toString(36).substring(2, 15);
      this.clients.set(clientId, {
        ws,
        subscribedSymbols: new Set(['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY']),
        lastPing: Date.now(),
      });
      console.log(`[WS] Client connected: ${clientId} (total: ${this.clients.size})`);

      ws.on('message', (data: Buffer) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'subscribe' && msg.symbol) {
            this.clients.get(clientId)?.subscribedSymbols.add(msg.symbol);
          }
          if (msg.type === 'pong') {
            const client = this.clients.get(clientId);
            if (client) client.lastPing = Date.now();
          }
        } catch {}
      });

      ws.on('close', () => {
        this.clients.delete(clientId);
        console.log(`[WS] Client disconnected: ${clientId} (total: ${this.clients.size})`);
      });

      ws.on('error', () => {
        this.clients.delete(clientId);
      });

      // Send welcome message
      ws.send(JSON.stringify({ type: 'connected', clientId, timestamp: Date.now() }));
    });

    // Heartbeat every 30s
    this.heartbeatInterval = setInterval(() => {
      const now = Date.now();
      this.clients.forEach((client, id) => {
        if (now - client.lastPing > 60000) {
          client.ws.terminate();
          this.clients.delete(id);
          return;
        }
        if (client.ws.readyState === WebSocket.OPEN) {
          client.ws.send(JSON.stringify({ type: 'ping', timestamp: now }));
        }
      });
    }, 30000);

    console.log('[WS] WebSocket server initialized');
  }

  broadcast(event: string, data: any, symbol?: string): void {
    const message = JSON.stringify({ type: event, data, timestamp: Date.now() });
    this.clients.forEach((client) => {
      if (client.ws.readyState !== WebSocket.OPEN) return;
      if (symbol && !client.subscribedSymbols.has(symbol)) return;
      try {
        client.ws.send(message);
      } catch {}
    });
  }

  emit(event: string, data: any): void {
    this.broadcast(event, data, data?.symbol);
  }

  getClientCount(): number {
    return this.clients.size;
  }

  shutdown(): void {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    this.clients.forEach((client) => client.ws.terminate());
    this.wss?.close();
  }
}

export const broadcaster = new Broadcaster();
