import { useRef, type FC } from 'react';
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
    serverKeyStatus,
    refreshServerKeyStatus,
    setHasValidatedApiKey,
    setHfValidationStatus,
    setIsAccessGranted
  } = useAuth();
  const providerValidationRef = useRef<{ provider: string; key: string } | null>(null);
  const hfValidationKeyRef = useRef<string | null>(null);

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
      onValidationChange={(args: {
        providerStatus: ValidationStatus;
        hfStatus: ValidationStatus;
        bothValid: boolean;
      }) => {
        if (args.providerStatus === 'validating') {
          providerValidationRef.current = {
            provider: selectedProvider,
            key: apiKeys[selectedProvider]?.trim() || ''
          };
        } else if (args.providerStatus === 'idle' || args.providerStatus === 'invalid') {
          providerValidationRef.current = null;
        }

        if (args.hfStatus === 'validating') {
          hfValidationKeyRef.current = apiKeys.hf?.trim() || '';
        } else if (args.hfStatus === 'idle' || args.hfStatus === 'invalid') {
          hfValidationKeyRef.current = null;
        }

        const currentProviderKey = apiKeys[selectedProvider]?.trim() || '';
        const browserProviderValidated =
          args.providerStatus === 'valid' &&
          providerValidationRef.current?.provider === selectedProvider &&
          providerValidationRef.current.key === currentProviderKey &&
          Boolean(currentProviderKey);
        const providerValid =
          Boolean(serverKeyStatus[selectedProvider]) || browserProviderValidated;

        const currentHfKey = apiKeys.hf?.trim() || '';
        const browserHfValidated =
          args.hfStatus === 'valid' &&
          hfValidationKeyRef.current === currentHfKey &&
          Boolean(currentHfKey);
        const hfValid = Boolean(serverKeyStatus.hf) || browserHfValidated;

        setHfValidationStatus(
          args.hfStatus === 'valid' && !hfValid ? 'idle' : args.hfStatus
        );
        setHasValidatedApiKey(providerValid);
        // legacy bridge (some screens still use it)
        setIsAccessGranted(providerValid);
      }}
    />
  );
};
