// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { Role, type Conversation } from '@shared/types';
import {
  applyTranscriptMessageSelection,
  getExcludedTranscriptMessageIds,
  getTranscriptSourceMessages,
} from './transcriptSelection';

const makeConversation = (): Conversation => ({
  id: 'conversation-1',
  title: 'Transcript',
  messages: [
    { id: 'msg-0', role: Role.Client, content: 'First' },
    { id: 'msg-1', role: Role.Chatbot, content: 'Second' },
    { id: 'msg-2', role: Role.Client, content: 'Third' },
  ],
});

describe('transcript message selection', () => {
  it('keeps the full preview while reindexing the retained evaluation subset', () => {
    const original = makeConversation();
    const selected = applyTranscriptMessageSelection(original, new Set(['msg-1']));

    expect(selected.messages).toEqual([
      { id: 'msg-0', role: Role.Client, content: 'First' },
      { id: 'msg-1', role: Role.Client, content: 'Third' },
    ]);
    expect(getTranscriptSourceMessages(selected)).toEqual(original.messages);
    expect([...getExcludedTranscriptMessageIds(selected)]).toEqual(['msg-1']);
    expect(original.messageSelection).toBeUndefined();
    expect(original.messages).toHaveLength(3);
  });

  it('restores messages in source order and removes selection metadata', () => {
    const original = makeConversation();
    const selected = applyTranscriptMessageSelection(
      original,
      new Set(['msg-0', 'msg-2'])
    );
    const restored = applyTranscriptMessageSelection(selected, new Set());

    expect(restored.messages.map((message) => message.content)).toEqual([
      'First',
      'Second',
      'Third',
    ]);
    expect(restored.messages.map((message) => message.id)).toEqual([
      'msg-0',
      'msg-1',
      'msg-2',
    ]);
    expect(restored.messageSelection).toBeUndefined();
  });

  it('ignores unknown ids and refuses to exclude every turn', () => {
    const original = makeConversation();
    const unknownOnly = applyTranscriptMessageSelection(original, new Set(['missing']));
    const excludeAll = applyTranscriptMessageSelection(
      original,
      new Set(original.messages.map((message) => message.id))
    );

    expect(unknownOnly.messages).toEqual(original.messages);
    expect(unknownOnly.messageSelection).toBeUndefined();
    expect(excludeAll).toBe(original);
  });
});
