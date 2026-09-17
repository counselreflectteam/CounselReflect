import { FC, useEffect, useRef, useState } from 'react';
import { fetchAvailableModels, validateApiKey, type ServerKeyStatus } from '@shared/services/modelsService';
import { validateHfKey as validateHfKeyService } from '@shared/services/hfService';
import type { LLMProvider, ModelsResponse } from '@shared/types';
import { ApiKeyInput, ValidationStatus } from './ApiKeyInput';

type ApiKeysLike = Record<string, string | undefined> & { hf?: string };

// Provider display metadata
const PROVIDER_LABELS: Record<string, { label: string; placeholder: string; helpUrl: string }> = {
  openai: {
    label: 'OpenAI',
    placeholder: 'sk-proj-...',
    helpUrl: 'https://help.openai.com/en/articles/4936850-where-do-i-find-my-openai-api-key'
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

// Providers whose keys may be persisted in localStorage. Static so opt-out
// cleanup works even when the backend/model list is unavailable.
const STORED_KEY_PROVIDERS = [...Object.keys(PROVIDER_LABELS), 'hf'];
const SAVE_KEYS_OPT_IN_STORAGE_KEY = 'saveApiKeysOptIn';

export interface APIConfigurationPanelProps {
  apiKeys: ApiKeysLike;
  updateApiKey: (provider: string, key: string) => void;

  selectedProvider: LLMProvider;
  setSelectedProvider: (provider: LLMProvider) => void;

  selectedModel: string;
  setSelectedModel: (model: string) => void;
  serverKeyStatus?: ServerKeyStatus;
  refreshServerKeyStatus?: () => Promise<void>;
  /** Preview deployments can prohibit browser-entered keys entirely. */
  serverManagedOnly?: boolean;

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
  serverKeyStatus = {},
  refreshServerKeyStatus,
  serverManagedOnly = false,
  onModelsLoaded,
  onValidationChange
}) => {
  // Models data
  const [availableModels, setAvailableModels] = useState<ModelsResponse | null>(null);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [modelLoadError, setModelLoadError] = useState<string | null>(null);

  // Validation status - local for immediate UI feedback
  const [providerStatus, setProviderStatus] = useState<ValidationStatus>('idle');
  const [hfStatus, setHfStatus] = useState<ValidationStatus>('idle');

  // UI state
  const [saveToLocal, setSaveToLocal] = useState(false);

  // Track if we've already loaded keys from localStorage
  const hasLoadedKeysRef = useRef(false);
  // Persisting/removing stored keys is only safe after they were hydrated into state.
  const [hasHydratedStoredKeys, setHasHydratedStoredKeys] = useState(false);

  // Keep the latest callback in a ref so the notify effect fires only on real
  // status changes, even when callers pass a new inline function every render.
  const onValidationChangeRef = useRef(onValidationChange);
  useEffect(() => {
    onValidationChangeRef.current = onValidationChange;
  });

  // Load models from backend on mount
  useEffect(() => {
    void loadModels();
    void refreshServerKeyStatus?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Notify host app whenever local statuses change
  useEffect(() => {
    const bothValid = providerStatus === 'valid';
    onValidationChangeRef.current?.({ providerStatus, hfStatus, bothValid });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providerStatus, hfStatus]);

  // Load saved keys from localStorage once provider is known
  useEffect(() => {
    if (hasLoadedKeysRef.current || !selectedProvider) return;
    hasLoadedKeysRef.current = true;

    if (serverManagedOnly) {
      STORED_KEY_PROVIDERS.forEach((provider) => {
        localStorage.removeItem(`${provider}_api_key`);
        updateApiKey(provider, '');
      });
      localStorage.removeItem(SAVE_KEYS_OPT_IN_STORAGE_KEY);
      setSaveToLocal(false);
      setHasHydratedStoredKeys(true);
      return;
    }

    const storedOptIn = localStorage.getItem(SAVE_KEYS_OPT_IN_STORAGE_KEY);
    let optedIn = storedOptIn === 'true';
    if (storedOptIn === null && STORED_KEY_PROVIDERS.some((p) => localStorage.getItem(`${p}_api_key`))) {
      // Keys saved by a build that predates the explicit opt-in flag: keep them.
      optedIn = true;
      localStorage.setItem(SAVE_KEYS_OPT_IN_STORAGE_KEY, 'true');
    }
    setSaveToLocal(optedIn);

    if (optedIn) {
      // Hydrate every stored key (not just the selected provider) so switching
      // providers or reloading never orphans or wipes an explicitly saved key.
      STORED_KEY_PROVIDERS.forEach((provider) => {
        const savedKey = localStorage.getItem(`${provider}_api_key`);
        if (!savedKey) return;
        updateApiKey(provider, savedKey);
        if (provider === 'hf') {
          void handleValidateHf(savedKey);
        } else if (provider === selectedProvider) {
          void handleValidateProvider(selectedProvider, savedKey);
        }
      });
    } else if (storedOptIn === 'false') {
      // Opt-out must leave nothing behind, even if a removal was missed earlier.
      clearStoredKeys();
    }

    // Re-validate a session-restored key so the gate reopens after a reload.
    const sessionKey = apiKeys[selectedProvider];
    if (sessionKey && !localStorage.getItem(`${selectedProvider}_api_key`) && !serverKeyStatus[selectedProvider]) {
      void handleValidateProvider(selectedProvider, sessionKey);
    }

    setHasHydratedStoredKeys(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProvider, serverManagedOnly]);

  // Persist keys the user opted to store; drop stored copies of cleared keys.
  // Opt-out removal happens eagerly in handleSaveToLocalChange, not here.
  useEffect(() => {
    if (!hasHydratedStoredKeys || !saveToLocal) return;

    if (providerStatus === 'valid' && apiKeys[selectedProvider]) {
      localStorage.setItem(`${selectedProvider}_api_key`, apiKeys[selectedProvider]!);
    }
    if (hfStatus === 'valid' && apiKeys.hf) {
      localStorage.setItem('hf_api_key', apiKeys.hf);
    }
    STORED_KEY_PROVIDERS.forEach((provider) => {
      if (!apiKeys[provider]) localStorage.removeItem(`${provider}_api_key`);
    });
  }, [hasHydratedStoredKeys, saveToLocal, providerStatus, hfStatus, apiKeys, selectedProvider]);

  const loadModels = async () => {
    setIsLoadingModels(true);
    setModelLoadError(null);
    try {
      const models = await fetchAvailableModels();
      setAvailableModels(models);
      onModelsLoaded?.(models);

      // Auto-select first provider and model if needed / invalid
      const providers = Object.keys(models.providers);
      if (providers.length > 0) {
        const firstProvider = providers[0] as LLMProvider;
        const effectiveProvider =
          selectedProvider && providers.includes(selectedProvider) ? selectedProvider : firstProvider;
        if (effectiveProvider !== selectedProvider) {
          setSelectedProvider(effectiveProvider);
        }
        // Validate the (possibly restored) model against the effective provider's
        // list so a stale or mismatched selection cannot reach the backend.
        const providerModels = models.providers[effectiveProvider] || [];
        if (!providerModels.some((m) => m.id === selectedModel) && providerModels[0]) {
          setSelectedModel(providerModels[0].id);
        }
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to load models:', error);
      setModelLoadError('Could not load provider models from the analysis server.');
    } finally {
      setIsLoadingModels(false);
    }
  };

  const handleProviderChange = (provider: LLMProvider) => {
    setSelectedProvider(provider);
    setProviderStatus(serverKeyStatus[provider] ? 'valid' : 'idle');

    if (availableModels) {
      const models = availableModels.providers[provider];
      // Clear the model when the new provider has none, rather than silently
      // keeping the previous provider's model id.
      setSelectedModel(models?.[0]?.id ?? '');
    }
  };

  const clearStoredKeys = () => {
    const providers = new Set([
      ...STORED_KEY_PROVIDERS,
      ...Object.keys(availableModels?.providers ?? {})
    ]);
    providers.forEach((provider) => localStorage.removeItem(`${provider}_api_key`));
  };

  const handleSaveToLocalChange = (checked: boolean) => {
    setSaveToLocal(checked);
    localStorage.setItem(SAVE_KEYS_OPT_IN_STORAGE_KEY, String(checked));
    if (!checked) {
      // Remove immediately; must work even when the backend is unreachable.
      clearStoredKeys();
    }
  };

  const handleValidateProvider = async (providerOverride?: LLMProvider, keyOverride?: string) => {
    const provider = providerOverride || selectedProvider;
    const key = keyOverride || apiKeys[provider];

    if (!key && serverKeyStatus[provider]) {
      setProviderStatus('valid');
      return;
    }

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

  const allProviders = availableModels
    ? Object.keys(availableModels.providers)
    : selectedProvider
      ? [selectedProvider]
      : [];
  const providers = serverManagedOnly
    ? allProviders.filter((provider) => Boolean(serverKeyStatus[provider]))
    : allProviders;
  const currentModels = availableModels?.providers[selectedProvider] || (
    selectedModel
      ? [{ id: selectedModel, name: selectedModel, provider: selectedProvider }]
      : []
  );
  const providerConfig = PROVIDER_LABELS[selectedProvider];
  const providerHasServerKey = Boolean(serverKeyStatus[selectedProvider]);
  const hfHasServerKey = Boolean(serverKeyStatus.hf);

  useEffect(() => {
    if (providerHasServerKey) {
      setProviderStatus('valid');
    } else if (!apiKeys[selectedProvider]?.trim()) {
      setProviderStatus('idle');
    }

    if (hfHasServerKey) {
      setHfStatus('valid');
    } else if (!apiKeys.hf?.trim()) {
      setHfStatus('idle');
    }
  }, [apiKeys, selectedProvider, providerHasServerKey, hfHasServerKey]);

  return (
    /* Renders on cr-module ground (Setup step 1 / extension STEP 1 — PROVIDER):
       L3 sub-blocks separated by spacing only, inputs punch through as wells. */
    <div className="space-y-6">
      {modelLoadError && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-baseline sm:justify-between">
          <p className="text-[0.8125rem] leading-relaxed text-[var(--cr-ink-2)]">
            <span className="font-bold text-[var(--cr-ink)]">Model list unavailable.</span>{' '}
            {selectedModel
              ? 'The saved preview provider and model remain selected while the analysis server is busy.'
              : `${modelLoadError} Check that the backend is running, then retry.`}
          </p>
          <button
            type="button"
            onClick={loadModels}
            className="cr-btn cr-btn-secondary cr-focus h-9 w-fit shrink-0 px-4 enabled:hover:bg-[var(--cr-bg)]!"
          >
            Retry
          </button>
        </div>
      )}

      <div>
        <h3 className="text-[0.9375rem] font-bold text-[var(--cr-ink)]">Provider and model</h3>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-[var(--cr-ink-2)]">Provider</label>
            <select
              value={selectedProvider}
              onChange={(e) => handleProviderChange(e.target.value as LLMProvider)}
              disabled={isLoadingModels}
              className="cr-focus h-9 w-full rounded-lg border border-[var(--cr-input-border)] bg-[var(--cr-bg)] px-3 text-sm text-[var(--cr-ink)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            >
              {providers.map((provider) => (
                <option key={provider} value={provider}>
                  {PROVIDER_LABELS[provider]?.label || provider}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-[var(--cr-ink-2)]">Model</label>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              disabled={isLoadingModels || currentModels.length === 0}
              className="cr-focus h-9 w-full rounded-lg border border-[var(--cr-input-border)] bg-[var(--cr-bg)] px-3 text-sm text-[var(--cr-ink)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            >
              {currentModels.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-[0.9375rem] font-bold text-[var(--cr-ink)]">Credentials</h3>
        {serverManagedOnly ? (
          <div className="mt-3 border-l-[3px] border-[var(--cr-brand-leaf)] bg-[var(--cr-brand-leaf-soft)] px-3 py-2">
            <p className="text-[0.8125rem] font-semibold leading-5 text-[var(--cr-brand-leaf-strong)]">
              Credentials are managed by the preview server.
            </p>
            <p className="mt-1 text-xs leading-5 text-[var(--cr-ink-2)]">
              This extension does not contain, request, or store provider API keys.
            </p>
          </div>
        ) : (
          <p className="mt-1 text-[0.8125rem] text-[var(--cr-ink-2)]">
            HF key is needed only for metrics badged HF.
          </p>
        )}

        {!serverManagedOnly && (providerHasServerKey || hfHasServerKey) && (
          <p className="cr-meta mt-2">
            Server-managed credential{providerHasServerKey && hfHasServerKey ? 's are' : ' is'} active. Browser key entry is not required.
          </p>
        )}

        {!serverManagedOnly && <div className="mt-4 space-y-4">
          {providerConfig && (
            <ApiKeyInput
              label={`${providerConfig.label} API key`}
              value={apiKeys[selectedProvider] || ''}
              onChange={(val) => {
                updateApiKey(selectedProvider, val);
                setProviderStatus('idle');
              }}
              onValidate={() => void handleValidateProvider()}
              status={providerStatus}
              placeholder={providerHasServerKey ? 'Using server-managed credential' : providerConfig.placeholder}
              helpUrl={providerConfig.helpUrl}
              helpText={providerHasServerKey
                ? 'Configured on the backend. No browser-stored key is needed.'
                : `Create a ${providerConfig.label} API key, paste it here, then select Verify.`}
              helpLinkText={`${providerConfig.label} key setup guide`}
              disabled={providerHasServerKey}
            />
          )}

          {/* Hugging Face Key */}
          <ApiKeyInput
            label="Hugging Face API key"
            value={apiKeys.hf || ''}
            onChange={(val) => {
              updateApiKey('hf', val);
              setHfStatus('idle');
            }}
            onValidate={() => void handleValidateHf()}
            status={hfStatus}
            placeholder={hfHasServerKey ? 'Using server-managed credential' : 'hf_...'}
            helpUrl="https://huggingface.co/docs/hub/security-tokens"
            helpText={hfHasServerKey
              ? 'Configured on the backend. No browser-stored key is needed.'
              : 'Create a Hugging Face user access token, paste it here, then select Verify. It is used only by metrics marked HF.'}
            helpLinkText="Hugging Face key setup guide"
            disabled={hfHasServerKey}
          />

          <div className="pt-2">
            <div className="flex items-center gap-2">
              <input
                id="save-keys"
                type="checkbox"
                checked={saveToLocal}
                onChange={(e) => handleSaveToLocalChange(e.target.checked)}
                className="cr-focus h-4 w-4 rounded border-[var(--cr-input-border)] accent-brand-600"
              />
              <label htmlFor="save-keys" className="text-sm text-[var(--cr-ink-2)]">
                Store browser-entered credentials
              </label>
            </div>
            <p className="cr-meta ml-6 mt-1">
              Keys are kept for this browser tab session by default. Enable this to load them on your next visit.
            </p>
          </div>
        </div>}
      </div>
    </div>
  );
};
