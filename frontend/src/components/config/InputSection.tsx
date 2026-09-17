import React, { useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  CircleAlert,
  CircleCheck,
  FileUp,
  Link2,
  Loader2,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import { Conversation, EvaluationStatus, Message, Role } from '@shared/types';
import { SAMPLE_CONVERSATIONS, mergeConsecutiveTurns, normalizeRole, parseConversation } from '@shared/utils';
import { importSharedConversation, ShareImportError } from '@shared/services/shareImportService';
import { useEvaluationState } from '@shared/context';
import toast from 'react-hot-toast';
import {
  applyTranscriptMessageSelection,
  getExcludedTranscriptMessageIds,
  getTranscriptSourceMessages,
} from '../../utils/transcriptSelection';

const SHARE_PROVIDER_LABELS: Record<string, string> = {
  openai: 'ChatGPT',
  claude: 'Claude',
};

const TRANSCRIPT_SOURCES = ['upload', 'share', 'sample'] as const;
type TranscriptSource = (typeof TRANSCRIPT_SOURCES)[number];

const SOURCE_OPTIONS = [
  {
    id: 'upload',
    label: 'Upload file',
    description: 'JSON, CSV, or TXT',
    icon: FileUp,
  },
  {
    id: 'share',
    label: 'Share link',
    description: 'ChatGPT or Claude',
    icon: Link2,
  },
  {
    id: 'sample',
    label: 'Sample transcript',
    description: 'Fully synthetic example',
    icon: BookOpen,
  },
] satisfies Array<{
  id: TranscriptSource;
  label: string;
  description: string;
  icon: typeof FileUp;
}>;

const inferTranscriptSource = (conversationId?: string): TranscriptSource => {
  if (conversationId?.startsWith('sample-')) return 'sample';
  if (conversationId?.startsWith('share-')) return 'share';
  return 'upload';
};

export const InputSection: React.FC = () => {
  const {
    conversation,
    status,
    setConversation,
    setResults,
    setStatus,
    setRunMetadata,
    setError,
  } = useEvaluationState();
  const [dragActive, setDragActive] = useState(false);
  const [selectedSampleIndex, setSelectedSampleIndex] = useState(0);
  const [transcriptSource, setTranscriptSource] = useState<TranscriptSource | null>(() =>
    conversation?.messages.length ? inferTranscriptSource(conversation.id) : null
  );
  const [shareUrl, setShareUrl] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [showFormats, setShowFormats] = useState(false);
  const formatsTriggerRef = useRef<HTMLButtonElement | null>(null);
  const formatsCloseRef = useRef<HTMLButtonElement | null>(null);
  const sourceTabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const importAbortRef = useRef<AbortController | null>(null);
  const sourceOperationRef = useRef(0);
  const previewData = conversation ? getTranscriptSourceMessages(conversation) : [];
  const removedMessageIds = conversation
    ? getExcludedTranscriptMessageIds(conversation)
    : new Set<string>();
  const retainedMessageCount = conversation?.messages.length ?? 0;
  const removedMessageCount = previewData.length - retainedMessageCount;
  const isEvaluationRunning = status === EvaluationStatus.Loading;
  const fileName = conversation?.messages.length
    ? conversation.title || 'Restored conversation'
    : null;
  const sampleTopic = conversation?.id.startsWith('sample-')
    ? SAMPLE_CONVERSATIONS.find((sample) => `sample-${sample.id}` === conversation.id)?.topic || null
    : null;

  // Abort an in-flight share import if the component unmounts, so its
  // resolution can't set state on an unmounted tree.
  useEffect(() => () => importAbortRef.current?.abort(), []);

  // Restore the action tab alongside a persisted conversation. Preview data
  // itself is derived directly from context below, so it cannot drift stale.
  useEffect(() => {
    if (conversation?.messages.length) {
      setTranscriptSource(inferTranscriptSource(conversation.id));
    } else {
      setTranscriptSource(null);
    }
  }, [conversation?.id]);

  useEffect(() => {
    if (!showFormats) return;

    formatsCloseRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowFormats(false);
      } else if (event.key === 'Tab') {
        event.preventDefault();
        formatsCloseRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      formatsTriggerRef.current?.focus();
    };
  }, [showFormats]);

  const handleDrag = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.type === 'dragenter' || event.type === 'dragover') {
      setDragActive(true);
    } else if (event.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleConversationLoaded = (conv: Conversation) => {
    const { messageSelection: _messageSelection, ...freshConversation } = conv;
    setConversation(applyTranscriptMessageSelection(freshConversation, new Set()));
    setResults(null);
    setStatus(EvaluationStatus.Idle);
    setRunMetadata(null);
    setError(null);
  };

  // Only the latest source action may replace the active transcript. This
  // prevents a slow share import or FileReader callback from overwriting a
  // sample/file the user selected afterward.
  const beginSourceOperation = () => {
    sourceOperationRef.current += 1;
    importAbortRef.current?.abort();
    importAbortRef.current = null;
    setIsImporting(false);
    return sourceOperationRef.current;
  };

  const selectTranscriptSource = (source: TranscriptSource) => {
    if (source === transcriptSource) return;
    const wasImporting = isImporting;
    beginSourceOperation();
    setTranscriptSource(source);
    if (wasImporting) {
      toast('Share link import cancelled.');
    }
  };

  const parseFile = (content: string, name: string) => {
    const extension = name.split('.').pop() || 'txt';
    const messages = parseConversation(content, extension);

    if (messages.length === 0) {
      // A failed parse must not destroy the currently loaded conversation or
      // completed results (that would bypass the UnsavedChangesModal guard) —
      // just report the problem and leave state untouched.
      toast.error(
        content.trim().length > 0
          ? 'Could not parse any messages from the file. Check the file format.'
          : 'The selected file is empty.'
      );
      return;
    }

    setTranscriptSource('upload');
    handleConversationLoaded({
      id: `conv-${Date.now()}`,
      title: name,
      messages
    });
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);

    if (event.dataTransfer.files && event.dataTransfer.files[0]) {
      const file = event.dataTransfer.files[0];
      const operationId = beginSourceOperation();
      const reader = new FileReader();
      reader.onload = (readerEvent) => {
        if (sourceOperationRef.current !== operationId) return;
        if (typeof readerEvent.target?.result === 'string') {
          parseFile(readerEvent.target.result, file.name);
        }
      };
      reader.onerror = () => {
        if (sourceOperationRef.current === operationId) {
          toast.error('Could not read the selected file.');
        }
      };
      reader.readAsText(file);
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      const operationId = beginSourceOperation();
      const reader = new FileReader();
      reader.onload = (readerEvent) => {
        if (sourceOperationRef.current !== operationId) return;
        if (typeof readerEvent.target?.result === 'string') {
          parseFile(readerEvent.target.result, file.name);
        }
      };
      reader.onerror = () => {
        if (sourceOperationRef.current === operationId) {
          toast.error('Could not read the selected file.');
        }
      };
      reader.readAsText(file);
      event.target.value = '';
    }
  };

  const loadSample = () => {
    beginSourceOperation();
    if (SAMPLE_CONVERSATIONS.length === 0) {
      toast.error('No sample data available.');
      return;
    }
    const sample = SAMPLE_CONVERSATIONS[selectedSampleIndex];
    const msgs = mergeConsecutiveTurns(sample.turns);
    const displayName = `Sample_${sample.topic}.json`;
    setTranscriptSource('sample');
    handleConversationLoaded({
      id: `sample-${sample.id}`,
      title: displayName,
      messages: msgs
    });
  };

  const handleImportShareLink = async () => {
    const url = shareUrl.trim();
    if (!url || isImporting) return;
    const operationId = beginSourceOperation();
    const controller = new AbortController();
    importAbortRef.current = controller;
    setIsImporting(true);
    try {
      const result = await importSharedConversation(url, controller.signal);
      if (controller.signal.aborted || sourceOperationRef.current !== operationId) return;
      // Map raw speaker labels to chatbot/client roles through the one shared
      // normalizer, then merge fragmented same-role turns (AI replies often
      // arrive in several nodes) into single turns — same as loadSample.
      const rawMessages: Message[] = result.messages.map((msg, idx) => ({
        id: `share-${idx}`,
        role: normalizeRole(msg.speaker),
        content: msg.text,
      }));
      // Blank-line separator: fragmented AI replies (split across nodes) keep
      // their paragraph breaks instead of collapsing into one run-on line.
      const merged = mergeConsecutiveTurns(rawMessages, '\n\n');
      if (merged.length === 0) {
        toast.error('No conversation turns were found at that link.');
        return;
      }
      const providerLabel = SHARE_PROVIDER_LABELS[result.provider] || 'Shared';
      const displayName = result.title
        ? `${result.title} (${providerLabel})`
        : `${providerLabel} conversation`;
      setTranscriptSource('share');
      setShareUrl('');
      handleConversationLoaded({
        id: `share-${result.provider}-${Date.now()}`,
        title: displayName,
        messages: merged,
      });
      toast.success(`Imported ${merged.length} turns from ${providerLabel}.`);
    } catch (error) {
      // A cancelled import (unmount / abort) is not a failure — stay silent.
      if (controller.signal.aborted || sourceOperationRef.current !== operationId) return;
      // The access gate already toasted its own message; don't stack a second.
      if (error instanceof ShareImportError && error.handled) return;
      // ShareImportError carries the backend's specific guidance (e.g. the
      // Gemini "upload a file instead" message); show it verbatim.
      const message =
        error instanceof ShareImportError
          ? error.message
          : 'Could not import that share link. Check the link and try again.';
      toast.error(message, { duration: 6000 });
    } finally {
      if (importAbortRef.current === controller) importAbortRef.current = null;
      if (!controller.signal.aborted && sourceOperationRef.current === operationId) {
        setIsImporting(false);
      }
    }
  };

  const clearConversation = () => {
    beginSourceOperation();
    setTranscriptSource(null);
    setConversation(null);
    setResults(null);
    setStatus(EvaluationStatus.Idle);
    setRunMetadata(null);
    setError(null);
  };

  const updateMessageSelection = (nextRemovedMessageIds: Set<string>) => {
    if (!conversation) return;
    if (isEvaluationRunning) {
      toast.error('Wait for the current evaluation to finish or cancel it before editing.');
      return;
    }

    const nextConversation = applyTranscriptMessageSelection(
      conversation,
      nextRemovedMessageIds
    );
    if (nextConversation === conversation) {
      toast.error('Keep at least one turn, or remove the whole transcript.');
      return;
    }

    setConversation(nextConversation);
    setResults(null);
    setStatus(EvaluationStatus.Idle);
    setRunMetadata(null);
    setError(null);
  };

  const excludeMessage = (messageId: string) => {
    if (retainedMessageCount <= 1) {
      toast.error('Keep at least one turn, or remove the whole transcript.');
      return;
    }
    const nextRemovedMessageIds = new Set(removedMessageIds);
    nextRemovedMessageIds.add(messageId);
    updateMessageSelection(nextRemovedMessageIds);
  };

  const restoreMessage = (messageId: string) => {
    const nextRemovedMessageIds = new Set(removedMessageIds);
    nextRemovedMessageIds.delete(messageId);
    updateMessageSelection(nextRemovedMessageIds);
  };

  const restoreAllMessages = () => updateMessageSelection(new Set());

  const formatTopicLabel = (topic: string) =>
    topic.split('-').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');

  const handleSourceTabKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    currentIndex: number
  ) => {
    let nextIndex: number | null = null;

    if (event.key === 'ArrowDown') {
      nextIndex = (currentIndex + 1) % TRANSCRIPT_SOURCES.length;
    } else if (event.key === 'ArrowUp') {
      nextIndex = (currentIndex - 1 + TRANSCRIPT_SOURCES.length) % TRANSCRIPT_SOURCES.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = TRANSCRIPT_SOURCES.length - 1;
    }

    if (nextIndex === null) return;
    event.preventDefault();
    selectTranscriptSource(TRANSCRIPT_SOURCES[nextIndex]);
    sourceTabRefs.current[nextIndex]?.focus();
  };

  const hasLoadedTranscript = Boolean(conversation && fileName && previewData.length > 0);
  const loadedSource = hasLoadedTranscript ? inferTranscriptSource(conversation?.id) : null;
  const loadedSourceLabel = !loadedSource
    ? null
    : loadedSource === 'sample'
      ? 'Synthetic sample'
      : loadedSource === 'share'
        ? conversation?.id.startsWith('share-openai-')
          ? 'ChatGPT link'
          : conversation?.id.startsWith('share-claude-')
            ? 'Claude link'
            : 'Shared link'
        : 'Uploaded file';
  const activeMatchesLoaded = loadedSource === transcriptSource;
  const workspaceState = isImporting
    ? 'loading'
    : hasLoadedTranscript
      ? activeMatchesLoaded
        ? 'ready'
        : 'retained'
      : 'empty';
  const replacementAction = transcriptSource === 'upload'
    ? 'Choose a file'
    : transcriptSource === 'share'
      ? 'Import a link'
      : transcriptSource === 'sample'
        ? 'Load a sample'
        : 'Choose a source';
  const workspaceStatus = isImporting
    ? hasLoadedTranscript
      ? `Importing link… current preview remains ${loadedSourceLabel}.`
      : 'Importing link… the preview will update when it is ready.'
    : workspaceState === 'retained'
      ? `Current preview remains ${loadedSourceLabel}. ${replacementAction} to replace it.`
      : workspaceState === 'ready'
        ? removedMessageCount > 0
          ? `${loadedSourceLabel} · ${retainedMessageCount} of ${previewData.length} turns included`
          : `${loadedSourceLabel} · ${previewData.length} turns ready`
        : 'Choose a transcript source on the left to begin.';

  const FORMAT_EXAMPLES = [
    {
      label: 'JSON',
      description: 'Array of objects. Keys: "role" or "speaker" and "text" or "content".',
      code: `[
  { "role": "Chatbot", "text": "Hello." },
  { "role": "Client", "text": "Hi there." }
]`
    },
    {
      label: 'CSV',
      description: 'Headers "speaker" and "text" required. Quoted commas and line breaks are supported.',
      code: `speaker,text
Chatbot,Hello.
Client,"Hi, I am ready."`
    },
    {
      label: 'TXT',
      description: 'Format: "Speaker: Message". Defaults to System role if no speaker found.',
      code: `Chatbot: Hello.
Client: Hi there.`
    }
  ];

  return (
    <div>
      <div className="cr-module overflow-hidden">
        <div className="grid min-w-0 xl:h-[620px] xl:grid-cols-[minmax(19rem,22rem)_minmax(0,1fr)]">
          <section className="min-w-0 bg-[var(--cr-muted)] px-5 py-5 md:px-6 md:py-6 xl:min-h-0 xl:overflow-y-auto xl:border-r xl:border-[var(--cr-card-border)]">
            <div>
              <p className="cr-eyebrow">Add or replace</p>
              <h3 className="mt-1 text-[17px] font-bold text-[var(--cr-ink)]">
                Choose a transcript source
              </h3>
            </div>

            <div
              className="mt-4 divide-y divide-[var(--cr-card-border)] overflow-hidden rounded-md border border-[var(--cr-card-border)] bg-[var(--cr-card)]"
              role="tablist"
              aria-label="Transcript source"
              aria-orientation="vertical"
            >
              {SOURCE_OPTIONS.map((option, index) => {
                const { id, label, description, icon: Icon } = option;
                const isActive = transcriptSource === id;
                const isLoaded = loadedSource === id;
                return (
                  <button
                    key={id}
                    ref={(element) => { sourceTabRefs.current[index] = element; }}
                    id={`transcript-source-${id}`}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    aria-controls={`transcript-panel-${id}`}
                    tabIndex={isActive || (transcriptSource === null && index === 0) ? 0 : -1}
                    onClick={() => selectTranscriptSource(id)}
                    onKeyDown={(event) => handleSourceTabKeyDown(event, index)}
                    className={`cr-focus cr-control flex min-h-[52px] w-full items-center gap-2.5 border-l-2 px-3 py-2 text-left ${
                      isActive
                        ? 'border-brand-600 bg-[var(--cr-accent-surface)] text-[var(--cr-ink)] dark:border-brand-400'
                        : 'border-transparent bg-[var(--cr-card)] text-[var(--cr-ink-2)] hover:bg-[var(--cr-muted)]'
                    }`}
                  >
                    <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-[var(--cr-brand-primary)]' : 'text-[var(--cr-ink-3)]'}`} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">{label}</span>
                      <span className="mt-0.5 block truncate text-xs font-normal text-[var(--cr-ink-2)]">
                        {description}
                      </span>
                    </span>
                    {isLoaded && (
                      <span
                        className="shrink-0 text-[var(--cr-brand-primary)]"
                        title="Current transcript source"
                      >
                        <CircleCheck className="h-4 w-4" aria-hidden />
                        <span className="sr-only">Current transcript source</span>
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {(workspaceState === 'retained' || workspaceState === 'loading') && (
              <div className="mt-3 hidden items-start gap-2 text-xs leading-5 text-[var(--cr-ink-2)] xl:flex">
                {workspaceState === 'loading' ? (
                  <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-[var(--cr-brand-primary)] motion-reduce:animate-none" aria-hidden />
                ) : (
                  <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-[var(--cr-ink-3)]" aria-hidden />
                )}
                <p>{workspaceStatus}</p>
              </div>
            )}

            <div className={transcriptSource ? 'mt-4 min-h-[220px]' : 'hidden'}>
              <div
                id="transcript-panel-upload"
                className="cr-intake-panel"
                role="tabpanel"
                aria-labelledby="transcript-source-upload"
                hidden={transcriptSource !== 'upload'}
              >
                <div
                  className={`rounded-md border border-dashed bg-[var(--cr-card)] px-4 py-4 transition-colors ${
                    dragActive
                      ? 'border-brand-500 bg-brand-50 dark:border-brand-400 dark:bg-brand-950/30'
                      : 'border-[var(--cr-input-border)]'
                  }`}
                  aria-label="Upload a JSON, CSV, or TXT transcript"
                  onDragEnter={handleDrag}
                  onDragLeave={handleDrag}
                  onDragOver={handleDrag}
                  onDrop={handleDrop}
                >
                  <div className="flex items-start gap-3">
                    <FileUp className="mt-0.5 h-5 w-5 shrink-0 text-[var(--cr-ink-3)]" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-[var(--cr-ink)]">Drop a transcript here</p>
                      <p className="mt-1 text-xs leading-5 text-[var(--cr-ink-2)]">
                        Or choose a file from this device.
                      </p>
                      <label className="cr-btn cr-btn-primary cr-focus-within mt-3 inline-flex h-9 cursor-pointer items-center justify-center px-4">
                        <input
                          type="file"
                          className="sr-only"
                          accept=".json,.txt,.csv"
                          onChange={handleFileChange}
                        />
                        Choose file
                      </label>
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[var(--cr-ink-2)]">
                  <span>JSON · CSV · TXT</span>
                  <button
                    ref={formatsTriggerRef}
                    type="button"
                    onClick={() => setShowFormats(true)}
                    className="cr-link cr-focus text-xs"
                  >
                    Format guide
                  </button>
                </div>
              </div>

              <div
                id="transcript-panel-share"
                className="cr-intake-panel"
                role="tabpanel"
                aria-labelledby="transcript-source-share"
                hidden={transcriptSource !== 'share'}
              >
                <div className="flex gap-2 border-l-2 border-[var(--cr-input-border)] pl-3 text-[var(--cr-ink-2)]">
                  <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  <p className="text-xs leading-5">
                    Public snapshots can be viewed by anyone with the link. Remove identifying details first.
                  </p>
                </div>

                <label htmlFor="transcript-share-url" className="mt-3 block text-sm font-bold text-[var(--cr-ink)]">
                  Public share link
                </label>
                <div className="cr-well cr-focus-within mt-2 flex min-w-0 items-center gap-2 px-3">
                  <Link2 className="h-4 w-4 shrink-0 text-[var(--cr-ink-3)]" aria-hidden />
                  <input
                    id="transcript-share-url"
                    type="url"
                    inputMode="url"
                    value={shareUrl}
                    onChange={(event) => setShareUrl(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        handleImportShareLink();
                      }
                    }}
                    disabled={isImporting}
                    placeholder="Paste a public ChatGPT or Claude link"
                    className="h-10 min-w-0 flex-1 bg-transparent text-sm text-[var(--cr-ink)] placeholder:text-[var(--cr-ink-3)] focus:outline-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleImportShareLink}
                  disabled={isImporting || !shareUrl.trim()}
                  className="cr-btn cr-btn-primary cr-focus mt-2 h-10 w-full px-4 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isImporting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
                      Importing…
                    </>
                  ) : (
                    'Import conversation'
                  )}
                </button>

                <details className="mt-3 border-t border-[var(--cr-card-border)] pt-2">
                  <summary className="cr-focus cursor-pointer text-xs font-semibold text-[var(--cr-ink)]">
                    Where do I find the link?
                  </summary>
                  <ol className="mt-2 space-y-1 text-xs leading-5 text-[var(--cr-ink-2)]">
                    <li><strong className="text-[var(--cr-ink)]">ChatGPT:</strong> Open the chat → Share → Copy link.</li>
                    <li><strong className="text-[var(--cr-ink)]">Claude:</strong> Open the chat → Share → Share, then copy the link.</li>
                  </ol>
                  <p className="mt-1 text-xs leading-5 text-[var(--cr-ink-2)]">For Gemini, use Upload file instead.</p>
                </details>
              </div>

              <div
                id="transcript-panel-sample"
                className="cr-intake-panel"
                role="tabpanel"
                aria-labelledby="transcript-source-sample"
                hidden={transcriptSource !== 'sample'}
              >
                <div className="flex items-start gap-3">
                  <BookOpen className="mt-0.5 h-5 w-5 shrink-0 text-[var(--cr-ink-3)]" aria-hidden />
                  <div>
                    <p className="text-sm font-semibold text-[var(--cr-ink)]">Practice with a fully synthetic transcript</p>
                    <p className="mt-1 text-xs leading-5 text-[var(--cr-ink-2)]">
                      Explore the report flow without adding your own conversation.
                    </p>
                  </div>
                </div>

                <label className="mt-4 block min-w-0">
                  <span className="text-sm font-bold text-[var(--cr-ink)]">Sample topic</span>
                  <select
                    value={selectedSampleIndex}
                    onChange={(event) => setSelectedSampleIndex(Number(event.target.value))}
                    className="cr-well cr-focus mt-2 h-10 w-full px-3 text-sm text-[var(--cr-ink)]"
                  >
                    {SAMPLE_CONVERSATIONS.map((sample, index) => (
                      <option key={sample.id} value={index}>
                        {formatTopicLabel(sample.topic)}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={loadSample}
                  className="cr-btn cr-btn-primary cr-focus mt-2 h-10 w-full px-4"
                >
                  Load synthetic sample
                </button>

                <details className="mt-3 border-t border-[var(--cr-card-border)] pt-2">
                  <summary className="cr-focus cursor-pointer text-xs font-semibold text-[var(--cr-ink)]">
                    About this sample
                  </summary>
                  <p className="mt-2 text-xs leading-5 text-[var(--cr-ink-2)]">
                    Generated with GPT-4o for research prototyping, using question-and-answer themes from the public Counsel-Chat dataset as prompts. All people and dialogue are fictional; not clinical guidance.
                  </p>
                </details>
              </div>
            </div>

            <p className="mt-4 text-xs leading-5 text-[var(--cr-ink-2)]">
              <strong className="font-semibold text-[var(--cr-ink)]">Privacy:</strong>{' '}
              Remove names and identifying details before adding a transcript. CounselReflect does not de-identify it for you.
            </p>

            <div
              className="-mx-5 -mb-5 mt-5 flex items-center gap-2 border-t border-[var(--cr-card-border)] bg-[var(--cr-card)] px-5 py-3 text-xs text-[var(--cr-ink-2)] md:-mx-6 md:-mb-6 md:px-6 xl:hidden"
              data-state={workspaceState}
            >
              {workspaceState === 'loading' ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[var(--cr-brand-primary)] motion-reduce:animate-none" aria-hidden />
              ) : hasLoadedTranscript ? (
                <CircleCheck className="h-4 w-4 shrink-0 text-[var(--cr-brand-primary-strong)]" aria-hidden />
              ) : (
                <span className="h-2 w-2 shrink-0 rounded-full border border-[var(--cr-ink-3)]" aria-hidden />
              )}
              <span className="min-w-0 flex-1">
                {workspaceStatus}
              </span>
            </div>
          </section>

          <section className="flex h-[520px] min-h-0 min-w-0 flex-col border-t border-[var(--cr-card-border)] bg-[var(--cr-card)] md:h-[560px] xl:h-full xl:border-t-0">
            <header className="relative shrink-0 border-b border-[var(--cr-card-border)] px-5 py-4 md:px-6">
              <p className="sr-only" role="status" aria-live="polite">
                {hasLoadedTranscript
                  ? removedMessageCount > 0
                    ? `${loadedSourceLabel} loaded. ${retainedMessageCount} of ${previewData.length} turns are included.`
                    : `${loadedSourceLabel} loaded with ${previewData.length} turns.`
                  : 'No transcript loaded.'}
              </p>
              <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
                <div className="min-w-0 flex-1">
                  <p className="cr-eyebrow inline-flex items-center gap-1.5">
                    {hasLoadedTranscript && <CircleCheck className="h-3.5 w-3.5 text-[var(--cr-brand-primary)]" aria-hidden />}
                    {hasLoadedTranscript ? 'Current transcript' : 'Review transcript'}
                  </p>
                  <div className="mt-1 flex min-w-0 flex-wrap items-baseline gap-2">
                    <h3 className="text-[17px] font-bold text-[var(--cr-ink)]">Transcript preview</h3>
                    {loadedSourceLabel && (
                      <span className="text-xs font-medium text-[var(--cr-ink-2)]">
                        Source: {loadedSourceLabel}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 truncate text-xs text-[var(--cr-ink-2)]">
                    {hasLoadedTranscript
                      ? `${sampleTopic ? `${formatTopicLabel(sampleTopic)} · ` : ''}${fileName}`
                      : 'Nothing is loaded yet.'}
                  </p>
                </div>

                {hasLoadedTranscript && (
                  <div className="ml-auto flex shrink-0 items-center gap-2">
                    <span
                      aria-live="polite"
                      className="text-xs font-medium tabular-nums text-[var(--cr-ink-2)]"
                    >
                      {removedMessageCount > 0
                        ? `${retainedMessageCount} of ${previewData.length} included`
                        : `${previewData.length} turns`}
                    </span>
                    <button
                      type="button"
                      onClick={clearConversation}
                      disabled={isEvaluationRunning}
                      className="cr-btn cr-btn-ghost cr-focus h-8 px-2.5 text-xs disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>
            </header>

            {hasLoadedTranscript && (
              <div
                id="transcript-selection-help"
                className="flex shrink-0 items-center gap-3 border-b border-[var(--cr-card-border)] bg-[var(--cr-muted)] px-4 py-2.5 text-xs text-[var(--cr-ink-2)] md:px-5"
              >
                <p className="min-w-0 flex-1 leading-5">
                  Choose which turns to include. Excluded turns stay here so you can undo. At least one turn must remain.
                </p>
                {removedMessageCount > 0 && (
                  <button
                    type="button"
                    onClick={restoreAllMessages}
                    disabled={isEvaluationRunning}
                    className="cr-focus inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 font-semibold text-[var(--cr-brand-primary-strong)] hover:underline disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                    Restore all
                  </button>
                )}
              </div>
            )}

            <div className="min-h-0 flex-1">
              {previewData.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center px-6 py-10 text-center">
                  <FileUp className="h-6 w-6 text-[var(--cr-ink-3)]" aria-hidden />
                  <p className="mt-3 text-sm font-semibold text-[var(--cr-ink)]">No transcript selected</p>
                  <p className="mt-1 max-w-sm text-sm leading-6 text-[var(--cr-ink-2)]">
                    Choose a transcript source on the left to begin.
                  </p>
                </div>
              ) : (
                <ol
                  className="custom-scrollbar h-full divide-y divide-[var(--cr-card-border)] overflow-y-auto overscroll-auto xl:overscroll-contain"
                  aria-label={`Transcript preview, ${retainedMessageCount} of ${previewData.length} turns included`}
                  tabIndex={0}
                >
                  {previewData.map((message, index) => {
                    const isClient = message.role === Role.Client;
                    const isChatbot = message.role === Role.Chatbot;
                    const roleLabel = isClient ? 'Client' : isChatbot ? 'Chatbot' : 'System';
                    const isRemoved = removedMessageIds.has(message.id);

                    if (isRemoved) {
                      return (
                        <li
                          key={message.id || `${message.role}-${index}`}
                          className="grid grid-cols-[28px_minmax(0,1fr)] gap-3 bg-[var(--cr-muted)] px-4 py-3 md:px-5"
                        >
                          <span className="pt-1 text-[11px] font-semibold tabular-nums text-[var(--cr-ink-3)]">
                            {String(index + 1).padStart(2, '0')}
                          </span>
                          <div className="flex min-w-0 items-center gap-2 rounded-md border border-dashed border-[var(--cr-input-border)] bg-[var(--cr-card)] px-3 py-2 text-xs text-[var(--cr-ink-3)]">
                            <Trash2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                            <span className="min-w-0 flex-1 truncate">
                              {roleLabel} turn excluded from evaluation
                            </span>
                            <button
                              type="button"
                              onClick={() => restoreMessage(message.id)}
                              disabled={isEvaluationRunning}
                              aria-label={`Undo exclusion of turn ${index + 1}`}
                              className="cr-focus inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 font-semibold text-[var(--cr-brand-primary-strong)] hover:underline disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                              Undo
                            </button>
                          </div>
                        </li>
                      );
                    }

                    return (
                      <li
                        key={message.id || `${message.role}-${index}`}
                        className="group grid grid-cols-[28px_minmax(0,1fr)_auto] gap-3 bg-[var(--cr-card)] px-4 py-3.5 transition-colors hover:bg-[var(--cr-muted)] md:px-5"
                      >
                        <span className="pt-0.5 text-[11px] font-semibold tabular-nums text-[var(--cr-ink-3)]">
                          {String(index + 1).padStart(2, '0')}
                        </span>
                        <div className="min-w-0 sm:grid sm:grid-cols-[84px_minmax(0,1fr)] sm:gap-3">
                          <span
                            className={`block pt-0.5 text-xs font-bold ${
                              isChatbot
                                ? 'text-brand-700 dark:text-brand-300'
                                : isClient
                                  ? 'text-[var(--cr-ink-2)]'
                                  : 'text-[var(--cr-ink-3)]'
                            }`}
                          >
                            {roleLabel}
                          </span>
                          <p className="mt-1 min-w-0 break-words text-sm leading-relaxed text-[var(--cr-ink-2)] [overflow-wrap:anywhere] sm:mt-0">
                            {message.content}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => excludeMessage(message.id)}
                          disabled={isEvaluationRunning || retainedMessageCount <= 1}
                          aria-label={`Exclude turn ${index + 1} from evaluation`}
                          aria-describedby="transcript-selection-help"
                          title={
                            isEvaluationRunning
                              ? 'Cancel or finish the evaluation before editing'
                              : retainedMessageCount <= 1
                                ? 'At least one turn must remain'
                                : `Exclude turn ${index + 1}`
                          }
                          className="cr-focus inline-flex h-8 shrink-0 items-center gap-1.5 self-start rounded-md px-2 text-xs font-semibold text-[var(--cr-ink-3)] opacity-70 transition hover:bg-[var(--cr-card)] hover:text-[var(--cr-ink)] hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-25"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                          <span className="hidden lg:inline">Exclude</span>
                        </button>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          </section>
        </div>
      </div>

      {showFormats && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="supported-formats-title"
          onClick={() => setShowFormats(false)}
        >
          <div
            className="cr-card max-h-[90vh] w-full max-w-2xl overflow-y-auto shadow-[var(--shadow-lift)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="sticky top-0 flex items-center justify-between border-b border-[var(--cr-card-border)] bg-[var(--cr-card)] px-6 py-4">
              <h3 id="supported-formats-title" className="cr-section-title">Supported formats</h3>
              <button
                ref={formatsCloseRef}
                type="button"
                onClick={() => setShowFormats(false)}
                className="cr-focus rounded-full p-1 text-[var(--cr-ink-3)] transition-colors hover:bg-[var(--cr-muted)] hover:text-[var(--cr-ink)]"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-6 p-6">
              {FORMAT_EXAMPLES.map((format) => (
                <div key={format.label}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-sm font-bold text-[var(--cr-ink)]">
                      {format.label}
                    </span>
                    <span className="cr-meta">{format.description}</span>
                  </div>
                  <pre className="cr-panel mt-2 overflow-x-auto p-4 text-xs leading-6 text-[var(--cr-ink-2)]">
                    {format.code}
                  </pre>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
