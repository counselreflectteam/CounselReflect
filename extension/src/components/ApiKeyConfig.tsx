import React from 'react';
import { useAuth } from '@shared/context';
import { APIConfigurationPanel } from '@shared/components/config';
import type { ValidationStatus } from '@shared/components/config';

interface ApiKeyConfigProps {}

export const ApiKeyConfig: React.FC<ApiKeyConfigProps> = () => {
  const {
    apiKeys,
    updateApiKey,
    selectedProvider,
    setSelectedProvider,
    selectedModel,
    setSelectedModel,
    setIsAccessGranted,
    setHasValidatedApiKey,
    setHfValidationStatus
  } = useAuth();

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-6 transition-colors">
      <APIConfigurationPanel
        apiKeys={apiKeys}
        updateApiKey={updateApiKey}
        selectedProvider={selectedProvider}
        setSelectedProvider={setSelectedProvider}
        selectedModel={selectedModel}
        setSelectedModel={setSelectedModel}
        onValidationChange={(args: { hfStatus: ValidationStatus; bothValid: boolean }) => {
          setHfValidationStatus(args.hfStatus);
          setHasValidatedApiKey(args.bothValid);
          setIsAccessGranted(args.bothValid);
        }}
      />
    </div>
  );
};
