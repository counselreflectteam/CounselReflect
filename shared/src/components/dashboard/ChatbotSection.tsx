import React, { useEffect, useRef } from 'react';
import { MessageCircle, Send, UserRound } from 'lucide-react';
import { renderMarkdown } from '@shared/utils/renderMarkdown';

interface ChatbotSectionProps {
  chatbotMessages: Array<{ role: string; content: string }>;
  chatbotInput: string;
  setChatbotInput: (value: string) => void;
  isLoadingChatbot: boolean;
  userRole: 'therapist' | 'patient' | null;
  setUserRole: (role: 'therapist' | 'patient' | null) => void;
  onSubmit: (e: React.FormEvent) => void;
  compact?: boolean;
  /** Suppress the cr-opener band when a collapsible zone header owns the threshold. */
  hideOpener?: boolean;
}

/**
 * AI Chatbot section for asking questions about evaluation results
 */
export const ChatbotSection: React.FC<ChatbotSectionProps> = ({
  chatbotMessages,
  chatbotInput,
  setChatbotInput,
  isLoadingChatbot,
  userRole,
  setUserRole,
  onSubmit,
  compact = false,
  hideOpener = false
}) => {
  const messageLogRef = useRef<HTMLDivElement | null>(null);
  const suggestedQuestions = userRole === 'patient'
    ? ['Which turns support the strongest finding?', 'Where was emotion reflected or missed?', 'Compare the first and second half.']
    : ['Which turns support the strongest finding?', 'Where did the response shift?', 'Compare the first and second half.'];

  useEffect(() => {
    if (chatbotMessages.length === 0 && !isLoadingChatbot) return;
    const messageLog = messageLogRef.current;
    if (!messageLog) return;
    messageLog.scrollTo({ top: messageLog.scrollHeight, behavior: 'smooth' });
  }, [chatbotMessages, isLoadingChatbot]);

  return (
    <div className={compact
      ? 'flex min-h-0 flex-col'
      : 'flex h-[min(650px,calc(100dvh-7rem))] min-h-[520px] flex-col max-md:mb-20 max-md:h-[calc(100dvh-16rem)] max-md:min-h-[460px]'}>
      {!hideOpener && (
        <div className="shrink-0">
          <header className="cr-opener">
            <span className="cr-eyebrow">Report inquiry</span>
            <h2 className="cr-section-title mt-1 text-lg md:text-xl">Ask about the report</h2>
            <p className="mt-1 max-w-2xl text-[0.8125rem] leading-5 text-[var(--cr-ink-2)]">
              Request comparisons or supporting turns for a finding. Verify each response against the transcript and evaluation output.
            </p>
          </header>
        </div>
      )}

      <div className={`${hideOpener ? '' : 'mt-5'} flex min-h-0 flex-col overflow-hidden rounded-lg border border-[var(--cr-card-border)] bg-[var(--cr-bg)] ${compact ? '' : 'flex-1'}`}>
        <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-[var(--cr-card-border)] px-4 py-3">
          <span className="text-xs font-semibold text-[var(--cr-ink-2)]">Perspective</span>
          <div className="flex items-center gap-1" role="group" aria-label="Question perspective">
            {[
              { value: null, label: 'General' },
              { value: 'therapist' as const, label: 'Chatbot' },
              { value: 'patient' as const, label: 'Client' }
            ].map((option) => (
              <button
                key={option.label}
                type="button"
                onClick={() => setUserRole(option.value)}
                aria-pressed={userRole === option.value}
                className={`cr-focus rounded-md px-2.5 py-1.5 text-xs font-semibold ${
                  userRole === option.value
                    ? 'bg-[var(--cr-brand-primary-soft)] text-[var(--cr-brand-primary-strong)]'
                    : 'text-[var(--cr-ink-2)] hover:text-[var(--cr-ink)]'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div
          ref={messageLogRef}
          role="log"
          aria-live="polite"
          aria-label="Report conversation"
          className={`space-y-4 overflow-y-auto bg-[var(--cr-muted)]/45 p-4 md:p-5 ${
            compact ? 'min-h-[220px] max-h-[min(360px,45dvh)]' : 'flex-1'
          }`}
        >
          {chatbotMessages.length === 0 && (
            <div className="flex items-end gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--cr-brand-primary)] text-white">
                <MessageCircle className="h-4 w-4" aria-hidden />
              </span>
              <div className="max-w-[82%] rounded-2xl rounded-bl-md border border-[var(--cr-card-border)] bg-[var(--cr-bg)] px-4 py-3 text-sm leading-6 text-[var(--cr-ink)]">
                <p>Ask about a finding, a comparison, or the transcript turns behind a result.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {suggestedQuestions.map((question) => (
                    <button
                      key={question}
                      type="button"
                      onClick={() => setChatbotInput(question)}
                      className="cr-focus rounded-full border border-[var(--cr-input-border)] bg-[var(--cr-bg)] px-3 py-1.5 text-left text-xs text-[var(--cr-ink-2)] hover:border-[var(--cr-brand-primary)] hover:text-[var(--cr-ink)]"
                    >
                      {question}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {chatbotMessages.map((msg, idx) => {
            const isUser = msg.role === 'user';
            return (
              <div key={idx} className={`flex items-end gap-2.5 ${isUser ? 'justify-end' : 'justify-start'}`}>
                {!isUser && (
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--cr-brand-primary)] text-white">
                    <MessageCircle className="h-4 w-4" aria-hidden />
                  </span>
                )}
                <div
                  className={`max-w-[78%] rounded-2xl px-4 py-2.5 text-[0.9375rem] leading-relaxed ${
                    isUser
                      ? 'rounded-br-md bg-[var(--cr-brand-primary)] text-white'
                      : 'rounded-bl-md border border-[var(--cr-card-border)] bg-[var(--cr-bg)] text-[var(--cr-ink)] [&_code]:bg-[var(--cr-muted)] [&_pre]:bg-[var(--cr-muted)]'
                  }`}
                >
                  <div className="whitespace-pre-wrap">
                    {isUser ? msg.content : renderMarkdown(msg.content)}
                  </div>
                </div>
                {isUser && (
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--cr-card-border)] bg-[var(--cr-bg)] text-[var(--cr-ink-2)]">
                    <UserRound className="h-4 w-4" aria-hidden />
                  </span>
                )}
              </div>
            );
          })}

          {isLoadingChatbot && (
            <div className="flex items-end gap-2.5" aria-label="Waiting for response">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--cr-brand-primary)] text-white">
                <MessageCircle className="h-4 w-4" aria-hidden />
              </span>
              <div className="flex gap-1.5 rounded-2xl rounded-bl-md border border-[var(--cr-card-border)] bg-[var(--cr-bg)] px-4 py-3.5">
                {[0, 150, 300].map((delay) => (
                  <span
                    key={delay}
                    className="h-2 w-2 animate-bounce rounded-full bg-[var(--cr-ink-3)]"
                    style={{ animationDelay: `${delay}ms` }}
                    aria-hidden
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        <form onSubmit={onSubmit} className="flex shrink-0 items-center gap-2 border-t border-[var(--cr-card-border)] bg-[var(--cr-bg)] p-3 md:p-4">
          <input
            type="text"
            value={chatbotInput}
            onChange={(e) => setChatbotInput(e.target.value)}
            placeholder="Ask a question about this report"
            aria-label="Ask a question about this report"
            className="cr-focus h-11 w-full flex-1 rounded-full border border-[var(--cr-input-border)] bg-[var(--cr-muted)] px-4 text-[0.9375rem] text-[var(--cr-ink)] placeholder:text-[var(--cr-ink-3)]"
            disabled={isLoadingChatbot}
          />
          <button
            type="submit"
            disabled={!chatbotInput.trim() || isLoadingChatbot}
            className="cr-focus flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--cr-brand-primary)] text-white transition-colors hover:bg-[var(--cr-brand-primary-strong)] disabled:cursor-not-allowed disabled:bg-[var(--cr-muted)] disabled:text-[var(--cr-ink-3)]"
            aria-label="Send question"
            title="Send question"
          >
            <Send className="h-4 w-4" aria-hidden />
          </button>
        </form>
      </div>
    </div>
  );
};
