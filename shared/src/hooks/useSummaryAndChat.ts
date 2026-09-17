import { useState, useEffect, useRef } from 'react';
import { generateSummary, sendChatbotMessage, SummaryResponse } from '@shared/services/summaryService';

const SUMMARY_CACHE_PREFIX = 'counselreflect_summary_';
const MAX_CACHED_SUMMARIES = 5;

// Keep only the most recent cached summaries so the cache cannot grow without
// bound and eventually exhaust the localStorage quota shared with settings/keys.
const pruneSummaryCache = (currentKey: string, keep: number = MAX_CACHED_SUMMARIES - 1) => {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(SUMMARY_CACHE_PREFIX) && k !== currentKey)
      // Key suffix is Date.now(), so a numeric sort (descending) gives recency.
      .sort((a, b) => Number(b.slice(SUMMARY_CACHE_PREFIX.length)) - Number(a.slice(SUMMARY_CACHE_PREFIX.length)))
      .slice(keep)
      .forEach((k) => localStorage.removeItem(k));
  } catch (error) {
    console.warn('Failed to prune summary cache:', error);
  }
};

interface UseSummaryAndChatProps {
  conversation: any;
  results: any;
  apiKeys: any;
  selectedProvider: string;
  selectedModel: string;
  useTurnNumbers?: boolean;
}

/**
 * Custom hook to manage summary generation and chatbot interactions
 */
export const useSummaryAndChat = ({
  conversation,
  results,
  apiKeys,
  selectedProvider,
  selectedModel,
  useTurnNumbers = false
}: UseSummaryAndChatProps) => {
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [isLoadingSummary, setIsLoadingSummary] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  
  const [chatbotMessages, setChatbotMessages] = useState<Array<{ role: string; content: string }>>([]);
  const [chatbotInput, setChatbotInput] = useState('');
  const [isLoadingChatbot, setIsLoadingChatbot] = useState(false);
  const [userRole, setUserRole] = useState<'therapist' | 'patient' | null>(null);
  
  const summaryGeneratedRef = useRef(false);
  const getSummaryCacheKey = () => {
    const timestamp = results?.timestamp;
    if (!timestamp) return null;
    return `${SUMMARY_CACHE_PREFIX}${timestamp}`;
  };

  // Reset generation marker when a new result set arrives
  useEffect(() => {
    summaryGeneratedRef.current = false;
  }, [results?.timestamp]);

  // Load cached summary for the current result set if available
  useEffect(() => {
    if (!results) return;
    const cacheKey = getSummaryCacheKey();
    if (!cacheKey) return;

    try {
      const raw = localStorage.getItem(cacheKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as SummaryResponse;
      setSummary(parsed);
      summaryGeneratedRef.current = true;
    } catch (error) {
      console.warn('Failed to restore cached summary:', error);
    }
  }, [results?.timestamp]);

  // Auto-generate summary when results are available
  useEffect(() => {
    if (results && conversation && !summary && !isLoadingSummary && !summaryGeneratedRef.current) {
      summaryGeneratedRef.current = true;
      handleGenerateSummary();
    }
  }, [results, conversation]);

  const handleGenerateSummary = async () => {
    if (!conversation || !results) return;

    setIsLoadingSummary(true);
    setSummaryError(null);
    try {
      const conversationTurns = conversation.messages.map((msg: any) => ({
        role: msg.role.toLowerCase(),
        content: msg.content
      }));

      const summaryData = await generateSummary({
        conversation: conversationTurns,
        evaluation_results: results,
        api_key: apiKeys[selectedProvider as keyof typeof apiKeys] || '',
        provider: selectedProvider,
        model: selectedModel,
        use_turn_numbers: useTurnNumbers
      });

      setSummary(summaryData);
      const cacheKey = getSummaryCacheKey();
      if (cacheKey) {
        pruneSummaryCache(cacheKey);
        // Caching is best-effort: a storage/quota failure must not surface as a
        // summary error after the summary was already generated and rendered.
        try {
          localStorage.setItem(cacheKey, JSON.stringify(summaryData));
        } catch {
          try {
            // Quota still exceeded: evict all other cached summaries and retry once.
            pruneSummaryCache(cacheKey, 0);
            localStorage.setItem(cacheKey, JSON.stringify(summaryData));
          } catch (storageError) {
            console.warn('Failed to cache summary:', storageError);
          }
        }
      }
    } catch (error: any) {
      console.error('Error generating summary:', error);
      setSummaryError(error.message || 'Failed to generate summary');
    } finally {
      setIsLoadingSummary(false);
    }
  };

  const handleChatbotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatbotInput.trim() || !conversation || !results) return;

    const userMessage = chatbotInput.trim();
    setChatbotInput('');

    // Add user message
    const newMessages = [...chatbotMessages, { role: 'user', content: userMessage }];
    setChatbotMessages(newMessages);
    setIsLoadingChatbot(true);

    try {
      const conversationTurns = conversation.messages.map((msg: any) => ({
        role: msg.role.toLowerCase(),
        content: msg.content
      }));

      const response = await sendChatbotMessage({
        conversation: conversationTurns,
        evaluation_results: results,
        messages: newMessages,
        api_key: apiKeys[selectedProvider as keyof typeof apiKeys] || '',
        provider: selectedProvider,
        model: selectedModel,
        user_role: userRole || undefined,
        use_turn_numbers: useTurnNumbers
      });

      // Add assistant response
      setChatbotMessages([...newMessages, { role: 'assistant', content: response.message }]);
    } catch (error: any) {
      console.error('Error in chatbot:', error);
      let errorMsg = 'Sorry, I encountered an error. ';
      if (error.response?.data?.detail) {
        errorMsg += error.response.data.detail;
      } else if (error.response?.status === 404) {
        errorMsg += 'The chatbot service is not available. Please restart the API server.';
      } else if (error.code === 'ERR_NETWORK') {
        errorMsg += 'Cannot connect to the server. Please make sure the API is running.';
      } else {
        errorMsg += 'Please check your API key and try again.';
      }
      setChatbotMessages([...newMessages, {
        role: 'assistant',
        content: errorMsg
      }]);
    } finally {
      setIsLoadingChatbot(false);
    }
  };

  const resetSummary = () => {
    const cacheKey = getSummaryCacheKey();
    if (cacheKey) {
      localStorage.removeItem(cacheKey);
    }
    summaryGeneratedRef.current = false;
    setSummary(null);
    handleGenerateSummary();
  };

  return {
    // Summary state
    summary,
    isLoadingSummary,
    summaryError,
    handleGenerateSummary,
    resetSummary,
    
    // Chatbot state
    chatbotMessages,
    chatbotInput,
    setChatbotInput,
    isLoadingChatbot,
    userRole,
    setUserRole,
    handleChatbotSubmit
  };
};
