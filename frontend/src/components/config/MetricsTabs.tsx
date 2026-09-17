import React, { useRef } from 'react';
import {
  CustomizedMetricsConfig,
  LiteratureBenchmarksConfig,
  PredefinedMetricsConfig
} from '@shared/components/config';
import { useMetrics } from '@shared/context';
import { PencilRule } from '../design/NotebookMarks';
import { MarkerHighlight } from '@shared/components/design/MarkerHighlight';

type TabId = 'predefined' | 'literature' | 'custom';

interface MetricsTabsProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  isEvaluating: boolean;
}

const TAB_META: Record<TabId, {
  label: string;
  description: string;
  accentLine: string;
  accentText: string;
}> = {
  predefined: {
    label: 'Model-scored',
    description: 'Research-trained models return their defined output labels.',
    accentLine: 'bg-[#176BFF]',
    accentText: 'text-brand-700 dark:text-brand-400'
  },
  literature: {
    label: 'Rubric-scored',
    description: 'Literature-grounded rubrics guide an anchored rating.',
    accentLine: 'bg-[#8B6FD6]',
    accentText: 'text-[#6A4CAF] dark:text-[#C9B8F4]'
  },
  custom: {
    label: 'Build your own metrics',
    description: 'Define a construct, then draft and review your own rubric.',
    accentLine: 'bg-[#12BFD0]',
    accentText: 'text-[#147782] dark:text-[#82E0E8]'
  }
};

const TAB_ORDER: TabId[] = ['predefined', 'literature', 'custom'];

interface TabButtonProps {
  id: TabId;
  count: number;
  isActive: boolean;
  isDisabled: boolean;
  onClick: () => void;
  buttonRef: (element: HTMLButtonElement | null) => void;
}

const TabButton: React.FC<TabButtonProps> = ({ id, count, isActive, isDisabled, onClick, buttonRef }) => (
  <button
    ref={buttonRef}
    type="button"
    role="tab"
    id={`metrics-tab-${id}`}
    aria-controls={`metrics-panel-${id}`}
    tabIndex={isActive ? 0 : -1}
    onClick={onClick}
    disabled={isDisabled}
    aria-selected={isActive}
    aria-label={`${TAB_META[id].label}. ${TAB_META[id].description} ${count} selected.`}
    className={`cr-focus relative inline-flex min-h-10 min-w-0 items-baseline gap-1.5 px-0.5 pb-2 pt-1 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
      isActive
        ? 'text-[var(--cr-ink)]'
        : 'text-[var(--cr-ink-2)] hover:text-[var(--cr-ink)]'
    }`}
  >
    <span className={`break-words text-[13px] leading-5 sm:text-[14px] ${isActive ? 'font-bold' : 'font-semibold'}`}>
      {TAB_META[id].label}
    </span>
    {count > 0 && (
      <span className={`whitespace-nowrap text-[10px] font-semibold ${
        isActive ? TAB_META[id].accentText : 'text-[var(--cr-ink-3)]'
      }`}>
        {count}
      </span>
    )}
    {isActive && (
      <span
        aria-hidden
        className={`absolute inset-x-0 bottom-0 h-[3px] origin-left -rotate-[0.5deg] ${TAB_META[id].accentLine}`}
      />
    )}
  </button>
);

export const MetricsTabs: React.FC<MetricsTabsProps> = ({
  activeTab,
  onTabChange,
  isEvaluating
}) => {
  const {
    selectedPredefinedMetrics,
    selectedLiteratureMetrics,
    selectedCustomizedMetrics
  } = useMetrics();

  const tabRefs = useRef<Record<TabId, HTMLButtonElement | null>>({
    predefined: null,
    literature: null,
    custom: null
  });

  const activateTab = (tab: TabId) => onTabChange(tab);

  // APG tabs pattern: ArrowLeft/ArrowRight (wrapping) plus Home/End move
  // focus and activate the tab (automatic activation — panels are
  // pre-rendered, so switching is cheap). All three tabs disable together
  // while evaluating, so a single no-op guard suffices.
  const handleTablistKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (isEvaluating) return;
    const currentIndex = TAB_ORDER.indexOf(activeTab);
    let nextTab: TabId;
    switch (event.key) {
      case 'ArrowRight':
        nextTab = TAB_ORDER[(currentIndex + 1) % TAB_ORDER.length];
        break;
      case 'ArrowLeft':
        nextTab = TAB_ORDER[(currentIndex - 1 + TAB_ORDER.length) % TAB_ORDER.length];
        break;
      case 'Home':
        nextTab = TAB_ORDER[0];
        break;
      case 'End':
        nextTab = TAB_ORDER[TAB_ORDER.length - 1];
        break;
      default:
        return;
    }
    event.preventDefault();
    activateTab(nextTab);
    tabRefs.current[nextTab]?.focus();
  };

  return (
    <div>
      <header>
        <PencilRule className="h-2.5 w-full text-[var(--cr-card-border)]" />
        <div className="mt-4 max-w-3xl">
          <p className="cr-kicker">Metric catalogue</p>
          <h2 className="mt-1 text-xl font-bold leading-7 text-[var(--cr-ink)]">
            Choose how to score the conversation
          </h2>
          <p className="mt-1.5 text-[13px] leading-5 text-[var(--cr-ink-2)]">
            Use any metric type on its own, or <MarkerHighlight tone="cyan">combine types</MarkerHighlight> in the same evaluation.
          </p>
          <p className="cr-meta mt-2 leading-5">
            Measures are alphabetical, <span className="font-semibold text-[var(--cr-ink-2)]">without ranking or endorsement</span>. Open any measure to review its definition, scoring method, and source.
          </p>
        </div>
      </header>
      <div className="mt-4">
        <div
          role="tablist"
          aria-label="Choose a metric type"
          onKeyDown={handleTablistKeyDown}
          className="flex flex-wrap items-end gap-x-5 gap-y-1 border-b border-[var(--cr-card-border)] sm:gap-x-8"
        >
          <TabButton
            id="predefined"
            count={selectedPredefinedMetrics.length}
            isActive={activeTab === 'predefined'}
            isDisabled={isEvaluating}
            onClick={() => activateTab('predefined')}
            buttonRef={(element) => { tabRefs.current.predefined = element; }}
          />
          <TabButton
            id="literature"
            count={selectedLiteratureMetrics.length}
            isActive={activeTab === 'literature'}
            isDisabled={isEvaluating}
            onClick={() => activateTab('literature')}
            buttonRef={(element) => { tabRefs.current.literature = element; }}
          />
          <TabButton
            id="custom"
            count={selectedCustomizedMetrics.length}
            isActive={activeTab === 'custom'}
            isDisabled={isEvaluating}
            onClick={() => activateTab('custom')}
            buttonRef={(element) => { tabRefs.current.custom = element; }}
          />
        </div>
        <p
          key={activeTab}
          className="cr-enter flex min-h-10 items-start gap-2 pt-2 text-xs leading-5 text-[var(--cr-ink-2)]"
        >
          <span
            aria-hidden
            className={`mt-[7px] h-1.5 w-1.5 shrink-0 rotate-12 ${TAB_META[activeTab].accentLine}`}
          />
          {TAB_META[activeTab].description}
        </p>
      </div>

      <div className="mt-3">
        <div
          key="predefined"
          role="tabpanel"
          id="metrics-panel-predefined"
          aria-labelledby="metrics-tab-predefined"
          tabIndex={0}
          className={activeTab === 'predefined' ? 'cr-enter cr-focus block scroll-mt-16 rounded-md' : 'hidden'}
        >
          <PredefinedMetricsConfig />
        </div>

        <div
          key="literature"
          role="tabpanel"
          id="metrics-panel-literature"
          aria-labelledby="metrics-tab-literature"
          tabIndex={0}
          className={activeTab === 'literature' ? 'cr-enter cr-focus block scroll-mt-16 rounded-md' : 'hidden'}
        >
          <LiteratureBenchmarksConfig />
        </div>

        <div
          key="custom"
          role="tabpanel"
          id="metrics-panel-custom"
          aria-labelledby="metrics-tab-custom"
          tabIndex={0}
          className={activeTab === 'custom' ? 'cr-enter cr-focus block scroll-mt-16 rounded-md' : 'hidden'}
        >
          <CustomizedMetricsConfig />
        </div>
      </div>
    </div>
  );
};
