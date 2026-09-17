// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { getEvaluationErrorPresentation } from '@shared/utils/evaluationErrorUtils';
import { createEvaluationRunId } from '@shared/services/evaluationRunService';
import { getPreviewTransportHeaders } from '@shared/services/apiClient';
import { isHfReady, isProviderReady } from './providerReadiness';

describe('isProviderReady', () => {
  it('accepts a server-managed credential with a selected model', () => {
    expect(isProviderReady({
      selectedProvider: 'openai',
      selectedModel: 'gpt-4.1',
      apiKeys: {},
      serverKeyStatus: { openai: true },
      hasValidatedApiKey: false
    })).toBe(true);
  });

  it('accepts a validated browser credential', () => {
    expect(isProviderReady({
      selectedProvider: 'gemini',
      selectedModel: 'gemini-2.5-flash',
      apiKeys: { gemini: 'test-key' },
      serverKeyStatus: {},
      hasValidatedApiKey: true
    })).toBe(true);
  });

  it('rejects an unverified browser credential', () => {
    expect(isProviderReady({
      selectedProvider: 'gemini',
      selectedModel: 'gemini-2.5-flash',
      apiKeys: { gemini: 'test-key' },
      serverKeyStatus: {},
      hasValidatedApiKey: false
    })).toBe(false);
  });

  it('requires a selected model even when the server has a credential', () => {
    expect(isProviderReady({
      selectedProvider: 'openai',
      selectedModel: '',
      apiKeys: {},
      serverKeyStatus: { openai: true },
      hasValidatedApiKey: false
    })).toBe(false);
  });
});

describe('isHfReady', () => {
  it('accepts either a server-managed key or a validated browser key', () => {
    expect(isHfReady({
      serverKeyAvailable: true,
      validationStatus: 'idle'
    })).toBe(true);
    expect(isHfReady({
      apiKey: 'hf_test',
      validationStatus: 'valid'
    })).toBe(true);
  });

  it('rejects present but unverified or invalid browser keys', () => {
    expect(isHfReady({
      apiKey: 'hf_test',
      validationStatus: 'idle'
    })).toBe(false);
    expect(isHfReady({
      apiKey: 'hf_test',
      validationStatus: 'invalid'
    })).toBe(false);
  });
});

describe('getEvaluationErrorPresentation', () => {
  it('explains a paused model endpoint without blaming the conversation', () => {
    const presentation = getEvaluationErrorPresentation(
      'The Hugging Face inference endpoint is paused. A workspace administrator must restart it.',
      'Emotional Support Strategy'
    );

    expect(presentation.title).toBe('Emotional Support Strategy is temporarily unavailable');
    expect(presentation.explanation).toContain('endpoint is restarted');
    expect(presentation.explanation).toContain('not caused by the conversation');
    expect(presentation.action).toContain('Hugging Face Inference Endpoints dashboard');
  });
});

describe('createEvaluationRunId', () => {
  it('creates a backend-safe unique run identifier', () => {
    const first = createEvaluationRunId();
    const second = createEvaluationRunId();

    expect(first).toMatch(/^[A-Za-z0-9._:-]{8,128}$/);
    expect(second).not.toBe(first);
  });
});

describe('getPreviewTransportHeaders', () => {
  it('bypasses the ngrok browser interstitial only for ngrok-free preview APIs', () => {
    expect(
      getPreviewTransportHeaders('https://example-preview.ngrok-free.dev/api')
    ).toEqual({ 'ngrok-skip-browser-warning': 'true' });
    expect(getPreviewTransportHeaders('https://api.counselreflect.com')).toEqual({});
  });
});
