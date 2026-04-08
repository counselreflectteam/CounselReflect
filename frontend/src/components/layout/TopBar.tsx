import React from 'react';
import { useLocation } from 'react-router-dom';
import { FileText, Download, Moon, Sun, Check, Loader2 } from 'lucide-react';
import { useTheme } from '@shared/context';
import { useEvaluationState } from '@shared/context';
import { EvaluationStatus } from '@shared/types';

const pageTitles: Record<string, string> = {
  '/': 'Getting Started',
  '/intro': 'Getting Started',
  '/setup': 'Setup',
  '/configure': 'Metric Selection',
  '/evaluate': 'Evaluation Status',
  '/results': 'Analysis Results',
};

export const TopBar: React.FC = () => {
  const location = useLocation();
  const { isDarkMode, toggleDarkMode } = useTheme();
  const { conversation, status, results } = useEvaluationState();

  const pageTitle = pageTitles[location.pathname] || 'CounselReflect';
  const showExportButtons = location.pathname === '/results' && results;
  const showConversationBadge = location.pathname !== '/intro' && location.pathname !== '/';

  const handleExportJSON = () => {
    if (!results) return;
    const blob = new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `evaluation-results-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportCSV = () => {
    if (!results) return;
    // Simple CSV export of utterance scores
    const headers = ['Turn', 'Role', 'Content', ...Object.keys(results.overallScores || {})];
    const rows = results.utteranceScores?.map((score, idx) => {
      const metrics = Object.entries(score.metrics || {}).map(([_, val]) => {
        if ('value' in val) return val.value;
        if ('label' in val) return val.label;
        return '';
      });
      return [idx + 1, '', '', ...metrics].join(',');
    }) || [];
    
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `evaluation-results-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getStatusBadge = () => {
    if (location.pathname === '/evaluate') {
      if (status === EvaluationStatus.Loading) {
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
            <Loader2 size={14} className="animate-spin" />
            Evaluating
          </span>
        );
      }
      if (status === EvaluationStatus.Complete) {
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400">
            <Check size={14} />
            Complete
          </span>
        );
      }
      if (status === EvaluationStatus.Error) {
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
            Error
          </span>
        );
      }
    }
    if (location.pathname === '/results' && results) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400">
          <Check size={14} />
          Complete
        </span>
      );
    }
    return null;
  };

  return (
    <header className="h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-8 flex-shrink-0 transition-colors duration-300">
      {/* Left Section */}
      <div className="flex items-center gap-4">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          {pageTitle}
        </h1>

        {/* File Context Badge */}
        {conversation && showConversationBadge && (
          <div className="flex items-center gap-1.5 px-3 py-1 bg-slate-100 dark:bg-slate-800 rounded-md text-sm text-slate-600 dark:text-slate-400">
            <FileText size={14} />
            <span>{conversation.title || 'conversation.json'}</span>
          </div>
        )}

        {/* Status Badge */}
        {getStatusBadge()}
      </div>

      {/* Right Section */}
      <div className="flex items-center gap-3">
        {/* Export Buttons (only on Results page) */}
        {showExportButtons && (
          <>
            <button
              onClick={handleExportJSON}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors"
            >
              <Download size={16} />
              JSON
            </button>
            <button
              onClick={handleExportCSV}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors"
            >
              <Download size={16} />
              CSV
            </button>
          </>
        )}

        {/* Dark Mode Toggle */}
        <button
          onClick={toggleDarkMode}
          className="p-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors"
          title={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        >
          {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
        </button>
      </div>
    </header>
  );
};
