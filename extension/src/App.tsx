import React from 'react';
import { Toaster } from 'react-hot-toast';
import { Header } from './components/Header';
import { InputSection } from './components/InputSection';
import { EvaluationConfig } from './components/EvaluationConfig';
import { ApiKeyConfig } from './components/ApiKeyConfig';
import { EvaluationStatus } from '@shared/types';
import { 
  AuthProvider, 
  MetricsProvider, 
  EvaluationStateProvider, 
  ThemeProvider,
  useEvaluationState,
  useAuth
} from '@shared/context';
import { ResultsDashboard } from './components/ResultsDashboard';

const AppContent: React.FC = () => {
  const { isAccessGranted } = useAuth();
  const { conversation, status, results } = useEvaluationState();

  return (
    <div className="min-h-screen flex flex-col transition-colors duration-300 dark:bg-slate-950 bg-slate-50">
      <Toaster position="top-right" toastOptions={{ duration: 5000 }} />
      <Header />

      <main className="flex-1 w-full px-3 py-4 space-y-4 overflow-y-auto">

        {/* Section 1: API Access Configuration */}
        <section>
          <ApiKeyConfig />
        </section>

        {/* Main App Workflow - Disabled until Access Granted */}
        <div className={`transition-all duration-700 ${!isAccessGranted ? 'opacity-40 pointer-events-none blur-sm grayscale' : 'opacity-100'}`}>

          {/* Section 2: Conversation Data Input */}
          <section className="mt-4">
            <InputSection />
          </section>

          <div className="w-full h-px bg-slate-200 dark:bg-slate-800 mt-4" />

          {/* Section 3: Evaluation Selection */}
          <section className={`mt-4 transition-all duration-500 ${conversation ? 'opacity-100' : 'opacity-50 pointer-events-none grayscale'}`}>
            <div className="mb-3 flex items-start">
              <div className="flex items-center justify-center w-7 h-7 rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-400 font-bold text-xs mr-2 shrink-0 mt-0.5">
                3
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Evaluation Configuration</h2>
                <p className="text-slate-500 dark:text-slate-400 text-xs mt-0.5">Select metrics or create rubrics for the LLM to apply.</p>
              </div>
            </div>
            <EvaluationConfig disabled={!conversation} />
          </section>

          {/* Section 4: Results Dashboard */}
          {results && status === EvaluationStatus.Complete && (
            <>
              <div className="w-full h-px bg-slate-200 dark:bg-slate-800 mt-4" />
              <section className="mt-4">
                <ResultsDashboard />
              </section>
            </>
          )}
        </div>
      </main>
    </div>
  );
};

const App: React.FC = () => {
  return (
    <AuthProvider>
      <MetricsProvider>
        <EvaluationStateProvider>
          <ThemeProvider>
            <AppContent />
          </ThemeProvider>
        </EvaluationStateProvider>
      </MetricsProvider>
    </AuthProvider>
  );
};

export default App;
