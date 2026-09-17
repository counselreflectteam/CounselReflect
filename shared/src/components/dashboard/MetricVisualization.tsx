import React, { useState, useMemo } from 'react';
import { CircleSlash } from 'lucide-react';
import { LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, type PieLabelRenderProps } from 'recharts';
import { getMetricType, getNotApplicableCopy } from '@shared/utils/metricUtils';

interface MetricVisualizationProps {
  results: any;
  conversation: any;
  metricNames: string[];
  metricLabelMap: Record<string, string>;
  compact?: boolean;
  /** Demote the cr-opener band to a plain subhead when a zone header owns the threshold. */
  hideOpener?: boolean;
}

/**
 * Interactive metric visualization with line charts (numerical) and pie charts (categorical)
 */
export const MetricVisualization: React.FC<MetricVisualizationProps> = ({
  results,
  conversation,
  metricNames,
  metricLabelMap,
  compact = false,
  hideOpener = false
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

  const notApplicableCopy = selectedMetricForViz
    ? getNotApplicableCopy(selectedMetricForViz)
    : getNotApplicableCopy('');

  return (
    <div>
      {hideOpener ? (
        <div>
          <h3 className="cr-subhead">Scores across the conversation</h3>
          <p className="cr-meta mt-1 max-w-2xl">
            Select a metric to view its score trend or label distribution.
          </p>
        </div>
      ) : (
        <header className="cr-opener">
          <span className="cr-eyebrow">Trends</span>
          <h2 className="cr-section-title mt-1 text-lg md:text-xl">Scores across the conversation</h2>
          <p className="mt-1 max-w-2xl text-[0.8125rem] leading-5 text-[var(--cr-ink-2)]">
            Select a metric to view its score trend or label distribution.
          </p>
        </header>
      )}

      {/* TRENDS module — metric picker + chart canvas are one tool on one muted
          surface. Chart palette (accent spec §1): single series = cobalt
          (--chart-line, 600 light / 400 dark); multi-series order s0 cobalt
          ("ours") → s1 vermilion (CVD-safe pair; chart-only hue, NEVER UI
          ink) → s2 iris (= model-based when split by family) → s3 magenta
          (= rubric-based) → s4 emerald (legend disambiguates from success).
          Amber and sky are banned as series (they counterfeit verdict/cobalt
          semantics in figures). Delivered as local CSS vars so the SVG attrs
          flip per mode. */}
      <div className="cr-module mt-5 p-4 [--chart-line:#2563EB] [--chart-s0:#2563EB] [--chart-s1:#EA580C] [--chart-s2:#7C3AED] [--chart-s3:#C026D3] [--chart-s4:#059669] md:p-6 dark:[--chart-line:#60A5FA] dark:[--chart-s0:#60A5FA] dark:[--chart-s1:#FB923C] dark:[--chart-s2:#A78BFA] dark:[--chart-s3:#E879F9] dark:[--chart-s4:#34D399]">
        <div className="w-full min-w-[200px] sm:max-w-xs">
          <label className="mb-1.5 block text-xs font-semibold text-[var(--cr-ink-2)]">
            Metric
          </label>
          <select
            value={selectedMetricForViz || ''}
            onChange={(e) => setSelectedMetricForViz(e.target.value)}
            className="cr-focus h-9 w-full rounded-lg border border-[var(--cr-input-border)] bg-[var(--cr-bg)] px-3 text-sm text-[var(--cr-ink)]"
          >
            {metricNames.map(name => (
              <option key={name} value={name}>
                {metricLabelMap[name] || name}
              </option>
            ))}
          </select>
        </div>

        {/* Chart canvas sits directly on the module surface — spacing, never a hairline */}
        <div className={compact ? 'mt-5 min-h-[310px]' : 'mt-6 min-h-[430px]'}>
        {selectedMetricType === 'numerical' && trendData.length > 0 && (() => {
          // Calculate responsive dimensions based on data point count
          const dataPointCount = trendData.length;
          const useScrolling = dataPointCount > 25; // Enable scrolling for 25+ turns
          const dotRadius = useScrolling ? 5 : Math.max(4, Math.min(6, 200 / dataPointCount)); // Fixed size when scrolling
          const strokeWidth = useScrolling ? 3 : Math.max(2, Math.min(4, 150 / dataPointCount)); // Fixed size when scrolling
          const pointWidth = 30; // Pixels per data point for comfortable spacing
          const calculatedWidth = dataPointCount * pointWidth; // Width needed for proper spacing
          const chartHeight = compact
            ? dataPointCount > 30 ? 320 : 280
            : dataPointCount > 50 ? 480 : dataPointCount > 30 ? 430 : 380;
          
          return (
            <div className="cr-enter">
              <p className="mb-6 text-sm text-[var(--cr-ink-2)]">
                Trend of <span className="font-bold text-[var(--cr-ink)]">{metricLabelMap[selectedMetricForViz!] || selectedMetricForViz}</span> across conversation turns
                {useScrolling && <span className="cr-meta ml-2">(scroll to see all {dataPointCount} turns)</span>}
              </p>
              <div className={useScrolling ? "custom-scrollbar overflow-x-auto rounded-lg" : ""}>
                <div style={{ minWidth: useScrolling ? calculatedWidth : undefined }}>
                  <ResponsiveContainer width="100%" height={chartHeight}>
                    <LineChart data={trendData} margin={{ top: 10, right: 40, left: 10, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--cr-card-border)" />
                      <XAxis
                        dataKey="index"
                        label={{ value: 'Conversation turn', position: 'insideBottom', offset: -10, style: { fill: 'var(--cr-ink-2)', fontWeight: 600 } }}
                        tick={{ fill: 'var(--cr-ink-3)', fontSize: '0.75rem', fontWeight: 400 }}
                        strokeWidth={1}
                        stroke="var(--cr-input-border)"
                      />
                      <YAxis
                        domain={[0, metricMaxValue]}
                        label={{ value: 'Score', angle: -90, position: 'insideLeft', style: { fill: 'var(--cr-ink-2)', fontWeight: 600 } }}
                        tick={{ fill: 'var(--cr-ink-3)', fontSize: '0.75rem', fontWeight: 400 }}
                        strokeWidth={1}
                        stroke="var(--cr-input-border)"
                      />
                      <Tooltip
                        content={({ active, payload, label }: any) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload;
                            return (
                              <div className="cr-card z-50 max-w-xs p-4 shadow-[var(--shadow-lift)]">
                                <p className="mb-1 text-sm font-bold text-[var(--cr-ink)]">Turn {label}</p>
                                <p className="mb-3 text-sm font-bold text-brand-700 dark:text-brand-300">
                                  Score: {Number(payload[0].value).toFixed(3)}
                                </p>
                                <div className="border-t border-[var(--cr-card-border)] pt-2">
                                  <span className={`mb-1 block text-xs font-bold
                                    ${String(data.role).toLowerCase() === 'chatbot' ? 'text-brand-700 dark:text-brand-300' : 'text-[var(--cr-ink-3)]'}`}>
                                    {data.role}
                                  </span>
                                  <p className="line-clamp-4 text-xs leading-relaxed text-[var(--cr-ink-2)]">
                                    "{data.content}"
                                  </p>
                                </div>
                              </div>
                            );
                          }
                          return null;
                        }}
                        cursor={{ stroke: 'var(--chart-line)', strokeWidth: 1, strokeDasharray: '4 4' }}
                      />
                      <Line
                        type="monotone"
                        dataKey="value"
                        name={(metricLabelMap[selectedMetricForViz!] || selectedMetricForViz) as string}
                        stroke="var(--chart-line)"
                        strokeWidth={strokeWidth}
                        dot={{
                          fill: 'var(--chart-line)',
                          r: dotRadius,
                          strokeWidth: Math.max(2, strokeWidth - 1),
                          stroke: 'var(--cr-bg)'
                        }}
                        activeDot={{
                          r: dotRadius + 2,
                          fill: 'var(--chart-line)',
                          stroke: 'var(--cr-bg)',
                          strokeWidth: Math.max(2, strokeWidth - 1)
                        }}
                        fill="transparent"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          );
        })()}

        {selectedMetricType === 'categorical' && distributionData.length > 0 && (
            <div className="cr-enter">
              <p className="mb-6 text-sm text-[var(--cr-ink-2)]">
                Distribution of <span className="font-bold text-[var(--cr-ink)]">{metricLabelMap[selectedMetricForViz!] || selectedMetricForViz}</span> labels
              </p>
              <div className="flex items-center justify-center">
                <ResponsiveContainer width="100%" height={compact ? 280 : 380}>
                  <PieChart>
                    <Pie
                      data={distributionData}
                      cx="50%"
                      cy="50%"
                      labelLine={{ stroke: 'var(--cr-input-border)', strokeWidth: 1 }}
                      label={
                        compact
                          ? // Compact (extension sidebar): an explicit rem size —
                            // an unstyled label inherits the root-scaled document
                            // font (20px at the largest text-size step) and clips
                            // against the fixed pie geometry.
                            (props: PieLabelRenderProps) => (
                              <text
                                x={props.x}
                                y={props.y}
                                textAnchor={props.textAnchor as 'start' | 'middle' | 'end'}
                                dominantBaseline="central"
                                fill="var(--cr-ink-2)"
                                fontSize="0.75rem"
                              >
                                {props.name}
                              </text>
                            )
                          : (entry) => entry.name
                      }
                      outerRadius={compact ? 92 : 130}
                      innerRadius={compact ? 42 : 60}
                      dataKey="value"
                      paddingAngle={3}
                    >
                      {distributionData.map((_entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={`var(--chart-s${index % 5})`}
                          stroke="var(--cr-bg)"
                          strokeWidth={2}
                        />
                      ))}
                    </Pie>
                    <Tooltip 
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          const color = payload[0].payload.fill || 'var(--chart-s0)';
                          return (
                            <div className="cr-card z-50 min-w-[160px] p-4 shadow-[var(--shadow-lift)]">
                              <div className="mb-3 flex items-center gap-2.5 border-b border-[var(--cr-card-border)] pb-2">
                                <div className="h-3 w-3 rounded-full" style={{ backgroundColor: color }}></div>
                                <p className="text-sm font-bold text-[var(--cr-ink)]">{data.name}</p>
                              </div>
                              <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                   <span className="cr-meta">Count</span>
                                   <span className="text-sm font-bold text-brand-700 dark:text-brand-300">{data.value}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                   <span className="cr-meta">Percentage</span>
                                   <span className="text-sm font-bold text-[var(--cr-ink)]">{data.percentage}%</span>
                                </div>
                              </div>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Legend
                      wrapperStyle={{ paddingTop: '20px', fontSize: '0.75rem', fontWeight: 400, color: 'var(--cr-ink-2)' }}
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
          <div className={`flex flex-col items-center justify-center py-12 text-center ${compact ? 'h-[280px]' : 'h-[380px]'}`}>
            <CircleSlash className="mx-auto mb-3 h-5 w-5 text-[var(--cr-ink-3)]" aria-hidden />
            <p className="text-sm font-bold text-[var(--cr-ink)]">{notApplicableCopy.title}</p>
            <p className="mt-1 max-w-sm text-sm text-[var(--cr-ink-2)]">
              {notApplicableCopy.description}
            </p>
          </div>
        )}

        {selectedMetricType === 'categorical' && distributionData.length === 0 && (
          <div className={`flex flex-col items-center justify-center py-12 text-center ${compact ? 'h-[280px]' : 'h-[380px]'}`}>
            <CircleSlash className="mx-auto mb-3 h-5 w-5 text-[var(--cr-ink-3)]" aria-hidden />
            <p className="text-sm font-bold text-[var(--cr-ink)]">{notApplicableCopy.title}</p>
            <p className="mt-1 max-w-sm text-sm text-[var(--cr-ink-2)]">
              {notApplicableCopy.description}
            </p>
          </div>
        )}

        {!selectedMetricType && (
          <div className={`flex flex-col items-center justify-center py-12 text-center ${compact ? 'h-[280px]' : 'h-[380px]'}`}>
            <p className="text-sm text-[var(--cr-ink-2)]">No data available for the selected metric.</p>
          </div>
        )}
        </div>
      </div>
    </div>
  );
};
