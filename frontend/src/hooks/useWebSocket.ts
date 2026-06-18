import { useEffect, useRef, useCallback } from 'react';
import { useDashboardStore } from '../store/dashboardStore';

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3001';
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const { setWsConnected, setSymbolState, addAlert, addTimelineEvent, setLastFetchTime, activeSymbol } = useDashboardStore();

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsConnected(true);
        console.log('[WS] Connected');
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'ping') {
            ws.send(JSON.stringify({ type: 'pong' }));
            return;
          }
          if (msg.type === 'update' && msg.data) {
            setLastFetchTime(msg.timestamp || Date.now());
            if (msg.data?.symbol) {
              setSymbolState(msg.data.symbol, msg.data);
            }
          }
          if (msg.type === 'alert' && msg.data) {
            addAlert(msg.data);
          }
          if (msg.type === 'timeline' && msg.data) {
            addTimelineEvent(msg.data.symbol, msg.data);
          }
        } catch {}
      };

      ws.onclose = () => {
        setWsConnected(false);
        console.log('[WS] Disconnected, reconnecting in 3s...');
        reconnectTimer.current = setTimeout(connect, 3000);
      };

      ws.onerror = () => {
        ws.close();
      };
    } catch {
      reconnectTimer.current = setTimeout(connect, 3000);
    }
  }, [setWsConnected, addAlert, addTimelineEvent, setLastFetchTime, setSymbolState]);

  // Initial HTTP fetch for dashboard data
  const fetchDashboard = useCallback(async (symbol: string, retries = 3) => {
    try {
      const res = await fetch(`${API_URL}/api/dashboard/${symbol}`);
      if (res.ok) {
        const json = await res.json();
        if (json.data) {
          setSymbolState(symbol, json.data);
          setLastFetchTime(Date.now());
        }
      } else if (res.status === 404 || res.status === 202) {
        if (retries > 0) {
          console.warn(`[API] Dashboard fetch initializing/failed, retrying in 5s... (${retries} left)`);
          setTimeout(() => fetchDashboard(symbol, retries - 1), 5000);
        }
      }
    } catch (err) {
      console.warn('[API] Dashboard fetch failed:', err);
      if (retries > 0) {
        setTimeout(() => fetchDashboard(symbol, retries - 1), 5000);
      }
    }
  }, [setSymbolState, setLastFetchTime]);

  useEffect(() => {
    connect();
    // Initial fetch for all symbols
    ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY'].forEach((s) => fetchDashboard(s));

    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect, fetchDashboard]);

  useEffect(() => {
    // Poll every 60s as backup
    const interval = setInterval(() => {
      fetchDashboard(activeSymbol);
    }, 60000);

    return () => {
      clearInterval(interval);
    };
  }, [activeSymbol, fetchDashboard]);

  return { fetchDashboard };
}
