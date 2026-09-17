import React, { Suspense, lazy } from 'react';

// Lazy load the entire ResultsDashboard component which contains recharts
const ResultsDashboardComponent = lazy(() =>
  import('./ResultsDashboard').then(module => ({ default: module.ResultsDashboard }))
);

// Loading fallback — previews the zoned results layout: each zone opens with
// a zone opener (.cr-opener — hairline + cobalt overscore + eyebrow/title
// type stack), then its content, with a muted module slab for the tool zone.
// On the module the bars use the on-muted rule value so they stay visible
// against the tint in both modes.
const Bar: React.FC<{ className?: string; onModule?: boolean }> = ({ className = '', onModule = false }) => (
  <div className={`rounded ${onModule ? 'bg-[var(--cr-rule-on-muted)]' : 'bg-[var(--cr-muted)]'} ${className}`} />
);

const LoadingFallback: React.FC = () => (
  <div className="animate-pulse">
    {/* Results header + quiet export pills */}
    <div className="pb-8">
      <Bar className="h-5 w-40" />
      <div className="mt-4 flex gap-2">
        <Bar className="h-9 flex-1 rounded-full" />
        <Bar className="h-9 flex-1 rounded-full" />
      </div>
    </div>

    {/* White zone — opener (eyebrow + title, like Coverage), then reading rows */}
    <div className="pb-10">
      <div className="cr-opener">
        <div className="h-2.5 w-20 rounded bg-[var(--cr-muted)]" />
        <div className="mt-2 h-4 w-44 rounded bg-[var(--cr-muted)]" />
      </div>
      <div className="mt-5 space-y-3">
        <Bar className="h-4 w-full" />
        <Bar className="h-4 w-5/6" />
        <Bar className="h-4 w-2/3" />
      </div>
    </div>

    {/* Tool zone — opener (eyebrow + title, like Trends), then muted module slab */}
    <div>
      <div className="cr-opener">
        <div className="h-2.5 w-20 rounded bg-[var(--cr-muted)]" />
        <div className="mt-2 h-4 w-48 rounded bg-[var(--cr-muted)]" />
      </div>
      <div className="cr-module mt-5 p-4">
        <Bar onModule className="h-9 w-full" />
        <Bar onModule className="mt-3 h-48 w-full" />
      </div>
    </div>
  </div>
);

// Wrapper component with Suspense boundary
export const ResultsDashboardLazy: React.FC = () => {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <ResultsDashboardComponent />
    </Suspense>
  );
};
