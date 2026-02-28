import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { ResultsDashboard } from '../components/dashboard/ResultsDashboard';
import { useEvaluationState } from '@shared/context';
import { useNavigationState } from '../context/NavigationContext';
import { EvaluationStatus } from '@shared/types';
import { EvaluatedMetricsSummary } from '@shared/components/dashboard';

export const ResultsPage: React.FC = () => {
  const navigate = useNavigate();
  const { results, status } = useEvaluationState();
  const { markStepCompleted } = useNavigationState();

  useEffect(() => {
    if (results && status === EvaluationStatus.Complete) {
      markStepCompleted(3);
    }
  }, [results, status, markStepCompleted]);

  // Auto-redirect if no results
  useEffect(() => {
    if (!results || status !== EvaluationStatus.Complete) {
      navigate('/configure');
    }
  }, [results, status, navigate]);

  if (!results || status !== EvaluationStatus.Complete) {
    return null;
  }

  return (
    <div className="space-y-6">
      <EvaluatedMetricsSummary />

      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm p-6 transition-colors duration-300">
        <ResultsDashboard />
      </div>

      {/* Navigation */}
      <div className="flex justify-start pt-4">
        <button
          onClick={() => navigate('/configure')}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
        >
          <ChevronLeft size={18} />
          Back to Configure
        </button>
      </div>
    </div>
  );
};
