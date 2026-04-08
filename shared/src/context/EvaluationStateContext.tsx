import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Conversation, EvaluationResult, EvaluationStatus } from '@shared/types';

interface EvaluationStateContextType {
  conversation: Conversation | null;
  setConversation: (conv: Conversation | null) => void;
  status: EvaluationStatus;
  setStatus: (status: EvaluationStatus) => void;
  results: EvaluationResult | null;
  setResults: (results: EvaluationResult | null) => void;
  error: string | null;
  setError: (error: string | null) => void;
  resetEvaluation: () => void;
}

const EvaluationStateContext = createContext<EvaluationStateContextType | undefined>(undefined);

export const EvaluationStateProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Restore conversation from localStorage
  const [conversation, setConversation] = useState<Conversation | null>(() => {
    try {
      const stored = localStorage.getItem('conversation');
      return stored ? JSON.parse(stored) : null;
    } catch (error) {
      console.error('Failed to restore conversation from localStorage:', error);
      return null;
    }
  });
  
  const [status, setStatus] = useState<EvaluationStatus>(EvaluationStatus.Idle);
  const [results, setResults] = useState<EvaluationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Persist conversation to localStorage whenever it changes
  useEffect(() => {
    try {
      if (conversation) {
        localStorage.setItem('conversation', JSON.stringify(conversation));
      } else {
        localStorage.removeItem('conversation');
      }
    } catch (error) {
      console.error('Failed to save conversation to localStorage:', error);
    }
  }, [conversation]);

  const resetEvaluation = () => {
    setConversation(null); // This will trigger the useEffect to remove from localStorage
    setStatus(EvaluationStatus.Idle);
    setResults(null);
    setError(null);
  };

  return (
    <EvaluationStateContext.Provider
      value={{
        conversation,
        setConversation,
        status,
        setStatus,
        results,
        setResults,
        error,
        setError,
        resetEvaluation,
      }}
    >
      {children}
    </EvaluationStateContext.Provider>
  );
};

export const useEvaluationState = () => {
  const context = useContext(EvaluationStateContext);
  if (context === undefined) {
    throw new Error('useEvaluationState must be used within an EvaluationStateProvider');
  }
  return context;
};
