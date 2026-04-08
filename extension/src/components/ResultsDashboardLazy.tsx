import React, { Suspense, lazy } from 'react';

// Lazy load the entire ResultsDashboard component which contains recharts
const ResultsDashboardComponent = lazy(() => 
  import('./ResultsDashboard').then(module => ({ default: module.ResultsDashboard }))
);

// Loading fallback component
const LoadingFallback: React.FC = () => (
  <div className="space-y-6 animate-pulse">
    <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-3">
      <div className="flex items-center">
        <div className="w-7 h-7 rounded-full bg-slate-200 dark:bg-slate-700 mr-2"></div>
        <div className="h-5 w-40 bg-slate-200 dark:bg-slate-700 rounded"></div>
      </div>
      <div className="flex space-x-2">
        <div className="h-8 w-20 bg-slate-200 dark:bg-slate-700 rounded"></div>
        <div className="h-8 w-20 bg-slate-200 dark:bg-slate-700 rounded"></div>
      </div>
    </div>
    
    <div className="bg-gradient-to-br from-white via-slate-50 to-indigo-50/30 dark:from-slate-800 dark:via-slate-800 dark:to-indigo-900/10 rounded-xl border border-slate-200/80 dark:border-slate-700/80 shadow-lg p-4">
      <div className="h-6 w-48 bg-slate-200 dark:bg-slate-700 rounded mb-4"></div>
      <div className="h-10 w-full bg-slate-200 dark:bg-slate-700 rounded mb-4"></div>
      <div className="h-80 w-full bg-slate-200 dark:bg-slate-700 rounded"></div>
    </div>
    
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6">
      <div className="h-6 w-32 bg-slate-200 dark:bg-slate-700 rounded mb-4"></div>
      <div className="space-y-3">
        <div className="h-12 w-full bg-slate-200 dark:bg-slate-700 rounded"></div>
        <div className="h-12 w-full bg-slate-200 dark:bg-slate-700 rounded"></div>
        <div className="h-12 w-full bg-slate-200 dark:bg-slate-700 rounded"></div>
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
