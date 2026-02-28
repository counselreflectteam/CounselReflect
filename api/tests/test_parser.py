"""
Tests for conversation parser.

Tests the parse function with various input formats and error cases.
"""
import json
import pytest
from pathlib import Path

from utils.conversation_parser import parse, ConversationParseError


@pytest.fixture
def test_input_data():
    """Load test_input.json data."""
    test_file = Path(__file__).parent / "test_input.json"
    if test_file.exists():
        with open(test_file, "r") as f:
            return json.load(f)
    return None


class TestListFormat:
    """Test parsing list format conversations."""
    
    def test_simple_list_format(self):
        """Test parsing a simple list of utterances."""
        conversation = [
            {"speaker": "Therapist", "text": "Hello, how are you?"},
            {"speaker": "Patient", "text": "I'm feeling anxious."}
        ]
        
        result = parse(conversation)
        
        assert len(result) == 2
        assert result[0]["speaker"] == "Therapist"
        assert result[0]["text"] == "Hello, how are you?"
        assert result[1]["speaker"] == "Patient"
        assert result[1]["text"] == "I'm feeling anxious."
    
    def test_list_with_multiple_utterances(self):
        """Test parsing a longer conversation."""
        conversation = [
            {"speaker": "Therapist", "text": "Hello"},
            {"speaker": "Patient", "text": "Hi there"},
            {"speaker": "Therapist", "text": "How can I help?"},
            {"speaker": "Patient", "text": "I need support"}
        ]
        
        result = parse(conversation)
        
        assert len(result) == 4
        assert all("speaker" in utt and "text" in utt for utt in result)
    
    def test_list_with_empty_text(self):
        """Test parsing list with empty text (should still work)."""
        conversation = [
            {"speaker": "Therapist", "text": "Hello"},
            {"speaker": "Patient", "text": ""}
        ]
        
        result = parse(conversation)
        
        assert len(result) == 2
        assert result[1]["text"] == ""


class TestDictWithConversationKey:
    """Test parsing dict format with 'conversation' key."""
    
    def test_dict_with_conversation_key(self):
        """Test parsing dict with 'conversation' key (test_input.json format)."""
        request_data = {
            "conversation": [
                {"speaker": "Therapist", "text": "Hello"},
                {"speaker": "Patient", "text": "Hi there"}
            ],
            "metrics": ["talk_type"]
        }
        
        result = parse(request_data["conversation"])
        
        assert len(result) == 2
        assert result[0]["speaker"] == "Therapist"
        assert result[1]["speaker"] == "Patient"
    
    def test_nested_conversation_key(self):
        """Test that conversation key is properly extracted."""
        data = {
            "conversation": [
                {"speaker": "Therapist", "text": "How are you?"},
                {"speaker": "Patient", "text": "I'm okay"}
            ],
            "other_field": "ignored"
        }
        
        # Should parse the conversation list directly
        result = parse(data["conversation"])
        
        assert len(result) == 2


class TestDictSpeakerFormat:
    """Test parsing dict format mapping speakers to messages."""
    
    def test_dict_speaker_format(self):
        """Test parsing dict mapping speakers to message lists."""
        conversation = {
            "Therapist": ["Hello", "How are you?"],
            "Patient": ["I'm fine", "Thanks"]
        }
        
        result = parse(conversation)
        
        assert len(result) == 4
        assert result[0]["speaker"] == "Therapist"
        assert result[0]["text"] == "Hello"
        assert result[1]["speaker"] == "Therapist"
        assert result[1]["text"] == "How are you?"
        assert result[2]["speaker"] == "Patient"
        assert result[2]["text"] == "I'm fine"
    
    def test_dict_speaker_format_single_message(self):
        """Test dict format with single message per speaker."""
        conversation = {
            "Therapist": "Hello",
            "Patient": "Hi"
        }
        
        result = parse(conversation)
        
        assert len(result) == 2
        assert result[0]["speaker"] == "Therapist"
        assert result[0]["text"] == "Hello"
        assert result[1]["speaker"] == "Patient"
        assert result[1]["text"] == "Hi"


class TestErrorHandling:
    """Test error handling and edge cases."""
    
    def test_empty_list_raises_error(self):
        """Test that empty list raises ConversationParseError."""
        with pytest.raises(ConversationParseError) as exc_info:
            parse([])
        
        assert "No utterances" in str(exc_info.value)
    
    def test_invalid_type_raises_error(self):
        """Test that invalid type raises ConversationParseError."""
        with pytest.raises(ConversationParseError) as exc_info:
            parse("not a list or dict")
        
        assert "Unsupported conversation type" in str(exc_info.value)
    
    def test_missing_text_key_raises_error(self):
        """Test that missing 'text' key raises error."""
        with pytest.raises(ConversationParseError) as exc_info:
            parse([{"speaker": "Therapist"}])  # missing 'text'
        
        assert "missing 'speaker' or 'text' key" in str(exc_info.value)
    
    def test_missing_speaker_key_raises_error(self):
        """Test that missing 'speaker' key raises error."""
        with pytest.raises(ConversationParseError) as exc_info:
            parse([{"text": "Hello"}])  # missing 'speaker'
        
        assert "missing 'speaker' or 'text' key" in str(exc_info.value)
    
    def test_non_dict_list_item_raises_error(self):
        """Test that non-dict items in list raise error."""
        with pytest.raises(ConversationParseError) as exc_info:
            parse(["not a dict", {"speaker": "Therapist", "text": "Hello"}])
        
        assert "List items must be dicts" in str(exc_info.value)
    
    def test_none_value_raises_error(self):
        """Test that None value raises error."""
        with pytest.raises(ConversationParseError):
            parse(None)
    
    def test_list_with_invalid_utterance_structure(self):
        """Test list with utterance missing required fields."""
        with pytest.raises(ConversationParseError):
            parse([
                {"speaker": "Therapist", "text": "Hello"},
                {"speaker": "Patient"}  # missing text
            ])


class TestEdgeCases:
    """Test edge cases and special scenarios."""
    
    def test_unicode_characters(self):
        """Test parsing with unicode characters."""
        conversation = [
            {"speaker": "Therapist", "text": "你好，今天怎么样？"},
            {"speaker": "Patient", "text": "我很好，谢谢！"}
        ]
        
        result = parse(conversation)
        
        assert len(result) == 2
        assert "你好" in result[0]["text"]
    
    def test_long_text(self):
        """Test parsing with very long text."""
        long_text = "A" * 1000
        conversation = [
            {"speaker": "Therapist", "text": long_text}
        ]
        
        result = parse(conversation)
        
        assert len(result) == 1
        assert len(result[0]["text"]) == 1000
    
    def test_special_characters(self):
        """Test parsing with special characters."""
        conversation = [
            {"speaker": "Therapist", "text": "Hello! How are you? I'm here to help."},
            {"speaker": "Patient", "text": "I'm feeling \"anxious\" and worried..."}
        ]
        
        result = parse(conversation)
        
        assert len(result) == 2
        assert '"' in result[1]["text"]
    
    def test_numeric_speaker_name(self):
        """Test parsing with numeric speaker names (converted to string)."""
        conversation = [
            {"speaker": "1", "text": "Message from speaker 1"},
            {"speaker": "2", "text": "Message from speaker 2"}
        ]
        
        result = parse(conversation)
        
        assert len(result) == 2
        assert result[0]["speaker"] == "1"
        assert result[1]["speaker"] == "2"


class TestWithTestInputFile:
    """Test parsing using test_input.json file."""
    
    def test_parse_test_input_conversation(self, test_input_data):
        """Test parsing conversation from test_input.json."""
        if test_input_data is None:
            pytest.skip("test_input.json not found")
        
        conversation = test_input_data["conversation"]
        result = parse(conversation)
        
        # Verify all utterances are parsed
        assert len(result) == len(conversation)
        assert len(result) == 6
        
        # Verify first utterance
        assert result[0]["speaker"] == "Therapist"
        assert result[0]["text"] == "Hello, welcome. How are you feeling today?"
        
        # Verify second utterance
        assert result[1]["speaker"] == "Patient"
        assert result[1]["text"] == "I've been pretty anxious this week."
        
        # Verify all utterances have required fields
        for utt in result:
            assert "speaker" in utt
            assert "text" in utt
            assert isinstance(utt["speaker"], str)
            assert isinstance(utt["text"], str)
    
    def test_parse_test_input_structure(self, test_input_data):
        """Test that test_input.json has expected structure."""
        if test_input_data is None:
            pytest.skip("test_input.json not found")
        
        # Verify structure
        assert "conversation" in test_input_data
        assert "metrics" in test_input_data
        assert isinstance(test_input_data["conversation"], list)
        assert isinstance(test_input_data["metrics"], list)
        
        # Verify conversation items
        for item in test_input_data["conversation"]:
            assert "speaker" in item
            assert "text" in item
    
    def test_parse_test_input_alternating_speakers(self, test_input_data):
        """Test that test_input.json has alternating speakers."""
        if test_input_data is None:
            pytest.skip("test_input.json not found")
        
        conversation = test_input_data["conversation"]
        result = parse(conversation)
        
        # Verify alternating pattern
        assert result[0]["speaker"] == "Therapist"
        assert result[1]["speaker"] == "Patient"
        assert result[2]["speaker"] == "Therapist"
        assert result[3]["speaker"] == "Patient"
        assert result[4]["speaker"] == "Therapist"
        assert result[5]["speaker"] == "Patient"

