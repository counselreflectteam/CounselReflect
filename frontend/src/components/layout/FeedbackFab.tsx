import React, { useEffect, useState } from 'react';
import { MessageCircle, X } from 'lucide-react';

type FeedbackCategory = 'feedback' | 'feature_request' | 'propose_new_metrics' | 'other';
type CategoryFieldKey =
  | 'what_happened'
  | 'worked_well'
  | 'could_improve'
  | 'additional_context'
  | 'problem_to_solve'
  | 'proposed_feature'
  | 'expected_benefit'
  | 'example_workflow'
  | 'metric_name'
  | 'measure_definition'
  | 'scoring_type'
  | 'rubric_examples'
  | 'why_useful'
  | 'metric_references'
  | 'details';

interface CategoryField {
  key: CategoryFieldKey;
  label: string;
  placeholder: string;
  multiline?: boolean;
  rows?: number;
}

const GITHUB_ISSUES_NEW_URL = 'https://github.com/counselreflectteam/CounselReflect/issues/new';

const CATEGORY_LABELS: Record<FeedbackCategory, string> = {
  feedback: 'Feedback',
  feature_request: 'Feature Request',
  propose_new_metrics: 'Metric Proposal',
  other: 'Other'
};

const CATEGORY_DEFAULT_TITLES: Record<FeedbackCategory, string> = {
  feedback: 'Feedback on user experience',
  feature_request: 'Feature request: ',
  propose_new_metrics: 'New metric proposal: ',
  other: ''
};

const CATEGORY_FIELDS: Record<FeedbackCategory, CategoryField[]> = {
  feedback: [
    { key: 'what_happened', label: 'What happened', placeholder: 'Describe what happened', multiline: true, rows: 3 },
    { key: 'worked_well', label: 'What worked well', placeholder: 'What worked well?', multiline: true, rows: 3 },
    { key: 'could_improve', label: 'What could be improved', placeholder: 'What should be improved?', multiline: true, rows: 3 },
    { key: 'additional_context', label: 'Additional context (optional)', placeholder: 'Any extra context', multiline: true, rows: 2 }
  ],
  feature_request: [
    { key: 'problem_to_solve', label: 'Problem to solve', placeholder: 'What problem are you trying to solve?', multiline: true, rows: 3 },
    { key: 'proposed_feature', label: 'Proposed feature', placeholder: 'Describe your feature request', multiline: true, rows: 3 },
    { key: 'expected_benefit', label: 'Expected benefit', placeholder: 'How will this help users?', multiline: true, rows: 2 },
    { key: 'example_workflow', label: 'Example workflow (optional)', placeholder: 'Optional step-by-step workflow', multiline: true, rows: 3 }
  ],
  propose_new_metrics: [
    { key: 'metric_name', label: 'Metric name', placeholder: 'e.g., Therapeutic Alignment' },
    { key: 'measure_definition', label: 'What should this metric measure?', placeholder: 'Define what this metric captures', multiline: true, rows: 3 },
    { key: 'scoring_type', label: 'Scoring type', placeholder: 'e.g., Categorical (Low/Medium/High) or Numerical (0-5)' },
    { key: 'rubric_examples', label: 'Suggested rubric or examples', placeholder: 'Provide rubric details or examples', multiline: true, rows: 3 },
    { key: 'why_useful', label: 'Why is this metric useful?', placeholder: 'Explain impact and use case', multiline: true, rows: 2 },
    { key: 'metric_references', label: 'References (optional)', placeholder: 'Optional papers/URLs supporting this metric', multiline: true, rows: 2 }
  ],
  other: [
    { key: 'details', label: 'Details', placeholder: 'Write your message freely', multiline: true, rows: 5 }
  ]
};

const createInitialFieldValues = (): Record<CategoryFieldKey, string> => ({
  what_happened: '',
  worked_well: '',
  could_improve: '',
  additional_context: '',
  problem_to_solve: '',
  proposed_feature: '',
  expected_benefit: '',
  example_workflow: '',
  metric_name: '',
  measure_definition: '',
  scoring_type: '',
  rubric_examples: '',
  why_useful: '',
  metric_references: '',
  details: ''
});

export const FeedbackFab: React.FC = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [category, setCategory] = useState<FeedbackCategory>('feedback');
  const [title, setTitle] = useState('');
  const [fieldValues, setFieldValues] = useState<Record<CategoryFieldKey, string>>(createInitialFieldValues);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

  const applyTemplate = (nextCategory: FeedbackCategory) => {
    setCategory(nextCategory);
    setTitle(CATEGORY_DEFAULT_TITLES[nextCategory]);
    setFieldValues(createInitialFieldValues());
    setSubmitError(null);
    setSubmitSuccess(null);
  };

  const resetForm = () => {
    applyTemplate('feedback');
  };

  const closeModal = () => {
    setIsModalOpen(false);
    resetForm();
  };

  // Opened from the quiet "Send feedback" link in the sidebar footer (desktop),
  // where the floating trigger no longer renders.
  useEffect(() => {
    const openFromSidebar = () => {
      applyTemplate('feedback');
      setIsModalOpen(true);
    };
    window.addEventListener('cr:open-feedback', openFromSidebar);
    return () => window.removeEventListener('cr:open-feedback', openFromSidebar);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setSubmitSuccess(null);

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setSubmitError('Enter a request title.');
      return;
    }

    const currentFields = CATEGORY_FIELDS[category];
    const hasAnyDetail = currentFields.some((field) => (fieldValues[field.key] || '').trim().length > 0);
    if (!hasAnyDetail) {
      setSubmitError('Fill in at least one detail field.');
      return;
    }

    const detailSections: string[] = [];
    for (const field of currentFields) {
      const value = (fieldValues[field.key] || '').trim();
      if (!value) continue;
      detailSections.push(`## ${field.label}`);
      detailSections.push(value);
      detailSections.push('');
    }

    const issueBody = [
      `## Request Type`,
      CATEGORY_LABELS[category],
      ``,
      ...detailSections
    ].join('\n');

    try {
      const params = new URLSearchParams({
        title: trimmedTitle,
        body: issueBody
      });
      const url = `${GITHUB_ISSUES_NEW_URL}?${params.toString()}`;
      const issueWindow = window.open(url, '_blank');

      if (!issueWindow) {
        setSubmitError('The popup was blocked. Allow popups and try again.');
        return;
      }
      issueWindow.opener = null;

      setSubmitSuccess('GitHub issue form opened in a new tab.');
      setTimeout(() => {
        closeModal();
      }, 400);
    } catch (_error) {
      setSubmitError('Could not open the GitHub issue form.');
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          resetForm();
          setIsModalOpen(true);
        }}
        className="hidden"
        aria-label="Send feedback"
        title="Send feedback"
      >
        <MessageCircle className="h-5 w-5" aria-hidden />
      </button>

      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Contact options"
        >
          <div
            className="absolute inset-0 bg-[#0F1419]/55 dark:bg-[#5B7083]/40"
            onClick={closeModal}
          />
          <div className="cr-card cr-enter relative max-h-[calc(100vh-2rem)] w-full max-w-xl overflow-y-auto rounded-2xl p-6 shadow-[var(--shadow-lift)] sm:p-8">
            <button
              type="button"
              onClick={closeModal}
              className="cr-control cr-focus absolute right-3 top-3 rounded-full p-2 text-[var(--cr-ink-3)] hover:bg-[var(--cr-muted)] hover:text-[var(--cr-ink)]"
              aria-label="Close"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>

            <h3 className="text-xl font-bold tracking-tight text-[var(--cr-ink)]">
              Send feedback
            </h3>
            <p className="mt-2 text-[13px] text-[var(--cr-ink-2)]">
              Choose a request type. Each option loads a short template.
            </p>

            <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => applyTemplate('feature_request')}
                  className={`cr-control cr-focus rounded-full border px-4 py-2 text-[13px] font-semibold ${
                    category === 'feature_request'
                      ? 'border-brand-600 bg-brand-50 text-brand-700 dark:border-brand-500 dark:bg-brand-950/40 dark:text-brand-300'
                      : 'border-[var(--cr-input-border)] text-[var(--cr-ink-2)] hover:bg-[var(--cr-muted)] hover:text-[var(--cr-ink)]'
                  }`}
                >
                  Add a feature
                </button>
                <button
                  type="button"
                  onClick={() => applyTemplate('feedback')}
                  className={`cr-control cr-focus rounded-full border px-4 py-2 text-[13px] font-semibold ${
                    category === 'feedback'
                      ? 'border-brand-600 bg-brand-50 text-brand-700 dark:border-brand-500 dark:bg-brand-950/40 dark:text-brand-300'
                      : 'border-[var(--cr-input-border)] text-[var(--cr-ink-2)] hover:bg-[var(--cr-muted)] hover:text-[var(--cr-ink)]'
                  }`}
                >
                  Provide feedback
                </button>
                <button
                  type="button"
                  onClick={() => applyTemplate('propose_new_metrics')}
                  className={`cr-control cr-focus rounded-full border px-4 py-2 text-[13px] font-semibold ${
                    category === 'propose_new_metrics'
                      ? 'border-brand-600 bg-brand-50 text-brand-700 dark:border-brand-500 dark:bg-brand-950/40 dark:text-brand-300'
                      : 'border-[var(--cr-input-border)] text-[var(--cr-ink-2)] hover:bg-[var(--cr-muted)] hover:text-[var(--cr-ink)]'
                  }`}
                >
                  Propose new metrics
                </button>
                <button
                  type="button"
                  onClick={() => applyTemplate('other')}
                  className={`cr-control cr-focus rounded-full border px-4 py-2 text-[13px] font-semibold ${
                    category === 'other'
                      ? 'border-brand-600 bg-brand-50 text-brand-700 dark:border-brand-500 dark:bg-brand-950/40 dark:text-brand-300'
                      : 'border-[var(--cr-input-border)] text-[var(--cr-ink-2)] hover:bg-[var(--cr-muted)] hover:text-[var(--cr-ink)]'
                  }`}
                >
                  Other
                </button>
              </div>

              <div>
                <label htmlFor="feedback-title" className="mb-1.5 block text-[13px] font-semibold text-[var(--cr-ink)]">
                  Request title
                </label>
                <input
                  id="feedback-title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={200}
                  placeholder={category === 'other' ? 'Enter your request title' : 'Template loaded — edit as needed'}
                  className="cr-focus h-10 w-full rounded-lg border border-[var(--cr-input-border)] bg-transparent px-3.5 text-[15px] text-[var(--cr-ink)] outline-none placeholder:text-[var(--cr-ink-3)]"
                  required
                />
              </div>

              {CATEGORY_FIELDS[category].map((field) => (
                <div key={field.key}>
                  <label htmlFor={`feedback-${field.key}`} className="mb-1.5 block text-[13px] font-semibold text-[var(--cr-ink)]">
                    {field.label}
                  </label>
                  {field.multiline ? (
                    <textarea
                      id={`feedback-${field.key}`}
                      value={fieldValues[field.key]}
                      onChange={(e) => setFieldValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                      maxLength={5000}
                      rows={field.rows ?? 3}
                      placeholder={field.placeholder}
                      className="cr-focus w-full rounded-lg border border-[var(--cr-input-border)] bg-transparent px-3.5 py-2.5 text-[15px] text-[var(--cr-ink)] outline-none placeholder:text-[var(--cr-ink-3)]"
                    />
                  ) : (
                    <input
                      id={`feedback-${field.key}`}
                      type="text"
                      value={fieldValues[field.key]}
                      onChange={(e) => setFieldValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                      maxLength={field.key === 'metric_name' ? 200 : 500}
                      placeholder={field.placeholder}
                      className="cr-focus h-10 w-full rounded-lg border border-[var(--cr-input-border)] bg-transparent px-3.5 text-[15px] text-[var(--cr-ink)] outline-none placeholder:text-[var(--cr-ink-3)]"
                    />
                  )}
                </div>
              ))}

              {submitError && (
                <p className="text-[13px] font-semibold text-rose-600 dark:text-rose-400">
                  {submitError}
                </p>
              )}

              {submitSuccess && (
                <p className="text-[13px] font-semibold text-emerald-700 dark:text-emerald-400">
                  {submitSuccess}
                </p>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={closeModal}
                  className="cr-btn cr-btn-secondary cr-focus h-10 px-5"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="cr-btn cr-btn-primary cr-focus h-10 px-5"
                >
                  Open GitHub issue
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};
