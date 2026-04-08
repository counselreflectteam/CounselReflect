import React from 'react';
import { CheckSquare, BookOpen, Wand2 } from 'lucide-react';
import { PredefinedMetricsConfig, CustomizedMetricsConfig, LiteratureBenchmarksConfig } from '@shared/components/config';

type TabId = 'predefined' | 'literature' | 'custom';

interface MetricsTabsProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  error: string | null;
  isEvaluating: boolean;
}

interface TabButtonProps {
  id: TabId;
  label: string;
  icon: any;
  isActive: boolean;
  isDisabled: boolean;
  onClick: () => void;
}

const getTabColorClasses = (id: TabId, isActive: boolean): string => {
  if (isActive) {
    if (id === 'predefined') {
      return 'border-blue-600 text-blue-800 dark:text-blue-300 dark:border-blue-400 bg-blue-50/80 dark:bg-blue-900/20 rounded-t-md';
    }
    if (id === 'literature') {
      return 'border-emerald-600 text-emerald-800 dark:text-emerald-300 dark:border-emerald-400 bg-emerald-50/80 dark:bg-emerald-900/20 rounded-t-md';
    }
    return 'border-fuchsia-500 text-fuchsia-800 dark:text-fuchsia-300 dark:border-fuchsia-400 bg-fuchsia-50/80 dark:bg-fuchsia-900/20 rounded-t-md';
  }

  if (id === 'predefined') {
    return 'border-transparent text-slate-500 dark:text-slate-400 hover:text-blue-700 dark:hover:text-blue-300 hover:bg-blue-50/50 dark:hover:bg-blue-900/10 rounded-t-md';
  }
  if (id === 'literature') {
    return 'border-transparent text-slate-500 dark:text-slate-400 hover:text-emerald-700 dark:hover:text-emerald-300 hover:bg-emerald-50/50 dark:hover:bg-emerald-900/10 rounded-t-md';
  }
  return 'border-transparent text-slate-500 dark:text-slate-400 hover:text-fuchsia-700 dark:hover:text-fuchsia-300 hover:bg-fuchsia-50/50 dark:hover:bg-fuchsia-900/10 rounded-t-md';
};

const TabButton: React.FC<TabButtonProps> = ({
  id,
  label,
  icon: Icon,
  isActive,
  isDisabled,
  onClick
}) => (
  <button
    onClick={onClick}
    disabled={isDisabled}
    className={`flex-1 min-w-0 flex items-center justify-center gap-2 px-3 py-3 text-sm font-medium border-b-2 transition-colors ${
      isDisabled 
        ? 'opacity-50 cursor-not-allowed' 
        : getTabColorClasses(id, isActive)
    }`}
  >
    <Icon className="w-4 h-4"/>
    <span>{label}</span>
  </button>
);

/**
 * Metrics configuration tabs with predefined, literature, and custom metrics
 */
export const MetricsTabs: React.FC<MetricsTabsProps> = ({
  activeTab,
  onTabChange,
  error,
  isEvaluating
}) => {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm overflow-hidden transition-colors duration-300">
      {/* Tab Buttons */}
      <div className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-2 flex w-full">
        <TabButton 
          id="predefined" 
          label="Research-Trained Metrics" 
          icon={CheckSquare}
          isActive={activeTab === 'predefined'}
          isDisabled={isEvaluating}
          onClick={() => onTabChange('predefined')}
        />
        <TabButton 
          id="literature" 
          label="Literature-Derived Metrics" 
          icon={BookOpen}
          isActive={activeTab === 'literature'}
          isDisabled={isEvaluating}
          onClick={() => onTabChange('literature')}
        />
        <TabButton 
          id="custom" 
          label="Custom Metrics" 
          icon={Wand2}
          isActive={activeTab === 'custom'}
          isDisabled={isEvaluating}
          onClick={() => onTabChange('custom')}
        />
      </div>

      {/* Tab Content */}
      <div className="p-6 min-h-[400px]">
        <div className={activeTab === 'predefined' ? 'block' : 'hidden'}>
          <PredefinedMetricsConfig/>
        </div>

        <div className={activeTab === 'literature' ? 'block' : 'hidden'}>
          <LiteratureBenchmarksConfig />
        </div>

        <div className={activeTab === 'custom' ? 'block' : 'hidden'}>
          <CustomizedMetricsConfig />
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="px-6 pb-6">
          <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-lg text-sm flex items-center justify-center">
            <span className="font-semibold mr-2">Error:</span> {error}
          </div>
        </div>
      )}
    </div>
  );
};
