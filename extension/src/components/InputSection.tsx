
import React, { useState, useEffect } from 'react';
import { UploadCloud, FileText, X, Globe } from 'lucide-react';
import { Conversation, Message, Role, EvaluationStatus } from '@shared/types';
import { parseConversation } from '@shared/utils';
import { useEvaluationState } from '@shared/context';
import toast from 'react-hot-toast';

export const InputSection: React.FC = () => {
  const { setConversation, setResults, setStatus } = useEvaluationState();
  const [dragActive, setDragActive] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<Message[]>([]);
  useEffect(() => {
    setConversation(null);
    setResults(null);
    setStatus(EvaluationStatus.Idle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    setConversation(conv);
    setResults(null);
    setStatus(EvaluationStatus.Idle);

    try {
      window.parent.postMessage({ type: 'CLEAR_TOOLTIPS' }, '*');
    } catch (e) {
      // Ignore
    }
  };

  const scrapeCurrentPage = async () => {
    setIsScraping(true);
    toast.loading('Scraping page content...', { id: 'scrape' });

    try {
      return new Promise((resolve, reject) => {
        let timeoutId: NodeJS.Timeout;

        const messageHandler = (event: MessageEvent) => {
          if (event.data.type === 'SCRAPE_RESPONSE') {
            window.removeEventListener('message', messageHandler);
            clearTimeout(timeoutId);

            const response = event.data.payload;

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
              toast.success('Successfully scraped conversation!', { id: 'scrape' });
              resolve(true);
            } else {
              toast.error('Failed to scrape conversation. Unsupported platform or no conversation found.', { id: 'scrape' });
              reject(new Error('Scraping failed'));
            }
            setIsScraping(false);
          }
        };

        window.addEventListener('message', messageHandler);
        window.parent.postMessage({ type: 'SCRAPE_REQUEST' }, '*');

        timeoutId = setTimeout(() => {
          window.removeEventListener('message', messageHandler);
          toast.error('Scraping timeout. Please try again.', { id: 'scrape' });
          setIsScraping(false);
          reject(new Error('Timeout'));
        }, 10000);
      });
    } catch (error) {
      console.error('Scraping error:', error);
      toast.error('Failed to scrape page', { id: 'scrape' });
      setIsScraping(false);
    }
  };

  const parseFile = (content: string, name: string) => {
    const extension = name.split('.').pop() || 'txt';
    const messages = parseConversation(content, extension);

    if (messages.length === 0 && content.trim().length > 0) {
      toast.error("Could not parse any messages from the file. Please check the file format.");
    }

    setFileName(name);
    setPreviewData(messages);
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



  return (
    <div className="space-y-6">
      <div className="flex items-center">
        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-400 font-bold text-sm mr-3 shrink-0">
            2
        </div>
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Conversation Input</h2>
      </div>

      <div className="flex flex-wrap gap-6">
        {/* Upload Area */}
        <div className="flex-1 min-w-[280px]">
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
                {!fileName ? (
                    <div className="flex flex-col w-full max-w-[200px] gap-3">
                         <button
                            onClick={scrapeCurrentPage}
                            disabled={isScraping}
                            className="flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-700 disabled:bg-slate-400 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:cursor-not-allowed w-full"
                        >
                            <Globe className="w-4 h-4" />
                            {isScraping ? 'Scraping...' : 'Scrape Page'}
                        </button>
                    </div>
                ) : (
                    <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setFileName(null);
                          setPreviewData([]);
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
        <div className="flex-[2] min-w-[320px] h-[400px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden flex flex-col transition-colors">
            <div className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 px-4 py-3 flex items-center flex-wrap gap-2">
                <FileText className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                  Preview: {fileName || 'No file loaded'}
                </span>
                <span className="ml-auto text-xs text-slate-400 dark:text-slate-500 shrink-0">
                  {previewData.length} turns
                </span>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-white dark:bg-slate-800">
                {previewData.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400 dark:text-slate-500">
                        <p className="text-sm">No conversation data to display.</p>
                        <p className="text-xs mt-1 text-center max-w-[240px]">
                            Click "Scrape Page" to load content.
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
    </div>
  );
};
