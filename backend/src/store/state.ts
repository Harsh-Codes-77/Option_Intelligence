// In-memory rolling state for current engine outputs per symbol

export interface EngineOutput {
  engine: string;
  signal: string;
  score: number;
  result: any;
  formulaBreakdown: any;
  timestamp: number;
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

export interface SectorState {
  name: string;
  price: number;
  changePct: number;
  rsRatio: number;
  rsMomentum: number;
  relativeVolume: number;
  sectorScore: number;
  rrgQuadrant: 'LEADING' | 'WEAKENING' | 'LAGGING' | 'IMPROVING';
  breadth: number;
}

export interface AlertEvent {
  id: string;
  timestamp: number;
  symbol: string;
  type: string;
  message: string;
  ruleFired: string;
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

class AppState {
  private symbols: Record<string, SymbolState> = {};
  private sectors: SectorState[] = [];
  private alerts: AlertEvent[] = [];
  private timeline: Record<string, TimelineEvent[]> = {};
  private previousStates: Record<string, SymbolState> = {};

  // Symbol state
  getSymbolState(symbol: string): SymbolState | null {
    return this.symbols[symbol] || null;
  }

  setSymbolState(symbol: string, state: SymbolState): void {
    this.previousStates[symbol] = this.symbols[symbol] ? { ...this.symbols[symbol] } : state;
    this.symbols[symbol] = state;
  }

  getPreviousState(symbol: string): SymbolState | null {
    return this.previousStates[symbol] || null;
  }

  getAllSymbolStates(): Record<string, SymbolState> {
    return this.symbols;
  }

  // Sector state
  getSectors(): SectorState[] {
    return this.sectors;
  }

  setSectors(sectors: SectorState[]): void {
    this.sectors = sectors;
  }

  // Alerts
  addAlert(alert: AlertEvent): void {
    this.alerts.unshift(alert);
    if (this.alerts.length > 100) {
      this.alerts = this.alerts.slice(0, 100);
    }
  }

  getAlerts(limit: number = 50): AlertEvent[] {
    return this.alerts.slice(0, limit);
  }

  // Timeline
  addTimelineEvent(symbol: string, event: TimelineEvent): void {
    if (!this.timeline[symbol]) {
      this.timeline[symbol] = [];
    }
    this.timeline[symbol].unshift(event);
    if (this.timeline[symbol].length > 200) {
      this.timeline[symbol] = this.timeline[symbol].slice(0, 200);
    }
  }

  getTimeline(symbol: string, limit: number = 200): TimelineEvent[] {
    return (this.timeline[symbol] || []).slice(0, limit);
  }

  // Engine output shortcut
  setEngineOutput(symbol: string, engineName: string, output: EngineOutput): void {
    if (!this.symbols[symbol]) {
      this.symbols[symbol] = {
        spotPrice: 0, futuresPrice: 0, vix: 0,
        change: 0, changePct: 0, dayHigh: 0, dayLow: 0, dayOpen: 0,
        volume: 0, previousClose: 0,
        engines: {}, lastUpdated: Date.now(), marketStatus: 'CLOSED',
      };
    }
    this.symbols[symbol].engines[engineName] = output;
    this.symbols[symbol].lastUpdated = Date.now();
  }

  getEngineOutput(symbol: string, engineName: string): EngineOutput | null {
    return this.symbols[symbol]?.engines[engineName] || null;
  }
}

export const appState = new AppState();

// Supported symbols
export const SYMBOLS = ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY'] as const;
export type Symbol = typeof SYMBOLS[number];

// Lot sizes per symbol
export const LOT_SIZES: Record<string, number> = {
  NIFTY: 75,
  BANKNIFTY: 30,
  FINNIFTY: 40,
  MIDCPNIFTY: 75,
};

// Sector list
export const SECTORS = [
  { name: 'NIFTY BANK', key: 'BANK' },
  { name: 'NIFTY IT', key: 'IT' },
  { name: 'NIFTY AUTO', key: 'AUTO' },
  { name: 'NIFTY PHARMA', key: 'PHARMA' },
  { name: 'NIFTY METAL', key: 'METAL' },
  { name: 'NIFTY PSU BANK', key: 'PSU_BANK' },
  { name: 'NIFTY ENERGY', key: 'ENERGY' },
  { name: 'NIFTY FMCG', key: 'FMCG' },
  { name: 'NIFTY REALTY', key: 'REALTY' },
  { name: 'NIFTY INFRA', key: 'INFRA' },
  { name: 'NIFTY FINANCIAL SERVICES', key: 'FIN_SERVICES' },
  { name: 'NIFTY INDIA DEFENCE', key: 'DEFENCE' },
] as const;
