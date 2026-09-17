import React from 'react';
import { useNavigationState } from '../../context/NavigationContext';

export const UnsavedChangesModal: React.FC = () => {
  const { pendingNavigation, confirmNavigation, cancelNavigation } = useNavigationState();

  if (!pendingNavigation) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F1419]/55 dark:bg-[#5B7083]/40"
      onClick={cancelNavigation}
    >
      <div
        className="cr-card cr-enter w-11/12 max-w-md rounded-2xl p-6 shadow-[var(--shadow-lift)] sm:p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold tracking-tight text-[var(--cr-ink)]">
          Unsaved changes
        </h2>

        <p className="mt-2 text-[15px] leading-relaxed text-[var(--cr-ink-2)]">
          Your evaluation results have not been exported and will be lost if you continue.
        </p>

        <div className="mt-8 flex justify-end gap-2">
          <button
            onClick={cancelNavigation}
            className="cr-btn cr-btn-secondary cr-focus h-10 px-5"
          >
            Cancel
          </button>
          <button
            onClick={confirmNavigation}
            className="cr-btn cr-btn-secondary cr-focus h-10 px-5 text-rose-600 dark:text-rose-400"
          >
            Discard results
          </button>
        </div>
      </div>
    </div>
  );
};
