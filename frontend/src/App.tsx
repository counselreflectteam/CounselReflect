import React, { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, MetricsProvider, EvaluationStateProvider, ThemeProvider } from '@shared/context';
import { NavigationProvider } from './context/NavigationContext';
import { Layout } from './components/layout';
import { AccessGate } from './components/layout/AccessGate';

const IntroPage = lazy(() => import('./pages/IntroPage').then((module) => ({ default: module.IntroPage })));
const SetupPage = lazy(() => import('./pages/SetupPage').then((module) => ({ default: module.SetupPage })));
const ConfigurePage = lazy(() => import('./pages/ConfigurePage').then((module) => ({ default: module.ConfigurePage })));
const ResultsPage = lazy(() => import('./pages/ResultsPage').then((module) => ({ default: module.ResultsPage })));

const PageFallback: React.FC = () => (
  <div className="mx-auto max-w-7xl">
    <div className="border-t border-[var(--cr-card-border)] pt-6">
      <div className="h-4 w-40 animate-pulse rounded bg-[var(--cr-muted)]" />
      <div className="mt-4 h-3 w-full max-w-xl animate-pulse rounded bg-[var(--cr-muted)]" />
    </div>
  </div>
);

const AppRoutes: React.FC = () => {
  const withFallback = (element: React.ReactNode) => (
    <Suspense fallback={<PageFallback />}>
      {element}
    </Suspense>
  );

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Navigate to="/intro" replace />} />
        <Route path="/intro" element={withFallback(<IntroPage />)} />
        <Route path="/setup" element={withFallback(<SetupPage />)} />
        <Route path="/configure" element={withFallback(<ConfigurePage />)} />
        <Route path="/results" element={withFallback(<ResultsPage />)} />
        <Route path="*" element={<Navigate to="/intro" replace />} />
      </Route>
    </Routes>
  );
};

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AccessGate>
          <AuthProvider>
            <MetricsProvider>
              <EvaluationStateProvider>
                <NavigationProvider>
                  <Toaster position="top-right" toastOptions={{ duration: 5000 }} />
                  <AppRoutes />
                </NavigationProvider>
              </EvaluationStateProvider>
            </MetricsProvider>
          </AuthProvider>
        </AccessGate>
      </ThemeProvider>
    </BrowserRouter>
  );
};

export default App;
