import { useDashboardStore } from '../../store/dashboardStore';

export function FormulaModal() {
  const { formulaModal, closeFormulaModal } = useDashboardStore();
  if (!formulaModal.open || !formulaModal.data) return null;

  const { title, steps, threshold_used, finalScore, result } = formulaModal.data;

  return (
    <>
      <div className="modal-overlay" onClick={closeFormulaModal} />
      <div className="modal-content">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-[var(--color-text)]">{title || 'Formula Breakdown'}</h3>
          <button onClick={closeFormulaModal}
            className="w-8 h-8 rounded-lg bg-[var(--color-bg)] flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors">
            ✕
          </button>
        </div>

        {/* Steps */}
        <div className="space-y-2">
          {steps?.map((step: any, i: number) => (
            <div key={i} className="bg-[var(--color-bg)] rounded-lg p-3 border border-[var(--color-border)]">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-5 h-5 rounded-full bg-[var(--color-accent)] text-white text-[10px] flex items-center justify-center font-bold">{step.step || i + 1}</span>
                    <span className="text-xs font-semibold text-[var(--color-text)]">{step.label}</span>
                  </div>
                  <p className="text-[11px] text-[var(--color-text-muted)] ml-7 font-mono">{step.formula}</p>
                </div>
                <span className="text-sm font-bold text-[var(--color-accent)] whitespace-nowrap">{String(step.value)}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Threshold */}
        {threshold_used && (
          <div className="mt-3 p-3 bg-[var(--color-surface2)] rounded-lg border border-[var(--color-border)]">
            <div className="text-[10px] text-[var(--color-text-muted)] mb-1 uppercase font-semibold">Thresholds Used</div>
            <div className="text-xs text-[var(--color-text)] font-mono">{threshold_used}</div>
          </div>
        )}

        {/* Final Score */}
        {finalScore && (
          <div className="mt-3 p-3 bg-gradient-to-r from-[var(--color-accent)]/10 to-transparent rounded-lg border border-[var(--color-accent)]/30">
            <div className="text-xs font-bold text-[var(--color-accent)]">{finalScore}</div>
          </div>
        )}

        {/* Result */}
        {result && (
          <div className="mt-3 text-center">
            <span className="text-lg font-bold text-[var(--color-accent)]">{result}</span>
          </div>
        )}
      </div>
    </>
  );
}
