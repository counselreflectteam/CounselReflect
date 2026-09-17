import React from 'react';
import { useAuth } from '@shared/context';
import { APIConfigurationPanel } from '@shared/components/config';
import type { ValidationStatus } from '@shared/components/config';

interface ApiKeyConfigProps {}

export const ApiKeyConfig: React.FC<ApiKeyConfigProps> = () => {
  const serverManagedOnly = String((import.meta as any).env?.VITE_SERVER_MANAGED_ONLY || '').toLowerCase() === 'true';
  const {
    apiKeys,
    updateApiKey,
    selectedProvider,
    setSelectedProvider,
    selectedModel,
    setSelectedModel,
    serverKeyStatus,
    refreshServerKeyStatus,
    setIsAccessGranted,
    setHasValidatedApiKey,
    setHfValidationStatus
  } = useAuth();

  // Stable identity so APIConfigurationPanel's notify effect only re-fires on
  // real status changes, not on every render of this component. The setters
  // are raw useState setters passed through context, so they never change.
  const handleValidationChange = React.useCallback(
    (args: { hfStatus: ValidationStatus; bothValid: boolean }) => {
      setHfValidationStatus(args.hfStatus);
      setHasValidatedApiKey(args.bothValid);
      setIsAccessGranted(args.bothValid);
    },
    [setHfValidationStatus, setHasValidatedApiKey, setIsAccessGranted]
  );

  return (
    <APIConfigurationPanel
      apiKeys={apiKeys}
      updateApiKey={updateApiKey}
      selectedProvider={selectedProvider}
      setSelectedProvider={setSelectedProvider}
      selectedModel={selectedModel}
      setSelectedModel={setSelectedModel}
      serverKeyStatus={serverKeyStatus}
      refreshServerKeyStatus={refreshServerKeyStatus}
      serverManagedOnly={serverManagedOnly}
      onValidationChange={handleValidationChange}
    />
  );
};
