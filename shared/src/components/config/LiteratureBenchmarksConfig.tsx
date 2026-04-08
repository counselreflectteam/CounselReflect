import React, { useState, useEffect, useMemo } from 'react';
import { ExternalLink, Search, Filter, X } from 'lucide-react';
import { fetchLiteratureMetrics, LiteratureMetric } from '../../services/literatureMetricsService';
import { useMetrics } from '../../context/MetricsContext';

import { TargetSpeakerBadge } from '../../utils/targetSpeakerUtils';
import { buildSearchIndex, searchAndFilterMetrics } from '../../utils/searchUtils';
import { CategoryBadge, CategoryFilterItem } from '../../utils/categoryUtils';
import { LiteratureMetricDetailModal } from '../modals/LiteratureMetricDetailModal';


export const LiteratureBenchmarksConfig: React.FC = () => {
  const { selectedLiteratureMetrics, toggleLiteratureMetric } = useMetrics();
  const [metrics, setMetrics] = useState<LiteratureMetric[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMetric, setSelectedMetric] = useState<LiteratureMetric | null>(null);
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());


  useEffect(() => {
    loadLiteratureMetrics();
  }, []);


  const categories = useMemo(() => {
    return Array.from(new Set(metrics.map(m => m.category || 'Other').filter(Boolean))).sort();
  }, [metrics]);

  const searchIndex = useMemo(() => buildSearchIndex(metrics), [metrics]);

  const searchResults = useMemo(() =>
    searchAndFilterMetrics(searchIndex, searchQuery, selectedCategories),
    [searchIndex, searchQuery, selectedCategories]
  );

  const filteredMetrics = useMemo(() =>
    searchResults.map(r => r.metric),
    [searchResults]
  );


  const loadLiteratureMetrics = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await fetchLiteratureMetrics();
      setMetrics(data.metrics);
    } catch (err: any) {
      console.error('Error fetching literature metrics:', err);
      // The service already logs errors and potentially shows toast, 
      // but we still want to set local error state for the UI fallback
      setError(err.message || 'Failed to load literature metrics');
    } finally {
      setIsLoading(false);
    }
  };


  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-3 text-slate-600 dark:text-slate-400">Loading literature metrics...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
        <p className="text-red-600 dark:text-red-400">{error}</p>
        <button
          onClick={loadLiteratureMetrics}
          className="mt-2 text-sm text-red-700 dark:text-red-300 hover:underline"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Literature-Derived Metrics
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Metrics derived from published literature for evaluating therapeutic conversations
          </p>
        </div>
        <div className="flex items-center space-x-2">
          {selectedLiteratureMetrics.length > 0 && (
            <button
              onClick={() => [...selectedLiteratureMetrics].forEach(m => toggleLiteratureMetric(m))}
              className="text-xs text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400"
            >
              Clear all
            </button>
          )}
          <span className="text-sm font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-3 py-1 rounded-full">
            {selectedLiteratureMetrics.length} selected
          </span>
        </div>
      </div>

      {/* Search Bar and Category Filter */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Smart search: try 'empathy', 'CBT', 'emotion'..."
            className="w-full pl-10 pr-10 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Category Filter */}
        {categories.length > 0 && (
          <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-3 border border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider flex items-center">
                <Filter className="w-3 h-3 mr-1.5" />
                Filter by Category
              </div>
              <div className="flex items-center space-x-2">
                {selectedCategories.size > 0 && (
                  <button
                    onClick={() => setSelectedCategories(new Set())}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    Clear filter
                  </button>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {categories.map((category) => {
                const isSelected = selectedCategories.has(category);
                const categoryMetrics = metrics.filter(m => (m.category || 'Other') === category);
                const count = categoryMetrics.length;
                const selectedInCategory = categoryMetrics.filter(m => selectedLiteratureMetrics.some(s => s.metricName === m.metricName)).length;
                
                return (
                  <CategoryFilterItem
                    key={category}
                    category={category}
                    isSelected={isSelected}
                    selectedCount={selectedInCategory}
                    totalCount={count}
                    onToggleCategory={() => {
                      const newSelected = new Set(selectedCategories);
                      if (isSelected) {
                        newSelected.delete(category);
                      } else {
                        newSelected.add(category);
                      }
                      setSelectedCategories(newSelected);
                    }}
                    onToggleAllInGroup={(e: React.MouseEvent) => {
                      e.stopPropagation();
                      // Toggle all metrics in this category
                      const allSelected = categoryMetrics.every(m => selectedLiteratureMetrics.some(s => s.metricName === m.metricName));
                      categoryMetrics.forEach(m => {
                        const isCurrentlySelected = selectedLiteratureMetrics.some(s => s.metricName === m.metricName);
                        if (allSelected) {
                          // Deselect all if all are selected
                          if (isCurrentlySelected) toggleLiteratureMetric(m);
                        } else {
                          // Select all if not all are selected
                          if (!isCurrentlySelected) toggleLiteratureMetric(m);
                        }
                      });
                    }}
                    areAllSelected={categoryMetrics.every(m => selectedLiteratureMetrics.some(s => s.metricName === m.metricName))}
                  />
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
        {filteredMetrics.map((metric, index) => {
          const isSelected = selectedLiteratureMetrics.some(m => m.metricName === metric.metricName);
          
          return (
            <div
              key={index}
              onClick={() => toggleLiteratureMetric(metric)}
              className={`bg-white dark:bg-slate-800 rounded-lg border p-4 transition-all cursor-pointer group ${
                isSelected 
                  ? 'border-blue-500 dark:border-blue-400 ring-2 ring-blue-200 dark:ring-blue-900' 
                  : 'border-slate-200 dark:border-slate-700 hover:border-blue-500 dark:hover:border-blue-400'
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                  <h4 className="font-semibold text-slate-900 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors mb-1.5">
                    {metric.metricName}
                  </h4>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <TargetSpeakerBadge target={metric.target} />
                    <CategoryBadge 
                      category={metric.category} 
                      className="inline-flex px-2 py-0.5 text-[10px]" 
                    />
                  </div>
                </div>
                <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ml-2 ${isSelected ? 'bg-blue-500 border-blue-500' : 'border-slate-300 dark:border-slate-500'}`}>
                  {isSelected && <div className="w-2 h-2 bg-white rounded-[1px]" />}
                </div>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-3 mb-3">
                {metric.definition}
              </p>
              <div className="flex items-center justify-between">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedMetric(metric);
                  }}
                  className="text-xs text-blue-600 dark:text-blue-400 font-medium hover:underline"
                >
                  {metric.references?.length || 0} references
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedMetric(metric);
                  }}
                  className="flex items-center gap-1.5 p-1 pr-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors group"
                  title="View details"
                >
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400 group-hover:text-blue-500 transition-colors">See details</span>
                  <ExternalLink className="w-4 h-4 text-slate-400 group-hover:text-blue-500 transition-colors" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {filteredMetrics.length === 0 && (
        <div className="text-center py-12 text-slate-500 dark:text-slate-400">
          <Filter className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>No metrics found matching "{searchQuery}"</p>
        </div>
      )}

      {/* Detail Modal */}
      {selectedMetric && (
        <LiteratureMetricDetailModal 
          metric={selectedMetric} 
          onClose={() => setSelectedMetric(null)} 
        />
      )}
    </div>
  );
};
