import { useEffect, useRef, type RefObject } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check } from 'lucide-react';
import { APIConfiguration } from '../components/config/APIConfiguration';
import { InputSection } from '../components/config/InputSection';
import { PencilRule, SketchArrow, TranscriptSketch } from '../components/design/NotebookMarks';
import { useAuth } from '@shared/context';
import { useEvaluationState } from '@shared/context';
import { useNavigationState } from '../context/NavigationContext';
import { MarkerHighlight } from '@shared/components/design/MarkerHighlight';
import { isProviderReady } from '../utils/providerReadiness';

export const SetupPage = () => {
  const navigate = useNavigate();
  const {
    apiKeys,
    selectedProvider,
    selectedModel,
    serverKeyStatus,
    hasValidatedApiKey
  } = useAuth();
  const { conversation } = useEvaluationState();
  const { markStepCompleted, hasUserConsent, setHasUserConsent } = useNavigationState();
  const providerSectionRef = useRef<HTMLElement | null>(null);
  const transcriptSectionRef = useRef<HTMLElement | null>(null);
  const consentSectionRef = useRef<HTMLElement | null>(null);

  const providerSetupReady = isProviderReady({
    selectedProvider,
    selectedModel,
    apiKeys,
    serverKeyStatus,
    hasValidatedApiKey
  });
  const hasConversation = Boolean(conversation?.messages.length);
  const canProceed = providerSetupReady && hasConversation && hasUserConsent;
  const completedSteps = [providerSetupReady, hasConversation, hasUserConsent].filter(Boolean).length;

  useEffect(() => {
    if (canProceed) {
      markStepCompleted(1);
    }
  }, [canProceed, markStepCompleted]);

  const handleNext = () => {
    if (!canProceed) return;
    markStepCompleted(1);
    navigate('/configure');
  };

  // First unfinished section, so the footer can say exactly what to do next
  // instead of silently withholding the continue button.
  const missingSections: { label: string; ref: RefObject<HTMLElement | null> }[] = [];
  if (!providerSetupReady) {
    missingSections.push({ label: 'Verify a provider API key', ref: providerSectionRef });
  }
  if (!hasConversation) {
    missingSections.push({ label: 'Add a transcript', ref: transcriptSectionRef });
  }
  if (!hasUserConsent) {
    missingSections.push({ label: 'Confirm the data terms', ref: consentSectionRef });
  }
  const nextMissing = missingSections[0];

  const scrollToSection = (section: RefObject<HTMLElement | null>) => {
    section.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Right-side status on the opener's baseline row — canvas typography,
  // emerald when complete, quiet ink-2 otherwise. Never a pill.
  const SectionStatus = ({ complete, detail }: { complete: boolean; detail: string }) => {
    return (
      <span
        className={`ml-auto inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs font-medium tabular-nums ${
          complete ? 'text-emerald-700 dark:text-emerald-400' : 'text-[var(--cr-ink-2)]'
        }`}
      >
        {complete && <Check className="h-3.5 w-3.5" aria-hidden />}
        {detail}
      </span>
    );
  };

  return (
    <div className="cr-enter mx-auto max-w-6xl pb-40 md:pb-24">
      <header className="grid gap-7 pb-12 sm:grid-cols-[minmax(0,1fr)_100px] sm:items-start lg:pb-14">
        <div>
          <p className="cr-kicker">Review setup</p>
          <h1 className="cr-page-title mt-2 text-[32px] text-[var(--cr-ink)] md:text-[36px]">
            Prepare a conversation for review
          </h1>
          <p className="mt-3 max-w-2xl text-[16px] leading-7 text-[var(--cr-ink-2)]">
            Select an analysis provider, provide a de-identified transcript, and confirm the data-use terms.
          </p>

          <nav className="mt-7 max-w-2xl" aria-label="Review setup sections">
            <PencilRule className="h-2.5 w-full text-[var(--cr-card-border)]" />
            <ol className="mt-3 grid grid-cols-3 gap-3 text-left">
              {[
                { label: 'Provider', ready: providerSetupReady, ref: providerSectionRef },
                { label: 'Transcript', ready: hasConversation, ref: transcriptSectionRef },
                { label: 'Data terms', ready: hasUserConsent, ref: consentSectionRef }
              ].map((step, index) => (
                <li key={step.label}>
                  <button
                    type="button"
                    onClick={() => scrollToSection(step.ref)}
                    className="cr-focus group flex w-full items-center gap-2 py-1 text-left"
                  >
                    <span className={`text-xs font-semibold tabular-nums ${step.ready ? 'text-[var(--cr-brand-leaf)]' : 'text-[var(--cr-brand-primary)]'}`}>
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <span className="truncate text-[13px] font-semibold text-[var(--cr-ink-2)] group-hover:text-[var(--cr-ink)]">
                      {step.label}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
            <p className="mt-3 text-xs text-[var(--cr-ink-3)]">{completedSteps} of 3 complete</p>
          </nav>
        </div>
        <TranscriptSketch className="hidden h-24 w-24 text-[var(--cr-brand-primary)] sm:block" />
      </header>

      <section ref={providerSectionRef} className="scroll-mt-24 pb-14">
        <header>
          <PencilRule className="h-2.5 w-full text-[var(--cr-card-border)]" />
          <div className="mt-4 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
            <div className="flex items-baseline gap-3">
              <span className="text-xs font-semibold text-[var(--cr-brand-primary)]">01</span>
              <h2 className="cr-section-title min-w-0 text-lg md:text-xl">Analysis provider</h2>
            </div>
            <SectionStatus
              complete={providerSetupReady}
              detail={providerSetupReady ? `Ready — ${selectedProvider} · ${selectedModel}` : 'Required'}
            />
          </div>
        </header>
        <div className="cr-module mt-5 p-5 md:p-6">
          <APIConfiguration />
        </div>
      </section>

      <section ref={transcriptSectionRef} className="scroll-mt-24 pb-14">
        <header>
          <PencilRule className="h-2.5 w-full text-[var(--cr-card-border)]" />
          <div className="mt-4 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
            <div className="flex items-baseline gap-3">
              <span className="text-xs font-semibold text-[var(--cr-brand-primary)]">02</span>
              <h2 className="cr-section-title min-w-0 text-lg md:text-xl">Transcript to review</h2>
            </div>
            <SectionStatus
              complete={hasConversation}
              detail={hasConversation ? `${conversation?.messages.length || 0} turns` : 'Required'}
            />
          </div>
        </header>
        <div className="mt-5">
          <InputSection />
        </div>
      </section>

      <section ref={consentSectionRef} className="scroll-mt-24 pb-14">
        <header>
          <PencilRule className="h-2.5 w-full text-[var(--cr-card-border)]" />
          <div className="mt-4 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
            <div className="flex items-baseline gap-3">
              <span className="text-xs font-semibold text-[var(--cr-brand-primary)]">03</span>
              <h2 className="cr-section-title min-w-0 text-lg md:text-xl">Data use and authorization</h2>
            </div>
            <SectionStatus
              complete={hasUserConsent}
              detail={hasUserConsent ? 'Accepted' : 'Required'}
            />
          </div>
        </header>

        <div className="cr-module mt-5 overflow-hidden">
          <ol className="divide-y divide-[var(--cr-card-border)] px-5 md:px-6">
            {[
              ['01', 'De-identification required', 'Remove names and details that could identify a person.'],
              ['02', 'External model processing', 'Text is sent to the model provider selected above.'],
              ['03', 'Research-use limitations', 'CounselReflect is not a clinical or HIPAA-covered service.']
            ].map(([number, title, description]) => (
              <li key={number} className="grid gap-1 py-4 sm:grid-cols-[36px_180px_minmax(0,1fr)] sm:items-baseline sm:gap-4">
                <span className="text-xs font-semibold text-[var(--cr-brand-primary)]">{number}</span>
                <span className="text-sm font-semibold text-[var(--cr-ink)]">{title}</span>
                <span className="text-[13px] leading-5 text-[var(--cr-ink-2)]">{description}</span>
              </li>
            ))}
          </ol>

          <details className="border-t border-[var(--cr-card-border)]">
            <summary className="cr-focus cursor-pointer px-5 py-4 text-sm font-semibold text-[var(--cr-ink)] md:px-6">
              Review the full data and consent terms
            </summary>
            <div className="max-h-[360px] space-y-4 overflow-y-auto border-t border-[var(--cr-card-border)] px-5 py-5 text-[15px] leading-relaxed text-[var(--cr-ink-2)] md:px-6">
          <p className="font-bold text-[var(--cr-ink)]">CounselReflect consent form</p>
          <p>Read this information carefully before using CounselReflect.</p>
          <p>
            CounselReflect is a research toolkit designed to support the auditing and evaluation of mental-health and counseling dialogues.
            By continuing to use this toolkit, you acknowledge that you have read, understood, and agreed to the terms described below.
          </p>

          <div>
            <p className="font-bold text-[var(--cr-ink)]">Use of third-party models</p>
            <p>
              CounselReflect relies on third-party artificial intelligence models, including large language models such as ChatGPT, to analyze and
              generate feedback on counseling dialogues. These models are developed and operated by external providers and are not controlled by
              the CounselReflect research team.
            </p>
          </div>

          <div>
            <p className="font-bold text-[var(--cr-ink)]">Data you provide</p>
            <p>
              If you choose to use CounselReflect, you may enter or upload text from counseling or mental-health dialogues, such as transcripts or excerpts.
              By continuing to use the toolkit, you acknowledge and agree that:
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>The text you provide will be processed by third-party models (e.g., ChatGPT) to generate feedback or analysis.</li>
              <li>Your input may be transmitted to and processed on external servers operated by these third-party providers, in accordance with their respective terms of service and privacy policies.</li>
            </ul>
          </div>

          <div>
            <p className="font-bold text-[var(--cr-ink)]">Data storage and retention</p>
            <p>
              CounselReflect does not persist transcripts or results on the analysis server. To support refresh during a review,
              the current tab temporarily keeps the transcript and completed results in browser session storage. Removing the
              transcript or closing the tab clears this browser copy.
            </p>
            <p>
              Note that third-party model providers may have their own data handling and retention practices, which are governed by their respective privacy policies.
            </p>
          </div>

          <div>
            <p className="font-bold text-[var(--cr-ink)]">HIPAA notice</p>
            <p>
              CounselReflect is not a HIPAA-covered service and is not designed to store, transmit, or process Protected Health Information (PHI) under the Health Insurance
              Portability and Accountability Act (HIPAA). You should not submit information that you would expect to be protected under HIPAA or that you consider to be PHI.
            </p>
          </div>

          <div>
            <p className="font-bold text-[var(--cr-ink)]">Voluntary use</p>
            <p>
              Your use of CounselReflect is entirely voluntary. You may stop using the toolkit at any time. You should not enter any information that you do not wish to be processed
              by third-party AI services.
            </p>
          </div>

          <div>
            <p className="font-bold text-[var(--cr-ink)]">Privacy considerations</p>
            <p>
              While reasonable measures are taken to minimize data exposure within CounselReflect, the use of third-party AI models means that absolute confidentiality cannot be guaranteed.
              You are strongly encouraged to avoid including directly identifying information (such as names, addresses, or other personal identifiers) in any text you submit.
            </p>
          </div>

          <div>
            <p className="font-bold text-[var(--cr-ink)]">Not a clinical tool</p>
            <p>
              CounselReflect is a research and evaluation tool and is not intended to provide medical, psychological, or therapeutic advice, diagnosis, or treatment.
              It does not replace professional clinical judgment or care.
            </p>
          </div>

          <div>
            <p className="font-bold text-[var(--cr-ink)]">Consent</p>
            <p>By continuing to use CounselReflect, you indicate that:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>You understand that the toolkit uses third-party AI models;</li>
              <li>You understand that the analysis server does not persist transcripts, while the current tab temporarily keeps this review in browser session storage;</li>
              <li>You understand that CounselReflect is not HIPAA-covered;</li>
              <li>You consent to the processing of the text you provide by third-party models for research and evaluation purposes; and</li>
              <li>You agree to participate under the terms described above.</li>
            </ul>
          </div>
            </div>
          </details>
        </div>

        <label className="mt-4 flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={hasUserConsent}
            onChange={(event) => setHasUserConsent(event.target.checked)}
            className="cr-focus mt-0.5 h-4 w-4 rounded-md border-[var(--cr-input-border)] accent-brand-600"
          />
          <span className="text-sm leading-6 text-[var(--cr-ink)]">
            I am authorized to use this transcript, have{' '}
            <MarkerHighlight tone="cyan">removed identifying information,</MarkerHighlight>{' '}
            and consent to sending it to {selectedProvider} for analysis.
          </span>
        </label>
      </section>

      <div
        className={`fixed inset-x-3 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-40 mx-auto max-w-3xl rounded-md border border-[var(--cr-card-border)] border-l-[3px] ${
          canProceed ? 'border-l-[var(--cr-brand-primary)]' : 'border-l-[var(--cr-card-border)]'
        } bg-[var(--cr-card)] px-5 py-3 md:bottom-3`}
      >
        <div className="flex items-center justify-between gap-3">
          {canProceed ? (
            <p className="inline-flex items-center gap-1.5 text-sm font-bold text-green-700 dark:text-green-400">
              <Check className="h-3.5 w-3.5" aria-hidden />
              Setup complete
            </p>
          ) : (
            <p className="min-w-0 truncate text-sm text-[var(--cr-ink-2)]">
              {`${completedSteps} of 3 done — next: `}
              <button
                type="button"
                onClick={() => nextMissing && scrollToSection(nextMissing.ref)}
                className="cr-link cr-focus font-medium"
              >
                {nextMissing?.label}
              </button>
            </p>
          )}
          <button
            type="button"
            onClick={() => (canProceed ? handleNext() : nextMissing && scrollToSection(nextMissing.ref))}
            aria-disabled={!canProceed}
            title={canProceed ? undefined : `To continue: ${nextMissing?.label ?? ''}`}
            className={`cr-btn cr-btn-primary cr-focus h-9 shrink-0 px-4 ${
              canProceed ? '' : 'cursor-not-allowed opacity-45'
            }`}
          >
            Select evaluation criteria
            <SketchArrow className="h-3.5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
};
