import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, ExternalLink, Heart } from 'lucide-react';
import { useNavigationState } from '../context/NavigationContext';
import { api } from '@shared/services/apiClient';
import { MetricReference, PredefinedMetric } from '@shared/types';

const FALLBACK_ACKNOWLEDGEMENTS: MetricReference[] = [
  {
    shortApa: 'Wu et al. (2022)',
    title: 'Anno-MI: A Dataset of Expert-Annotated Counselling Dialogues',
    citation: 'Wu, Z., Balloccu, S., Kumar, V., Helaoui, R., Reiter, E., Reforgiato Recupero, D., & Riboni, D. (2022). Anno-MI: A Dataset of Expert-Annotated Counselling Dialogues. In ICASSP 2022 - 2022 IEEE International Conference on Acoustics, Speech and Signal Processing (ICASSP) (pp. 6177-6181). IEEE. https://doi.org/10.1109/ICASSP43922.2022.9746035',
    url: 'https://doi.org/10.1109/ICASSP43922.2022.9746035'
  },
  {
    shortApa: 'Sharma et al. (2020)',
    title: 'Towards Understanding and Predicting Empathy in Spoken Conversations',
    citation: 'Sharma, A., Lin, I. W., Miner, A. S., Atkins, D. C., Althoff, T. (2020). Towards Understanding and Predicting Empathy in Spoken Conversations. Proceedings of EMNLP 2020.',
    url: 'https://aclanthology.org/2020.emnlp-main.425/'
  },
  {
    shortApa: 'Min et al. (2022)',
    title: 'PAIR: Prompt-Aware margIn Ranking for Counselor Reflection Scoring in Motivational Interviewing',
    citation: 'Min, D. J., Pérez-Rosas, V., Resnicow, K., & Mihalcea, R. (2022). PAIR. EMNLP 2022.',
    url: 'https://aclanthology.org/2022.emnlp-main.11/'
  },
  {
    shortApa: 'Liu et al. (2021)',
    title: 'Towards Emotional Support Dialog Systems (ESConv)',
    citation: 'Liu, S., et al. (2021). Towards Emotional Support Dialog Systems. ACL-IJCNLP 2021.',
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
    title: 'MedScore: Generalizable Factuality Evaluation of Free-Form Medical Answers by Domain-adapted Claim Decomposition and Verification',
    citation: 'Huang, H., DeLucia, A., Tiyyala, V. M., & Dredze, M. (2025). MedScore. arXiv.',
    url: 'https://arxiv.org/abs/2505.18452'
  },
  {
    shortApa: 'Poria et al. (2021)',
    title: 'Recognizing Emotion Cause in Conversations (RECCON)',
    citation: 'Poria, S., et al. (2021). Recognizing Emotion Cause in Conversations. Findings of ACL-IJCNLP 2021.',
    url: 'https://aclanthology.org/2021.findings-acl.288/'
  },
  {
    shortApa: 'Hartmann et al. (n.d.)',
    title: 'emotion-english-roberta-large model card',
    citation: 'Hartmann, J., et al. (n.d.). emotion-english-roberta-large [Model card]. Hugging Face.',
    url: 'https://huggingface.co/j-hartmann/emotion-english-roberta-large'
  },
  {
    shortApa: 'Hanu & Unitary. (2020)',
    title: 'Detoxify: A Python package for toxicity prediction',
    citation: 'Hanu, L., & Unitary team. (2020). Detoxify: A Python package for toxicity prediction.',
    url: 'https://github.com/unitaryai/detoxify'
  },
  {
    shortApa: 'Google. (n.d.)',
    title: 'Perspective API (Comment Analyzer)',
    citation: 'Google. (n.d.). Perspective API: Comment Analyzer.',
    url: 'https://developers.perspectiveapi.com/'
  }
];

const normalizeReference = (reference?: MetricReference | string): MetricReference | null => {
  if (!reference) return null;
  if (typeof reference === 'string') {
    return { shortApa: reference, citation: reference };
  }
  return reference;
};

const dedupeAcknowledgements = (items: MetricReference[]): MetricReference[] => {
  const unique = new Map<string, MetricReference>();

  items.forEach((item) => {
    const key = (item.url || item.citation || item.title || item.shortApa || '').trim().toLowerCase();
    if (!key) return;
    if (!unique.has(key)) unique.set(key, item);
  });

  return Array.from(unique.values());
};

export const IntroPage: React.FC = () => {
  const navigate = useNavigate();
  const { markStepCompleted } = useNavigationState();
  const [acknowledgements, setAcknowledgements] = useState<MetricReference[]>(FALLBACK_ACKNOWLEDGEMENTS);
  const [expandedAccess, setExpandedAccess] = useState<'website' | 'extension' | 'cli'>('website');

  useEffect(() => {
    markStepCompleted(0);
  }, [markStepCompleted]);

  useEffect(() => {
    let isMounted = true;

    const loadAcknowledgements = async () => {
      try {
        const response = await api.get('/predefined_metrics/metrics');
        const metrics = (response.data?.metrics || []) as PredefinedMetric[];
        const refs = metrics
          .map((metric) => normalizeReference(metric.reference))
          .filter((ref): ref is MetricReference => ref !== null);
        const deduped = dedupeAcknowledgements(refs);
        if (isMounted && deduped.length > 0) {
          setAcknowledgements(deduped);
        }
      } catch (error) {
        console.warn('Using fallback acknowledgements; unable to fetch metric references.', error);
      }
    };

    loadAcknowledgements();
    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <section className="relative overflow-hidden rounded-2xl border border-slate-200/80 dark:border-slate-700/70 bg-gradient-to-br from-indigo-600 via-sky-600 to-cyan-600 text-white shadow-xl">
        <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -bottom-20 -left-10 w-72 h-72 rounded-full bg-indigo-900/30 blur-3xl" />

        <div className="relative p-8 md:p-10 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-medium tracking-wide">
              Getting Started
            </div>
            <div className="mt-4 flex items-start gap-3">
              <img src="/logo.png" alt="CounselReflect Logo" className="w-12 h-12 rounded-lg object-contain bg-white/10 p-1.5" />
              <div>
                <h1 className="text-3xl md:text-4xl font-bold leading-tight">Welcome to CounselReflect</h1>
                <p className="mt-3 text-sm md:text-base text-cyan-50/95 leading-relaxed max-w-2xl">
                  Evaluate counseling conversations with predefined, literature-grounded, and custom metrics to assess quality,
                  safety, and therapeutic alignment.
                </p>
              </div>
            </div>
            <div className="mt-6">
              <button
                onClick={() => navigate('/setup')}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-lg font-semibold bg-white text-indigo-700 hover:bg-indigo-50 transition-colors shadow-md"
              >
                Start Setup
                <ArrowRight size={18} />
              </button>
            </div>
          </div>

          <div className="rounded-xl bg-slate-900/30 border border-white/20 backdrop-blur-sm p-5">
            <p className="text-xs uppercase tracking-wider text-cyan-100/90 font-semibold">Quick Flow</p>
            <ol className="mt-3 space-y-3 text-sm">
              <li className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-white/20 text-white font-semibold text-xs flex items-center justify-center">1</span>
                <div>
                  <p className="font-semibold">Setup</p>
                  <p className="text-cyan-100/90">Configure API, upload conversation, and consent.</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-white/20 text-white font-semibold text-xs flex items-center justify-center">2</span>
                <div>
                  <p className="font-semibold">Select Metrics</p>
                  <p className="text-cyan-100/90">Choose predefined, literature, or custom metrics.</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-white/20 text-white font-semibold text-xs flex items-center justify-center">3</span>
                <div>
                  <p className="font-semibold">Review Results</p>
                  <p className="text-cyan-100/90">Analyze score trends and metric-level insights.</p>
                </div>
              </li>
            </ol>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">How to Access</h2>
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">3 versions: Website / Extension / CLI</span>
        </div>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Click a version below to expand access details and recommended use cases.
        </p>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
          <button
            type="button"
            onClick={() => setExpandedAccess('website')}
            className={`rounded-lg border px-4 py-3 text-left transition-colors ${
              expandedAccess === 'website'
                ? 'border-indigo-400 bg-indigo-50 dark:border-indigo-500 dark:bg-indigo-900/20'
                : 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/40'
            }`}
          >
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Website</p>
            <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">Interactive dashboard.</p>
          </button>
          <button
            type="button"
            onClick={() => setExpandedAccess('extension')}
            className={`rounded-lg border px-4 py-3 text-left transition-colors ${
              expandedAccess === 'extension'
                ? 'border-emerald-400 bg-emerald-50 dark:border-emerald-500 dark:bg-emerald-900/20'
                : 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/40'
            }`}
          >
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Extension</p>
            <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">In-context browser auditing.</p>
          </button>
          <button
            type="button"
            onClick={() => setExpandedAccess('cli')}
            className={`rounded-lg border px-4 py-3 text-left transition-colors ${
              expandedAccess === 'cli'
                ? 'border-amber-400 bg-amber-50 dark:border-amber-500 dark:bg-amber-900/20'
                : 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/40'
            }`}
          >
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">CLI</p>
            <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">Scripted batch workflows.</p>
          </button>
        </div>

        <div className="mt-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 p-4">
          {expandedAccess === 'website' && (
            <>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Access</p>
              <p className="mt-1 text-xs text-slate-700 dark:text-slate-200">
                You are already in the website version. Continue directly with setup and evaluation.
              </p>
              <button
                onClick={() => navigate('/setup')}
                className="mt-3 inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
              >
                Open Setup
                <ArrowRight size={16} />
              </button>
              <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Best For</p>
              <ul className="mt-1 text-xs text-slate-700 dark:text-slate-200 list-disc pl-5 space-y-1">
                <li>Interactive exploration and visual dashboards.</li>
                <li>Detailed metric comparisons and per-turn analysis.</li>
              </ul>
            </>
          )}

          {expandedAccess === 'extension' && (
            <>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Access</p>
              <pre className="mt-1 text-[11px] leading-relaxed overflow-x-auto rounded-md bg-slate-900 text-slate-100 p-3">
{`make build-extension
# then open chrome://extensions
# enable Developer mode
# Load unpacked -> extension/dist`}
              </pre>
              <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Best For</p>
              <ul className="mt-1 text-xs text-slate-700 dark:text-slate-200 list-disc pl-5 space-y-1">
                <li>In-context auditing while using ChatGPT, Gemini, or Claude.</li>
                <li>Lightweight usage without leaving the conversation interface.</li>
              </ul>
            </>
          )}

          {expandedAccess === 'cli' && (
            <>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Access</p>
              <pre className="mt-1 text-[11px] leading-relaxed overflow-x-auto rounded-md bg-slate-900 text-slate-100 p-3">
{`make run-cli
# or:
# cd cli && python cli_tool.py`}
              </pre>
              <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Best For</p>
              <ul className="mt-1 text-xs text-slate-700 dark:text-slate-200 list-disc pl-5 space-y-1">
                <li>Batch processing and repeatable evaluation workflows.</li>
                <li>Automation in scripts and research pipelines.</li>
              </ul>
            </>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-gradient-to-br from-white via-slate-50/70 to-indigo-50/40 dark:from-slate-900 dark:via-slate-900 dark:to-indigo-950/10 p-6 shadow-sm">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
              <Heart className="w-5 h-5 text-indigo-600 dark:text-indigo-300" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Acknowledgements</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">With gratitude to the community</p>
            </div>
          </div>
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{acknowledgements.length} references</span>
        </div>
        <p className="mt-3 text-sm leading-relaxed font-medium text-indigo-700 dark:text-indigo-300">
          CounselReflect is made possible by prior research, open-source tools, and the people behind them. We deeply appreciate
          the authors and contributors below for advancing this space and enabling this work.
        </p>

        <ul className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          {acknowledgements.map((item, index) => (
            <li
              key={`${item.title || item.shortApa || item.citation || 'ack'}-${index}`}
              className="rounded-lg border border-slate-200/80 dark:border-slate-700 p-3 bg-white/80 dark:bg-slate-900/50 shadow-sm hover:shadow-md transition-shadow"
            >
              <p className="text-[11px] uppercase tracking-wide text-indigo-600 dark:text-indigo-300 font-semibold">
                {item.shortApa || 'Reference'}
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                {item.title || item.shortApa || 'Reference'}
              </p>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                {item.citation || 'Citation unavailable.'}
              </p>
              {item.url && (
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:underline break-all"
                >
                  View source
                  <ExternalLink size={12} />
                </a>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
};
