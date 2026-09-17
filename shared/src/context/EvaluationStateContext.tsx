import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import {
  Conversation,
  EvaluationResult,
  EvaluationStatus,
  Message,
  MetricPresentationSnapshot,
} from '@shared/types';
import { normalizeRole } from '@shared/utils/conversationParser';

const CONVERSATION_STORAGE_KEY = 'conversation';
const EVALUATION_SNAPSHOT_STORAGE_KEY = 'counselreflectEvaluationSnapshot';

export interface EvaluationRunMetadata {
  metricNames: string[];
  metricLabelMap: Record<string, string>;
  metricPresentation?: Record<string, MetricPresentationSnapshot>;
  selectedMetricCount: number;
  provider: string;
  model: string;
  metricGroups: {
    predefined: string[];
    literature: string[];
    custom: string[];
  };
  savedAt: number;
}

interface EvaluationStateContextType {
  conversation: Conversation | null;
  setConversation: (conv: Conversation | null) => void;
  status: EvaluationStatus;
  setStatus: (status: EvaluationStatus) => void;
  results: EvaluationResult | null;
  setResults: (results: EvaluationResult | null) => void;
  runMetadata: EvaluationRunMetadata | null;
  setRunMetadata: (metadata: EvaluationRunMetadata | null) => void;
  error: string | null;
  setError: (error: string | null) => void;
  resetEvaluation: () => void;
}

const EvaluationStateContext = createContext<EvaluationStateContextType | undefined>(undefined);

interface PersistedEvaluationSnapshot {
  version: 1;
  conversationId: string;
  conversationMessageCount: number;
  status: EvaluationStatus.Complete;
  results: EvaluationResult;
  runMetadata?: EvaluationRunMetadata | null;
  savedAt: number;
}

// Snapshots persisted before the Therapist -> Chatbot rename carry the old
// role value, so restored messages must be re-normalized before enum comparisons.
const normalizeStoredMessages = (messages: Message[] | undefined): Message[] | undefined =>
  messages?.map((msg) => ({ ...msg, role: normalizeRole(String(msg.role)) }));

const normalizeStoredConversation = (conversation: Conversation): Conversation => ({
  ...conversation,
  messages: normalizeStoredMessages(conversation.messages) ?? [],
  messageSelection: conversation.messageSelection
    ? {
        ...conversation.messageSelection,
        sourceMessages: normalizeStoredMessages(conversation.messageSelection.sourceMessages) ?? [],
      }
    : undefined,
});

const restoreConversation = (): Conversation | null => {
  try {
    const stored = sessionStorage.getItem(CONVERSATION_STORAGE_KEY);
    if (stored) return normalizeStoredConversation(JSON.parse(stored));

    const legacyStored = localStorage.getItem(CONVERSATION_STORAGE_KEY);
    if (legacyStored) {
      localStorage.removeItem(CONVERSATION_STORAGE_KEY);
      sessionStorage.setItem(CONVERSATION_STORAGE_KEY, legacyStored);
      return normalizeStoredConversation(JSON.parse(legacyStored));
    }

    return null;
  } catch (error) {
    console.error('Failed to restore conversation from browser storage:', error);
    return null;
  }
};

const removeEvaluationSnapshot = () => {
  try {
    sessionStorage.removeItem(EVALUATION_SNAPSHOT_STORAGE_KEY);
  } catch (error) {
    console.error('Failed to remove evaluation snapshot:', error);
  }
};

const restoreEvaluationSnapshot = (conversation: Conversation | null): PersistedEvaluationSnapshot | null => {
  if (!conversation) return null;

  try {
    const stored = sessionStorage.getItem(EVALUATION_SNAPSHOT_STORAGE_KEY);
    if (!stored) return null;

    const snapshot = JSON.parse(stored) as PersistedEvaluationSnapshot;
    const matchesConversation =
      snapshot.version === 1 &&
      snapshot.conversationId === conversation.id &&
      snapshot.conversationMessageCount === conversation.messages.length &&
      snapshot.status === EvaluationStatus.Complete &&
      snapshot.results;

    if (!matchesConversation) {
      removeEvaluationSnapshot();
      return null;
    }

    return snapshot;
  } catch (error) {
    console.error('Failed to restore evaluation snapshot:', error);
    removeEvaluationSnapshot();
    return null;
  }
};

const restoreInitialState = () => {
  const conversation = restoreConversation();
  const snapshot = restoreEvaluationSnapshot(conversation);

  return {
    conversation,
    status: snapshot ? EvaluationStatus.Complete : EvaluationStatus.Idle,
    results: snapshot?.results ?? null,
    runMetadata: snapshot?.runMetadata ?? null,
  };
};

export const EvaluationStateProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [initialState] = useState(restoreInitialState);
  const [conversation, setConversation] = useState<Conversation | null>(initialState.conversation);
  
  const [status, setStatus] = useState<EvaluationStatus>(initialState.status);
  const [results, setResults] = useState<EvaluationResult | null>(initialState.results);
  const [runMetadata, setRunMetadata] = useState<EvaluationRunMetadata | null>(initialState.runMetadata);
  const [error, setError] = useState<string | null>(null);

  // Persist conversation only for the current browser tab so refreshes do not lose work.
  useEffect(() => {
    try {
      if (conversation) {
        sessionStorage.setItem(CONVERSATION_STORAGE_KEY, JSON.stringify(conversation));
        localStorage.removeItem(CONVERSATION_STORAGE_KEY);
      } else {
        sessionStorage.removeItem(CONVERSATION_STORAGE_KEY);
        localStorage.removeItem(CONVERSATION_STORAGE_KEY);
        removeEvaluationSnapshot();
      }
    } catch (error) {
      console.error('Failed to save conversation to sessionStorage:', error);
    }
  }, [conversation]);

  // Keep completed results available across refreshes in the same browser tab.
  useEffect(() => {
    if (!conversation || !results || status !== EvaluationStatus.Complete) {
      removeEvaluationSnapshot();
      return;
    }

    try {
      const snapshot: PersistedEvaluationSnapshot = {
        version: 1,
        conversationId: conversation.id,
        conversationMessageCount: conversation.messages.length,
        status: EvaluationStatus.Complete,
        results,
        runMetadata,
        savedAt: Date.now(),
      };
      sessionStorage.setItem(EVALUATION_SNAPSHOT_STORAGE_KEY, JSON.stringify(snapshot));
    } catch (error) {
      console.error('Failed to save evaluation snapshot:', error);
    }
  }, [conversation, results, runMetadata, status]);

  const resetEvaluation = () => {
    setConversation(null); // This will trigger the useEffect to remove from localStorage
    setStatus(EvaluationStatus.Idle);
    setResults(null);
    setRunMetadata(null);
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
        runMetadata,
        setRunMetadata,
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
