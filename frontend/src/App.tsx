import { Header } from './components/layout/Header';
import { FormulaModal } from './components/shared/FormulaModal';
import { MarketBiasCard, RegimeCard, SupportResistanceCard, ScoringCard, PCRCard, MaxPainCard, VolatilityCard, BreadthCard, FuturesCard, InstitutionalCard, TechnicalCard, SectorHeatmap, TimelinePanel, GreeksCard } from './components/dashboard/Panels';
import { useWebSocket } from './hooks/useWebSocket';
import { useDashboardStore } from './store/dashboardStore';

function App() {
  useWebSocket();
  const { activeSymbol, symbols, lastFetchTime } = useDashboardStore();
  const state = symbols[activeSymbol];

  const freshnessMs = Date.now() - (lastFetchTime || Date.now());
  const freshness = freshnessMs < 120000 ? 'text-[var(--color-bullish)]' : freshnessMs < 300000 ? 'text-[var(--color-neutral)]' : 'text-[var(--color-bearish)]';

  return (
    <div className="min-h-screen bg-[var(--color-bg)]">
      <Header />

      {/* Main Content */}
      <main className="pt-16 pb-16 px-3 md:px-6 max-w-[1600px] mx-auto">
        {!state ? (
          <div className="flex flex-col items-center justify-center h-[60vh] text-[var(--color-text-muted)] space-y-4">
            {(!import.meta.env.VITE_API_URL && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') ? (
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-6 rounded-lg max-w-md text-center">
                <h3 className="font-bold text-lg mb-2">Deployment Configuration Error</h3>
                <p className="text-sm">VITE_API_URL environment variable is missing.</p>
                <p className="text-sm mt-2 opacity-80">Please go to your Vercel project settings, add <b>VITE_API_URL</b> with your Render backend URL (e.g., https://your-backend.onrender.com), and redeploy.</p>
              </div>
            ) : (
              <>
                <div className="w-12 h-12 border-4 border-[var(--color-surface)] border-t-[var(--color-accent)] rounded-full animate-spin"></div>
                <p className="text-sm font-medium tracking-wide">Initializing data for {activeSymbol}...</p>
                <p className="text-xs opacity-60">This may take a few moments as we fetch live market data.</p>
              </>
            )}
          </div>
        ) : (
          <>
            {/* Status Bar */}
            <div className="flex items-center justify-between mb-4 text-[10px] text-[var(--color-text-muted)]">
          <span>
            Last updated: <span className={freshness}>
              {lastFetchTime ? new Date(lastFetchTime).toLocaleTimeString('en-IN') : 'Never'}
            </span>
          </span>
          {state?.engines?.scoring?.result?.marketBias && (
            <span>Expiry: {state.engines.futures?.result?.daysToExpiry || '?'}d | DTE</span>
          )}
        </div>

        {/* Top Row: Bias + Regime + Support/Resistance */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
          <MarketBiasCard />
          <RegimeCard />
          <SupportResistanceCard />
        </div>

        {/* Second Row: PCR + Max Pain + Volatility + Greeks + Futures */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-3">
          <PCRCard />
          <MaxPainCard />
          <VolatilityCard />
          <GreeksCard />
          <FuturesCard />
        </div>

        {/* Third Row: Breadth + Institutional + Technical + Scoring */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
          <BreadthCard />
          <InstitutionalCard />
          <TechnicalCard />
          <ScoringCard />
        </div>

        {/* Fourth Row: Sector Heatmap */}
        <div className="mb-3">
          <SectorHeatmap />
        </div>

        {/* Fifth Row: Timeline */}
        <div className="mb-3">
          <TimelinePanel />
        </div>
          </>
        )}
      </main>

      {/* Bottom nav for mobile */}
      <nav className="fixed bottom-0 left-0 right-0 md:hidden bg-[var(--color-surface)] border-t border-[var(--color-border)] z-40">
        <div className="flex items-center justify-around h-12">
          {[
            { label: '📊', title: 'Dashboard' },
            { label: '📋', title: 'Options' },
            { label: '📈', title: 'Futures' },
            { label: '🏭', title: 'Sectors' },
            { label: '⏱️', title: 'Timeline' },
          ].map((item) => (
            <button key={item.title} className="flex flex-col items-center gap-0.5 text-[var(--color-text-muted)] hover:text-[var(--color-accent)] transition-colors">
              <span className="text-lg">{item.label}</span>
              <span className="text-[9px]">{item.title}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* Formula Modal */}
      <FormulaModal />
    </div>
  );
}

export default App;
