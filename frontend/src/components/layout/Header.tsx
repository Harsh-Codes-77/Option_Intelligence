import { useEffect } from 'react';
import { useDashboardStore } from '../../store/dashboardStore';

const SYMBOLS = ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY'];
const API_URL = import.meta.env.VITE_API_URL || '';

export function Header() {
  const { 
    activeSymbol, 
    setActiveSymbol, 
    symbols, 
    wsConnected,
    kotakStatus,
    setKotakStatus,
    setKotakModalOpen
  } = useDashboardStore();

  const state = symbols[activeSymbol];
  const isPositive = (state?.changePct || 0) >= 0;

  // Poll Kotak status
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch(`${API_URL}/api/kotak/status`);
        if (res.ok) {
          const data = await res.json();
          setKotakStatus(data);
        }
      } catch (err) {
        console.error('Failed to fetch Kotak status:', err);
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 15000); // Check every 15s
    return () => clearInterval(interval);
  }, [setKotakStatus]);

  return (
    <header className="fixed top-0 left-0 right-0 z-40 bg-[var(--color-surface)] border-b border-[var(--color-border)] backdrop-blur-xl">
      <div className="flex items-center justify-between px-4 h-14">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[var(--color-accent)] to-purple-500 flex items-center justify-center text-white font-bold text-sm">OI</div>
          <span className="hidden md:inline text-sm font-semibold text-[var(--color-text)]">Options Intelligence</span>
        </div>

        {/* Symbol Tabs */}
        <div className="flex items-center gap-1 bg-[var(--color-bg)] rounded-lg p-1">
          {SYMBOLS.map((s) => (
            <button
              key={s}
              onClick={() => setActiveSymbol(s)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                activeSymbol === s
                  ? 'bg-[var(--color-accent)] text-black shadow-lg'
                  : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
              }`}
            >
              {s === 'BANKNIFTY' ? 'BNIFTY' : s === 'FINNIFTY' ? 'FINN' : s === 'MIDCPNIFTY' ? 'MIDCP' : s}
            </button>
          ))}
        </div>

        {/* Live Price */}
        <div className="flex items-center gap-4">
          {state && (
            <div className="text-right">
              <div className="text-lg font-bold tabular-nums">{state.spotPrice?.toLocaleString('en-IN', { minimumFractionDigits: 1 })}</div>
              <div className={`text-xs font-semibold ${isPositive ? 'text-[var(--color-bullish)]' : 'text-[var(--color-bearish)]'}`}>
                {isPositive ? '+' : ''}{state.change?.toFixed(1)} ({isPositive ? '+' : ''}{state.changePct?.toFixed(2)}%)
              </div>
            </div>
          )}

          {/* VIX */}
          {state?.vix ? (
            <div className="hidden sm:block text-right">
              <div className="text-[10px] text-[var(--color-text-muted)]">VIX</div>
              <div className={`text-sm font-bold ${state.vix > 20 ? 'text-[var(--color-bearish)]' : state.vix < 14 ? 'text-[var(--color-bullish)]' : 'text-[var(--color-neutral)]'}`}>
                {state.vix.toFixed(2)}
              </div>
            </div>
          ) : null}

          <div className="flex items-center gap-1.5">
            <div className={`pulse-dot ${state?.marketStatus === 'OPEN' ? 'pulse-dot-green' : state?.marketStatus === 'PRE_OPEN' ? 'pulse-dot-yellow' : 'pulse-dot-red'}`} />
            <span className={`text-[10px] font-bold hidden sm:inline ${
              state?.marketStatus === 'OPEN' ? 'text-[var(--color-bullish)]' : 
              state?.marketStatus === 'PRE_OPEN' ? 'text-[var(--color-warning)]' : 
              'text-[var(--color-bearish)]'
            }`}>
              {state?.marketStatus || 'CLOSED'}
            </span>
          </div>

          {/* Kotak Neo API Status */}
          <button 
            onClick={() => setKotakModalOpen(true)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-bold font-mono transition-all border cursor-pointer ${
              kotakStatus?.status === 'CONNECTED'
                ? 'bg-[var(--color-bullish)]/10 border-[var(--color-bullish)]/30 text-[var(--color-bullish)] hover:bg-[var(--color-bullish)]/20'
                : 'bg-[var(--color-bearish)]/10 border-[var(--color-bearish)]/30 text-[var(--color-bearish)] animate-pulse hover:bg-[var(--color-bearish)]/20'
            }`}
          >
            <span className="text-xs">●</span>
            <span>KOTAK {kotakStatus?.status === 'CONNECTED' ? 'LIVE' : 'OFFLINE'}</span>
          </button>

          {/* WS Status */}
          <div className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-[var(--color-bullish)]' : 'bg-[var(--color-bearish)]'}`}
            title={wsConnected ? 'WebSocket Connected' : 'WebSocket Disconnected'} />
        </div>
      </div>
    </header>
  );
}
