import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, MetricsProvider, EvaluationStateProvider, ThemeProvider } from '@shared/context';
import { NavigationProvider } from './context/NavigationContext';
import { Layout } from './components/layout';
import { IntroPage, SetupPage, ConfigurePage, ResultsPage, PaperPage } from './pages';

const AppRoutes: React.FC = () => {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Navigate to="/intro" replace />} />
        <Route path="/intro" element={<IntroPage />} />
        <Route path="/paper" element={<PaperPage />} />
        <Route path="/setup" element={<SetupPage />} />
        <Route path="/configure" element={<ConfigurePage />} />
        <Route path="/results" element={<ResultsPage />} />
      </Route>
    </Routes>
  );
};

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <MetricsProvider>
          <EvaluationStateProvider>
            <ThemeProvider>
              <NavigationProvider>
                <Toaster position="top-right" toastOptions={{ duration: 5000 }} />
                <AppRoutes />
              </NavigationProvider>
            </ThemeProvider>
          </EvaluationStateProvider>
        </MetricsProvider>
      </AuthProvider>
    </BrowserRouter>
  );
};

export default App;
