import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth, useEvaluationState } from '@shared/context';
import { EvaluationStatus } from '@shared/types';
import { pipelineSteps } from '../navigationConfig';
import { isProviderReady } from '../utils/providerReadiness';

interface NavigationContextType {
  completedSteps: number[];
  markStepCompleted: (step: number) => void;
  isStepComplete: (step: number) => boolean;
  canNavigateTo: (step: number) => boolean;
  hasUserConsent: boolean;
  setHasUserConsent: (value: boolean) => void;
  hasUnsavedResults: boolean;
  setHasUnsavedResults: (value: boolean) => void;
  pendingNavigation: string | null;
  setPendingNavigation: (path: string | null) => void;
  confirmNavigation: () => void;
  cancelNavigation: () => void;
}

const NavigationContext = createContext<NavigationContextType | undefined>(undefined);
const CONSENT_STORAGE_KEY = 'counselreflectUserConsentAccepted';
const COMPLETED_STEPS_STORAGE_KEY = 'completedSteps';

const readCompletedSteps = (): number[] => {
  localStorage.removeItem(COMPLETED_STEPS_STORAGE_KEY);
  try {
    const stored = sessionStorage.getItem(COMPLETED_STEPS_STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed)
      ? parsed.filter((step): step is number => Number.isInteger(step))
      : [];
  } catch {
    sessionStorage.removeItem(COMPLETED_STEPS_STORAGE_KEY);
    return [];
  }
};

export const NavigationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  
  // Workflow milestones belong to the current browser tab. Persistent history
  // made a completed report appear complete again when a new review started.
  const [completedSteps, setCompletedSteps] = useState<number[]>(readCompletedSteps);
  const {
    apiKeys,
    selectedProvider,
    selectedModel,
    serverKeyStatus,
    serverKeyStatusLoaded,
    hasValidatedApiKey
  } = useAuth();
  const { conversation, results, status } = useEvaluationState();
  const [hasUserConsent, setHasUserConsent] = useState<boolean>(() => {
    return localStorage.getItem(CONSENT_STORAGE_KEY) === 'true';
  });

  const [hasUnsavedResults, setHasUnsavedResults] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null);

  // Automatic Fallback Check
  React.useEffect(() => {
    // Wait for the async server-key-status fetch to settle before judging
    // credentials: on refresh it starts as {}, and redirecting immediately
    // would bounce server-managed-key users to /setup on every reload of
    // /configure or /results.
    if (!serverKeyStatusLoaded) return;

    // Determine if setup requirements are satisfied
    const hasProviderSetup = isProviderReady({
      selectedProvider,
      selectedModel,
      apiKeys,
      serverKeyStatus,
      hasValidatedApiKey
    });
    const hasConversation = !!conversation;
    const hasConsent = hasUserConsent;

    // Gate evaluation steps; let the router send unknown or retired URLs home.
    const requiresSetup = pipelineSteps.some(step => step.step > 1 && step.path === location.pathname);
    if (requiresSetup) {
      if (!hasProviderSetup || !hasConversation || !hasConsent) {
        console.warn('Missing setup requirements (Provider setup, Conversation, or Consent), redirecting to Setup.');
        navigate('/setup');
      }
    }
  }, [location.pathname, apiKeys, selectedProvider, selectedModel, serverKeyStatus, hasValidatedApiKey, conversation, hasUserConsent, navigate, serverKeyStatusLoaded]);

  // Persist milestones only for refresh continuity in this browser tab.
  React.useEffect(() => {
    sessionStorage.setItem(COMPLETED_STEPS_STORAGE_KEY, JSON.stringify(completedSteps));
  }, [completedSteps]);

  React.useEffect(() => {
    localStorage.setItem(CONSENT_STORAGE_KEY, String(hasUserConsent));
  }, [hasUserConsent]);

  const markStepCompleted = useCallback((step: number) => {
    setCompletedSteps(prev => {
      if (prev.includes(step)) return prev;
      return [...prev, step];
    });
  }, []);

  const isStepComplete = useCallback((step: number): boolean => {
    const hasConversation = Boolean(conversation?.messages.length);
    const hasProviderSetup = isProviderReady({
      selectedProvider,
      selectedModel,
      apiKeys,
      serverKeyStatus,
      hasValidatedApiKey
    });
    const hasSetupRequirements = hasProviderSetup && hasConversation && hasUserConsent;
    const hasCompletedReport = Boolean(results && status === EvaluationStatus.Complete);

    if (step === 1) return hasSetupRequirements;
    if (step === 2) {
      return status === EvaluationStatus.Loading || status === EvaluationStatus.Error || hasCompletedReport;
    }
    if (step === 3) return hasCompletedReport;
    return completedSteps.includes(step);
  }, [completedSteps, conversation, apiKeys, selectedProvider, selectedModel, serverKeyStatus, hasValidatedApiKey, hasUserConsent, results, status]);

  const canNavigateTo = useCallback((step: number): boolean => {
    if (step <= 0) return true;

    const pathToStep: Record<string, number> = {
      '/intro': 0,
      '/setup': 1,
      '/configure': 2,
      '/results': 3,
    };
    const currentStep = pathToStep[location.pathname] ?? 0;

    // Setup (1) is always reachable.
    if (step === 1) return true;

    // Allow going back exactly one step (e.g., results -> configure).
    if (step === currentStep - 1) return true;

    // Current page is always selectable.
    if (step === currentStep) return true;

    const hasConversation = !!conversation;
    const hasProviderSetup = isProviderReady({
      selectedProvider,
      selectedModel,
      apiKeys,
      serverKeyStatus,
      hasValidatedApiKey
    });
    const hasSetupRequirements = hasProviderSetup && hasConversation && hasUserConsent;

    // Forward navigation gates.
    if (step === 2) return completedSteps.includes(1) && hasSetupRequirements;
    if (step === 3) return completedSteps.includes(3) && hasSetupRequirements && !!results && status === EvaluationStatus.Complete;

    return false;
  }, [completedSteps, location.pathname, apiKeys, selectedProvider, selectedModel, serverKeyStatus, hasValidatedApiKey, conversation, hasUserConsent, results, status]);

  const confirmNavigation = useCallback(() => {
    if (pendingNavigation) {
      setHasUnsavedResults(false);
      const path = pendingNavigation;
      setPendingNavigation(null);
      navigate(path);
    }
  }, [pendingNavigation, navigate]);

  const cancelNavigation = useCallback(() => {
    setPendingNavigation(null);
  }, []);

  return (
    <NavigationContext.Provider
      value={{
        completedSteps,
        markStepCompleted,
        isStepComplete,
        canNavigateTo,
        hasUserConsent,
        setHasUserConsent,
        hasUnsavedResults,
        setHasUnsavedResults,
        pendingNavigation,
        setPendingNavigation,
        confirmNavigation,
        cancelNavigation,
      }}
    >
      {children}
    </NavigationContext.Provider>
  );
};

export const useNavigationState = () => {
  const context = useContext(NavigationContext);
  if (context === undefined) {
    throw new Error('useNavigationState must be used within a NavigationProvider');
  }
  return context;
};
