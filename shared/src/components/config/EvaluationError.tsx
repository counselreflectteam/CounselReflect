import React from 'react';
import { AlertCircle, Play } from 'lucide-react';

export interface EvaluationErrorProps {
  error: string | null;
  onRetry: () => void;
  onBackToConfigure: () => void;
}

/**
 * Displays evaluation error state with retry and back options
 */
export const EvaluationError: React.FC<EvaluationErrorProps> = ({
  error,
  onRetry,
  onBackToConfigure
}) => {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm p-8 transition-colors duration-300">
      <div className="space-y-6 text-center">
        <div className="w-20 h-20 mx-auto rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
          <AlertCircle className="w-10 h-10 text-red-600 dark:text-red-400" />
        </div>
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6">
          <h2 className="text-2xl font-semibold text-red-700 dark:text-red-400">Evaluation Failed</h2>
          <p className="text-red-600 dark:text-red-300 mt-2">
            {error || 'An unexpected error occurred during evaluation.'}
          </p>
        </div>
        <div className="flex gap-4 justify-center">
          <button
            onClick={onBackToConfigure}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            Back to Configure
          </button>
          <button
            onClick={onRetry}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg font-medium text-white bg-indigo-600 hover:bg-indigo-700 transition-colors"
          >
            <Play size={18} />
            Retry
          </button>
        </div>
      </div>
    </div>
  );
};
