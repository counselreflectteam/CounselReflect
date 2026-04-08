import React, { useState } from 'react';
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setSubmitSuccess(null);

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setSubmitError('Please fill in the request title.');
      return;
    }

    const currentFields = CATEGORY_FIELDS[category];
    const hasAnyDetail = currentFields.some((field) => (fieldValues[field.key] || '').trim().length > 0);
    if (!hasAnyDetail) {
      setSubmitError('Please fill in at least one detail field.');
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
        setSubmitError('Popup was blocked. Please allow popups and try again.');
        return;
      }
      issueWindow.opener = null;

      setSubmitSuccess('GitHub issue form opened in a new tab.');
      setTimeout(() => {
        closeModal();
      }, 400);
    } catch (_error) {
      setSubmitError('Failed to open GitHub issue form.');
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
        className="group fixed bottom-24 right-4 z-40 h-14 w-14 md:bottom-6 md:right-6 rounded-full bg-blue-600 text-white shadow-lg shadow-blue-600/30 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-100 dark:focus:ring-offset-slate-950 transition-all duration-200 flex items-center justify-center"
        aria-label="Contact us with feedback"
        title="Contact us"
      >
        <MessageCircle className="h-6 w-6" />
        <span className="pointer-events-none absolute right-16 top-1/2 -translate-y-1/2 whitespace-nowrap rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white opacity-0 group-hover:opacity-100 transition-opacity">
          Contact us
        </span>
      </button>

      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Contact options"
        >
          <div
            className="absolute inset-0 bg-slate-900/55"
            onClick={closeModal}
          />
          <div className="relative w-full max-w-xl rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl p-6">
            <button
              type="button"
              onClick={closeModal}
              className="absolute right-3 top-3 p-1 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>

            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              We would love to hear from you
            </h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Choose a request type below. We provide templates to help you fill in quickly.
            </p>

            <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => applyTemplate('feature_request')}
                  className={`rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
                    category === 'feature_request'
                      ? 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-900/25 dark:text-blue-300'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                  }`}
                >
                  Add a feature
                </button>
                <button
                  type="button"
                  onClick={() => applyTemplate('feedback')}
                  className={`rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
                    category === 'feedback'
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:border-emerald-400 dark:bg-emerald-900/25 dark:text-emerald-300'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                  }`}
                >
                  Provide feedback
                </button>
                <button
                  type="button"
                  onClick={() => applyTemplate('propose_new_metrics')}
                  className={`rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
                    category === 'propose_new_metrics'
                      ? 'border-violet-500 bg-violet-50 text-violet-700 dark:border-violet-400 dark:bg-violet-900/25 dark:text-violet-300'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                  }`}
                >
                  Propose new metrics
                </button>
                <button
                  type="button"
                  onClick={() => applyTemplate('other')}
                  className={`rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
                    category === 'other'
                      ? 'border-slate-500 bg-slate-100 text-slate-800 dark:border-slate-400 dark:bg-slate-700 dark:text-slate-100'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                  }`}
                >
                  Other
                </button>
              </div>

              <div>
                <label htmlFor="feedback-title" className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                  Request Title
                </label>
                <input
                  id="feedback-title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={200}
                  placeholder={category === 'other' ? 'Enter your request title' : 'Template loaded - edit as needed'}
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              {CATEGORY_FIELDS[category].map((field) => (
                <div key={field.key}>
                  <label htmlFor={`feedback-${field.key}`} className="block text-sm font-medium text-slate-700 dark:text-slate-200">
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
                      className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  ) : (
                    <input
                      id={`feedback-${field.key}`}
                      type="text"
                      value={fieldValues[field.key]}
                      onChange={(e) => setFieldValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                      maxLength={field.key === 'metric_name' ? 200 : 500}
                      placeholder={field.placeholder}
                      className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  )}
                </div>
              ))}

              {submitError && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-900/25 dark:text-rose-300">
                  {submitError}
                </div>
              )}

              {submitSuccess && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/25 dark:text-emerald-300">
                  {submitSuccess}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 pt-1">
                <button
                  type="button"
                  onClick={closeModal}
                  className="rounded-lg px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg px-4 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 transition-colors"
                >
                  Submit GitHub Issue
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};
