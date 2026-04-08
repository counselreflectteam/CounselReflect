import React from 'react';
import { Download, FileJson } from 'lucide-react';
import { downloadJSON, downloadCSV } from '@shared/utils/exportUtils';

interface ExportButtonsProps {
  results: any;
  conversation: any;
  metricNames: string[];
  metricLabelMap: Record<string, string>;
}

/**
 * Export buttons for downloading results as JSON or CSV
 */
export const ExportButtons: React.FC<ExportButtonsProps> = ({
  results,
  conversation,
  metricNames,
  metricLabelMap
}) => {
  return (
    <div className="flex flex-wrap gap-3">
      <button 
        onClick={() => downloadJSON(results)} 
        className="flex-1 flex items-center justify-center space-x-2 px-4 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-md text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 whitespace-nowrap min-w-[130px]"
      >
        <FileJson className="w-4 h-4" />
        <span>Export JSON</span>
      </button>
      <button 
        onClick={() => downloadCSV(results, conversation, metricNames, metricLabelMap)} 
        className="flex-1 flex items-center justify-center space-x-2 px-4 py-2 bg-slate-900 dark:bg-blue-600 rounded-md text-sm font-medium text-white hover:bg-slate-800 dark:hover:bg-blue-700 whitespace-nowrap min-w-[130px]"
      >
        <Download className="w-4 h-4" />
        <span>Export CSV</span>
      </button>
    </div>
  );
};
