import { Message, Role } from '../types';
import generatedData from '../data/top10_synthetic_transcripts_gpt4o.json';

export type SampleConversationItem = {
  id: number;
  topic: string;
  turns: Message[];
};

export const normalizeRole = (raw: string): Role => {
  const lower = raw.trim().toLowerCase();
  
  if (lower.includes('system')) return Role.System;
  
  const therapistKeywords = ['therapist', 'doctor', 'counselor', 'assistant', 'provider', 'gpt', 'model'];
  if (therapistKeywords.some(keyword => lower.includes(keyword))) return Role.Therapist;
  
  const clientKeywords = ['client', 'patient', 'user', 'seeker'];
  if (clientKeywords.some(keyword => lower.includes(keyword))) return Role.Client;
  
  return Role.System;
};

const createMessage = (speaker: string, content: string, idx: number): Message => ({
  id: `msg-${idx}`,
  role: normalizeRole(speaker),
  content: content
});

export const mergeConsecutiveTurns = (messages: Message[]): Message[] => {
  if (messages.length === 0) return [];

  const merged: Message[] = [];
  let currentMsg = messages[0];

  for (let i = 1; i < messages.length; i++) {
    const nextMsg = messages[i];
    if (nextMsg.role === currentMsg.role) {
      currentMsg = {
        ...currentMsg,
        content: `${currentMsg.content} ${nextMsg.content}`
      };
    } else {
      merged.push(currentMsg);
      currentMsg = nextMsg;
    }
  }
  merged.push(currentMsg);
  
  return merged.map((msg, idx) => ({ ...msg, id: `msg-${idx}` }));
};

export const parseConversation = (fileContent: string, fileType: string): Message[] => {
  const messages: Message[] = [];
  const type = fileType.toLowerCase().replace(/^\./, '');

  if (type === 'json') {
    try {
      const data = JSON.parse(fileContent);
      
      if (Array.isArray(data)) {
        data.forEach((item: any, idx: number) => {
          messages.push(createMessage(
            item.role || item.speaker || 'Unknown',
            item.content || item.text || '',
            idx
          ));
        });
      } else if (data.conversation && Array.isArray(data.conversation)) {
        data.conversation.forEach((item: any, idx: number) => {
           messages.push(createMessage(
            item.role || item.speaker || 'Unknown',
            item.content || item.text || '',
            idx
           ));
        });
      } else {
        let msgIdx = 0;
        Object.keys(data).forEach((speaker) => {
            const msgs = Array.isArray(data[speaker]) ? data[speaker] : [data[speaker]];
            msgs.forEach((txt: string) => {
                messages.push(createMessage(speaker, txt, msgIdx++));
            });
        });
      }
    } catch (e) {
      console.error("Invalid JSON", e);
      return [];
    }
  } else if (type === 'txt') {
      const lines = fileContent.split('\n');
      lines.forEach((line, idx) => {
          if (line.trim()) {
              if (line.includes(':')) {
                  const [speaker, ...rest] = line.split(':');
                  messages.push(createMessage(speaker.trim(), rest.join(':').trim(), idx));
              } else {
                  messages.push(createMessage('System', line.trim(), idx));
              }
          }
      });
  } else if (type === 'csv') {
      // Basic CSV parsing logic
      const lines = fileContent.split('\n');
      if (lines.length > 0) {
        // Simple heuristic: assume first line is header
        const header = lines[0].toLowerCase();
        if (header.includes('speaker') && header.includes('text')) {
             // Creating a map of index to column name
             const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
             const speakerIdx = headers.indexOf('speaker');
             const textIdx = headers.indexOf('text');

             if (speakerIdx !== -1 && textIdx !== -1) {
                 for (let i = 1; i < lines.length; i++) {
                     // very basic split, does not handle quoted commas
                     const parts = lines[i].split(',');
                     if (parts.length >= 2) {
                        messages.push(createMessage(
                            parts[speakerIdx] || 'Unknown',
                            parts.slice(textIdx).join(',').trim() || '', // join back in case of extra commas
                            i
                        ));
                     }
                 }
             }
        }
      }
  }

  return mergeConsecutiveTurns(messages);
};

type SyntheticRecord = {
  source?: {
    topic?: string;
    questionID?: string | number;
  };
  transcript?: Array<{ role?: string; text?: string }>;
};

type SyntheticPayload = {
  records?: SyntheticRecord[];
};

const payload = generatedData as unknown as SyntheticPayload;
const records = Array.isArray(payload.records) ? payload.records : [];

export const SAMPLE_CONVERSATIONS: SampleConversationItem[] = records.map((record, idx) => {
  const topic = record.source?.topic || 'synthetic';
  const turnsRaw = Array.isArray(record.transcript) ? record.transcript : [];

  return {
    id: idx + 1,
    topic,
    turns: turnsRaw.map((turn, turnIdx) => createMessage(turn.role || 'Unknown', turn.text || '', turnIdx)),
  };
});
