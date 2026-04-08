import React from 'react';
import { Settings2, Loader2 } from 'lucide-react';
import { EvaluationStatus } from '@shared/types';
import { EvaluationProgress } from '@shared/components/config';
import type { EvaluationPhase, ProgressState } from '@shared/utils/evaluationUtils';

interface ConfigureHeaderProps {
  isEvaluating: boolean;
  status: EvaluationStatus;
  totalSelectedMetrics: number;
  progress: ProgressState;
  phasesToRun: EvaluationPhase[];
  phaseCounts: {
    predefined: number;
    custom: number;
    literature: number;
  };
  onCancel: () => void;
}

/**
 * Header section showing evaluation status, metrics count, and progress
 */
export const ConfigureHeader: React.FC<ConfigureHeaderProps> = ({
  isEvaluating,
  totalSelectedMetrics,
  progress,
  phasesToRun,
  phaseCounts,
  onCancel
}) => {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm p-6 transition-colors duration-300">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-violet-100 dark:bg-violet-900/50 flex items-center justify-center">
            {isEvaluating ? (
              <Loader2 className="w-5 h-5 text-violet-600 dark:text-violet-400 animate-spin" />
            ) : (
              <Settings2 className="w-5 h-5 text-violet-600 dark:text-violet-400" />
            )}
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              {isEvaluating ? 'Evaluating Conversation...' : 'Select Evaluation Metrics'}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {isEvaluating 
                ? `Processing ${phasesToRun.length} phase${phasesToRun.length > 1 ? 's' : ''}`
                : 'Choose which metrics to use for evaluating the conversation'
              }
            </p>
          </div>
        </div>
        <div className="text-right">
          <span className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{totalSelectedMetrics}</span>
          <span className="text-sm text-slate-500 dark:text-slate-400 ml-1">metrics selected</span>
        </div>
      </div>

      {/* Progress Bar (shown during evaluation) */}
      {isEvaluating && (
        <EvaluationProgress
          progress={progress}
          phasesToRun={phasesToRun}
          phaseCounts={phaseCounts}
          onCancel={onCancel}
        />
      )}
    </div>
  );
};
