/**
 * Metric inventory cache (Guided Library spec §5.1).
 *
 * Module-level memoized promises so MetricBundles and the two fetched
 * pickers share ONE request per source instead of fetching independently.
 * Holds server data only — never selection state.
 *
 * Rejected promises clear their own cache slot, so picker Retry buttons work.
 * Retry handlers that clear explicitly must pass THEIR source to
 * clearMetricInventoryCache so they never evict the other source's healthy
 * or in-flight slot; the zero-arg form is a clear-all.
 *
 * Derived consumers (MetricBundles, the dock attribution) can subscribe to
 * successful loads via subscribeMetricInventory / getMetricInventoryVersion
 * (useSyncExternalStore-compatible), so a picker Retry that repopulates the
 * cache also revives UI that failed its own mount-time load.
 */
import { fetchPretrainedMetrics } from './pretrainedMetricsService';
import { fetchLiteratureMetrics } from './literatureMetricsService';

export type MetricInventorySource = 'predefined' | 'literature';

let pretrainedPromise: ReturnType<typeof fetchPretrainedMetrics> | null = null;
let literaturePromise: ReturnType<typeof fetchLiteratureMetrics> | null = null;

// Bumped on every successful fetch; never on failure, so subscribers cannot
// enter a refetch loop while the backend is down.
let version = 0;
const listeners = new Set<() => void>();

function notifyLoaded(): void {
  version += 1;
  listeners.forEach((listener) => listener());
}

/** useSyncExternalStore-compatible subscribe; returns the unsubscriber. */
export function subscribeMetricInventory(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Monotonic counter of successful inventory loads (either source). */
export function getMetricInventoryVersion(): number {
  return version;
}

export function getPretrainedMetricsCached(): ReturnType<typeof fetchPretrainedMetrics> {
  if (!pretrainedPromise) {
    const promise = fetchPretrainedMetrics().then(
      (data) => {
        notifyLoaded();
        return data;
      },
      (error) => {
        // Failed fetches must not be cached, or Retry would replay the error.
        if (pretrainedPromise === promise) pretrainedPromise = null;
        throw error;
      }
    );
    pretrainedPromise = promise;
  }
  return pretrainedPromise;
}

export function getLiteratureMetricsCached(): ReturnType<typeof fetchLiteratureMetrics> {
  if (!literaturePromise) {
    const promise = fetchLiteratureMetrics().then(
      (data) => {
        notifyLoaded();
        return data;
      },
      (error) => {
        if (literaturePromise === promise) literaturePromise = null;
        throw error;
      }
    );
    literaturePromise = promise;
  }
  return literaturePromise;
}

/**
 * Called by picker Retry buttons before reloading — pass the picker's own
 * source so Retry on one tab never invalidates the other tab's slot.
 * Without a source, clears BOTH slots (clear-all, e.g. for tests/logout).
 */
export function clearMetricInventoryCache(source?: MetricInventorySource): void {
  if (!source || source === 'predefined') pretrainedPromise = null;
  if (!source || source === 'literature') literaturePromise = null;
}
