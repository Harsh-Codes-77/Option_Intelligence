import { create } from 'zustand';

export type MarketBias = 'BULLISH' | 'MILDLY_BULLISH' | 'NEUTRAL' | 'MILDLY_BEARISH' | 'BEARISH';

export interface EngineOutput {
  engine: string;
  signal: string;
  score: number;
  result: any;
  formulaBreakdown: any;
  timestamp: number;
}

export interface KotakStatus {
  status: 'DISCONNECTED' | 'OTP_REQUIRED' | 'MPIN_REQUIRED' | 'CONNECTED' | 'EXPIRED' | 'ERROR';
  authenticated: boolean;
  expiresAt: number;
  expiresIn: number;
  lastError: string;
}

export interface SymbolState {
  spotPrice: number;
  futuresPrice: number;
  vix: number;
  change: number;
  changePct: number;
  dayHigh: number;
  dayLow: number;
  dayOpen: number;
  volume: number;
  previousClose: number;
  engines: Record<string, EngineOutput>;
  lastUpdated: number;
  marketStatus: 'PRE_OPEN' | 'OPEN' | 'CLOSED';
}

export interface AlertEvent {
  id: string;
  timestamp: number;
  symbol: string;
  type: string;
  message: string;
  severity: 'info' | 'warning' | 'critical';
}

export interface TimelineEvent {
  timestamp: number;
  symbol: string;
  eventType: string;
  description: string;
  ruleFired: string;
  previousValue: string;
  newValue: string;
}

interface DashboardStore {
  activeSymbol: string;
  setActiveSymbol: (s: string) => void;
  symbols: Record<string, SymbolState>;
  setSymbolState: (symbol: string, state: SymbolState) => void;
  updateSymbolTick: (symbol: string, tick: { ltp: number; change: number; changePct: number }) => void;
  sectors: any[];
  setSectors: (sectors: any[]) => void;
  alerts: AlertEvent[];
  addAlert: (alert: AlertEvent) => void;
  timeline: Record<string, TimelineEvent[]>;
  addTimelineEvent: (symbol: string, event: TimelineEvent) => void;
  wsConnected: boolean;
  setWsConnected: (c: boolean) => void;
  formulaModal: { open: boolean; data: any | null };
  openFormulaModal: (data: any) => void;
  closeFormulaModal: () => void;
  lastFetchTime: number;
  setLastFetchTime: (t: number) => void;
  kotakStatus: KotakStatus | null;
  setKotakStatus: (status: KotakStatus | null) => void;
  kotakModalOpen: boolean;
  setKotakModalOpen: (open: boolean) => void;
}

export const useDashboardStore = create<DashboardStore>((set) => ({
  activeSymbol: 'NIFTY',
  setActiveSymbol: (s) => set({ activeSymbol: s }),
  symbols: {},
  setSymbolState: (symbol, state) => set((prev) => ({
    symbols: { ...prev.symbols, [symbol]: state },
  })),
  updateSymbolTick: (symbol, tick) => set((prev) => {
    const existing = prev.symbols[symbol];
    if (!existing) return {};
    return {
      symbols: {
        ...prev.symbols,
        [symbol]: {
          ...existing,
          spotPrice: tick.ltp,
          change: tick.change,
          changePct: tick.changePct,
          lastUpdated: Date.now(),
        }
      }
    };
  }),
  sectors: [],
  setSectors: (sectors) => set({ sectors }),
  alerts: [],
  addAlert: (alert) => set((prev) => ({
    alerts: [alert, ...prev.alerts].slice(0, 50),
  })),
  timeline: {},
  addTimelineEvent: (symbol, event) => set((prev) => ({
    timeline: {
      ...prev.timeline,
      [symbol]: [event, ...(prev.timeline[symbol] || [])].slice(0, 200),
    },
  })),
  wsConnected: false,
  setWsConnected: (c) => set({ wsConnected: c }),
  formulaModal: { open: false, data: null },
  openFormulaModal: (data) => set({ formulaModal: { open: true, data } }),
  closeFormulaModal: () => set({ formulaModal: { open: false, data: null } }),
  lastFetchTime: 0,
  setLastFetchTime: (t) => set({ lastFetchTime: t }),
  kotakStatus: null,
  setKotakStatus: (status) => set({ kotakStatus: status }),
  kotakModalOpen: false,
  setKotakModalOpen: (open) => set({ kotakModalOpen: open }),
}));
