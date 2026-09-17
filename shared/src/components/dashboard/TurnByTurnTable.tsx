import React, { useEffect, useMemo, useState } from 'react';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { Message, Role } from '@shared/types';
import { renderHighlightedContent } from '@shared/utils/highlightContent';
import { renderScoreCell } from '@shared/utils/scoreRenderers';
import { getTurnRoleLabelClass, getTurnRoleDotClass } from './turnDisplayUtils';

interface TurnByTurnTableProps {
  results: any;
  conversation: any;
  metricNames: string[];
  metricLabelMap: Record<string, string>;
  selectedLiteratureMetrics: string[];
  selectedTurnIndex: number | null;
  onSelectTurn: (index: number) => void;
  revealSelectedTurnRequest?: number;
  compact?: boolean;
}

/**
 * Turn-by-turn analysis table with clickable rows
 */
const MAX_TABLE_METRICS = 4;
const MAX_COMPACT_METRICS = 2;
type RoleFilter = 'all' | Role.Chatbot | Role.Client;

interface TurnExplorerRow {
  scoreItem: any;
  msg: Message;
  index: number;
  searchableText: string;
}

export const TurnByTurnTable: React.FC<TurnByTurnTableProps> = ({
  results,
  conversation,
  metricNames,
  metricLabelMap,
  selectedLiteratureMetrics,
  selectedTurnIndex,
  onSelectTurn,
  revealSelectedTurnRequest = 0,
  compact = false
}) => {
  const maxVisibleMetrics = compact ? MAX_COMPACT_METRICS : MAX_TABLE_METRICS;
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [visibleMetricNames, setVisibleMetricNames] = useState<string[]>(() =>
    metricNames.slice(0, maxVisibleMetrics)
  );
  const [selectionAnnouncement, setSelectionAnnouncement] = useState('');
  const lastRevealRequestRef = React.useRef(0);
  const metricKey = metricNames.join('\u001f');

  useEffect(() => {
    setVisibleMetricNames((previous) => {
      const next = previous
        .filter((name) => metricNames.includes(name))
        .slice(0, maxVisibleMetrics);

      for (const name of metricNames) {
        if (next.length >= maxVisibleMetrics) break;
        if (!next.includes(name)) next.push(name);
      }

      if (next.length === previous.length && next.every((name, index) => name === previous[index])) {
        return previous;
      }

      return next;
    });
  }, [metricKey, metricNames, maxVisibleMetrics]);

  const rows = useMemo<TurnExplorerRow[]>(() => {
    const messages = conversation.messages as Message[];
    const messageById = new Map<string, Message>(messages.map((message) => [message.id, message]));
    const utteranceScores = results.utteranceScores as any[];

    return utteranceScores
      .map((scoreItem: any, index: number) => {
        const msg = messageById.get(scoreItem.messageId);
        if (!msg) return null;

        return {
          scoreItem,
          msg,
          index,
          searchableText: `${msg.role} ${msg.content}`.toLowerCase()
        };
      })
      .filter((row): row is TurnExplorerRow => row !== null);
  }, [conversation.messages, results.utteranceScores]);

  const roleCounts = useMemo(() => {
    return rows.reduce<Record<string, number>>((counts, row: any) => {
      counts[row.msg.role] = (counts[row.msg.role] || 0) + 1;
      return counts;
    }, {});
  }, [rows]);

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return rows.filter((row: any) => {
      const matchesRole = roleFilter === 'all' || row.msg.role === roleFilter;
      const matchesQuery = normalizedQuery.length === 0 || row.searchableText.includes(normalizedQuery);
      return matchesRole && matchesQuery;
    });
  }, [query, roleFilter, rows]);

  useEffect(() => {
    if (
      revealSelectedTurnRequest === 0 ||
      revealSelectedTurnRequest === lastRevealRequestRef.current ||
      selectedTurnIndex === null
    ) return;

    lastRevealRequestRef.current = revealSelectedTurnRequest;
    const selectedRow = rows.find((row) => row.index === selectedTurnIndex);
    if (!selectedRow) return;

    const normalizedQuery = query.trim().toLowerCase();
    if (normalizedQuery && !selectedRow.searchableText.includes(normalizedQuery)) {
      setQuery('');
    }
    if (roleFilter !== 'all' && selectedRow.msg.role !== roleFilter) {
      setRoleFilter('all');
    }
    setSelectionAnnouncement(`Turn ${selectedTurnIndex + 1} selected in Turn evidence.`);
  }, [query, revealSelectedTurnRequest, roleFilter, rows, selectedTurnIndex]);

  const roleOptions: Array<{ value: RoleFilter; label: string; count: number }> = [
    { value: 'all' as const, label: 'All', count: rows.length },
    { value: Role.Chatbot, label: 'Chatbot', count: roleCounts[Role.Chatbot] || 0 },
    { value: Role.Client, label: 'Client', count: roleCounts[Role.Client] || 0 }
  ];

  const toggleVisibleMetric = (metricName: string) => {
    setVisibleMetricNames((previous) => {
      if (previous.includes(metricName)) {
        return previous.length > 1 ? previous.filter((name) => name !== metricName) : previous;
      }

      if (previous.length < maxVisibleMetrics) {
        return [...previous, metricName];
      }

      return [...previous.slice(0, maxVisibleMetrics - 1), metricName];
    });
  };

  const resetVisibleMetrics = () => {
    setVisibleMetricNames(metricNames.slice(0, maxVisibleMetrics));
  };

  const hiddenMetricCount = Math.max(0, metricNames.length - visibleMetricNames.length);
  const shouldShowMetricPicker = metricNames.length > maxVisibleMetrics;

  return (
    <div className={compact ? 'flex min-h-0 flex-col' : 'flex h-[650px] min-h-0 flex-col'}>
      <p className="sr-only" aria-live="polite">{selectionAnnouncement}</p>
      {/* Filter deck on white — controls separate from the table by spacing, not chrome */}
      <div className="pb-3">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <p className="cr-meta">
              {filteredRows.length} of {rows.length} turns · {visibleMetricNames.length} metrics
            </p>
          </div>

          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-end">
            <div className="relative min-w-[220px] flex-1 lg:w-72 lg:flex-none">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--cr-ink-3)]" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search turns"
                aria-label="Search turns"
                className="cr-focus h-9 w-full rounded-lg border border-[var(--cr-input-border)] bg-[var(--cr-bg)] pl-9 pr-9 text-sm text-[var(--cr-ink)] outline-none placeholder:text-[var(--cr-ink-3)]"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="cr-focus absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-[var(--cr-ink-3)] hover:bg-[var(--cr-muted)] hover:text-[var(--cr-ink)]"
                  aria-label="Clear turn search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <div className="flex flex-wrap gap-1 rounded-full bg-[var(--cr-muted)] p-1">
              {roleOptions.map((option) => {
                const isActive = roleFilter === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setRoleFilter(option.value)}
                    aria-pressed={isActive}
                    className={`cr-focus rounded-full px-3 py-1 text-xs transition-colors ${
                      isActive
                        ? 'bg-[var(--cr-card)] font-semibold text-[var(--cr-ink)]'
                        : 'font-normal text-[var(--cr-ink-2)] hover:text-[var(--cr-ink)]'
                    }`}
                  >
                    {option.label} {option.count}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        {shouldShowMetricPicker && (
          <div className="mt-3">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
              <div
                className="flex shrink-0 items-center gap-2 text-xs font-semibold text-[var(--cr-ink-2)]"
                title={`Up to ${maxVisibleMetrics} results shown; open a turn to see every metric`}
              >
                <SlidersHorizontal className="h-4 w-4 text-[var(--cr-ink-3)]" aria-hidden />
                <span>Metric columns</span>
              </div>
              <div className="custom-scrollbar flex min-w-0 flex-1 gap-1 overflow-x-auto pb-1">
                {metricNames.map((name) => {
                  const isVisible = visibleMetricNames.includes(name);
                  const label = metricLabelMap[name] || name;
                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() => toggleVisibleMetric(name)}
                      aria-pressed={isVisible}
                      title={isVisible ? `Hide ${label}` : `Show ${label} (up to ${maxVisibleMetrics} results)`}
                      className={`cr-focus inline-flex max-w-[180px] shrink-0 items-center rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                        isVisible
                          ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300'
                          : 'bg-[var(--cr-muted)] text-[var(--cr-ink-2)] hover:text-[var(--cr-ink)]'
                      }`}
                    >
                      <span className="truncate">{label}</span>
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={resetVisibleMetrics}
                className="cr-btn cr-btn-ghost cr-focus h-8 w-fit px-3 text-xs"
              >
                Reset
              </button>
            </div>
          </div>
        )}
      </div>
      {compact ? (
        <div className="cr-well custom-scrollbar max-h-[min(520px,62dvh)] divide-y divide-[var(--cr-card-border)] overflow-y-auto">
          {filteredRows.length === 0 && (
            <div className="px-4 py-10 text-center">
              <p className="text-sm font-bold text-[var(--cr-ink)]">No turns match the current filters</p>
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setRoleFilter('all');
                }}
                className="cr-btn cr-btn-secondary cr-focus mt-3 h-8 px-3 text-xs"
              >
                Reset filters
              </button>
            </div>
          )}
          {filteredRows.map(({ scoreItem, msg, index }) => {
            const isSelected = selectedTurnIndex === index;
            return (
              <div
                key={scoreItem.messageId}
                role="button"
                tabIndex={0}
                onClick={() => onSelectTurn(index)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onSelectTurn(index);
                  }
                }}
                aria-current={isSelected ? 'true' : undefined}
                className={`cr-focus block w-full cursor-pointer border-l-2 px-3 py-4 text-left transition-colors ${
                  isSelected
                    ? 'border-l-brand-600 bg-brand-50/60 dark:border-l-brand-400 dark:bg-brand-500/10'
                    : 'border-l-transparent hover:bg-brand-50/40 dark:hover:bg-brand-500/5'
                }`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className={`inline-flex items-center gap-1.5 text-[0.8125rem] ${getTurnRoleLabelClass(msg.role)}`}>
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${getTurnRoleDotClass(msg.role)}`} aria-hidden />
                    {msg.role}
                  </span>
                  <span className="cr-meta tabular-nums">Turn {index + 1}</span>
                </span>
                <span className="mt-2 line-clamp-2 block text-[0.8125rem] leading-5 text-[var(--cr-ink-2)]">
                  {renderHighlightedContent(msg.content, scoreItem, selectedLiteratureMetrics)}
                </span>
                <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-[var(--cr-card-border)] pt-3">
                  {visibleMetricNames.map((name) => (
                    <div key={name} className="min-w-0">
                      <span className="cr-meta block truncate" title={metricLabelMap[name] || name}>
                        {metricLabelMap[name] || name}
                      </span>
                      <div className="mt-1 text-[0.8125rem] text-[var(--cr-ink)]">
                        {renderScoreCell(name, scoreItem, results)}
                      </div>
                    </div>
                  ))}
                </div>
                {hiddenMetricCount > 0 && (
                  <span className="cr-meta mt-2 block">Open turn for {hiddenMetricCount} more score{hiddenMetricCount === 1 ? '' : 's'}</span>
                )}
              </div>
            );
          })}
        </div>
      ) : (
      /* The desktop table remains a bounded, horizontally scrollable artifact. */
      <div className="cr-well flex-1 overflow-auto">
        <table className="min-w-full divide-y divide-[var(--cr-card-border)]">
          <thead className="sticky top-0 z-10 bg-[var(--cr-bg)]">
            <tr>
              <th className="w-20 px-5 py-3 text-left text-xs font-bold text-[var(--cr-ink)]">Turn</th>
              <th className="w-32 px-4 py-3 text-left text-xs font-bold text-[var(--cr-ink)]">Speaker</th>
              <th className="w-full min-w-[340px] px-4 py-3 text-left text-xs font-bold text-[var(--cr-ink)]">Transcript excerpt</th>
              {visibleMetricNames.map(name => (
                <th key={name} className="w-28 px-3 py-3 text-center text-xs font-bold text-[var(--cr-ink)]">
                  <span className="block max-w-28 truncate" title={metricLabelMap[name] || name}>
                    {metricLabelMap[name] || name}
                  </span>
                </th>
              ))}
              {hiddenMetricCount > 0 && (
                <th className="w-20 px-3 py-3 text-center text-xs font-bold text-[var(--cr-ink)]">
                  More
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--cr-card-border)] bg-[var(--cr-bg)]">
            {filteredRows.length === 0 && (
              <tr>
                <td colSpan={3 + visibleMetricNames.length + (hiddenMetricCount > 0 ? 1 : 0)} className="px-5 py-12 text-center">
                  <p className="text-sm font-bold text-[var(--cr-ink)]">No turns match the current filters</p>
                  <button
                    type="button"
                    onClick={() => {
                      setQuery('');
                      setRoleFilter('all');
                    }}
                    className="cr-btn cr-btn-secondary cr-focus mt-3 h-8 px-3 text-xs"
                  >
                    Reset filters
                  </button>
                </td>
              </tr>
            )}
            {filteredRows.map((row) => {
              const { scoreItem, msg, index } = row;
              const isSelected = selectedTurnIndex === index;

              return (
                <tr
                  key={scoreItem.messageId}
                  onClick={() => onSelectTurn(index)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onSelectTurn(index);
                    }
                  }}
                  tabIndex={0}
                  aria-current={isSelected ? 'true' : undefined}
                  className={`group cursor-pointer border-l-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400
                    ${isSelected
                      ? 'border-l-brand-600 bg-brand-50/60 dark:border-l-brand-400 dark:bg-brand-500/10'
                      : 'border-l-transparent hover:bg-brand-50/40 dark:hover:bg-brand-500/5'}`}
                >
                  <td className="whitespace-nowrap px-5 py-4 align-top text-[0.8125rem] tabular-nums">
                    <span className={isSelected ? 'font-bold text-brand-700 dark:text-brand-300' : 'text-[var(--cr-ink-3)]'}>
                      {index + 1}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-4 align-top">
                    <span className={`inline-flex items-center gap-1.5 text-[0.8125rem] ${getTurnRoleLabelClass(msg.role)}`}>
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${getTurnRoleDotClass(msg.role)}`} aria-hidden />
                      {msg.role}
                    </span>
                  </td>
                  <td className="w-full min-w-[340px] px-4 py-4 align-top text-[0.8125rem] text-[var(--cr-ink-2)]">
                    <div className="min-w-0">
                      <div className="line-clamp-2 leading-5">
                        {renderHighlightedContent(msg.content, scoreItem, selectedLiteratureMetrics)}
                      </div>
                    </div>
                  </td>
                  {visibleMetricNames.map(name => (
                    <td key={name} className="whitespace-nowrap px-3 py-4 text-center align-top">
                      {renderScoreCell(name, scoreItem, results)}
                    </td>
                  ))}
                  {hiddenMetricCount > 0 && (
                    <td className="whitespace-nowrap px-3 py-4 text-center align-top">
                      <span
                        className="cr-meta inline-flex"
                        title="Open this turn to inspect all metric reasoning"
                      >
                        +{hiddenMetricCount}
                      </span>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      )}
    </div>
  );
};
