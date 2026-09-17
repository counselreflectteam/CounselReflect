interface ProviderReadinessArgs {
  selectedProvider: string;
  selectedModel: string;
  apiKeys: Record<string, string | undefined>;
  serverKeyStatus: Record<string, boolean | undefined>;
  hasValidatedApiKey: boolean;
}

interface HfReadinessArgs {
  apiKey?: string;
  serverKeyAvailable?: boolean;
  validationStatus: 'idle' | 'validating' | 'valid' | 'invalid';
}

export const isProviderReady = ({
  selectedProvider,
  selectedModel,
  apiKeys,
  serverKeyStatus,
  hasValidatedApiKey
}: ProviderReadinessArgs): boolean => {
  if (!selectedProvider || !selectedModel.trim()) return false;

  const hasServerKey = Boolean(serverKeyStatus[selectedProvider]);
  const hasValidatedBrowserKey = Boolean(
    apiKeys[selectedProvider]?.trim() && hasValidatedApiKey
  );

  return hasServerKey || hasValidatedBrowserKey;
};

export const isHfReady = ({
  apiKey,
  serverKeyAvailable,
  validationStatus
}: HfReadinessArgs): boolean =>
  Boolean(serverKeyAvailable || (apiKey?.trim() && validationStatus === 'valid'));
