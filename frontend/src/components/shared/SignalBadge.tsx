interface Props {
  signal: string;
  size?: 'sm' | 'md' | 'lg';
}

const signalColors: Record<string, string> = {
  BULLISH: 'badge-bullish', MILDLY_BULLISH: 'badge-bullish', STRONG_BULLISH: 'badge-bullish',
  BEARISH: 'badge-bearish', MILDLY_BEARISH: 'badge-bearish', STRONG_BEARISH: 'badge-bearish',
  LONG_BUILDUP: 'badge-bullish', SHORT_COVERING: 'badge-bullish',
  SHORT_BUILDUP: 'badge-bearish', LONG_UNWINDING: 'badge-bearish',
  LEADING: 'badge-bullish', IMPROVING: 'badge-neutral',
  WEAKENING: 'badge-neutral', LAGGING: 'badge-bearish',
  TRENDING_BULLISH: 'badge-bullish', BREAKOUT: 'badge-bullish',
  TRENDING_BEARISH: 'badge-bearish', BREAKDOWN: 'badge-bearish',
  CONTANGO: 'badge-bullish', BACKWARDATION: 'badge-bearish',
  HEALTHY_BULL: 'badge-bullish', WEAK_MARKET: 'badge-bearish', BEAR_MARKET: 'badge-bearish',
};

export function SignalBadge({ signal, size = 'sm' }: Props) {
  const cls = signalColors[signal] || 'badge-neutral';
  const fontSize = size === 'lg' ? 'text-sm px-3 py-1' : size === 'md' ? 'text-xs px-2 py-0.5' : 'text-[10px] px-1.5 py-0.5';

  return (
    <span className={`badge ${cls} ${fontSize}`}>
      {signal.replace(/_/g, ' ')}
    </span>
  );
}
