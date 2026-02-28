import React from 'react';
import { Loader2, Check, X } from 'lucide-react';
import type { EvaluationPhase, ProgressState } from '../../utils/evaluationUtils';
import { getPhaseLabel } from '../../utils/evaluationUtils';

export interface EvaluationProgressProps {
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
 * Displays evaluation progress with phase checklist and progress bar
 */
export const EvaluationProgress: React.FC<EvaluationProgressProps> = ({
  progress,
  phasesToRun,
  phaseCounts,
  onCancel
}) => {
  return (
    <div className="mt-6 space-y-4">
      {/* Progress bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-slate-700 dark:text-slate-300">
            {progress.progressPercent.toFixed(0)}% Complete
          </span>
          <span className="text-slate-500 dark:text-slate-400">
            {progress.completedMetrics} / {progress.totalMetrics} metrics evaluated
          </span>
        </div>
        <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-3 overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-indigo-500 to-indigo-600 rounded-full transition-all duration-500 ease-out"
            style={{ width: `${Math.max(2, progress.progressPercent)}%` }}
            role="progressbar"
            aria-valuenow={progress.progressPercent}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>
      </div>

      {/* Phase checklist */}
      <div className="space-y-2">
        <div className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
          Evaluation Phases
        </div>
        <div className="space-y-2">
          {phasesToRun.map((phase) => {
            const isComplete = progress.completedPhases.includes(phase);
            // Evaluations run in parallel now, so pending selected phases should
            // appear as loading rather than inactive/gray.
            const isLoading =
              !isComplete &&
              progress.totalMetrics > 0 &&
              progress.completedMetrics < progress.totalMetrics;
            
            return (
              <div 
                key={phase}
                className={`flex items-center gap-3 p-3 rounded-lg transition-all ${
                  isComplete ? 'bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800' :
                  isLoading ? 'bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800' :
                  'bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 opacity-60'
                }`}
              >
                {isComplete && <Check className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />}
                {isLoading && <Loader2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400 animate-spin shrink-0" />}
                {!isComplete && !isLoading && <div className="w-5 h-5 rounded-full border-2 border-slate-300 dark:border-slate-600 shrink-0" />}
                <span className={`text-sm font-medium flex-grow ${
                  isComplete ? 'text-emerald-700 dark:text-emerald-300' :
                  isLoading ? 'text-indigo-700 dark:text-indigo-300' :
                  'text-slate-600 dark:text-slate-400'
                }`}>
                  {getPhaseLabel(phase, phaseCounts)}
                </span>
                {(isLoading || isComplete) && phaseCounts[phase] > 0 && (
                  <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
                    isComplete 
                      ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300' 
                      : 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300'
                  }`}>
                    {progress.phaseProgress[phase]} / {phaseCounts[phase]}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Cancel button */}
      <div className="flex justify-end">
        <button
          onClick={onCancel}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
        >
          <X className="w-4 h-4" />
          Cancel Evaluation
        </button>
      </div>
    </div>
  );
};
