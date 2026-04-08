import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Settings, Upload, ShieldAlert } from 'lucide-react';
import { APIConfiguration } from '../components/config/APIConfiguration';
import { InputSection } from '../components/config/InputSection';
import { useAuth } from '@shared/context';
import { useEvaluationState } from '@shared/context';
import { useNavigationState } from '../context/NavigationContext';

export const SetupPage = () => {
  const navigate = useNavigate();
  const { hasValidatedApiKey } = useAuth();
  const { conversation } = useEvaluationState();
  const { markStepCompleted, hasUserConsent, setHasUserConsent } = useNavigationState();

  // Require validated API key, conversation, and explicit consent to proceed
  const canProceed = hasValidatedApiKey && conversation !== null && hasUserConsent;

  // Auto-mark step 1 as completed when setup requirements are met
  // This persists across page refreshes so the sidebar icon stays green
  useEffect(() => {
    if (canProceed) {
      markStepCompleted(1);
    }
  }, [canProceed, markStepCompleted]);

  const handleNext = () => {
    if (canProceed) {
      markStepCompleted(1);
      navigate('/configure');
    }
  };

  const requirementHint = !hasValidatedApiKey
    ? 'Validate an API key to continue.'
    : conversation === null
      ? 'Upload a conversation to continue.'
      : !hasUserConsent
        ? 'Please review and agree to the user consent form to continue.'
        : null;

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* API Configuration Card */}
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm p-6 transition-colors duration-300">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center">
            <Settings className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">API Configuration</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">Select your LLM provider and configure API keys</p>
          </div>
        </div>
        <APIConfiguration />
      </div>

      {/* Conversation Upload Card */}
      <div className={`bg-white dark:bg-slate-900 rounded-xl shadow-sm p-6 transition-all duration-300 ${
        !hasValidatedApiKey ? 'opacity-50 pointer-events-none' : ''
      }`}>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center">
            <Upload className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Upload Conversation</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {hasValidatedApiKey 
                ? 'Load a therapy conversation to evaluate' 
                : 'Validate an API key above to enable conversation upload'}
            </p>
          </div>
        </div>
        <InputSection />
      </div>

      {/* User Consent Form */}
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm p-6 transition-colors duration-300">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center">
            <ShieldAlert className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">User Consent Form</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">Required before continuing to metric selection</p>
          </div>
        </div>

        <div className="max-h-[360px] overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 p-4 space-y-4 text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
          <p><strong>User Consent Form – CounselReflect</strong></p>
          <p>Please read this information carefully before using CounselReflect.</p>
          <p>
            CounselReflect is a research toolkit designed to support the auditing and evaluation of mental-health and counseling dialogues.
            By continuing to use this toolkit, you acknowledge that you have read, understood, and agreed to the terms described below.
          </p>

          <div>
            <p className="font-semibold">Use of Third-Party Models</p>
            <p>
              CounselReflect relies on third-party artificial intelligence models, including large language models such as ChatGPT, to analyze and
              generate feedback on counseling dialogues. These models are developed and operated by external providers and are not controlled by
              the CounselReflect research team.
            </p>
          </div>

          <div>
            <p className="font-semibold">Data You Provide</p>
            <p>
              If you choose to use CounselReflect, you may enter or upload text from counseling or mental-health dialogues, such as transcripts or excerpts.
              By continuing to use the toolkit, you acknowledge and agree that:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>The text you provide will be processed by third-party models (e.g., ChatGPT) to generate feedback or analysis.</li>
              <li>Your input may be transmitted to and processed on external servers operated by these third-party providers, in accordance with their respective terms of service and privacy policies.</li>
            </ul>
          </div>

          <div>
            <p className="font-semibold">Data Storage and Retention</p>
            <p>
              CounselReflect does not store, log, or retain the text you enter or upload. All processing occurs transiently for the purpose of generating feedback,
              and no counseling transcripts or user inputs are saved by the CounselReflect system.
            </p>
            <p>
              Please note that third-party model providers may have their own data handling and retention practices, which are governed by their respective privacy policies.
            </p>
          </div>

          <div>
            <p className="font-semibold">HIPAA Notice</p>
            <p>
              CounselReflect is not a HIPAA-covered service and is not designed to store, transmit, or process Protected Health Information (PHI) under the Health Insurance
              Portability and Accountability Act (HIPAA). You should not submit information that you would expect to be protected under HIPAA or that you consider to be PHI.
            </p>
          </div>

          <div>
            <p className="font-semibold">Voluntary Use</p>
            <p>
              Your use of CounselReflect is entirely voluntary. You may stop using the toolkit at any time. You should not enter any information that you do not wish to be processed
              by third-party AI services.
            </p>
          </div>

          <div>
            <p className="font-semibold">Privacy Considerations</p>
            <p>
              While reasonable measures are taken to minimize data exposure within CounselReflect, the use of third-party AI models means that absolute confidentiality cannot be guaranteed.
              You are strongly encouraged to avoid including directly identifying information (such as names, addresses, or other personal identifiers) in any text you submit.
            </p>
          </div>

          <div>
            <p className="font-semibold">Not a Clinical Tool</p>
            <p>
              CounselReflect is a research and evaluation tool and is not intended to provide medical, psychological, or therapeutic advice, diagnosis, or treatment.
              It does not replace professional clinical judgment or care.
            </p>
          </div>

          <div>
            <p className="font-semibold">Consent</p>
            <p>By continuing to use CounselReflect, you indicate that:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>You understand that the toolkit uses third-party AI models;</li>
              <li>You understand that CounselReflect does not save or retain your submitted data;</li>
              <li>You understand that CounselReflect is not HIPAA-covered;</li>
              <li>You consent to the processing of the text you provide by third-party models for research and evaluation purposes; and</li>
              <li>You agree to participate under the terms described above.</li>
            </ul>
          </div>
        </div>

        <label className="mt-4 flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={hasUserConsent}
            onChange={(e) => setHasUserConsent(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
          />
          <span className="text-sm text-slate-700 dark:text-slate-200">
            I have read and agree to the User Consent Form.
          </span>
        </label>
      </div>

      {/* Next Button */}
      <div className="flex justify-end pt-4">
        <div className="flex flex-col items-end gap-2">
          {requirementHint && (
            <p className="text-sm text-amber-700 dark:text-amber-400">{requirementHint}</p>
          )}
          <button
            onClick={handleNext}
            disabled={!canProceed}
            className={`
              inline-flex items-center gap-2 px-6 py-3 rounded-lg font-medium text-white
              transition-all duration-200
              ${canProceed 
                ? 'bg-indigo-600 hover:bg-indigo-700 cursor-pointer' 
                : 'bg-slate-300 dark:bg-slate-700 cursor-not-allowed'}
            `}
          >
            Next: Configure Metrics
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
    </div>
  );
};
