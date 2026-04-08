import React from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { useNavigationState } from '../../context/NavigationContext';

export const UnsavedChangesModal: React.FC = () => {
  const { pendingNavigation, confirmNavigation, cancelNavigation } = useNavigationState();

  if (!pendingNavigation) return null;

  return (
    <div 
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={cancelNavigation}
    >
      <div 
        className="bg-white dark:bg-slate-900 rounded-2xl p-8 max-w-md w-11/12 shadow-2xl animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-4 mb-4">
          <div className="w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
            <AlertTriangle className="w-6 h-6 text-amber-600 dark:text-amber-400" />
          </div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            Unsaved Changes
          </h2>
        </div>

        {/* Content */}
        <div className="text-slate-600 dark:text-slate-400 space-y-3 mb-6">
          <p>
            You have evaluation results that haven't been exported. If you change the configuration or upload a new conversation, these results will be lost.
          </p>
          <p className="font-medium text-slate-900 dark:text-slate-100">
            Do you want to continue?
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-3 justify-end">
          <button
            onClick={cancelNavigation}
            className="px-5 py-2.5 rounded-lg font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={confirmNavigation}
            className="px-5 py-2.5 rounded-lg font-medium text-white bg-red-600 hover:bg-red-700 transition-colors"
          >
            Discard Results
          </button>
        </div>
      </div>
    </div>
  );
};
