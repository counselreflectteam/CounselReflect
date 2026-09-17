"""
File handler utilities for the CLI tool.

Handles finding, loading, and saving conversation files.
"""
from pathlib import Path
from typing import List, Dict, Any
import json


def find_conversation_files(directory: str) -> List[Path]:
    """
    Find all JSON conversation files in a directory (recursively).
    
    Args:
        directory: Directory path to search
        
    Returns:
        List of Path objects for found files
        
    Raises:
        FileNotFoundError: If directory doesn't exist
    """
    dir_path = Path(directory)
    
    if not dir_path.exists():
        raise FileNotFoundError(f"Directory not found: {directory}")
    
    if not dir_path.is_dir():
        raise NotADirectoryError(f"Not a directory: {directory}")
    
    # Find all JSON files, excluding result files
    json_files = []
    for file_path in dir_path.rglob("*.json"):
        # Skip result files
        if file_path.name.endswith('_results.json'):
            continue
        # Skip files in results directories
        if 'results' in file_path.parts:
            continue
        json_files.append(file_path)
    
    return sorted(json_files)


def load_conversation(file_path: Path) -> Dict[str, Any]:
    """
    Load and validate a conversation JSON file.
    
    Args:
        file_path: Path to JSON file
        
    Returns:
        Parsed conversation data
        
    Raises:
        ValueError: If file format is invalid
    """
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        # Validate format
        if isinstance(data, dict) and 'conversation' in data:
            conversation = data['conversation']
        elif isinstance(data, list):
            conversation = data
        else:
            raise ValueError(
                f"Invalid format in {file_path.name}. "
                f"Expected list or dict with 'conversation' key."
            )
        
        # Validate conversation structure
        if not conversation:
            raise ValueError(f"Empty conversation in {file_path.name}")
        
        if not isinstance(conversation, list):
            raise ValueError(
                f"Conversation must be a list in {file_path.name}"
            )
        
        # Check first item has required keys
        if conversation and isinstance(conversation[0], dict):
            if 'speaker' not in conversation[0] or 'text' not in conversation[0]:
                raise ValueError(
                    f"Conversation items must have 'speaker' and 'text' keys in {file_path.name}"
                )
        
        return data
    
    except json.JSONDecodeError as e:
        raise ValueError(f"Invalid JSON in {file_path.name}: {str(e)}")
    except Exception as e:
        raise ValueError(f"Error loading {file_path.name}: {str(e)}")


def save_results(results: Dict[str, Any], output_path: Path) -> None:
    """
    Save evaluation results to JSON file.
    
    Args:
        results: Evaluation results dictionary
        output_path: Path to save results
    """
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(results, f, indent=2, ensure_ascii=False)


def create_output_filename(input_file: Path, output_dir: Path) -> Path:
    """
    Create output filename based on input filename.
    
    Args:
        input_file: Input file path
        output_dir: Output directory
        
    Returns:
        Output file path
    """
    # Add _results suffix before extension
    stem = input_file.stem
    output_name = f"{stem}_results.json"
    return output_dir / output_name
