import React, { Suspense, lazy } from 'react';

const EvaluationConfigComponent = lazy(() =>
  import('./EvaluationConfig').then((module) => ({ default: module.EvaluationConfig }))
);

const LoadingFallback: React.FC = () => (
  <div className="cr-module min-h-52 p-4" aria-label="Loading evaluation metrics">
    <div className="animate-pulse space-y-4">
      <div className="h-3 w-24 rounded bg-[var(--cr-rule-on-muted)]" />
      <div className="h-5 w-40 rounded bg-[var(--cr-rule-on-muted)]" />
      <div className="grid grid-cols-3 gap-3 border-b border-[var(--cr-rule-on-muted)] pb-3">
        <div className="h-4 rounded bg-[var(--cr-rule-on-muted)]" />
        <div className="h-4 rounded bg-[var(--cr-rule-on-muted)]" />
        <div className="h-4 rounded bg-[var(--cr-rule-on-muted)]" />
      </div>
      <div className="h-10 rounded bg-[var(--cr-rule-on-muted)]" />
    </div>
  </div>
);

// Collapsed presentations get a slim row skeleton so a restored session's
// first paint is a receipt-height row, not a full-module placeholder.
const RowFallback: React.FC = () => (
  <div className="cr-step-row animate-pulse" aria-label="Loading evaluation metrics">
    <div className="h-4 w-40 rounded bg-[var(--cr-rule-on-muted)]" />
  </div>
);

export const EvaluationConfigLazy: React.FC<{
  disabled: boolean;
  presentation?: 'locked' | 'active' | 'receipt';
  receipt?: React.ReactNode;
  onExpand?: () => void;
  onCollapse?: () => void;
}> = ({ disabled, presentation, receipt, onExpand, onCollapse }) => (
  <Suspense fallback={presentation && presentation !== 'active' ? <RowFallback /> : <LoadingFallback />}>
    <EvaluationConfigComponent
      disabled={disabled}
      presentation={presentation}
      receipt={receipt}
      onExpand={onExpand}
      onCollapse={onCollapse}
    />
  </Suspense>
);
