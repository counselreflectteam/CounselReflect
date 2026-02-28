import React, { FC, useEffect, useRef, useState } from 'react';
import { AlertCircle, Check, ChevronDown } from 'lucide-react';
import { fetchAvailableModels, validateApiKey } from '@shared/services/modelsService';
import { validateHfKey as validateHfKeyService } from '@shared/services/hfService';
import type { LLMProvider, ModelsResponse } from '@shared/types';
import { ApiKeyInput, ValidationStatus } from './ApiKeyInput';

type ApiKeysLike = Record<string, string | undefined> & { hf?: string };

// Provider display metadata
const PROVIDER_LABELS: Record<string, { label: string; placeholder: string; helpUrl: string }> = {
  openai: {
    label: 'OpenAI',
    placeholder: 'sk-proj-...',
    helpUrl: 'https://platform.openai.com/api-keys'
  },
  gemini: {
    label: 'Google Gemini',
    placeholder: 'AIza...',
    helpUrl: 'https://aistudio.google.com/app/apikey'
  },
  claude: {
    label: 'Anthropic Claude',
    placeholder: 'sk-ant-...',
    helpUrl: 'https://console.anthropic.com/settings/keys'
  }
};

export interface APIConfigurationPanelProps {
  apiKeys: ApiKeysLike;
  updateApiKey: (provider: string, key: string) => void;

  selectedProvider: LLMProvider;
  setSelectedProvider: (provider: LLMProvider) => void;

  selectedModel: string;
  setSelectedModel: (model: string) => void;

  /**
   * Optional bridge for app-level state.
   * Useful if the host app stores models centrally (e.g. extension).
   */
  onModelsLoaded?: (models: ModelsResponse) => void;

  /**
   * Optional bridge for app-level validation state.
   * Useful if the host app gates navigation based on validation.
   */
  onValidationChange?: (args: {
    providerStatus: ValidationStatus;
    hfStatus: ValidationStatus;
    bothValid: boolean;
  }) => void;
}

export const APIConfigurationPanel: FC<APIConfigurationPanelProps> = ({
  apiKeys,
  updateApiKey,
  selectedProvider,
  setSelectedProvider,
  selectedModel,
  setSelectedModel,
  onModelsLoaded,
  onValidationChange
}) => {
  // Models data
  const [availableModels, setAvailableModels] = useState<ModelsResponse | null>(null);
  const [isLoadingModels, setIsLoadingModels] = useState(false);

  // Validation status - local for immediate UI feedback
  const [providerStatus, setProviderStatus] = useState<ValidationStatus>('idle');
  const [hfStatus, setHfStatus] = useState<ValidationStatus>('idle');

  // UI state
  const [saveToLocal, setSaveToLocal] = useState(false);

  // Track if we've already loaded keys from localStorage
  const hasLoadedKeysRef = useRef(false);

  // Load models from backend on mount
  useEffect(() => {
    void loadModels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Notify host app whenever local statuses change
  useEffect(() => {
    const bothValid = providerStatus === 'valid' && hfStatus === 'valid';
    onValidationChange?.({ providerStatus, hfStatus, bothValid });
  }, [providerStatus, hfStatus, onValidationChange]);

  // Load saved keys from localStorage once provider is known
  useEffect(() => {
    if (hasLoadedKeysRef.current || !selectedProvider) return;
    hasLoadedKeysRef.current = true;

    const savedProviderKey = localStorage.getItem(`${selectedProvider}_api_key`);
    const savedHfKey = localStorage.getItem('hf_api_key');

    if (savedProviderKey || savedHfKey) {
      setSaveToLocal(true);

      if (savedProviderKey) {
        updateApiKey(selectedProvider, savedProviderKey);
        void handleValidateProvider(selectedProvider, savedProviderKey);
      }

      if (savedHfKey) {
        updateApiKey('hf', savedHfKey);
        void handleValidateHf(savedHfKey);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProvider]);

  // Save/remove keys when saveToLocal or keys change
  useEffect(() => {
    if (!availableModels) return;
    const allProviders = Object.keys(availableModels.providers);

    if (saveToLocal) {
      if (providerStatus === 'valid' && apiKeys[selectedProvider]) {
        localStorage.setItem(`${selectedProvider}_api_key`, apiKeys[selectedProvider]!);
      }
      if (hfStatus === 'valid' && apiKeys.hf) {
        localStorage.setItem('hf_api_key', apiKeys.hf);
      }
    } else {
      allProviders.forEach((provider) => localStorage.removeItem(`${provider}_api_key`));
      localStorage.removeItem('hf_api_key');
    }
  }, [saveToLocal, providerStatus, hfStatus, apiKeys, selectedProvider, availableModels]);

  const loadModels = async () => {
    setIsLoadingModels(true);
    try {
      const models = await fetchAvailableModels();
      setAvailableModels(models);
      onModelsLoaded?.(models);

      // Auto-select first provider and model if needed / invalid
      const providers = Object.keys(models.providers);
      if (providers.length > 0) {
        const firstProvider = providers[0] as LLMProvider;
        const firstModel = models.providers[firstProvider]?.[0]?.id;

        if (!selectedProvider || !providers.includes(selectedProvider)) {
          setSelectedProvider(firstProvider);
        }
        if (!selectedModel && firstModel) {
          setSelectedModel(firstModel);
        }
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to load models:', error);
    } finally {
      setIsLoadingModels(false);
    }
  };

  const handleProviderChange = (provider: LLMProvider) => {
    setSelectedProvider(provider);
    setProviderStatus('idle'); // Reset validation for new provider

    if (availableModels) {
      const models = availableModels.providers[provider];
      if (models && models.length > 0) {
        setSelectedModel(models[0].id);
      }
    }
  };

  const handleValidateProvider = async (providerOverride?: LLMProvider, keyOverride?: string) => {
    const provider = providerOverride || selectedProvider;
    const key = keyOverride || apiKeys[provider];

    if (!key) return;

    setProviderStatus('validating');
    try {
      const result = await validateApiKey(provider, key);
      setProviderStatus(result.valid ? 'valid' : 'invalid');
    } catch (error) {
      setProviderStatus('invalid');
      // eslint-disable-next-line no-console
      console.error('Provider key validation failed:', error);
    }
  };

  const handleValidateHf = async (keyOverride?: string) => {
    const key = keyOverride || apiKeys.hf;
    if (!key) return;

    setHfStatus('validating');
    const isValid = await validateHfKeyService(key);
    setHfStatus(isValid ? 'valid' : 'invalid');
  };

  const providers = availableModels ? Object.keys(availableModels.providers) : [];
  const currentModels = availableModels?.providers[selectedProvider] || [];
  const providerConfig = PROVIDER_LABELS[selectedProvider];
  const bothKeysValid = providerStatus === 'valid' && hfStatus === 'valid';

  return (
    <div className="space-y-6">
      {/* Step 1: Provider & Model Selection */}
      <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-slate-200 dark:border-slate-700">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">1. Select Provider & Model</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Provider</label>
            <div className="relative">
              <select
                value={selectedProvider}
                onChange={(e) => handleProviderChange(e.target.value as LLMProvider)}
                disabled={isLoadingModels}
                className="w-full px-4 py-2.5 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 appearance-none disabled:opacity-50"
              >
                {providers.map((provider) => (
                  <option key={provider} value={provider}>
                    {PROVIDER_LABELS[provider]?.label || provider}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Model</label>
            <div className="relative">
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                disabled={isLoadingModels || currentModels.length === 0}
                className="w-full px-4 py-2.5 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 appearance-none disabled:opacity-50"
              >
                {currentModels.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
            </div>
          </div>
        </div>
      </div>

      {/* Step 2: API Keys */}
      <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-slate-200 dark:border-slate-700">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">2. Enter & Validate API Keys</h3>
        <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">Both keys must be validated to proceed.</p>

        <div className="space-y-6">
          {/* Provider API Key */}
          {providerConfig && (
            <ApiKeyInput
              label={`${providerConfig.label} API Key`}
              value={apiKeys[selectedProvider] || ''}
              onChange={(val) => {
                updateApiKey(selectedProvider, val);
                setProviderStatus('idle');
              }}
              onValidate={() => void handleValidateProvider()}
              status={providerStatus}
              placeholder={providerConfig.placeholder}
              helpUrl={providerConfig.helpUrl}
              helpText={`Get your key from ${providerConfig.label}`}
            />
          )}

          {/* Hugging Face Key */}
          <ApiKeyInput
            label="Hugging Face API Key"
            value={apiKeys.hf || ''}
            onChange={(val) => {
              updateApiKey('hf', val);
              setHfStatus('idle');
            }}
            onValidate={() => void handleValidateHf()}
            status={hfStatus}
            placeholder="hf_..."
            helpUrl="https://huggingface.co/settings/tokens"
            helpText="Required for pretrained models."
          />

          {/* Save to LocalStorage Option */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
            <div className="flex items-center">
              <input
                id="save-keys"
                type="checkbox"
                checked={saveToLocal}
                onChange={(e) => setSaveToLocal(e.target.checked)}
                className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
              />
              <label htmlFor="save-keys" className="ml-2 text-sm text-slate-600 dark:text-slate-300">
                Save API keys to browser storage
              </label>
            </div>
            <p className="mt-1 ml-6 text-xs text-slate-500 dark:text-slate-400">
              Keys will be stored locally and auto-loaded on your next visit
            </p>
          </div>
        </div>
      </div>

      {/* Status Banner */}
      <div
        className={`p-4 rounded-lg border ${
          bothKeysValid
            ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800'
            : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'
        }`}
      >
        <div className="flex items-start gap-3">
          {bothKeysValid ? (
            <Check className="w-5 h-5 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
          )}
          <div>
            <h4
              className={`text-sm font-semibold mb-1 ${
                bothKeysValid ? 'text-emerald-800 dark:text-emerald-300' : 'text-amber-800 dark:text-amber-300'
              }`}
            >
              {bothKeysValid ? 'All Keys Validated' : 'API Keys Required'}
            </h4>
            <p
              className={`text-sm ${
                bothKeysValid ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'
              }`}
            >
              {bothKeysValid
                ? 'Both API keys are validated. You can proceed to upload a conversation.'
                : 'Please validate both API keys to continue.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

