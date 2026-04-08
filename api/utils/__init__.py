"""
Utility functions for API.

Conversation parsing and evaluation helper functions.
"""
from utils.conversation_parser import parse, ConversationParseError
from utils.evaluation_helpers import (
    create_categorical_score,
    create_numerical_score,
    create_utterance_result,
    create_conversation_result,
    create_segment_result,
    handle_openai_error,
)

__all__ = [
    "parse",
    "ConversationParseError",
    "create_categorical_score",
    "create_numerical_score",
    "create_utterance_result",
    "create_conversation_result",
    "create_segment_result",
    "handle_openai_error",
]

