import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEvaluationState } from '@shared/context';
import { api } from '@shared/services/apiClient';
import { MetricReference, PredefinedMetric } from '@shared/types';
import { useNavigationState } from '../context/NavigationContext';

const CHROME_WEB_STORE_URL =
  'https://chromewebstore.google.com/detail/counselreflect/kkplffeneacdfjaonjhinlhconmdiibb';

const FALLBACK_REFERENCES: MetricReference[] = [
  {
    shortApa: 'Wu et al. (2022)',
    title: 'Anno-MI: A Dataset of Expert-Annotated Counselling Dialogues',
    citation: 'Wu, Z., et al. (2022). Anno-MI: A Dataset of Expert-Annotated Counselling Dialogues.',
    url: 'https://doi.org/10.1109/ICASSP43922.2022.9746035'
  },
  {
    shortApa: 'Sharma et al. (2020)',
    title: 'Towards Understanding and Predicting Empathy in Spoken Conversations',
    citation: 'Sharma, A., et al. (2020). Towards Understanding and Predicting Empathy in Spoken Conversations.',
    url: 'https://aclanthology.org/2020.emnlp-main.425/'
  },
  {
    shortApa: 'Min et al. (2022)',
    title: 'PAIR: Prompt-Aware margIn Ranking for Counselor Reflection Scoring',
    citation: 'Min, D. J., et al. (2022). PAIR.',
    url: 'https://aclanthology.org/2022.emnlp-main.11/'
  },
  {
    shortApa: 'Liu et al. (2021)',
    title: 'Towards Emotional Support Dialog Systems (ESConv)',
    citation: 'Liu, S., et al. (2021). Towards Emotional Support Dialog Systems.',
    url: 'https://aclanthology.org/2021.acl-long.269/'
  },
  {
    shortApa: 'Min et al. (2023)',
    title: 'FActScore: Fine-grained Atomic Evaluation of Factual Precision in Long Form Text Generation',
    citation: 'Min, S., et al. (2023). FActScore.',
    url: 'https://arxiv.org/abs/2305.14251'
  },
  {
    shortApa: 'Huang et al. (2025)',
    title: 'MedScore: Generalizable Factuality Evaluation of Free-Form Medical Answers',
    citation: 'Huang, H., et al. (2025). MedScore.',
    url: 'https://arxiv.org/abs/2505.18452'
  },
  {
    shortApa: 'Poria et al. (2021)',
    title: 'Recognizing Emotion Cause in Conversations (RECCON)',
    citation: 'Poria, S., et al. (2021). Recognizing Emotion Cause in Conversations.',
    url: 'https://aclanthology.org/2021.findings-acl.288/'
  },
  {
    shortApa: 'Hartmann et al. (n.d.)',
    title: 'emotion-english-roberta-large model card',
    citation: 'Hartmann, J., et al. emotion-english-roberta-large.',
    url: 'https://huggingface.co/j-hartmann/emotion-english-roberta-large'
  },
  {
    shortApa: 'Hanu & Unitary (2020)',
    title: 'Detoxify: A Python package for toxicity prediction',
    citation: 'Hanu, L., & Unitary team. (2020). Detoxify.',
    url: 'https://github.com/unitaryai/detoxify'
  },
  {
    shortApa: 'Google (n.d.)',
    title: 'Perspective API (Comment Analyzer)',
    citation: 'Google. Perspective API: Comment Analyzer.',
    url: 'https://developers.perspectiveapi.com/'
  }
];

const WORKFLOW = [
  ['01', 'Provide a transcript', 'Upload a de-identified counseling transcript.'],
  ['02', 'Select evaluation criteria', 'Select established measures or define custom rubrics.'],
  ['03', 'Review supporting evidence', 'Examine each finding alongside the relevant transcript turns.']
];

const normalizeReference = (reference?: MetricReference | string): MetricReference | null => {
  if (!reference) return null;
  return typeof reference === 'string' ? { shortApa: reference, citation: reference } : reference;
};

const dedupeReferences = (references: MetricReference[]) => {
  const unique = new Map<string, MetricReference>();
  references.forEach((reference) => {
    const key = (reference.url || reference.citation || reference.title || reference.shortApa || '').trim().toLowerCase();
    if (key && !unique.has(key)) unique.set(key, reference);
  });
  return Array.from(unique.values());
};

const SketchArrow: React.FC<{ className?: string }> = ({ className = 'h-4 w-5' }) => (
  <svg viewBox="0 0 24 16" fill="none" className={className} aria-hidden>
    <path
      d="M2.2 8.4c4.2-.3 8.5-.4 14.8-.2M13.8 3.4c1.8 1.7 3.6 3.2 5.2 4.7-1.7 1.5-3.2 3.1-4.8 4.7"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const PencilUnderline: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg viewBox="0 0 520 14" preserveAspectRatio="none" className={className} fill="none" aria-hidden>
    <path
      d="M3 6.9c58-2.4 119-1.1 177-.5 83 .8 164-2.2 337-.2"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
    />
    <path
      d="M23 10.5c82-1.6 174-.8 254-.9 75-.1 147-1.4 217-.5"
      stroke="currentColor"
      strokeWidth="1"
      strokeLinecap="round"
      opacity=".34"
    />
  </svg>
);

const PencilRule: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg viewBox="0 0 640 10" preserveAspectRatio="none" className={className} fill="none" aria-hidden>
    <path
      d="M2 4.7c95-1.7 182 .8 279-.1 125-1.1 236-1 357 .2"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    />
    <path
      d="M15 7.3c78-1 170 .5 248-.2 121-1 237-.4 360 .3"
      stroke="currentColor"
      strokeWidth=".9"
      strokeLinecap="round"
      opacity=".3"
    />
  </svg>
);

const NumberUnderline: React.FC = () => (
  <svg viewBox="0 0 32 7" className="absolute -bottom-0.5 -left-1 h-2 w-9 text-[#2468cf]" fill="none" aria-hidden>
    <path d="M2 3.7c8.7-1.2 18.2-.9 28-.2M7 5.6c6.3-.7 12.8-.6 19.4-.2" stroke="currentColor" strokeWidth="1.15" strokeLinecap="round" />
  </svg>
);

const ReferenceStackSketch: React.FC = () => (
  <svg viewBox="0 0 68 52" fill="none" className="h-12 w-16 text-[#2468cf]" aria-hidden>
    <path d="M12.5 10.4c12.1-1.1 25.2-.8 37.8.5.5 9.8.2 19.4-1 28.9-12 1-24.3.8-36.7-.5-.7-9.7-.8-19.5-.1-28.9Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    <path d="M17.4 6.2c12.2-1.1 25.5-.6 38.8.9.6 9 .4 18-.5 26.7M8.8 15.4c-.4 9.3-.1 18.4.8 27.1 10.8 1.4 21.6 1.8 32.5 1.2" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" opacity=".55" />
    <path d="M20.2 20.3c6.4-.4 13.2-.3 20.1.3M19.8 27.2c8.2-.4 16.3-.2 23.8.5M20 34.1c5.1-.2 10-.1 14.8.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const DisclosureSketch: React.FC = () => (
  <svg viewBox="0 0 34 34" fill="none" className="h-8 w-8" aria-hidden>
    <path
      d="M5.2 16.9c7.4-.4 15.1-.3 23.5.1M17.3 5.8c-.4 7.1-.3 14.6.1 22.5"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    />
    <path
      d="M4.6 18.6c7.9-.2 15.9-.1 24 .2"
      stroke="currentColor"
      strokeWidth=".8"
      strokeLinecap="round"
      opacity=".38"
    />
  </svg>
);

const ExtensionSketch: React.FC = () => (
  <svg viewBox="0 0 112 78" fill="none" className="h-[70px] w-[100px]" aria-hidden>
    <path
      d="M8.2 9.8c29.5-1.7 59.9-1.2 93.8.7 1.2 18.7.8 37.5-1.1 56.4-30.4 1.5-61.4 1.2-92.7-.8-1.3-18.8-1.3-37.6 0-56.3Z"
      stroke="var(--cr-sketch-ink)"
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
    <path
      d="M8.7 20.4c30.8-.8 61.7-.4 92.7.9"
      stroke="var(--cr-sketch-ink)"
      strokeWidth="1.35"
      strokeLinecap="round"
      opacity=".65"
    />
    <path d="M15.1 15.1h.2M20.3 15.2h.2M25.6 15.4h.2" stroke="var(--cr-sketch-coral)" strokeWidth="2.7" strokeLinecap="round" />
    <path
      d="M72.2 21.2c.5 14.4.3 29.3-.8 44.8M78.7 30.7c5.3-.4 10.9-.2 16.5.5M78.5 38.4c4.1-.3 8.5-.1 13 .4M78.3 53.8c5.8-.2 11.3-.1 16.3.4"
      stroke="#2468cf"
      strokeWidth="1.65"
      strokeLinecap="round"
    />
    <path
      d="M78.2 47.8c2.2-2.2 4.2-3.5 6-3.8 2.2-.4 3.7 2.1 5.8 1.7 1.5-.3 3-2 4.7-4"
      stroke="var(--cr-brand-leaf)"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M17 31.1c11.2-1.1 22.9-.6 35.2 1.2.8 4.6.7 9.2-.3 13.6-11.4 1-22.8.6-34.6-1-.8-4.4-.9-9-.3-13.8ZM28.8 50.5c10.5-.7 21.7-.3 33.6 1.1.6 4 .4 7.8-.5 11.5-11 .8-21.9.5-32.8-.9-.7-3.9-.8-7.8-.3-11.7Z"
      stroke="var(--cr-sketch-ink)"
      strokeWidth="1.4"
      strokeLinejoin="round"
      opacity=".78"
    />
  </svg>
);

export const IntroPage: React.FC = () => {
  const navigate = useNavigate();
  const { conversation, resetEvaluation } = useEvaluationState();
  const { markStepCompleted, canNavigateTo } = useNavigationState();
  const [references, setReferences] = useState<MetricReference[]>(FALLBACK_REFERENCES);

  useEffect(() => {
    markStepCompleted(0);
  }, [markStepCompleted]);

  useEffect(() => {
    // A synthetic sample is a disposable practice state, not an unfinished
    // user review. Returning Home ends that practice state so both the Home
    // workflow and Setup start from the neutral transcript chooser.
    if (conversation?.id.startsWith('sample-')) resetEvaluation();
  }, [conversation?.id, resetEvaluation]);

  useEffect(() => {
    let active = true;

    const loadReferences = async () => {
      try {
        const response = await api.get('/predefined_metrics/metrics');
        const metrics = (response.data?.metrics || []) as PredefinedMetric[];
        const available = dedupeReferences(
          metrics
            .map((metric) => normalizeReference(metric.reference))
            .filter((reference): reference is MetricReference => reference !== null)
        );
        if (active && available.length > 0) setReferences(available);
      } catch {
        // The complete fallback list keeps the bibliography available offline.
      }
    };

    void loadReferences();
    return () => {
      active = false;
    };
  }, []);

  const isSyntheticSample = conversation?.id.startsWith('sample-') ?? false;
  const canOpenReport = !isSyntheticSample && canNavigateTo(3);
  const canContinueReview = !isSyntheticSample && canNavigateTo(2);
  const primaryPath = canOpenReport ? '/results' : canContinueReview ? '/configure' : '/setup';
  const primaryLabel = canOpenReport
    ? 'Open the latest report'
    : canContinueReview
      ? `Continue ${conversation?.title?.trim() || 'this review'}`
      : 'Choose a transcript';

  const handlePrimaryAction = () => {
    // Synthetic samples are practice material, not work the Home page should
    // present as an unfinished user review. Clear the demo before returning to
    // Setup so the user gets the neutral source chooser.
    if (isSyntheticSample) resetEvaluation();
    navigate(primaryPath);
  };

  return (
    <div className="cr-enter mx-auto max-w-[1080px] pb-12">
      <section className="pb-12 pt-2 lg:pb-16 lg:pt-8">
        <div className="max-w-[760px]">
          <h1 className="cr-page-title text-[38px] text-[var(--cr-ink)]">CounselReflect</h1>
          <div className="relative mt-5 max-w-[620px] pb-2">
            <p className="text-[24px] font-medium leading-[1.35] text-[#2468cf] sm:text-[27px]">
              Review counseling conversations with traceable evidence.
            </p>
            <PencilUnderline className="absolute -bottom-0.5 left-0 h-3 w-[92%] text-[#2468cf]" />
          </div>
          <p className="mt-4 max-w-[620px] text-[16px] leading-7 text-[var(--cr-ink-2)] sm:text-[17px]">
            Upload a de-identified transcript, select evaluation criteria, and review each finding
            alongside the transcript turns that informed it.
          </p>

          <button
            type="button"
            onClick={handlePrimaryAction}
            className="cr-control cr-focus mt-7 inline-flex h-11 max-w-full items-center gap-2 rounded-md bg-[#2468cf] px-5 text-sm font-semibold text-white hover:bg-[#1d58ad]"
          >
            <SketchArrow className="h-4 w-5 shrink-0" />
            <span className="truncate">{primaryLabel}</span>
          </button>
        </div>
      </section>

      <section className="pb-8 lg:ml-[8.333%]">
        <PencilRule className="h-2.5 w-full text-[color:var(--cr-card-border)]" />
        <ol className="mt-7 grid gap-7 md:grid-cols-3 md:gap-10">
          {WORKFLOW.map(([number, title, text]) => (
            <li key={number}>
              <p className="relative inline-block pb-1 text-[13px] font-semibold text-[#2468cf]">
                {number}
                <NumberUnderline />
              </p>
              <h2 className="mt-2 text-[15px] font-semibold text-[var(--cr-ink)]">{title}</h2>
              <p className="mt-1.5 text-[14px] leading-6 text-[var(--cr-ink-2)]">{text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-10 border-t border-[var(--cr-card-border)] pt-8">
        <div className="flex items-start justify-between gap-5">
          <h2 className="text-[21px] font-semibold text-[var(--cr-ink)]">Research basis</h2>
          <ReferenceStackSketch />
        </div>

        <details className="group mt-3">
          <summary className="cr-focus flex cursor-pointer list-none items-start justify-between gap-5 py-1 text-[15px] leading-6 text-[var(--cr-ink-2)] [&::-webkit-details-marker]:hidden">
            <span className="max-w-[760px]">
              We are grateful to the researchers and maintainers who made the papers, datasets,
              models, and code behind these metrics openly available.
            </span>
            <span className="mt-0.5 shrink-0 text-[#2468cf] transition-transform duration-200 group-open:rotate-45">
              <DisclosureSketch />
            </span>
          </summary>

          <div className="mt-7 grid gap-8 border-t border-dashed border-[var(--cr-card-border)] pt-7 lg:grid-cols-[230px_minmax(0,1fr)] lg:gap-12">
            <div>
              <p className="text-[14px] leading-6 text-[var(--cr-ink-2)]">
                The included metrics draw on published work in counseling dialogue, empathy,
                emotional support, factuality, and safety.
              </p>
              <p className="mt-6 text-xs text-[var(--cr-ink-3)]">
                {references.length} references used by included metrics
              </p>
            </div>

            <ol className="grid gap-x-10 md:grid-cols-2">
              {references.map((reference, index) => (
                <li key={`${reference.url || reference.citation}-${index}`} className="grid grid-cols-[28px_minmax(0,1fr)] gap-2 border-t border-[var(--cr-card-border)] py-3.5">
                  <span className="pt-0.5 text-xs tabular-nums text-[#2468cf]">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[var(--cr-ink-2)]">{reference.shortApa || 'Reference'}</p>
                    <p className="mt-1 text-[14px] leading-5 text-[var(--cr-ink)]">
                      {reference.title || reference.citation || 'Untitled reference'}
                    </p>
                    {reference.url && (
                      <a
                        href={reference.url}
                        target="_blank"
                        rel="noreferrer"
                        className="cr-focus mt-1.5 inline-block text-xs font-medium text-[#2468cf] hover:text-[#174f9f]"
                      >
                        View source ↗
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </details>
      </section>

      <section
        aria-labelledby="chrome-extension-title"
        className="mt-10 border-y border-[#cddcf3] bg-[#f3f7fd] px-5 py-6 sm:px-7"
      >
        <div className="grid items-center gap-5 sm:grid-cols-[100px_minmax(0,1fr)_auto] sm:gap-7">
          <ExtensionSketch />
          <div>
            <p className="text-xs font-semibold text-[#2468cf]">Browser extension</p>
            <h2 id="chrome-extension-title" className="mt-1 text-[19px] font-semibold text-[var(--cr-ink)]">
              Use CounselReflect beside the conversation.
            </h2>
            <p className="mt-1.5 max-w-[570px] text-[14px] leading-6 text-[var(--cr-ink-2)]">
              Review conversations in ChatGPT, Claude, and Gemini from an in-page sidebar.
            </p>
          </div>
          <a
            href={CHROME_WEB_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="cr-control cr-focus inline-flex h-10 w-fit items-center gap-2 rounded-md bg-[#2468cf] px-4 text-sm font-semibold text-white hover:bg-[#1d58ad]"
          >
            Add to Chrome
            <SketchArrow className="h-3.5 w-5" />
          </a>
        </div>
      </section>

      <footer className="mt-10 flex flex-col gap-3 border-t border-[var(--cr-card-border)] pt-5 text-[13px] text-[var(--cr-ink-2)] sm:flex-row sm:items-center sm:justify-between">
        <p>Built for web, browser, and command-line workflows.</p>
        <div className="flex flex-wrap gap-x-5 gap-y-2 font-semibold text-[#2468cf]">
          <a href="https://github.com/counselreflectteam/CounselReflect/tree/main/extension" target="_blank" rel="noreferrer" className="cr-focus hover:text-[#174f9f]">
            Extension source ↗
          </a>
          <a href="https://github.com/counselreflectteam/CounselReflect" target="_blank" rel="noreferrer" className="cr-focus hover:text-[#174f9f]">
            Source code ↗
          </a>
        </div>
      </footer>
    </div>
  );
};
