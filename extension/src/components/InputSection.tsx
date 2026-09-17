
import React, { useState, useEffect } from 'react';
import { UploadCloud, FileText, X, Globe, RotateCcw, Trash2 } from 'lucide-react';
import { Conversation, Message, Role, EvaluationStatus } from '@shared/types';
import { parseConversation } from '@shared/utils';
import { useEvaluationState } from '@shared/context';
import toast from 'react-hot-toast';
import { sendToContent } from '../utils/bridge';

interface ScrapeResponse {
  platform: string;
  messages: Message[];
  success: boolean;
  error?: string;
}

const SUPPORTED_FILE_EXTENSIONS = new Set(['json', 'txt', 'csv']);
const MAX_TRANSCRIPT_FILE_BYTES = 10 * 1024 * 1024;

export const InputSection: React.FC = () => {
  const { conversation, status, setConversation, setResults, setStatus } = useEvaluationState();
  const [dragActive, setDragActive] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<Message[]>([]);
  const [removedMessageIds, setRemovedMessageIds] = useState<Set<string>>(() => new Set());
  const [hasRestoredFromStorage, setHasRestoredFromStorage] = useState(false);

  const isScrapedPreview = Boolean(conversation?.id.startsWith('scraped-'));
  const retainedMessageCount = previewData.reduce(
    (count, message) => count + (removedMessageIds.has(message.id) ? 0 : 1),
    0
  );
  const removedMessageCount = previewData.length - retainedMessageCount;
  const isEvaluationRunning = status === EvaluationStatus.Loading;

  // Hydrate the local preview from a conversation restored out of
  // sessionStorage by EvaluationStateProvider, so reopening the sidebar does
  // not lose the loaded transcript (or a completed evaluation snapshot).
  useEffect(() => {
    if (!hasRestoredFromStorage && conversation && conversation.messages.length > 0) {
      setFileName(conversation.title || 'Restored conversation');
      setPreviewData(conversation.messages);
      setHasRestoredFromStorage(true);
    }
  }, [conversation, hasRestoredFromStorage]);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const [isScraping, setIsScraping] = useState(false);

  const handleConversationLoaded = (conv: Conversation) => {
    // A user-initiated load supersedes any restored conversation; make sure
    // the hydration effect above never overwrites the fresher local state.
    setHasRestoredFromStorage(true);
    setRemovedMessageIds(new Set());
    setConversation(conv);
    setResults(null);
    setStatus(EvaluationStatus.Idle);

    sendToContent({ type: 'CLEAR_TOOLTIPS' }).catch(() => {
      // No tooltips to clear if the content script is unreachable
    });
  };

  const scrapeCurrentPage = async () => {
    setIsScraping(true);
    toast.loading('Scraping page content...', { id: 'scrape' });

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      const scrapePromise = sendToContent<ScrapeResponse>({ type: 'SCRAPE_REQUEST' });
      // Mark late rejections as handled so a timeout win never leaves an
      // unhandled promise rejection behind.
      scrapePromise.catch(() => {});

      const response = await Promise.race([
        scrapePromise,
        new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error('Scraping timeout. Please try again.')), 10000);
        })
      ]);

      if (response && response.success && response.messages && response.messages.length > 0) {
        const platformName = response.platform.charAt(0).toUpperCase() + response.platform.slice(1);
        const normalizedMessages = response.messages;

        setFileName(`${platformName}_Conversation.json`);
        setPreviewData(normalizedMessages);
        handleConversationLoaded({
          id: `scraped-${Date.now()}`,
          title: `${platformName} Scraped Content`,
          messages: normalizedMessages
        });
        toast.success('Conversation scraped.', { id: 'scrape' });
      } else {
        toast.error(response?.error ?? 'Failed to scrape conversation. Unsupported platform or no conversation found.', { id: 'scrape' });
      }
    } catch (error) {
      console.error('Scraping error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to scrape page', { id: 'scrape' });
    } finally {
      clearTimeout(timeoutId);
      setIsScraping(false);
    }
  };

  const parseFile = (content: string, name: string) => {
    const extension = (name.split('.').pop() || '').toLowerCase();
    const messages = parseConversation(content, extension);

    if (messages.length === 0) {
      // A failed parse must not replace the current conversation with an
      // empty one (or leave a stale fileName suggesting a loaded transcript);
      // report the problem and keep the existing state intact.
      toast.error(
        content.trim().length > 0
          ? 'Could not parse any messages from the file. Please check the file format.'
          : 'The selected file is empty.'
      );
      return;
    }

    setFileName(name);
    setPreviewData(messages);
    handleConversationLoaded({
      id: `conv-${Date.now()}`,
      title: name,
      messages
    });
  };

  const loadFile = (file: File) => {
    const extension = (file.name.split('.').pop() || '').toLowerCase();
    if (!SUPPORTED_FILE_EXTENSIONS.has(extension)) {
      toast.error('Choose a .json, .txt, or .csv transcript file.');
      return;
    }
    if (file.size > MAX_TRANSCRIPT_FILE_BYTES) {
      toast.error('The transcript file is larger than 10 MB. Choose a smaller file.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      parseFile(typeof reader.result === 'string' ? reader.result : '', file.name);
    };
    reader.onerror = () => {
      toast.error('Could not read the selected transcript file.');
    };
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      loadFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      loadFile(e.target.files[0]);
    }
    // Allow choosing the same file again after a parse/read error.
    e.target.value = '';
  };

  const updateScrapedSelection = (nextRemovedMessageIds: Set<string>) => {
    if (!conversation || !isScrapedPreview) return;
    if (isEvaluationRunning) {
      toast.error('Wait for the current evaluation to finish or cancel it before editing.');
      return;
    }

    const retainedMessages = previewData.filter(
      (message) => !nextRemovedMessageIds.has(message.id)
    );

    setRemovedMessageIds(nextRemovedMessageIds);
    setConversation({ ...conversation, messages: retainedMessages });
    // A transcript edit invalidates any scores produced for its old turn
    // ordering. Clear both sidebar results and host-page artifacts before the
    // next evaluation.
    setResults(null);
    setStatus(EvaluationStatus.Idle);
    sendToContent({ type: 'CLEAR_TOOLTIPS' }).catch(() => {});
    sendToContent({ type: 'CLEAR_HIGHLIGHTS' }).catch(() => {});
  };

  const removeScrapedMessage = (messageId: string) => {
    // Keeping one turn prevents an apparently loaded transcript from becoming
    // unevaluable. The whole transcript can still be discarded with the
    // separate "Remove transcript" action above the preview.
    if (retainedMessageCount <= 1) {
      toast.error('Keep at least one turn, or remove the whole transcript.');
      return;
    }

    const nextRemovedMessageIds = new Set(removedMessageIds);
    nextRemovedMessageIds.add(messageId);
    updateScrapedSelection(nextRemovedMessageIds);
  };

  const restoreScrapedMessage = (messageId: string) => {
    const nextRemovedMessageIds = new Set(removedMessageIds);
    nextRemovedMessageIds.delete(messageId);
    updateScrapedSelection(nextRemovedMessageIds);
  };

  const restoreAllScrapedMessages = () => {
    updateScrapedSelection(new Set());
  };



  return (
    <div className="space-y-3">
      {/* Upload / scrape area — dashed well punching through the module tint */}
      <div
        className={`cr-well relative flex flex-col items-center border-dashed px-3 py-6 text-center transition-colors duration-200 ${
          dragActive
            ? 'border-brand-500 bg-brand-50 dark:border-brand-400 dark:bg-brand-950/40'
            : 'hover:border-brand-400 dark:hover:border-brand-500'
        }`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        {fileName ? (
          <FileText className="h-6 w-6 text-[var(--cr-ink-2)]" aria-hidden />
        ) : (
          <UploadCloud className="h-6 w-6 text-[var(--cr-ink-3)]" aria-hidden />
        )}

        <h3 className="mt-2 text-sm font-bold text-[var(--cr-ink)]">
          {fileName ? 'Transcript loaded' : 'Add a transcript'}
        </h3>
        <p className="mt-1 text-xs text-[var(--cr-ink-2)]">
          {fileName ? fileName : 'Scrape this page, or drop or browse a .json, .txt or .csv file.'}
        </p>

        {!fileName ? (
          <div className="mt-4 flex w-full flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={scrapeCurrentPage}
              disabled={isScraping}
              className="cr-btn cr-btn-primary cr-focus h-9 px-4 text-sm"
            >
              <Globe className="h-4 w-4" aria-hidden />
              {isScraping ? 'Scraping…' : 'Scrape page'}
            </button>
            <label className="cr-btn cr-btn-secondary cr-focus-within h-9 cursor-pointer px-4 text-sm">
              {/* Kept focusable (sr-only, not display:none) so keyboard users
                  can reach it and open the picker with Enter/Space. */}
              <input
                type="file"
                className="sr-only"
                accept=".json,.txt,.csv"
                onChange={handleFileChange}
              />
              <UploadCloud className="h-4 w-4" aria-hidden />
              Browse file
            </label>
          </div>
        ) : (
          <button
            type="button"
            disabled={isEvaluationRunning}
            onClick={(e) => {
              e.stopPropagation();
              setFileName(null);
              setPreviewData([]);
              setRemovedMessageIds(new Set());
              setConversation(null);
              setResults(null);
              setStatus(EvaluationStatus.Idle);
              // Also tear down the on-page overlays from the discarded run —
              // otherwise tooltips and toxic badges keep showing its scores.
              sendToContent({ type: 'CLEAR_TOOLTIPS' }).catch(() => {});
              sendToContent({ type: 'CLEAR_HIGHLIGHTS' }).catch(() => {});
            }}
            className="cr-btn cr-focus mt-3 h-9 border border-[var(--cr-input-border)] px-4 text-xs text-rose-600 hover:bg-[var(--cr-muted)] disabled:opacity-50 dark:text-rose-400"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
            Remove transcript
          </button>
        )}
      </div>

      {/* Preview — well with internal scroll, inside the module */}
      <div className="cr-well flex h-[300px] flex-col overflow-hidden">
        <div className="flex items-center gap-2 border-b border-[var(--cr-rule-on-muted)] px-3 py-2">
          <span className="min-w-0 truncate text-xs font-semibold text-[var(--cr-ink)]">
            {fileName || 'No transcript loaded'}
          </span>
          <span
            aria-live="polite"
            className="ml-auto shrink-0 text-xs text-[var(--cr-ink-3)]"
          >
            {isScrapedPreview && previewData.length > 0
              ? `${retainedMessageCount} of ${previewData.length} kept`
              : `${previewData.length} turns`}
          </span>
        </div>
        {isScrapedPreview && previewData.length > 0 && (
          <div className="flex items-start gap-2 border-b border-[var(--cr-rule-on-muted)] px-3 py-2">
            <p className="min-w-0 text-[0.6875rem] leading-4 text-[var(--cr-ink-2)]">
              Choose which scraped turns to keep. Removed turns are excluded from evaluation.
            </p>
            {removedMessageCount > 0 && (
              <button
                type="button"
                onClick={restoreAllScrapedMessages}
                disabled={isEvaluationRunning}
                className="cr-focus ml-auto shrink-0 rounded-md px-1 py-0.5 text-[0.6875rem] font-semibold text-brand-700 hover:underline disabled:cursor-not-allowed disabled:opacity-40 dark:text-brand-300"
              >
                Restore all
              </button>
            )}
          </div>
        )}
        <div className="custom-scrollbar flex-1 space-y-2.5 overflow-y-auto p-3">
          {previewData.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center px-4 text-center">
              <p className="text-sm font-semibold text-[var(--cr-ink-2)]">No conversation yet</p>
              <p className="mt-1 max-w-[240px] text-xs text-[var(--cr-ink-3)]">
                Scrape the page or browse a file to preview the dialogue here.
              </p>
            </div>
          ) : (
            previewData.map((msg, index) => {
              const isRemoved = removedMessageIds.has(msg.id);

              if (isRemoved) {
                return (
                  <div
                    key={msg.id}
                    className="flex items-center gap-2 rounded-lg border border-dashed border-[var(--cr-input-border)] px-3 py-2 text-[0.6875rem] text-[var(--cr-ink-3)]"
                  >
                    <Trash2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    <span className="min-w-0 truncate">
                      Turn {index + 1} ({msg.role}) removed
                    </span>
                    <button
                      type="button"
                      onClick={() => restoreScrapedMessage(msg.id)}
                      disabled={isEvaluationRunning}
                      aria-label={`Undo removal of turn ${index + 1}`}
                      className="cr-focus ml-auto inline-flex shrink-0 items-center gap-1 rounded-md px-1 py-0.5 font-semibold text-brand-700 hover:underline disabled:cursor-not-allowed disabled:opacity-40 dark:text-brand-300"
                    >
                      <RotateCcw className="h-3 w-3" aria-hidden />
                      Undo
                    </button>
                  </div>
                );
              }

              return (
                <div key={msg.id} className={`flex ${msg.role === Role.Client ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2.5 text-[0.8125rem] leading-relaxed ${
                      msg.role === Role.Client
                        ? 'rounded-br-sm bg-[var(--cr-muted)] text-[var(--cr-ink)]'
                        : 'rounded-bl-sm bg-brand-50 text-brand-900 dark:bg-brand-950/50 dark:text-brand-100'
                    }`}
                  >
                    <div className="mb-0.5 flex items-center gap-2">
                      <span className="text-[0.6875rem] font-semibold uppercase tracking-wider opacity-60">
                        {msg.role}
                      </span>
                      {isScrapedPreview && (
                        <button
                          type="button"
                          onClick={() => removeScrapedMessage(msg.id)}
                          disabled={isEvaluationRunning || retainedMessageCount <= 1}
                          aria-label={`Remove turn ${index + 1} from evaluation`}
                          title={
                            isEvaluationRunning
                              ? 'Cancel or finish the evaluation before editing'
                              : retainedMessageCount <= 1
                              ? 'At least one turn must remain'
                              : `Remove turn ${index + 1}`
                          }
                          className="cr-focus ml-auto inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-current opacity-55 hover:bg-black/5 hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-25 dark:hover:bg-white/10"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        </button>
                      )}
                    </div>
                    {msg.content}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
