import React from 'react';

export type DataStatus = 'LIVE' | 'STALE' | 'NO_DATA' | 'WARMING_UP';

interface DataStatusBadgeProps {
  status?: DataStatus;
}

export const DataStatusBadge: React.FC<DataStatusBadgeProps> = ({ status }) => {
  if (!status) return null;

  const colors = {
    LIVE: 'bg-[var(--color-bullish)]/20 text-[var(--color-bullish)] border-[var(--color-bullish)]/30',
    STALE: 'bg-[var(--color-warning)]/20 text-[var(--color-warning)] border-[var(--color-warning)]/30',
    NO_DATA: 'bg-[var(--color-bearish)]/20 text-[var(--color-bearish)] border-[var(--color-bearish)]/30',
    WARMING_UP: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  };

  const labels = {
    LIVE: '● LIVE',
    STALE: '⚠ STALE',
    NO_DATA: 'NO DATA',
    WARMING_UP: '⟳ WARMING UP...',
  };

  return (
    <span className={`text-[9px] px-1.5 py-0.5 rounded-sm border ${colors[status]} font-mono ml-2 animate-pulse`}>
      {labels[status]}
    </span>
  );
};
