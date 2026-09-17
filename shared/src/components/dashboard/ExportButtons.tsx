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
    <div className="flex w-full min-w-0 flex-wrap gap-2 sm:w-auto">
      <button
        onClick={() => downloadJSON(results)}
        className="cr-btn cr-btn-secondary cr-focus h-9 flex-1 justify-center whitespace-nowrap px-4"
      >
        <FileJson className="h-4 w-4" />
        <span>Export JSON</span>
      </button>
      <button
        onClick={() => downloadCSV(results, conversation, metricNames, metricLabelMap)}
        className="cr-btn cr-btn-secondary cr-focus h-9 flex-1 justify-center whitespace-nowrap px-4"
      >
        <Download className="h-4 w-4" />
        <span>Export CSV</span>
      </button>
    </div>
  );
};
