import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import type { LLMProvider, ApiKeys } from '../types';

interface AuthContextType {
  // API Keys
  apiKeys: ApiKeys;
  setApiKeys: React.Dispatch<React.SetStateAction<ApiKeys>>;
  updateApiKey: (provider: keyof ApiKeys, key: string) => void;
  
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

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // API Keys
  const [apiKeys, setApiKeys] = useState<ApiKeys>(() => {
    const stored = localStorage.getItem('apiKeys');
    return stored ? JSON.parse(stored) : {};
  });
  
  // LLM Provider Configuration - will be set by APIConfiguration component after loading models
  const [selectedProvider, setSelectedProvider] = useState<LLMProvider>(() => {
    const stored = localStorage.getItem('selectedProvider');
    return (stored as LLMProvider) || 'openai'; // Fallback to openai, will be overridden by APIConfiguration
  });
  
  const [selectedModel, setSelectedModel] = useState<string>(() => {
    const stored = localStorage.getItem('selectedModel');
    return stored || ''; // Empty string, will be set by APIConfiguration after loading models
  });
  
  // Validation Status - restore from localStorage
  const [hasValidatedApiKey, setHasValidatedApiKey] = useState<boolean>(() => {
    const stored = localStorage.getItem('hasValidatedApiKey');
    return stored === 'true';
  });
  const [hfValidationStatus, setHfValidationStatus] = useState<'idle' | 'validating' | 'valid' | 'invalid'>('idle');
  
  // Legacy support
  const [isAccessGranted, setIsAccessGranted] = useState(false);
  
  // Auto-validate if API key exists for selected provider on mount
  useEffect(() => {
    if (!hasValidatedApiKey && selectedProvider && apiKeys[selectedProvider]) {
      // If we have an API key for the selected provider, mark as validated
      setHasValidatedApiKey(true);
    }
  }, []); // Only run on mount
  
  // Sync validation status with isAccessGranted for legacy components
  useEffect(() => {
    if (hasValidatedApiKey) {
      setIsAccessGranted(true);
    }
  }, [hasValidatedApiKey]);
  
  // Persist validation status to localStorage
  useEffect(() => {
    localStorage.setItem('hasValidatedApiKey', String(hasValidatedApiKey));
  }, [hasValidatedApiKey]);
  
  // Persist API keys to localStorage
  useEffect(() => {
    localStorage.setItem('apiKeys', JSON.stringify(apiKeys));
  }, [apiKeys]);
  
  // Persist provider selection
  useEffect(() => {
    localStorage.setItem('selectedProvider', selectedProvider);
  }, [selectedProvider]);
  
  // Persist model selection
  useEffect(() => {
    localStorage.setItem('selectedModel', selectedModel);
  }, [selectedModel]);
  
  const updateApiKey = (provider: keyof ApiKeys, key: string) => {
    setApiKeys(prev => ({ ...prev, [provider]: key }));
  };

  return (
    <AuthContext.Provider
      value={{
        apiKeys,
        setApiKeys,
        updateApiKey,
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
