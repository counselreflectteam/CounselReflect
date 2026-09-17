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

  const chatbotKeywords = [
    'therapist', 'doctor', 'counselor', 'counsellor', 'assistant', 'provider', 'gpt', 'model',
    'chatbot', 'bot', 'claude', 'gemini',
    // CJK speaker labels (Simplified/Traditional Chinese, Japanese, Korean)
    '治疗师', '治療師', '咨询师', '諮詢師', '心理师', '心理師', '医生', '醫生', '助手',
    'カウンセラー', 'セラピスト', '상담사', '치료사'
  ];
  if (chatbotKeywords.some(keyword => lower.includes(keyword))) return Role.Chatbot;

  const clientKeywords = [
    'client', 'patient', 'user', 'human', 'seeker',
    // CJK speaker labels
    '来访者', '來訪者', '患者', '客户', '客戶', '用户', '用戶', '求助者',
    'クライアント', '来談者', '내담자', '환자'
  ];
  if (clientKeywords.some(keyword => lower.includes(keyword))) return Role.Client;

  return Role.System;
};

const createMessage = (speaker: string, content: string, idx: number): Message => ({
  id: `msg-${idx}`,
  role: normalizeRole(speaker),
  content: content
});

export const mergeConsecutiveTurns = (messages: Message[], separator = ' '): Message[] => {
  if (messages.length === 0) return [];

  const merged: Message[] = [];
  let currentMsg = messages[0];

  for (let i = 1; i < messages.length; i++) {
    const nextMsg = messages[i];
    if (nextMsg.role === currentMsg.role) {
      currentMsg = {
        ...currentMsg,
        content: `${currentMsg.content}${separator}${nextMsg.content}`
      };
    } else {
      merged.push(currentMsg);
      currentMsg = nextMsg;
    }
  }
  merged.push(currentMsg);
  
  return merged.map((msg, idx) => ({ ...msg, id: `msg-${idx}` }));
};

const parseCsvRows = (input: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];

    if (inQuotes) {
      if (character === '"' && input[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        inQuotes = false;
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"' && field.length === 0) {
      inQuotes = true;
    } else if (character === ',') {
      row.push(field);
      field = '';
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && input[index + 1] === '\n') index += 1;
      row.push(field);
      if (row.some((value) => value.trim().length > 0)) rows.push(row);
      row = [];
      field = '';
    } else {
      field += character;
    }
  }

  row.push(field);
  if (row.some((value) => value.trim().length > 0)) rows.push(row);
  return rows;
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
              // Accept both the ASCII ':' and the full-width '：' separator so
              // pasted CJK transcripts are not silently treated as System lines.
              const separatorMatch = line.match(/[:：]/);
              if (separatorMatch && separatorMatch.index !== undefined) {
                  const speaker = line.slice(0, separatorMatch.index);
                  const content = line.slice(separatorMatch.index + 1);
                  messages.push(createMessage(speaker.trim(), content.trim(), idx));
              } else {
                  messages.push(createMessage('System', line.trim(), idx));
              }
          }
      });
  } else if (type === 'csv') {
    const rows = parseCsvRows(fileContent);
    const headers = (rows[0] || []).map((header) => header.trim().toLowerCase());
    const speakerIdx = headers.indexOf('speaker');
    const textIdx = headers.indexOf('text');

    if (speakerIdx !== -1 && textIdx !== -1) {
      rows.slice(1).forEach((parts, index) => {
        const content = parts[textIdx]?.trim() || '';
        if (!content) return;
        messages.push(createMessage(
          parts[speakerIdx]?.trim() || 'Unknown',
          content,
          index
        ));
      });
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
