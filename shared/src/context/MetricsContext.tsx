import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import type { CustomizedMetric, PredefinedMetric } from '../types';
import type { RefineMetricsResponse } from '../services/customMetricsService';
import type { ExamplePayload } from '../services/customMetricsService';
import {LiteratureMetric} from "../services/literatureMetricsService.ts";

export interface LockedProfileData {
  version: string;
  rubric: RefineMetricsResponse;
  userPreferences: Record<string, unknown>;
  canonicalExamples: ExamplePayload[];
}

export interface MetricsContextType {
  // Predefined metrics selection
  selectedPredefinedMetrics: PredefinedMetric[];
  togglePredefinedMetric: (metric: PredefinedMetric) => void;

  // Literature metrics selection (by metric name)
  selectedLiteratureMetrics: LiteratureMetric[];
  toggleLiteratureMetric: (metricName: LiteratureMetric) => void;

  // Customized metrics
  customizedMetrics: CustomizedMetric[];
  selectedCustomizedMetrics: CustomizedMetric[];
  addCustomizedMetric: (metric: CustomizedMetric) => void;
  removeCustomizedMetric: (metricId: string) => void;
  toggleCustomizedMetric: (metric: CustomizedMetric) => void;
  clearCustomizedMetrics: () => void;
  selectAllCustomizedMetrics: () => void;
  clearSelectedCustomizedMetrics: () => void;
  setSelectedCustomizedMetrics: (metrics: CustomizedMetric[]) => void;

  // Locked profile (for custom metrics evaluation)
  lockedProfile: LockedProfileData | null;
  setLockedProfile: (profile: LockedProfileData | null) => void;
}

const MetricsContext = createContext<MetricsContextType | undefined>(undefined);
const METRICS_STATE_STORAGE_KEY = 'counselreflectMetricsState';

interface PersistedMetricsState {
  version: 1;
  selectedPredefinedMetrics: PredefinedMetric[];
  selectedLiteratureMetrics: LiteratureMetric[];
  customizedMetrics: CustomizedMetric[];
  selectedCustomizedMetrics: CustomizedMetric[];
  lockedProfile: LockedProfileData | null;
}

const restoreMetricsState = (): PersistedMetricsState => {
  const fallback: PersistedMetricsState = {
    version: 1,
    selectedPredefinedMetrics: [],
    selectedLiteratureMetrics: [],
    customizedMetrics: [],
    selectedCustomizedMetrics: [],
    lockedProfile: null,
  };

  try {
    const stored = sessionStorage.getItem(METRICS_STATE_STORAGE_KEY);
    if (!stored) return fallback;

    const parsed = JSON.parse(stored) as PersistedMetricsState;
    if (parsed.version !== 1) return fallback;

    return {
      version: 1,
      selectedPredefinedMetrics: Array.isArray(parsed.selectedPredefinedMetrics) ? parsed.selectedPredefinedMetrics : [],
      selectedLiteratureMetrics: Array.isArray(parsed.selectedLiteratureMetrics) ? parsed.selectedLiteratureMetrics : [],
      customizedMetrics: Array.isArray(parsed.customizedMetrics) ? parsed.customizedMetrics : [],
      selectedCustomizedMetrics: Array.isArray(parsed.selectedCustomizedMetrics) ? parsed.selectedCustomizedMetrics : [],
      lockedProfile: parsed.lockedProfile ?? null,
    };
  } catch (error) {
    console.error('Failed to restore metric selections:', error);
    return fallback;
  }
};

export const MetricsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [initialMetricsState] = useState(restoreMetricsState);
  const [selectedPredefinedMetrics, setSelectedPredefinedMetrics] = useState<PredefinedMetric[]>(initialMetricsState.selectedPredefinedMetrics);
  const [selectedLiteratureMetrics, setSelectedLiteratureMetrics] = useState<LiteratureMetric[]>(initialMetricsState.selectedLiteratureMetrics);
  const [customizedMetrics, setCustomizedMetrics] = useState<CustomizedMetric[]>(initialMetricsState.customizedMetrics);
  const [selectedCustomizedMetrics, setSelectedCustomizedMetrics] = useState<CustomizedMetric[]>(initialMetricsState.selectedCustomizedMetrics);
  const [lockedProfile, setLockedProfile] = useState<LockedProfileData | null>(initialMetricsState.lockedProfile);

  useEffect(() => {
    try {
      const snapshot: PersistedMetricsState = {
        version: 1,
        selectedPredefinedMetrics,
        selectedLiteratureMetrics,
        customizedMetrics,
        selectedCustomizedMetrics,
        lockedProfile,
      };
      sessionStorage.setItem(METRICS_STATE_STORAGE_KEY, JSON.stringify(snapshot));
    } catch (error) {
      console.error('Failed to save metric selections:', error);
    }
  }, [
    selectedPredefinedMetrics,
    selectedLiteratureMetrics,
    customizedMetrics,
    selectedCustomizedMetrics,
    lockedProfile,
  ]);

  const togglePredefinedMetric = useCallback((metric: PredefinedMetric) => {
    setSelectedPredefinedMetrics((prev) => {
      const exists = prev.some((m) => m.name === metric.name);
      if (exists) return prev.filter((m) => m.name !== metric.name);
      return [...prev, metric];
    });
  }, []);

  const toggleLiteratureMetric = useCallback((metric: LiteratureMetric) => {
    setSelectedLiteratureMetrics((prev) => {
      const exists = prev.some((m) => m.metricName === metric.metricName);
      if (exists) return prev.filter((m) => m.metricName !== metric.metricName);
      return [...prev, metric];
    });
  }, []);

  const addCustomizedMetric = useCallback((metric: CustomizedMetric) => {
    setCustomizedMetrics((prev) => [...prev, metric]);
  }, []);

  const removeCustomizedMetric = useCallback((metricId: string) => {
    setCustomizedMetrics((prev) => prev.filter((m) => m.id !== metricId));
    setSelectedCustomizedMetrics((prev) => prev.filter((m) => m.id !== metricId));
  }, []);

  const toggleCustomizedMetric = useCallback((metric: CustomizedMetric) => {
    setSelectedCustomizedMetrics((prev) => {
      const exists = prev.some((m) => m.id === metric.id);
      if (exists) return prev.filter((m) => m.id !== metric.id);
      return [...prev, metric];
    });
  }, []);

  const clearCustomizedMetrics = useCallback(() => {
    setCustomizedMetrics([]);
    setSelectedCustomizedMetrics([]);
  }, []);

  const selectAllCustomizedMetrics = useCallback(() => {
    setSelectedCustomizedMetrics((prev) => {
      const allIds = new Set(customizedMetrics.map((m) => m.id));
      const existingIds = new Set(prev.map((m) => m.id));
      if (allIds.size > 0 && existingIds.size === allIds.size && [...allIds].every((id) => existingIds.has(id))) {
        return [];
      }
      return [...customizedMetrics];
    });
  }, [customizedMetrics]);

  const clearSelectedCustomizedMetrics = useCallback(() => {
    setSelectedCustomizedMetrics([]);
  }, []);

  return (
    <MetricsContext.Provider
      value={{
        selectedPredefinedMetrics,
        togglePredefinedMetric,
        selectedLiteratureMetrics,
        toggleLiteratureMetric,
        customizedMetrics,
        selectedCustomizedMetrics,
        addCustomizedMetric,
        removeCustomizedMetric,
        toggleCustomizedMetric,
        clearCustomizedMetrics,
        selectAllCustomizedMetrics,
        clearSelectedCustomizedMetrics,
        setSelectedCustomizedMetrics,
        lockedProfile,
        setLockedProfile,
      }}
    >
      {children}
    </MetricsContext.Provider>
  );
};

export const useMetrics = () => {
  const context = useContext(MetricsContext);
  if (context === undefined) {
    throw new Error('useMetrics must be used within a MetricsProvider');
  }
  return context;
};
