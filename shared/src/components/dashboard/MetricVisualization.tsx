import React, { useState, useMemo } from 'react';
import { TrendingUp } from 'lucide-react';
import { LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { getMetricType } from '@shared/utils/metricUtils';
import { CHART_COLORS } from '@shared/utils/emotionColors';

interface MetricVisualizationProps {
  results: any;
  conversation: any;
  metricNames: string[];
  metricLabelMap: Record<string, string>;
}

/**
 * Interactive metric visualization with line charts (numerical) and pie charts (categorical)
 */
export const MetricVisualization: React.FC<MetricVisualizationProps> = ({
  results,
  conversation,
  metricNames,
  metricLabelMap
}) => {
  const [selectedMetricForViz, setSelectedMetricForViz] = useState<string | null>(
    metricNames.length > 0 ? metricNames[0] : null
  );

  const selectedMetricType = selectedMetricForViz ? getMetricType(selectedMetricForViz, results) : null;

  // Prepare trend data for numeric metrics
  const trendData = useMemo(() => {
    if (!selectedMetricForViz || selectedMetricType !== 'numerical') return [];
    
    return results.utteranceScores.map((scoreItem: any, idx: number) => {
      const metric = scoreItem.metrics[selectedMetricForViz];
      const msg = conversation.messages.find((m: any) => m.id === scoreItem.messageId);
      return {
        index: idx + 1,
        value: metric?.type === 'numerical' ? metric.value : null,
        content: msg?.content || '',
        role: msg?.role || 'Unknown'
      };
    }).filter((d: any) => d.value !== null && d.value !== -1);  // Exclude null and -1 (not applicable)
  }, [selectedMetricForViz, selectedMetricType, results, conversation]);

  // Prepare distribution data for categorical metrics
  const distributionData = useMemo(() => {
    if (!selectedMetricForViz || selectedMetricType !== 'categorical') return [];
    
    const labelCounts: Record<string, number> = {};
    results.utteranceScores.forEach((scoreItem: any) => {
      const metric = scoreItem.metrics[selectedMetricForViz];
      // Exclude -1 (not applicable) labels from distribution
      if (metric?.type === 'categorical' && metric.label && metric.label !== '-1') {
        labelCounts[metric.label] = (labelCounts[metric.label] || 0) + 1;
      }
    });

    const total = Object.values(labelCounts).reduce((sum: number, count: any) => sum + count, 0);
    return Object.entries(labelCounts).map(([label, count]) => ({
      name: label,
      value: count,
      percentage: ((count / total) * 100).toFixed(1),
    }));
  }, [selectedMetricForViz, selectedMetricType, results]);

  const metricMaxValue = useMemo(() => {
    if (!selectedMetricForViz || selectedMetricType !== 'numerical') return 5;
    const item = results.utteranceScores.find((u: any) => 
      u.metrics?.[selectedMetricForViz]?.type === 'numerical'
    );
    return item?.metrics[selectedMetricForViz]?.max_value || 5;
  }, [selectedMetricForViz, selectedMetricType, results]);

  return (
    <div className="bg-gradient-to-br from-white via-slate-50 to-indigo-50/30 dark:from-slate-800 dark:via-slate-800 dark:to-indigo-900/10 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 shadow-lg hover:shadow-xl transition-all duration-300 p-8">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-gradient-to-br from-blue-500 to-cyan-600 rounded-xl shadow-lg shadow-blue-500/30">
            <TrendingUp className="w-6 h-6 text-white" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">Metric Visualization</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Interactive analysis across conversation</p>
          </div>
        </div>

        {/* Premium Metric Dropdown */}
        <div className="relative group flex-1 sm:flex-none w-full sm:w-auto min-w-[200px] max-w-full">
          <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
            Selected Metric
          </label>
          <div className="relative w-full">
            <select
              value={selectedMetricForViz || ''}
              onChange={(e) => setSelectedMetricForViz(e.target.value)}
              className="appearance-none w-full sm:min-w-[280px] px-6 py-3.5 pr-12 
                bg-gradient-to-br from-white to-slate-50 dark:from-slate-700 dark:to-slate-800 
                border-2 border-slate-200 dark:border-slate-600 
                rounded-xl text-sm font-bold text-slate-800 dark:text-slate-100
                shadow-md hover:shadow-lg 
                hover:border-blue-400 dark:hover:border-blue-500
                hover:scale-[1.02] active:scale-[0.98]
                focus:outline-none focus:ring-4 focus:ring-blue-500/30 focus:border-blue-500
                transition-all duration-200 cursor-pointer
                backdrop-blur-sm"
              style={{
                backgroundImage: 'linear-gradient(135deg, rgba(59, 130, 246, 0.03) 0%, rgba(6, 182, 212, 0.03) 100%)'
              }}
            >
              {metricNames.map(name => (
                <option key={name} value={name} className="bg-white dark:bg-slate-800 py-2">
                  {metricLabelMap[name] || name}
                </option>
              ))}
            </select>
            {/* Custom Dropdown Arrow */}
            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
              <svg 
                className="w-5 h-5 text-blue-600 dark:text-blue-400 group-hover:text-blue-700 dark:group-hover:text-blue-300 transition-colors" 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
            {/* Gradient Accent Line */}
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-500 via-cyan-500 to-sky-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-full"></div>
          </div>
        </div>
      </div>

      {/* Chart Container - Beautified */}
      <div className="min-h-[450px] bg-white dark:bg-slate-900/50 rounded-xl p-6 shadow-inner border border-slate-100 dark:border-slate-700/50">
        {selectedMetricType === 'numerical' && trendData.length > 0 && (() => {
          // Calculate responsive dimensions based on data point count
          const dataPointCount = trendData.length;
          const useScrolling = dataPointCount > 25; // Enable scrolling for 25+ turns
          const dotRadius = useScrolling ? 5 : Math.max(4, Math.min(6, 200 / dataPointCount)); // Fixed size when scrolling
          const strokeWidth = useScrolling ? 3 : Math.max(2, Math.min(4, 150 / dataPointCount)); // Fixed size when scrolling
          const pointWidth = 30; // Pixels per data point for comfortable spacing
          const calculatedWidth = dataPointCount * pointWidth; // Width needed for proper spacing
          const chartHeight = dataPointCount > 50 ? 480 : dataPointCount > 30 ? 430 : 380; // Taller for many points
          
          return (
            <div className="animate-fade-in-up">
              <div className="flex items-center space-x-2 mb-6">
                <div className="h-1 w-1 rounded-full bg-gradient-to-r from-blue-500 to-cyan-500 animate-pulse"></div>
                <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
                  Trend of <span className="text-blue-600 dark:text-blue-400 font-bold">{metricLabelMap[selectedMetricForViz!] || selectedMetricForViz}</span> across conversation turns
                  {useScrolling && <span className="ml-2 text-xs text-slate-400 dark:text-slate-500">(scroll to see all {dataPointCount} turns)</span>}
                </p>
              </div>
              <div className={useScrolling ? "overflow-x-auto scrollbar-thin scrollbar-thumb-indigo-300 dark:scrollbar-thumb-indigo-700 scrollbar-track-slate-100 dark:scrollbar-track-slate-800 rounded-lg" : ""}>
                <div style={{ minWidth: useScrolling ? calculatedWidth : undefined }}>
                  <ResponsiveContainer width="100%" height={chartHeight}>
                    <LineChart data={trendData} margin={{ top: 10, right: 40, left: 10, bottom: 20 }}>
                      <defs>
                        <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" className="dark:opacity-10" strokeOpacity={0.3} />
                      <XAxis 
                        dataKey="index" 
                        label={{ value: 'Conversation Turn', position: 'insideBottom', offset: -10, style: { fill: '#64748b', fontWeight: 600 } }}
                        tick={{ fill: '#64748b', fontSize: 12, fontWeight: 500 }}
                        strokeWidth={2}
                        stroke="#cbd5e1"
                      />
                      <YAxis 
                        domain={[0, metricMaxValue]}
                        label={{ value: 'Score', angle: -90, position: 'insideLeft', style: { fill: '#64748b', fontWeight: 600 } }}
                        tick={{ fill: '#64748b', fontSize: 12, fontWeight: 500 }}
                        strokeWidth={2}
                        stroke="#cbd5e1"
                      /> 
                      <Tooltip 
                        content={({ active, payload, label }: any) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload;
                            return (
                              <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-xl border border-slate-100 dark:border-slate-700 max-w-xs z-50">
                                <p className="font-bold text-slate-800 dark:text-slate-100 mb-1">Turn {label}</p>
                                <p className="text-sm text-blue-600 dark:text-blue-400 font-bold mb-3">
                                  Score: {Number(payload[0].value).toFixed(3)}
                                </p>
                                <div className="border-t border-slate-100 dark:border-slate-700 pt-2">
                                  <span className={`text-[10px] font-bold uppercase tracking-wider mb-1 block
                                    ${String(data.role).toLowerCase() === 'therapist' ? 'text-blue-500' : 'text-slate-500'}`}>
                                    {data.role}
                                  </span>
                                  <p className="text-xs text-slate-600 dark:text-slate-300 italic line-clamp-4 leading-relaxed">
                                    "{data.content}"
                                  </p>
                                </div>
                              </div>
                            );
                          }
                          return null;
                        }}
                        cursor={{ stroke: '#3b82f6', strokeWidth: 2, strokeDasharray: '5 5' }}
                      />
                      <Legend 
                        wrapperStyle={{ paddingTop: '20px' }}
                        iconType="line"
                      />
                      <Line 
                        type="monotone" 
                        dataKey="value" 
                        name={(metricLabelMap[selectedMetricForViz!] || selectedMetricForViz) as string}
                        stroke="url(#lineGradient)"
                        strokeWidth={strokeWidth}
                        dot={{ 
                          fill: '#3b82f6', 
                          r: dotRadius, 
                          strokeWidth: Math.max(2, strokeWidth - 1), 
                          stroke: '#ffffff',
                          filter: 'drop-shadow(0 2px 4px rgba(59, 130, 246, 0.3))'
                        }}
                        activeDot={{ 
                          r: dotRadius + 2, 
                          fill: '#3b82f6',
                          stroke: '#ffffff',
                          strokeWidth: Math.max(2, strokeWidth - 1),
                          filter: 'drop-shadow(0 4px 8px rgba(59, 130, 246, 0.5))'
                        }}
                        fill="url(#colorValue)"
                      />
                      <defs>
                        <linearGradient id="lineGradient" x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor="#3b82f6" />
                          <stop offset="50%" stopColor="#0ea5e9" />
                          <stop offset="100%" stopColor="#06b6d4" />
                        </linearGradient>
                      </defs>
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          );
        })()}

        {selectedMetricType === 'categorical' && distributionData.length > 0 && (
            <div className="animate-fade-in-up">
              <div className="flex items-center space-x-2 mb-6">
                <div className="h-1 w-1 rounded-full bg-gradient-to-r from-blue-500 to-cyan-500 animate-pulse"></div>
                <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
                  Distribution of <span className="text-blue-600 dark:text-blue-400 font-bold">{metricLabelMap[selectedMetricForViz!] || selectedMetricForViz}</span> labels
                </p>
              </div>
              <div className="flex items-center justify-center">
                <ResponsiveContainer width="100%" height={380}>
                  <PieChart>
                    <Pie
                      data={distributionData}
                      cx="50%"
                      cy="50%"
                      labelLine={{ stroke: '#cbd5e1', strokeWidth: 1 }}
                      label={(entry) => entry.name}
                      outerRadius={130}
                      innerRadius={60}
                      dataKey="value"
                      paddingAngle={3}
                    >
                      {distributionData.map((_entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={CHART_COLORS[index % CHART_COLORS.length]}
                          stroke="#ffffff"
                          strokeWidth={2}
                        />
                      ))}
                    </Pie>
                    <Tooltip 
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          const color = payload[0].payload.fill || CHART_COLORS[0];
                          return (
                            <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-xl border border-slate-100 dark:border-slate-700 min-w-[160px] z-50">
                              <div className="flex items-center gap-2.5 mb-3 border-b border-slate-100 dark:border-slate-700 pb-2">
                                <div className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: color }}></div>
                                <p className="font-bold text-slate-800 dark:text-slate-100 text-sm">{data.name}</p>
                              </div>
                              <div className="space-y-2">
                                <div className="flex justify-between items-center">
                                   <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Count</span>
                                   <span className="text-base font-bold text-blue-600 dark:text-blue-400">{data.value}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                   <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Percentage</span>
                                   <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">{data.percentage}%</span>
                                </div>
                              </div>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Legend 
                      wrapperStyle={{ paddingTop: '20px', fontSize: '12px', fontWeight: 500, color: '#64748b' }} 
                      iconType="circle"
                      iconSize={8}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
        )}

        {/* All turns are N/A: type detected but all data filtered out */}
        {selectedMetricType === 'numerical' && trendData.length === 0 && (
          <div className="flex flex-col items-center justify-center h-[380px]">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-slate-100 to-amber-100 dark:from-slate-700 dark:to-amber-900/30 flex items-center justify-center mb-4 shadow-lg">
              <span className="text-2xl">🚫</span>
            </div>
            <p className="text-slate-700 dark:text-slate-300 text-sm font-semibold mb-1">Not Applicable</p>
            <p className="text-slate-400 dark:text-slate-500 text-xs text-center max-w-xs">
              This metric was not applicable to any turn in the conversation. No scoreable events were detected.
            </p>
          </div>
        )}

        {selectedMetricType === 'categorical' && distributionData.length === 0 && (
          <div className="flex flex-col items-center justify-center h-[380px]">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-slate-100 to-amber-100 dark:from-slate-700 dark:to-amber-900/30 flex items-center justify-center mb-4 shadow-lg">
              <span className="text-2xl">🚫</span>
            </div>
            <p className="text-slate-700 dark:text-slate-300 text-sm font-semibold mb-1">Not Applicable</p>
            <p className="text-slate-400 dark:text-slate-500 text-xs text-center max-w-xs">
              This metric was not applicable to any turn in the conversation. No scoreable events were detected.
            </p>
          </div>
        )}

        {!selectedMetricType && (
          <div className="flex flex-col items-center justify-center h-[380px]">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-700 dark:to-slate-800 flex items-center justify-center mb-4 shadow-lg">
              <TrendingUp className="w-8 h-8 text-slate-400 dark:text-slate-500" />
            </div>
            <p className="text-slate-400 dark:text-slate-500 text-sm font-medium">No data available for the selected metric.</p>
          </div>
        )}
      </div>
    </div>
  );
};
