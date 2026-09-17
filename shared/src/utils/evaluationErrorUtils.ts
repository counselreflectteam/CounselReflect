export interface EvaluationErrorPresentation {
  title: string;
  explanation: string;
  action: string;
  technicalDetails?: string;
}

type ErrorKind =
  | 'server_busy'
  | 'provider_paused'
  | 'provider_bad_request'
  | 'provider_access'
  | 'provider_missing_endpoint'
  | 'rate_limited'
  | 'timeout'
  | 'unreachable'
  | 'missing_setup'
  | 'no_result'
  | 'unknown';

const deduplicateSegments = (rawError: string): string => {
  const segments = rawError
    .split(/\s+[•]\s+|\r?\n+/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  return Array.from(new Set(segments)).join('\n');
};

const sanitizeTechnicalDetails = (rawError: string): string => {
  const deduplicated = deduplicateSegments(rawError);

  return deduplicated
    .replace(
      /https?:\/\/[^\s/]*huggingface\.cloud(?:\/[^\s]*)?/gi,
      '[Hugging Face inference endpoint]'
    )
    .replace(/https?:\/\/[^\s]+/gi, '[service endpoint]')
    .trim();
};

const classifyEvaluationError = (rawError: string): ErrorKind => {
  const normalized = rawError.toLowerCase();
  const isProviderError = /hugging\s*face|huggingface|inference endpoint/.test(normalized);

  // Our own capacity gate (429 from the CounselReflect API, not a provider).
  if (/every analysis seat is taken|at capacity right now/.test(normalized)) return 'server_busy';
  if (isProviderError && /endpoint is paused|endpoint.*paused|restart it/.test(normalized)) return 'provider_paused';
  if (/timed?\s*out|timeout/.test(normalized)) return 'timeout';
  if (/429|rate[ -]?limit|too many requests|quota/.test(normalized)) return 'rate_limited';
  if (/401|403|unauthori[sz]ed|forbidden|access denied/.test(normalized)) return 'provider_access';
  if (isProviderError && /404|not found/.test(normalized)) return 'provider_missing_endpoint';
  if (isProviderError && /400|bad request|rejected/.test(normalized)) return 'provider_bad_request';
  if (
    /perspective_api_key|api key|credential|requires .*backend|requires .*corpus|dependency|not configured|missing configuration/.test(normalized)
  ) {
    return 'missing_setup';
  }
  if (
    /network error|failed to fetch|connection (?:refused|reset)|could not connect|cannot connect|could not be reached|name or service not known|dns|econn/.test(normalized)
  ) {
    return 'unreachable';
  }
  if (/without returning a result|no scores were returned|produced no result|no usable result/.test(normalized)) {
    return 'no_result';
  }

  return 'unknown';
};

const metricTitle = (metricLabel: string | undefined, fallback: string): string =>
  metricLabel ? `${metricLabel} could not be scored` : fallback;

const inferSingleMetricLabel = (rawError: string): string | undefined => {
  const segments = deduplicateSegments(rawError).split('\n');
  if (segments.length !== 1) return undefined;

  const match = segments[0].match(/^([^:\n]{2,80}):\s+(?:failed|error|the\s)/i);
  return match?.[1]?.trim();
};

/**
 * Converts backend and provider exceptions into user-facing guidance. Raw URLs
 * are removed from the optional technical details so infrastructure is not
 * exposed in the ordinary product UI.
 */
export const getEvaluationErrorPresentation = (
  rawError?: string | null,
  metricLabel?: string
): EvaluationErrorPresentation => {
  const raw = rawError?.trim() || 'An unexpected error occurred during evaluation.';
  const kind = classifyEvaluationError(raw);
  const technicalDetails = sanitizeTechnicalDetails(raw);
  const resolvedMetricLabel = metricLabel || inferSingleMetricLabel(raw);

  switch (kind) {
    case 'server_busy':
      return {
        title: 'Every analysis seat is taken right now',
        explanation: 'Our one small (but hardworking) server is helping other reviewers at the moment.',
        action:
          'Wait a minute, then select Retry — your setup is kept. Don’t refresh the page: that clears your metric selections.',
        technicalDetails,
      };
    case 'provider_paused':
      return {
        title: resolvedMetricLabel
          ? `${resolvedMetricLabel} is temporarily unavailable`
          : 'A model service is temporarily unavailable',
        explanation: resolvedMetricLabel
          ? `The hosted model for ${resolvedMetricLabel} is paused. It cannot produce a result until the endpoint is restarted; this is not caused by the conversation.`
          : 'A hosted model endpoint is paused and cannot produce a result until it is restarted.',
        action: 'Restart the endpoint from the Hugging Face Inference Endpoints dashboard, wait until it shows Running, then retry. For a hosted workspace, contact the workspace administrator.',
        technicalDetails
      };

    case 'provider_bad_request':
      return {
        title: metricTitle(resolvedMetricLabel, 'The model service rejected the evaluation request'),
        explanation: resolvedMetricLabel
          ? `The model service did not accept the analysis request, so ${resolvedMetricLabel} produced no result. This does not indicate a problem with the conversation or a metric finding.`
          : 'The model service did not accept one or more analysis requests, so the evaluation could not produce a report. This does not indicate a problem with the conversation.',
        action: 'Retry once. If it fails again, verify the endpoint request format and service logs for a local installation, or contact the workspace administrator for a hosted deployment.',
        technicalDetails
      };

    case 'provider_access':
      return {
        title: metricTitle(resolvedMetricLabel, 'The model service denied access'),
        explanation: resolvedMetricLabel
          ? `The model service could not authorize the request, so ${resolvedMetricLabel} produced no result.`
          : 'The model service could not authorize one or more requests, so the evaluation could not produce a report.',
        action: 'Verify the provider credential and endpoint permissions for a local installation, or ask the workspace administrator to update them for a hosted deployment.',
        technicalDetails
      };

    case 'provider_missing_endpoint':
      return {
        title: metricTitle(resolvedMetricLabel, 'The configured model endpoint was not found'),
        explanation: 'The evaluation reached the provider, but the configured model endpoint is no longer available at that location.',
        action: 'Check the endpoint URL and deployment status for a local installation, or contact the workspace administrator for a hosted deployment.',
        technicalDetails
      };

    case 'rate_limited':
      return {
        title: metricTitle(resolvedMetricLabel, 'The model service is temporarily rate-limited'),
        explanation: 'The provider received too many requests or the current usage limit was reached, so this result was not produced.',
        action: 'Wait briefly and retry once. If the limit continues, check the provider quota for a local installation or contact the workspace administrator.',
        technicalDetails
      };

    case 'timeout':
      return {
        title: metricTitle(resolvedMetricLabel, 'The evaluation took too long to respond'),
        explanation: 'The analysis did not return a usable result before the evaluation time limit.',
        action: 'Retry once. If it happens again, check the analysis server and model service for a local installation, or contact the workspace administrator.',
        technicalDetails
      };

    case 'unreachable':
      return {
        title: metricTitle(resolvedMetricLabel, 'The analysis service could not be reached'),
        explanation: 'CounselReflect could not connect to the service needed to run this analysis.',
        action: 'Confirm that the analysis server is running and reachable for a local installation, or contact the workspace administrator for a hosted deployment, then retry.',
        technicalDetails
      };

    case 'missing_setup':
      return {
        title: metricTitle(resolvedMetricLabel, 'Additional server setup is required'),
        explanation: 'The analysis server is available, but a required credential, model resource, or backend dependency has not been configured.',
        action: 'Complete the named backend setup for a local installation, or ask the workspace administrator to configure it for a hosted deployment, then retry.',
        technicalDetails
      };

    case 'no_result':
      return {
        title: metricTitle(resolvedMetricLabel, 'The metric returned no usable result'),
        explanation: 'The metric finished without a score that CounselReflect could include in the report.',
        action: 'Retry once. If the result is still missing, check the metric service logs for a local installation or contact the workspace administrator.',
        technicalDetails
      };

    default:
      return {
        title: metricTitle(resolvedMetricLabel, 'The evaluation could not finish'),
        explanation: resolvedMetricLabel
          ? `${resolvedMetricLabel} did not return a usable result. Other completed metric results are unaffected.`
          : 'The selected metrics did not return a usable result, so CounselReflect could not produce a report.',
        action: 'Retry once. If the problem continues, review the technical details for a local installation or contact the workspace administrator for a hosted deployment.',
        technicalDetails
      };
  }
};
