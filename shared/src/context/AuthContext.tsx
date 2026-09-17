import React, { createContext, useContext, useState, ReactNode, useEffect, useCallback } from 'react';
import type { LLMProvider, ApiKeys } from '../types';
import { fetchServerKeyStatus, type ServerKeyStatus } from '../services/modelsService';

interface AuthContextType {
  // API Keys
  apiKeys: ApiKeys;
  setApiKeys: React.Dispatch<React.SetStateAction<ApiKeys>>;
  updateApiKey: (provider: string, key: string) => void;
  serverKeyStatus: ServerKeyStatus;
  /** True once the first /models/server-keys-status fetch has settled (ok or
   *  failed). Credential-based gates must wait for this before redirecting,
   *  or server-managed-key users get bounced during the initial fetch. */
  serverKeyStatusLoaded: boolean;
  refreshServerKeyStatus: () => Promise<void>;
  hasProviderCredential: (provider: LLMProvider) => boolean;
  hasHfCredential: boolean;
  
  // LLM Provider Configuration
  selectedProvider: LLMProvider;
  setSelectedProvider: (provider: LLMProvider) => void;
  selectedModel: string;
  setSelectedModel: (model: string) => void;
  
  // Validation Status
  hasValidatedApiKey: boolean;
  setHasValidatedApiKey: (isValid: boolean) => void;
  hfValidationStatus: 'idle' | 'validating' | 'valid' | 'invalid';
  setHfValidationStatus: (status: 'idle' | 'validating' | 'valid' | 'invalid') => void;
  
  // Legacy support (synced with hasValidatedApiKey for backward compatibility)
  isAccessGranted: boolean;
  setIsAccessGranted: (granted: boolean) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const API_KEYS_SESSION_STORAGE_KEY = 'counselreflectApiKeys';
const SAVE_KEYS_OPT_IN_STORAGE_KEY = 'saveApiKeysOptIn';
const BROWSER_KEY_PROVIDERS = ['openai', 'gemini', 'claude', 'hf'];

const configuredProvider = ((import.meta as any).env?.VITE_DEFAULT_PROVIDER || 'openai') as LLMProvider;
const configuredModel = String((import.meta as any).env?.VITE_DEFAULT_MODEL || '');
const configuredServerManagedOnly =
  String((import.meta as any).env?.VITE_SERVER_MANAGED_ONLY || '').toLowerCase() === 'true';

const purgeBrowserApiKeys = () => {
  sessionStorage.removeItem(API_KEYS_SESSION_STORAGE_KEY);
  localStorage.removeItem('apiKeys');
  localStorage.removeItem(SAVE_KEYS_OPT_IN_STORAGE_KEY);
  BROWSER_KEY_PROVIDERS.forEach((provider) => {
    localStorage.removeItem(`${provider}_api_key`);
  });
};

const readConfiguredServerKeyStatus = (): ServerKeyStatus => {
  const configured = String((import.meta as any).env?.VITE_SERVER_MANAGED_PROVIDERS || '');
  return configured
    .split(',')
    .map((provider) => provider.trim().toLowerCase())
    .filter(Boolean)
    .reduce<ServerKeyStatus>((status, provider) => {
      status[provider] = true;
      return status;
    }, {});
};

const configuredServerKeyStatus = readConfiguredServerKeyStatus();

const readLegacyLocalApiKeys = (): ApiKeys => {
  try {
    const raw = localStorage.getItem('apiKeys');
    if (!raw) return {};

    const parsed = JSON.parse(raw) as ApiKeys;
    const keys = Object.fromEntries(
      Object.entries(parsed).filter(([, value]) => typeof value === 'string' && value.trim())
    ) as ApiKeys;

    if (Object.keys(keys).length > 0) {
      // These credentials were already persisted by an older CounselReflect
      // build, so preserve that choice while migrating to the explicit format.
      localStorage.setItem(SAVE_KEYS_OPT_IN_STORAGE_KEY, 'true');
      Object.entries(keys).forEach(([provider, key]) => {
        localStorage.setItem(`${provider}_api_key`, key as string);
      });
    }
    return keys;
  } catch {
    return {};
  } finally {
    localStorage.removeItem('apiKeys');
  }
};

const readSessionApiKeys = (): ApiKeys => {
  if (configuredServerManagedOnly) {
    purgeBrowserApiKeys();
    return {};
  }
  try {
    const raw = sessionStorage.getItem(API_KEYS_SESSION_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
    return readLegacyLocalApiKeys();
  } catch {
    return {};
  }
};

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // API Keys
  const [apiKeys, setApiKeys] = useState<ApiKeys>(() => readSessionApiKeys());
  const [serverKeyStatus, setServerKeyStatus] = useState<ServerKeyStatus>(configuredServerKeyStatus);
  const [serverKeyStatusLoaded, setServerKeyStatusLoaded] = useState(
    () => Object.keys(configuredServerKeyStatus).length > 0
  );
  
  // LLM Provider Configuration - will be set by APIConfiguration component after loading models
  const [selectedProvider, setSelectedProvider] = useState<LLMProvider>(() => {
    const stored = localStorage.getItem('selectedProvider');
    return (stored as LLMProvider) || configuredProvider;
  });
  
  const [selectedModel, setSelectedModel] = useState<string>(() => {
    const stored = localStorage.getItem('selectedModel');
    return stored || configuredModel;
  });
  
  // Validation Status - deliberately NOT persisted: the keys it certifies live in
  // sessionStorage, so a persisted "validated" claim would outlive the credential.
  const [hasValidatedApiKey, setHasValidatedApiKey] = useState<boolean>(false);
  const [hfValidationStatus, setHfValidationStatus] = useState<'idle' | 'validating' | 'valid' | 'invalid'>('idle');
  
  // Legacy support
  const [isAccessGranted, setIsAccessGranted] = useState(false);

  const refreshServerKeyStatus = useCallback(async () => {
    try {
      const status = await fetchServerKeyStatus();
      setServerKeyStatus(status);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('Failed to load server key status:', error);
      // Keep the last known status: clobbering to {} here would make the
      // revoke effect below lock out server-managed-key users on a single
      // transient fetch failure.
    } finally {
      setServerKeyStatusLoaded(true);
    }
  }, []);

  useEffect(() => {
    // Purge the stale validation flag persisted by earlier builds.
    localStorage.removeItem('hasValidatedApiKey');
    void refreshServerKeyStatus();
  }, [refreshServerKeyStatus]);

  useEffect(() => {
    if (configuredServerManagedOnly) {
      purgeBrowserApiKeys();
      return;
    }
    sessionStorage.setItem(API_KEYS_SESSION_STORAGE_KEY, JSON.stringify(apiKeys));
  }, [apiKeys]);

  const hasProviderCredential = useCallback((provider: LLMProvider) => {
    const browserKey = apiKeys[provider as keyof ApiKeys]?.trim();
    return Boolean(browserKey || serverKeyStatus[provider]);
  }, [apiKeys, serverKeyStatus]);

  const hasHfCredential = Boolean(apiKeys.hf?.trim() || serverKeyStatus.hf);
  
  // Auto-grant only for server-managed credentials: the backend already holds a
  // working key, so no browser-side validation is possible or needed. Browser-typed
  // keys must pass validation (APIConfigurationPanel) before the gate opens.
  useEffect(() => {
    if (!hasValidatedApiKey && selectedProvider && serverKeyStatus[selectedProvider]) {
      setHasValidatedApiKey(true);
    }
  }, [hasValidatedApiKey, selectedProvider, serverKeyStatus]);

  // Revoke access when no credential of any kind exists for the selected provider,
  // e.g. after the user clears a previously validated key.
  useEffect(() => {
    if (hasValidatedApiKey && selectedProvider && !hasProviderCredential(selectedProvider)) {
      setHasValidatedApiKey(false);
    }
  }, [hasProviderCredential, hasValidatedApiKey, selectedProvider]);

  // Sync validation status with isAccessGranted for legacy components (both directions,
  // so revocation propagates too).
  useEffect(() => {
    setIsAccessGranted(hasValidatedApiKey);
  }, [hasValidatedApiKey]);

  // Persist provider selection
  useEffect(() => {
    localStorage.setItem('selectedProvider', selectedProvider);
  }, [selectedProvider]);
  
  // Persist model selection
  useEffect(() => {
    localStorage.setItem('selectedModel', selectedModel);
  }, [selectedModel]);
  
  const updateApiKey = (provider: string, key: string) => {
    if (configuredServerManagedOnly) {
      purgeBrowserApiKeys();
      return;
    }
    setApiKeys(prev => {
      const next = { ...prev };
      if (key.trim()) {
        next[provider] = key;
      } else {
        delete next[provider];
      }
      return next;
    });
  };

  return (
    <AuthContext.Provider
      value={{
        apiKeys,
        setApiKeys,
        updateApiKey,
        serverKeyStatus,
        serverKeyStatusLoaded,
        refreshServerKeyStatus,
        hasProviderCredential,
        hasHfCredential,
        selectedProvider,
        setSelectedProvider,
        selectedModel,
        setSelectedModel,
        hasValidatedApiKey,
        setHasValidatedApiKey,
        hfValidationStatus,
        setHfValidationStatus,
        isAccessGranted,
        setIsAccessGranted,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
