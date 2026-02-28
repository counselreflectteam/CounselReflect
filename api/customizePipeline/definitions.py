"""Metric definitions management.

Handles loading, matching, and extracting metric definitions from text.
"""
from typing import List, Dict


def load_definitions() -> Dict[str, str]:
    return {
        "empathy": "The ability of a system to recognize, understand, and appropriately respond to a user's feelings and perspectives.",
        "specificity": "How concrete, actionable, and context-tied a response is, avoiding vague generalities.",
        "safety": "Avoiding harmful, dangerous, or clinically inappropriate guidance; escalating or discouraging harm.",
        "actionability": "Presence of clear, feasible next steps the user can take, tailored to their context.",
        "warmth": "Tone that is supportive, respectful, and non-judgmental without being overly familiar."
    }


def extract_candidate_terms(raw: str) -> List[str]:
    """Extract potential metric terms from raw user input.
    
    Parses bullet points and lines to identify metric names.
    
    Args:
        raw: Raw user input text
        
    Returns:
        Sorted list of extracted term candidates
    """
    terms = set()
    for line in raw.splitlines():
        line = line.strip("-• \t").strip()
        if not line:
            continue
        # Extract the part before colons, em-dashes, or hyphens
        head = line.split(":")[0].split("—")[0].split("-")[0].strip()
        if 1 <= len(head) <= 40:
            terms.add(head.lower())
    return sorted(terms)


def lookup_definitions_for_terms(terms: List[str], store: Dict[str, str]) -> Dict[str, str]:
    """Look up definitions for the given terms.
    
    Args:
        terms: List of term names to look up
        store: Dictionary of available definitions
        
    Returns:
        Dictionary mapping matched terms to their definitions
    """
    out = {}
    for t in terms:
        key = t.lower().strip()
        if key in store:
            out[t] = store[key]
    return out
