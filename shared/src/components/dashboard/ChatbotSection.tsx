import React from 'react';
import { MessageSquare, Send, Sparkles } from 'lucide-react';
import { renderMarkdown } from '@shared/utils/renderMarkdown';

interface ChatbotSectionProps {
  chatbotMessages: Array<{ role: string; content: string }>;
  chatbotInput: string;
  setChatbotInput: (value: string) => void;
  isLoadingChatbot: boolean;
  userRole: 'therapist' | 'patient' | null;
  setUserRole: (role: 'therapist' | 'patient' | null) => void;
  onSubmit: (e: React.FormEvent) => void;
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
  onSubmit
}) => {
  return (
    <div className="bg-gradient-to-br from-white via-slate-50 to-indigo-50/30 dark:from-slate-800 dark:via-slate-800 dark:to-indigo-900/10 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 shadow-lg hover:shadow-xl transition-all duration-300 p-6 flex flex-col h-[650px]">
      {/* Header */}
      <div className="flex items-center space-x-3 mb-6 flex-shrink-0">
        <div className="p-3 bg-gradient-to-br from-violet-500 to-fuchsia-600 rounded-xl shadow-lg shadow-violet-500/30">
          <MessageSquare className="w-6 h-6 text-white" />
        </div>
        <div>
          <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">Ask About Results</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">AI-powered analysis assistant</p>
        </div>
      </div>

      {/* Chat Container */}
      <div className="flex-1 bg-white dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-700/50 shadow-inner overflow-hidden flex flex-col">

      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50 dark:bg-slate-900/50">
        {/* Role Selection */}
        {!userRole && chatbotMessages.length === 0 && (
          <div className="text-center py-6 h-full flex flex-col justify-center">
            <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-violet-100 to-indigo-100 dark:from-violet-900/30 dark:to-indigo-900/30 rounded-2xl flex items-center justify-center">
              <MessageSquare className="w-8 h-8 text-indigo-500 dark:text-indigo-400" />
            </div>
            <p className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">First, tell me who you are</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mb-6">This helps me tailor my feedback for you</p>

            <div className="flex justify-center gap-4">
              <button
                onClick={() => setUserRole('therapist')}
                className="px-6 py-4 bg-gradient-to-br from-emerald-500 to-emerald-600 text-white rounded-xl hover:from-emerald-600 hover:to-emerald-700 transition-all shadow-md hover:shadow-lg hover:-translate-y-1 transform"
              >
                <div className="text-2xl mb-1 text-center">🩺</div>
                <div className="text-base font-medium">I'm the Therapist</div>
              </button>
              <button
                onClick={() => setUserRole('patient')}
                className="px-6 py-4 bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-xl hover:from-blue-600 hover:to-blue-700 transition-all shadow-md hover:shadow-lg hover:-translate-y-1 transform"
              >
                <div className="text-2xl mb-1 text-center">🧑</div>
                <div className="text-base font-medium">I'm the Patient</div>
              </button>
            </div>
          </div>
        )}

        {/* Ready to chat */}
        {userRole && chatbotMessages.length === 0 && (
          <div className="text-center py-6">
            <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-violet-100 to-indigo-100 dark:from-violet-900/30 dark:to-indigo-900/30 rounded-2xl flex items-center justify-center">
              <MessageSquare className="w-8 h-8 text-indigo-500 dark:text-indigo-400" />
            </div>
            <p className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">
              {userRole === 'therapist' ? "Let's review your session" : "Let's discuss your therapist's approach"}
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">
              {userRole === 'therapist'
                ? "I'll focus on your techniques and how your patient responded"
                : "I'll focus on how your therapist performed and what worked well"}
            </p>

            {/* Quick action buttons based on role */}
            <div className="flex flex-wrap justify-center gap-2">
              {userRole === 'therapist'
                ? ['How did my patient respond?', 'What techniques worked?', 'How can I improve?'].map((q) => (
                  <button
                    key={q}
                    onClick={() => { setChatbotInput(q); }}
                    className="px-3 py-1.5 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-full text-slate-600 dark:text-slate-300 hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                  >
                    {q}
                  </button>
                ))
                : ['How did my therapist do?', 'Was I being heard?', 'What could be better?'].map((q) => (
                  <button
                    key={q}
                    onClick={() => { setChatbotInput(q); }}
                    className="px-3 py-1.5 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-full text-slate-600 dark:text-slate-300 hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                  >
                    {q}
                  </button>
                ))
              }
            </div>

            <button
              onClick={() => setUserRole(null)}
              className="mt-4 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
            >
              Switch role
            </button>
          </div>
        )}

        {/* Messages */}
        {chatbotMessages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex items-end gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {msg.role === 'assistant' && (
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-3.5 h-3.5 text-white" />
              </div>
            )}
            <div
              className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${msg.role === 'user'
                  ? 'bg-gradient-to-r from-indigo-500 to-indigo-600 text-white rounded-br-md'
                  : 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-sm border border-slate-100 dark:border-slate-700 rounded-bl-md'
                }`}
            >
              <div className="text-sm whitespace-pre-wrap">
                {msg.role === 'assistant' ? renderMarkdown(msg.content) : msg.content}
              </div>
            </div>
            {msg.role === 'user' && (
              <div className="w-7 h-7 rounded-full bg-slate-200 dark:bg-slate-600 flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-300">You</span>
              </div>
            )}
          </div>
        ))}

        {/* Loading indicator */}
        {isLoadingChatbot && (
          <div className="flex items-end gap-2 justify-start">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-3.5 h-3.5 text-white" />
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-2xl rounded-bl-md px-4 py-3 shadow-sm border border-slate-100 dark:border-slate-700">
              <div className="flex space-x-1.5">
                <div className="w-2 h-2 bg-slate-300 dark:bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                <div className="w-2 h-2 bg-slate-300 dark:bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                <div className="w-2 h-2 bg-slate-300 dark:bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Chat Input */}
      <div className="p-4 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700">
        <form onSubmit={onSubmit} className="flex items-center gap-2">
          <input
            type="text"
            value={chatbotInput}
            onChange={(e) => setChatbotInput(e.target.value)}
            placeholder="Type your question..."
            className="flex-1 px-4 py-2.5 rounded-full border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            disabled={isLoadingChatbot}
          />
          <button
            type="submit"
            disabled={!chatbotInput.trim() || isLoadingChatbot}
            className="p-2.5 bg-gradient-to-r from-indigo-500 to-indigo-600 text-white rounded-full hover:from-indigo-600 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-md transition-all hover:shadow-lg"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
      </div>
    </div>
  );
};
