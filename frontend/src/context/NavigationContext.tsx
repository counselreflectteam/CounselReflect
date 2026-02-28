import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth, useEvaluationState } from '@shared/context';
import { mainSteps } from '../navigationConfig';

interface NavigationContextType {
  completedSteps: number[];
  markStepCompleted: (step: number) => void;
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

export const NavigationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  
  // Restore completed steps from localStorage
  const [completedSteps, setCompletedSteps] = useState<number[]>(() => {
    const stored = localStorage.getItem('completedSteps');
    return stored ? JSON.parse(stored) : [];
  });
  const { hasValidatedApiKey } = useAuth();
  const { conversation } = useEvaluationState();
  const [hasUserConsent, setHasUserConsent] = useState<boolean>(() => {
    return localStorage.getItem(CONSENT_STORAGE_KEY) === 'true';
  });

  const [hasUnsavedResults, setHasUnsavedResults] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null);

  // Automatic Fallback Check
  React.useEffect(() => {
    // Determine if setup requirements are satisfied
    const hasApiKey = hasValidatedApiKey;
    const hasConversation = !!conversation;
    const hasConsent = hasUserConsent;

    // If we are not on intro/setup/paper pages, enforce setup requirements
    const isPublic = mainSteps.some(step => step.path === location.pathname) || location.pathname === '/';
    if (!isPublic && location.pathname !== '/setup') {
      if (!hasApiKey || !hasConversation || !hasConsent) {
        console.warn('Missing setup requirements (API Key, Conversation, or Consent), redirecting to Setup.');
        navigate('/setup');
      }
    }
  }, [location.pathname, hasValidatedApiKey, conversation, hasUserConsent, navigate]);

  // Persist completed steps to localStorage
  React.useEffect(() => {
    localStorage.setItem('completedSteps', JSON.stringify(completedSteps));
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
    const hasSetupRequirements = hasValidatedApiKey && hasConversation && hasUserConsent;

    // Forward navigation gates.
    if (step === 2) return completedSteps.includes(1) && hasSetupRequirements;
    if (step === 3) return completedSteps.includes(3) && hasSetupRequirements;

    return false;
  }, [completedSteps, location.pathname, hasValidatedApiKey, conversation, hasUserConsent]);

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
