"""
Conversation parser utility for API.

Simple parser that converts request conversation data into standardized format.
"""
from typing import List, Dict, Any, Union


class ConversationParseError(Exception):
    """Exception raised when conversation parsing fails."""
    
    def __init__(self, message: str):
        self.message = message
        super().__init__(self.message)
    
    def __str__(self):
        return f"Parse error: {self.message}"


def parse(conversation: Union[List[Dict[str, str]], Dict[str, Any]]) -> List[Dict[str, str]]:
    """
    Parse conversation from request data.
    
    Supports multiple input formats including test_input.json format.
    
    Args:
        conversation: Conversation data, can be:
            - List of dicts: [{"speaker": "...", "text": "..."}, ...]
            - Dict with 'conversation' key (test_input.json format): 
              {"conversation": [...], "metrics": [...]}
            - Dict mapping speakers to messages: {"Speaker": ["msg1", "msg2"], ...}
    
    Returns:
        List of utterances, each with 'speaker' and 'text' keys:
        [{"speaker": str, "text": str}, ...]
    
    Raises:
        ConversationParseError: If parsing fails
    
    Examples:
        >>> # List format (direct)
        >>> conversation = [
        ...     {"speaker": "Therapist", "text": "Hello"},
        ...     {"speaker": "Patient", "text": "Hi"}
        ... ]
        >>> parse(conversation)
        [{"speaker": "Therapist", "text": "Hello"}, {"speaker": "Patient", "text": "Hi"}]
        
        >>> # test_input.json format (dict with 'conversation' key)
        >>> test_input = {
        ...     "conversation": [
        ...         {"speaker": "Therapist", "text": "Hello"},
        ...         {"speaker": "Patient", "text": "Hi"}
        ...     ],
        ...     "metrics": ["talk_type"]
        ... }
        >>> parse(test_input)
        [{"speaker": "Therapist", "text": "Hello"}, {"speaker": "Patient", "text": "Hi"}]
    """
    utterances: List[Dict[str, str]] = []
    
    try:
        # Handle dict with 'conversation' key
        if isinstance(conversation, dict) and "conversation" in conversation:
            conversation = conversation["conversation"]
        
        # Handle list format: [{"speaker": "...", "text": "..."}, ...] or [{"role": "...", "content"|"text": "..."}, ...]
        if isinstance(conversation, list):
            for i, item in enumerate(conversation):
                if not isinstance(item, dict):
                    raise ConversationParseError(
                        f"List items must be dicts, got {type(item).__name__}"
                    )
                speaker = item.get("speaker")
                text = item["text"] if "text" in item else item.get("content")
                if speaker is None and "role" in item:
                    role = str(item["role"]).lower()
                    if role in ("therapist", "assistant", "helper", "counselor"):
                        speaker = "therapist"
                    elif role in ("patient", "user", "client"):
                        speaker = "patient"
                    else:
                        speaker = role
                if speaker is None or text is None:
                    raise ConversationParseError(
                        f"Utterance {i} missing 'speaker' or 'text' key. "
                        f"Accepted formats are (speaker, text) or (role, content/text). "
                        f"Got keys: {list(item.keys())}"
                    )
                utterances.append({
                    "speaker": str(speaker),
                    "text": str(text)
                })
        
        # Handle dict format: {"Speaker1": ["msg1", "msg2"], "Speaker2": [...]}
        elif isinstance(conversation, dict):
            for speaker, messages in conversation.items():
                if isinstance(messages, list):
                    for message in messages:
                        utterances.append({
                            "speaker": str(speaker),
                            "text": str(message)
                        })
                else:
                    utterances.append({
                        "speaker": str(speaker),
                        "text": str(messages)
                    })
        
        else:
            raise ConversationParseError(
                f"Unsupported conversation type: {type(conversation).__name__}. "
                f"Expected list or dict."
            )
        
        # Validate parsed utterances
        _validate_utterances(utterances)
        
        return utterances
    
    except ConversationParseError:
        raise
    except Exception as e:
        raise ConversationParseError(f"Unexpected error: {str(e)}") from e


def _validate_utterances(utterances: List[Dict[str, str]]) -> None:
    """Validate parsed utterances."""
    if not utterances:
        raise ConversationParseError("No utterances found in conversation")
    
    for i, utt in enumerate(utterances):
        if not isinstance(utt, dict):
            raise ConversationParseError(
                f"Utterance {i} is not a dict: {type(utt).__name__}"
            )
        
        if "speaker" not in utt or "text" not in utt:
            raise ConversationParseError(
                f"Utterance {i} missing 'speaker' or 'text' key"
            )
        
        if not isinstance(utt["speaker"], str) or not isinstance(utt["text"], str):
            raise ConversationParseError(
                f"Utterance {i} has non-string 'speaker' or 'text'"
            )
