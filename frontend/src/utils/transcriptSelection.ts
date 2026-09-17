import type { Conversation, Message } from '@shared/types';

export const getTranscriptSourceMessages = (conversation: Conversation): Message[] =>
  conversation.messageSelection?.sourceMessages ?? conversation.messages;

export const getExcludedTranscriptMessageIds = (conversation: Conversation): Set<string> =>
  new Set(conversation.messageSelection?.excludedMessageIds ?? []);

/**
 * Build the evaluation subset while retaining the full source transcript for
 * reversible preview edits. Evaluation results are keyed by `msg-N`, so the
 * retained subset must always be reindexed after a turn is excluded.
 */
export const applyTranscriptMessageSelection = (
  conversation: Conversation,
  requestedExcludedIds: ReadonlySet<string>
): Conversation => {
  const sourceMessages = getTranscriptSourceMessages(conversation);
  const requestedIds = new Set(requestedExcludedIds);
  const excludedMessageIds = sourceMessages
    .filter((message) => requestedIds.has(message.id))
    .map((message) => message.id);
  const retainedSourceMessages = sourceMessages.filter(
    (message) => !requestedIds.has(message.id)
  );

  // A transcript with zero retained turns cannot be evaluated. The whole
  // transcript has a separate Remove action in the UI.
  if (retainedSourceMessages.length === 0) return conversation;

  const messages = retainedSourceMessages.map((message, index) => ({
    ...message,
    id: `msg-${index}`,
  }));

  if (excludedMessageIds.length === 0) {
    const { messageSelection: _messageSelection, ...baseConversation } = conversation;
    return { ...baseConversation, messages };
  }

  return {
    ...conversation,
    messages,
    messageSelection: {
      sourceMessages,
      excludedMessageIds,
    },
  };
};
