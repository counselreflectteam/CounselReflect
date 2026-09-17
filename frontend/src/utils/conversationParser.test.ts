// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { parseConversation } from '@shared/utils/conversationParser';
import { Role } from '@shared/types';

describe('parseConversation', () => {
  it('accepts JSON arrays with either role/content or speaker/text fields', () => {
    const messages = parseConversation(JSON.stringify([
      { role: 'Therapist', content: 'How are you feeling?' },
      { speaker: 'Client', text: 'Anxious.' },
      { speaker: 'Chatbot', text: 'That sounds hard.' }
    ]), 'json');

    expect(messages).toEqual([
      { id: 'msg-0', role: Role.Chatbot, content: 'How are you feeling?' },
      { id: 'msg-1', role: Role.Client, content: 'Anxious.' },
      { id: 'msg-2', role: Role.Chatbot, content: 'That sounds hard.' }
    ]);
  });

  it('accepts full-width speaker separators in CJK text transcripts', () => {
    const messages = parseConversation(
      '治疗师：这一周怎么样？\n来访者：开会前我很焦虑。',
      'txt'
    );

    expect(messages.map(({ role, content }) => ({ role, content }))).toEqual([
      { role: Role.Chatbot, content: '这一周怎么样？' },
      { role: Role.Client, content: '开会前我很焦虑。' }
    ]);
  });

  it('parses quoted CSV commas, escaped quotes, CRLF, and non-final text columns', () => {
    const messages = parseConversation(
      [
        'speaker,text,session',
        'Therapist,"What felt ""most difficult""?",one',
        'Client,"I felt anxious, tense, and distracted.",one'
      ].join('\r\n'),
      '.csv'
    );

    expect(messages.map(({ role, content }) => ({ role, content }))).toEqual([
      { role: Role.Chatbot, content: 'What felt "most difficult"?' },
      { role: Role.Client, content: 'I felt anxious, tense, and distracted.' }
    ]);
  });

  it('keeps line breaks inside quoted CSV text fields', () => {
    const messages = parseConversation(
      'speaker,text\nTherapist,"First line.\nSecond line."\nClient,Thanks.',
      'csv'
    );

    expect(messages[0].content).toBe('First line.\nSecond line.');
    expect(messages[1].content).toBe('Thanks.');
  });
});
