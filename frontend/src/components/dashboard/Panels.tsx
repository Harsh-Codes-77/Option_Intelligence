import { useDashboardStore } from '../../store/dashboardStore';
import { SignalBadge } from '../shared/SignalBadge';

export function MarketBiasCard() {
  const { activeSymbol, symbols, openFormulaModal } = useDashboardStore();
  const state = symbols[activeSymbol];
  const scoring = state?.engines?.scoring;
  if (!scoring?.result) return <EmptyCard title="MARKET BIAS" />;

  const { bullishScore, bearishScore, marketBias, components } = scoring.result;
  const isBullish = bullishScore >= 50;

  return (
    <div
      className={`card cursor-pointer ${isBullish ? 'glow-bullish' : 'glow-bearish'}`}
      onClick={() => openFormulaModal(scoring.formulaBreakdown)}
    >
      <div className="card-header">
        <span className="card-title">Market Bias</span>
        <SignalBadge signal={marketBias} size="md" />
      </div>
      <div className="text-center py-2">
        <div className={`text-3xl font-black ${isBullish ? 'text-[var(--color-bullish)]' : 'text-[var(--color-bearish)]'}`}>
          {bullishScore?.toFixed(1)}
        </div>
        <div className="text-xs text-[var(--color-text-muted)] mt-1">Bullish Score / 100</div>
      </div>
      {/* Progress bar */}
      <div className="h-2 bg-[var(--color-bg)] rounded-full overflow-hidden mt-2">
        <div className="h-full rounded-full transition-all duration-700" style={{
          width: `${bullishScore}%`,
          background: `linear-gradient(90deg, var(--color-bearish), var(--color-neutral), var(--color-bullish))`,
        }} />
      </div>
      <div className="flex justify-between mt-1 text-[10px] text-[var(--color-text-muted)]">
        <span>Bear {bearishScore?.toFixed(1)}</span>
        <span>Bull {bullishScore?.toFixed(1)}</span>
      </div>
      {/* Component pills */}
      <div className="flex flex-wrap gap-1 mt-3">
        {components?.slice(0, 4).map((c: any) => (
          <span key={c.name} className={`text-[9px] px-1.5 py-0.5 rounded-full ${c.normalizedScore >= 60 ? 'bg-[var(--color-bullish)]/10 text-[var(--color-bullish)]' : c.normalizedScore <= 40 ? 'bg-[var(--color-bearish)]/10 text-[var(--color-bearish)]' : 'bg-[var(--color-neutral)]/10 text-[var(--color-neutral)]'}`}>
            {c.name}: {c.normalizedScore?.toFixed(0)}
          </span>
        ))}
      </div>
      <div className="text-[9px] text-[var(--color-text-muted)] mt-2 text-center">Click for formula breakdown →</div>
    </div>
  );
}

export function RegimeCard() {
  const { activeSymbol, symbols, openFormulaModal } = useDashboardStore();
  const state = symbols[activeSymbol];
  const regime = state?.engines?.regime;
  if (!regime?.result) return <EmptyCard title="MARKET REGIME" />;

  const { regime: regimeType, rulesFired } = regime.result;

  const regimeColors: Record<string, string> = {
    TRENDING_BULLISH: 'text-[var(--color-bullish)]', BREAKOUT: 'text-[var(--color-bullish)]',
    TRENDING_BEARISH: 'text-[var(--color-bearish)]', BREAKDOWN: 'text-[var(--color-bearish)]',
    HIGH_VOLATILITY: 'text-[var(--color-warning)]', RANGE_BOUND: 'text-[var(--color-neutral)]',
    LOW_VOLATILITY_RANGE: 'text-[var(--color-accent)]',
  };

  return (
    <div className="card cursor-pointer" onClick={() => openFormulaModal(regime.formulaBreakdown)}>
      <div className="card-header">
        <span className="card-title">Market Regime</span>
      </div>
      <div className={`text-xl font-black text-center py-2 ${regimeColors[regimeType] || 'text-[var(--color-text)]'}`}>
        {regimeType?.replace(/_/g, ' ')}
      </div>
      <div className="space-y-1 mt-2">
        {rulesFired?.slice(-3).map((rule: string, i: number) => (
          <div key={i} className="text-[10px] text-[var(--color-text-muted)] font-mono truncate">• {rule}</div>
        ))}
      </div>
    </div>
  );
}

export function SupportResistanceCard() {
  const { activeSymbol, symbols, openFormulaModal } = useDashboardStore();
  const state = symbols[activeSymbol];
  const sd = state?.engines?.supplyDemand;
  if (!sd?.result) return <EmptyCard title="SUPPORT / RESISTANCE" />;

  const { resistanceLevels, supportLevels, spotPrice } = sd.result;

  return (
    <div className="card cursor-pointer" onClick={() => openFormulaModal(sd.formulaBreakdown)}>
      <div className="card-header">
        <span className="card-title">Support / Resistance</span>
        <span className="text-xs text-[var(--color-text-muted)]">Spot: {spotPrice?.toLocaleString()}</span>
      </div>
      <div className="space-y-1.5">
        {resistanceLevels?.map((r: any, i: number) => (
          <div key={`r${i}`} className="flex items-center justify-between text-xs">
            <span className="text-[var(--color-bearish)]">R{i+1}: {r.strike?.toLocaleString()}</span>
            <div className="flex items-center gap-2">
              <div className="w-16 h-1.5 bg-[var(--color-bg)] rounded-full overflow-hidden">
                <div className="h-full bg-[var(--color-bearish)] rounded-full" style={{ width: `${Math.min(r.strength, 100)}%` }} />
              </div>
              <span className="text-[10px] text-[var(--color-text-muted)] w-12">{r.rating}</span>
            </div>
          </div>
        ))}
        <div className="border-t border-[var(--color-border)] my-1" />
        {supportLevels?.map((s: any, i: number) => (
          <div key={`s${i}`} className="flex items-center justify-between text-xs">
            <span className="text-[var(--color-bullish)]">S{i+1}: {s.strike?.toLocaleString()}</span>
            <div className="flex items-center gap-2">
              <div className="w-16 h-1.5 bg-[var(--color-bg)] rounded-full overflow-hidden">
                <div className="h-full bg-[var(--color-bullish)] rounded-full" style={{ width: `${Math.min(s.strength, 100)}%` }} />
              </div>
              <span className="text-[10px] text-[var(--color-text-muted)] w-12">{s.rating}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ScoringCard() {
  const { activeSymbol, symbols, openFormulaModal } = useDashboardStore();
  const state = symbols[activeSymbol];
  const scoring = state?.engines?.scoring;
  if (!scoring?.result) return <EmptyCard title="SCORING BREAKDOWN" />;

  const { components } = scoring.result;

  return (
    <div className="card cursor-pointer" onClick={() => openFormulaModal(scoring.formulaBreakdown)}>
      <div className="card-header">
        <span className="card-title">Scoring Breakdown</span>
      </div>
      <div className="space-y-2">
        {components?.map((c: any) => (
          <div key={c.name}>
            <div className="flex justify-between text-[11px] mb-0.5">
              <span className="text-[var(--color-text-muted)]">{c.name} ({(c.weight * 100).toFixed(0)}%)</span>
              <span className={c.normalizedScore >= 60 ? 'text-[var(--color-bullish)]' : c.normalizedScore <= 40 ? 'text-[var(--color-bearish)]' : 'text-[var(--color-neutral)]'}>
                {c.normalizedScore?.toFixed(1)}
              </span>
            </div>
            <div className="h-1.5 bg-[var(--color-bg)] rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-500" style={{
                width: `${c.normalizedScore}%`,
                background: c.normalizedScore >= 60 ? 'var(--color-bullish)' : c.normalizedScore <= 40 ? 'var(--color-bearish)' : 'var(--color-neutral)',
              }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PCRCard() {
  const { activeSymbol, symbols, openFormulaModal } = useDashboardStore();
  const state = symbols[activeSymbol];
  const pcr = state?.engines?.pcr;
  if (!pcr?.result) return <EmptyCard title="PCR" />;

  const { pcrOI, classification, trend, signal, atmPCR } = pcr.result;

  return (
    <div className="card cursor-pointer" onClick={() => openFormulaModal(pcr.formulaBreakdown)}>
      <div className="card-header">
        <span className="card-title">Put/Call Ratio</span>
        <SignalBadge signal={signal} />
      </div>
      <div className="text-center py-2">
        <div className="text-3xl font-black">{pcrOI?.toFixed(2)}</div>
        <div className="text-xs text-[var(--color-text-muted)]">{classification}</div>
      </div>
      <div className="flex justify-between text-[11px] mt-2">
        <span className="text-[var(--color-text-muted)]">ATM PCR: <span className="text-[var(--color-text)]">{atmPCR?.toFixed(2)}</span></span>
        <span className="text-[var(--color-text-muted)]">Trend: <span className={trend === 'RISING' ? 'text-[var(--color-bullish)]' : trend === 'FALLING' ? 'text-[var(--color-bearish)]' : 'text-[var(--color-neutral)]'}>{trend}</span></span>
      </div>
    </div>
  );
}

export function MaxPainCard() {
  const { activeSymbol, symbols, openFormulaModal } = useDashboardStore();
  const state = symbols[activeSymbol];
  const mp = state?.engines?.maxPain;
  if (!mp?.result) return <EmptyCard title="MAX PAIN" />;

  const { maxPainStrike, spotPrice, distancePct, signal } = mp.result;

  return (
    <div className="card cursor-pointer" onClick={() => openFormulaModal(mp.formulaBreakdown)}>
      <div className="card-header">
        <span className="card-title">Max Pain</span>
        <SignalBadge signal={signal} />
      </div>
      <div className="text-center py-2">
        <div className="text-2xl font-black">{maxPainStrike?.toLocaleString()}</div>
        <div className="text-xs text-[var(--color-text-muted)] mt-1">
          {distancePct > 0 ? '+' : ''}{distancePct}% from spot ({spotPrice?.toLocaleString()})
        </div>
      </div>
    </div>
  );
}

export function VolatilityCard() {
  const { activeSymbol, symbols, openFormulaModal } = useDashboardStore();
  const state = symbols[activeSymbol];
  const vol = state?.engines?.volatility;
  if (!vol?.result) return <EmptyCard title="VOLATILITY" />;

  const { vix, vixClassification, atmIV, ivRank, strategyRecommendation, ivSkewType } = vol.result;

  return (
    <div className="card cursor-pointer" onClick={() => openFormulaModal(vol.formulaBreakdown)}>
      <div className="card-header">
        <span className="card-title">Volatility</span>
        <SignalBadge signal={vixClassification} />
      </div>
      <div className="grid grid-cols-2 gap-3 mt-1">
        <div><div className="text-[10px] text-[var(--color-text-muted)]">VIX</div><div className="text-lg font-bold">{vix?.toFixed(2)}</div></div>
        <div><div className="text-[10px] text-[var(--color-text-muted)]">ATM IV</div><div className="text-lg font-bold">{atmIV?.toFixed(1)}</div></div>
        <div><div className="text-[10px] text-[var(--color-text-muted)]">IV Rank</div><div className="text-sm font-semibold">{ivRank?.toFixed(0)}%</div></div>
        <div><div className="text-[10px] text-[var(--color-text-muted)]">Skew</div><div className="text-sm font-semibold">{ivSkewType?.replace(/_/g, ' ')}</div></div>
      </div>
      <div className="mt-2 text-center">
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--color-accent)]/10 text-[var(--color-accent)]">{strategyRecommendation?.replace(/_/g, ' ')}</span>
      </div>
    </div>
  );
}

export function BreadthCard() {
  const { activeSymbol, symbols, openFormulaModal } = useDashboardStore();
  const state = symbols[activeSymbol];
  const b = state?.engines?.breadth;
  if (!b?.result) return <EmptyCard title="MARKET BREADTH" />;

  const { advancing, declining, adRatio, breadthScore, marketHealth, mcClellanOsc } = b.result;

  return (
    <div className="card cursor-pointer" onClick={() => openFormulaModal(b.formulaBreakdown)}>
      <div className="card-header">
        <span className="card-title">Market Breadth</span>
        <SignalBadge signal={marketHealth} />
      </div>
      <div className="grid grid-cols-3 gap-2 mt-1 text-center">
        <div><div className="text-[10px] text-[var(--color-text-muted)]">Advances</div><div className="text-sm font-bold text-[var(--color-bullish)]">{advancing}</div></div>
        <div><div className="text-[10px] text-[var(--color-text-muted)]">A/D Ratio</div><div className="text-sm font-bold">{adRatio?.toFixed(2)}</div></div>
        <div><div className="text-[10px] text-[var(--color-text-muted)]">Declines</div><div className="text-sm font-bold text-[var(--color-bearish)]">{declining}</div></div>
      </div>
      <div className="flex justify-between text-[11px] mt-2 text-[var(--color-text-muted)]">
        <span>McClellan: {mcClellanOsc?.toFixed(1)}</span>
        <span>Score: {breadthScore?.toFixed(0)}/100</span>
      </div>
    </div>
  );
}

export function FuturesCard() {
  const { activeSymbol, symbols, openFormulaModal } = useDashboardStore();
  const state = symbols[activeSymbol];
  const f = state?.engines?.futures;
  if (!f?.result) return <EmptyCard title="FUTURES" />;

  const { basis, basisPct, basisInterpretation, oiSignal, daysToExpiry, costOfCarry } = f.result;

  return (
    <div className="card cursor-pointer" onClick={() => openFormulaModal(f.formulaBreakdown)}>
      <div className="card-header">
        <span className="card-title">Futures</span>
        <SignalBadge signal={oiSignal} />
      </div>
      <div className="grid grid-cols-2 gap-3 mt-1">
        <div><div className="text-[10px] text-[var(--color-text-muted)]">Basis</div><div className={`text-lg font-bold ${basis >= 0 ? 'text-[var(--color-bullish)]' : 'text-[var(--color-bearish)]'}`}>{basis?.toFixed(1)} ({basisPct?.toFixed(2)}%)</div></div>
        <div><div className="text-[10px] text-[var(--color-text-muted)]">DTE</div><div className="text-lg font-bold">{daysToExpiry}d</div></div>
        <div><div className="text-[10px] text-[var(--color-text-muted)]">Structure</div><div className="text-sm">{basisInterpretation}</div></div>
        <div><div className="text-[10px] text-[var(--color-text-muted)]">CoC</div><div className="text-sm">{costOfCarry?.toFixed(2)}%</div></div>
      </div>
    </div>
  );
}

export function InstitutionalCard() {
  const { activeSymbol, symbols, openFormulaModal } = useDashboardStore();
  const state = symbols[activeSymbol];
  const inst = state?.engines?.institutional;
  if (!inst?.result) return <EmptyCard title="INSTITUTIONAL FLOW" />;

  const { fiiNet, diiNet, fiiTrend, signal } = inst.result;

  return (
    <div className="card cursor-pointer" onClick={() => openFormulaModal(inst.formulaBreakdown)}>
      <div className="card-header">
        <span className="card-title">Institutional Flow</span>
        <SignalBadge signal={signal} />
      </div>
      <div className="grid grid-cols-2 gap-3 mt-1">
        <div>
          <div className="text-[10px] text-[var(--color-text-muted)]">FII Net</div>
          <div className={`text-lg font-bold ${fiiNet >= 0 ? 'text-[var(--color-bullish)]' : 'text-[var(--color-bearish)]'}`}>{fiiNet?.toFixed(0)} Cr</div>
        </div>
        <div>
          <div className="text-[10px] text-[var(--color-text-muted)]">DII Net</div>
          <div className={`text-lg font-bold ${diiNet >= 0 ? 'text-[var(--color-bullish)]' : 'text-[var(--color-bearish)]'}`}>{diiNet?.toFixed(0)} Cr</div>
        </div>
      </div>
      <div className="text-xs text-[var(--color-text-muted)] mt-2">FII Trend: <span className={fiiTrend === 'BUYING' ? 'text-[var(--color-bullish)]' : 'text-[var(--color-bearish)]'}>{fiiTrend}</span></div>
    </div>
  );
}

export function TechnicalCard() {
  const { activeSymbol, symbols, openFormulaModal } = useDashboardStore();
  const state = symbols[activeSymbol];
  const tech = state?.engines?.technical;
  if (!tech?.result) return <EmptyCard title="TECHNICALS" />;

  const { ema20, ema50, ema200, rsi, trendScore, momentumScore, pivot, r1, s1 } = tech.result;

  return (
    <div className="card cursor-pointer" onClick={() => openFormulaModal(tech.formulaBreakdown)}>
      <div className="card-header">
        <span className="card-title">Technical</span>
        <SignalBadge signal={tech.signal} />
      </div>
      <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
        <div><div className="text-[10px] text-[var(--color-text-muted)]">EMA20</div><div className="font-semibold">{ema20?.toFixed(0)}</div></div>
        <div><div className="text-[10px] text-[var(--color-text-muted)]">EMA50</div><div className="font-semibold">{ema50?.toFixed(0)}</div></div>
        <div><div className="text-[10px] text-[var(--color-text-muted)]">EMA200</div><div className="font-semibold">{ema200?.toFixed(0)}</div></div>
      </div>
      <div className="flex justify-between text-[11px] mt-2">
        <span className="text-[var(--color-text-muted)]">RSI: <span className={rsi > 70 ? 'text-[var(--color-bearish)]' : rsi < 30 ? 'text-[var(--color-bullish)]' : 'text-[var(--color-text)]'}>{rsi?.toFixed(1)}</span></span>
        <span className="text-[var(--color-text-muted)]">Trend: {trendScore}/100</span>
        <span className="text-[var(--color-text-muted)]">Mom: {momentumScore}/100</span>
      </div>
      <div className="text-[10px] text-[var(--color-text-muted)] mt-1.5">
        Pivot: {pivot?.toFixed(0)} | R1: {r1?.toFixed(0)} | S1: {s1?.toFixed(0)}
      </div>
    </div>
  );
}

export function SectorHeatmap() {
  const { sectors, openFormulaModal, symbols, activeSymbol } = useDashboardStore();
  const sectorEngine = symbols[activeSymbol]?.engines?.sectors;
  const sectorData = sectorEngine?.result?.sectors || sectors || [];

  if (sectorData.length === 0) return <EmptyCard title="SECTOR ROTATION" />;

  const quadrantColors: Record<string, string> = {
    LEADING: 'border-[var(--color-bullish)]',
    IMPROVING: 'border-[var(--color-accent)]',
    WEAKENING: 'border-[var(--color-neutral)]',
    LAGGING: 'border-[var(--color-bearish)]',
  };

  return (
    <div className="card cursor-pointer" onClick={() => sectorEngine && openFormulaModal(sectorEngine.formulaBreakdown)}>
      <div className="card-header">
        <span className="card-title">Sector Rotation</span>
        {sectorEngine && <SignalBadge signal={sectorEngine.signal} />}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
        {sectorData.map((s: any) => (
          <div key={s.key || s.name}
            className={`bg-[var(--color-bg)] rounded-lg p-2 border-l-2 ${quadrantColors[s.rrgQuadrant] || 'border-[var(--color-border)]'}`}>
            <div className="text-[10px] text-[var(--color-text-muted)] truncate">{s.key || s.name}</div>
            <div className={`text-sm font-bold ${s.changePct >= 0 ? 'text-[var(--color-bullish)]' : 'text-[var(--color-bearish)]'}`}>
              {s.changePct >= 0 ? '+' : ''}{s.changePct?.toFixed(2)}%
            </div>
            <div className="text-[9px] text-[var(--color-text-muted)]">{s.rrgQuadrant}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function TimelinePanel() {
  const { activeSymbol, timeline } = useDashboardStore();
  const events = timeline[activeSymbol] || [];

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Timeline</span>
        <span className="text-[10px] text-[var(--color-text-muted)]">{events.length} events</span>
      </div>
      <div className="space-y-1.5 max-h-64 overflow-y-auto">
        {events.length === 0 && (
          <div className="text-xs text-[var(--color-text-muted)] text-center py-4">No events yet. Events appear when signals change.</div>
        )}
        {events.map((e, i) => (
          <div key={i} className="flex items-start gap-2 text-[11px] py-1 border-b border-[var(--color-border)]/30">
            <span className="text-[var(--color-text-muted)] whitespace-nowrap font-mono text-[10px]">
              {new Date(e.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
            </span>
            <span className={`flex-1 ${e.eventType?.includes('BULLISH') || e.eventType === 'BIAS_CHANGE' ? 'text-[var(--color-bullish)]' : e.eventType?.includes('BEARISH') ? 'text-[var(--color-bearish)]' : 'text-[var(--color-text)]'}`}>
              {e.description}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyCard({ title }: { title: string }) {
  return (
    <div className="card">
      <div className="card-header"><span className="card-title">{title}</span></div>
      <div className="text-xs text-[var(--color-text-muted)] text-center py-6">
        <div className="animate-pulse">Awaiting data...</div>
        <div className="text-[10px] mt-1">Data will appear during market hours</div>
      </div>
    </div>
  );
}
