
import React, { useState, useEffect } from 'react';
import { UploadCloud, FileText, X } from 'lucide-react';
import { Conversation, Message, Role, EvaluationStatus } from '@shared/types';
import { SAMPLE_CONVERSATIONS, parseConversation, mergeConsecutiveTurns } from '@shared/utils';
import { useEvaluationState } from '@shared/context';
import toast from 'react-hot-toast';

export const InputSection: React.FC = () => {
  const { conversation, setConversation, setResults, setStatus } = useEvaluationState();
  const [dragActive, setDragActive] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<Message[]>([]);
  const [hasRestoredFromStorage, setHasRestoredFromStorage] = useState(false);
  const [selectedSampleIndex, setSelectedSampleIndex] = useState(0);
  const [sampleTopic, setSampleTopic] = useState<string | null>(null);

  // Restore preview data from saved conversation on mount
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

  const handleConversationLoaded = (conv: Conversation) => {
    setConversation(conv);
    setResults(null);
    setStatus(EvaluationStatus.Idle);
  };

  const parseFile = (content: string, name: string) => {
    const extension = name.split('.').pop() || 'txt';
    const messages = parseConversation(content, extension);

    if (messages.length === 0 && content.trim().length > 0) {
      toast.error("Could not parse any messages from the file. Please check the file format.");
    }

    setFileName(name);
    setPreviewData(messages);
    setSampleTopic(null);
    handleConversationLoaded({
      id: `conv-${Date.now()}`,
      title: name,
      messages
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) parseFile(event.target.result as string, file.name);
      };
      reader.readAsText(file);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) parseFile(event.target.result as string, file.name);
      };
      reader.readAsText(file);
    }
  };

  const loadSample = () => {
    if (SAMPLE_CONVERSATIONS.length === 0) {
      toast.error('No sample data available.');
      return;
    }
    const sample = SAMPLE_CONVERSATIONS[selectedSampleIndex];
    const msgs = mergeConsecutiveTurns(sample.turns);
    const displayName = `Sample_${sample.topic}.json`;
    setFileName(displayName);
    setPreviewData(msgs);
    setSampleTopic(sample.topic);
    handleConversationLoaded({
      id: `sample-${sample.id}`,
      title: displayName,
      messages: msgs
    });
  };

  const [showFormats, setShowFormats] = useState(false);

  const formatTopicLabel = (topic: string) =>
    topic.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

  const FORMAT_EXAMPLES = [
    {
      label: 'JSON',
      description: 'Array of objects. Keys: "role" (or "speaker") and "text" (or "content").',
      code: `[
  {
    "role": "Therapist",
    "text": "Hello."
  },
  {
    "role": "Client",
    "text": "Hi there."
  }
]`
    },
    {
      label: 'CSV',
      description: 'Headers "speaker" and "text" required. Text column must be last.',
      code: `speaker,text
Therapist,Hello.
Client,"Hi, I am ready."`
    },
    {
      label: 'TXT',
      description: 'Format: "Speaker: Message". Defaults to System role if no speaker found.',
      code: `Therapist: Hello.
Client: Hi there.`
    }
  ];

  return (
    <div className="space-y-6 relative">
      <div className="flex items-center">
        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-400 font-bold text-sm mr-3 shrink-0">
            2
        </div>
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Conversation Input</h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Upload Area */}
        <div className="lg:col-span-1">
            <div
                className={`
                    relative h-full min-h-[300px] border-2 border-dashed rounded-xl flex flex-col items-center justify-center text-center p-6 transition-all duration-200
                    ${dragActive
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
                        : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 hover:border-slate-400 dark:hover:border-slate-500'}
                `}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
            >
                <input
                    type="file"
                    id="file-upload"
                    className="hidden"
                    accept=".json,.txt,.csv"
                    onChange={handleFileChange}
                />

                <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 transition-colors ${fileName ? 'bg-green-100 dark:bg-green-900/50' : 'bg-blue-100 dark:bg-blue-900/50'}`}>
                    {fileName ? (
                         <FileText className="w-8 h-8 text-green-600 dark:text-green-400" />
                    ) : (
                         <UploadCloud className="w-8 h-8 text-blue-600 dark:text-blue-400" />
                    )}
                </div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">
                    {fileName ? 'File Selected' : 'Upload Transcript'}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 max-w-[200px]">
                    {fileName ? fileName : (
                        <span>
                            Drag & drop JSON, CSV, or TXT files here, or click to browse. {' '}
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setShowFormats(true);
                                }}
                                className="text-blue-500 hover:text-blue-600 hover:underline z-10 relative font-medium"
                            >
                                View formats
                            </button>
                        </span>
                    )}
                </p>

                {!fileName ? (
                    <>
                      <label htmlFor="file-upload" className="cursor-pointer bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors shadow-sm">
                          Browse Files
                      </label>

                      <div className="flex items-center w-full max-w-[200px] my-4">
                        <div className="h-px bg-slate-200 dark:bg-slate-600 flex-1"></div>
                        <span className="px-2 text-xs text-slate-400 dark:text-slate-500 font-medium">OR</span>
                        <div className="h-px bg-slate-200 dark:bg-slate-600 flex-1"></div>
                      </div>

                      <div className="w-full max-w-[220px] space-y-2">
                        <label className="block text-left text-xs font-medium text-slate-600 dark:text-slate-400">
                          Load Sample
                        </label>
                        <div className="flex gap-2">
                          <select
                            value={selectedSampleIndex}
                            onChange={(e) => setSelectedSampleIndex(Number(e.target.value))}
                            className="flex-1 min-w-0 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 text-sm px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          >
                            {SAMPLE_CONVERSATIONS.map((s, i) => (
                              <option key={s.id} value={i}>
                                {formatTopicLabel(s.topic)}
                              </option>
                            ))}
                          </select>
                          <button
                            onClick={loadSample}
                            className="shrink-0 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors shadow-sm"
                          >
                            Load
                          </button>
                        </div>
                      </div>
                    </>
                ) : (
                    <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setFileName(null);
                          setPreviewData([]);
                          setSampleTopic(null);
                          setConversation(null);
                        }}
                        className="flex items-center space-x-1 text-red-500 dark:text-red-400 hover:text-red-600 dark:hover:text-red-300 text-xs font-medium bg-red-50 dark:bg-red-900/20 px-3 py-1 rounded-full"
                    >
                        <X className="w-3 h-3" />
                        <span>Remove</span>
                    </button>
                )}
            </div>
        </div>

        {/* Preview Area */}
        <div className="lg:col-span-2 h-[400px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden flex flex-col transition-colors shadow-sm">
            <div className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 px-4 py-3 flex items-center flex-wrap gap-2">
                <FileText className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                  {fileName ? `Preview: ${fileName}` : 'Preview — No file loaded'}
                </span>
                {sampleTopic && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 font-medium">
                    Topic: {formatTopicLabel(sampleTopic)}
                  </span>
                )}
                <span className="ml-auto text-xs text-slate-400 dark:text-slate-500 shrink-0">
                  {previewData.length} turns
                </span>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-white dark:bg-slate-800 min-h-[280px]">
                {previewData.length === 0 ? (
                    <div className="h-full min-h-[280px] flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 px-6">
                        <FileText className="w-12 h-12 mb-3 opacity-40" />
                        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">No conversation loaded</p>
                        <p className="text-xs mt-1 text-center max-w-[240px]">
                          Choose a sample from the dropdown or upload a file to preview
                        </p>
                    </div>
                ) : (
                    previewData.map((msg) => (
                        <div key={msg.id} className={`flex ${msg.role === Role.Client ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[80%] rounded-2xl px-5 py-3.5 text-sm leading-relaxed shadow-sm ${
                                msg.role === Role.Client
                                ? 'bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-100 rounded-br-none'
                                : 'bg-blue-50 dark:bg-blue-900/30 text-blue-900 dark:text-blue-100 border border-blue-100 dark:border-blue-800 rounded-bl-none'
                            }`}>
                                <div className="text-xs font-bold mb-1 opacity-70 uppercase tracking-wider">{msg.role}</div>
                                {msg.content}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
      </div>

      {/* Formats Modal */}
      {showFormats && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setShowFormats(false)}>
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center p-4 border-b border-slate-200 dark:border-slate-700 sticky top-0 bg-white dark:bg-slate-800">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Supported File Formats</h3>
              <button
                onClick={() => setShowFormats(false)}
                className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-6">
              {FORMAT_EXAMPLES.map((fmt) => (
                <div key={fmt.label} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-slate-800 dark:text-slate-200 px-2 py-0.5 bg-slate-100 dark:bg-slate-700 rounded text-xs uppercase tracking-wider">
                      {fmt.label}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400 italic">
                      {fmt.description}
                    </span>
                  </div>
                  <pre className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-3 overflow-x-auto text-xs font-mono text-slate-700 dark:text-slate-300">
                    {fmt.code}
                  </pre>
                </div>
              ))}
            </div>
            <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 rounded-b-xl">
              <button
                onClick={() => setShowFormats(false)}
                className="w-full py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 rounded-lg font-medium text-sm transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
