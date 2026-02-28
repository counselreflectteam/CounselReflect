import type { FC } from 'react';
import { useAuth } from '@shared/context';
import { APIConfigurationPanel, type ValidationStatus } from '@shared/components/config';

export const APIConfiguration: FC = () => {
  const {
    apiKeys,
    updateApiKey,
    selectedProvider,
    setSelectedProvider,
    selectedModel,
    setSelectedModel,
    setHasValidatedApiKey,
    setHfValidationStatus,
    setIsAccessGranted
  } = useAuth();

  return (
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
        // legacy bridge (some screens still use it)
        setIsAccessGranted(args.bothValid);
      }}
    />
  );
};

