"""
Lightweight example source registry.

Each entry specifies:
- source: external dataset/database name (e.g., "ESConv", "CounselBench")
- topic: a single evaluation topic (e.g., "therapy_dialogue")

Contains real examples from ESConv dataset for therapy dialogue evaluation.
"""
from typing import List, Dict, Any, Optional
from .models import Example


# Registry of available example sources with their topics
# For now, using a single source with example conversations
EXAMPLE_SOURCES: List[Dict[str, str]] = [
    {"source": "ExampleConversations", "topic": "therapy_dialogue"},
]


# Real examples from ESConv dataset
# Multidialogue examples with multiple turns between user and therapist
_PLACEHOLDER_EXAMPLES: Dict[str, List[Example]] = {
    "ExampleConversations:therapy_dialogue": [
        # 1) Job anxiety — scared to quit a stressful but well-paid job
        Example(
            conversation=[
                {"role": "user", "content": "I'm having a lot of anxiety about quitting my current job. It's very stressful but it pays well."},
                {"role": "assistant", "content": "What makes it stressful for you?"},
                {"role": "user", "content": "I deal with people in terrible financial situations every day. It really gets to me."},
                {"role": "assistant", "content": "Do you feel you still help them in some way?"},
                {"role": "user", "content": "I do, but many of them still lose their homes. Sometimes I feel like I should put my own health first."},
                {"role": "assistant", "content": "That's understandable. Is there another job that could pay close to this?"},
                {"role": "user", "content": "Probably not. I've been here a long time and get yearly bonuses."},
                {"role": "assistant", "content": "Do you think reframing how you view your clients' situations might help?"},
                {"role": "user", "content": "Maybe. I just need to sit down and really think through this decision."}
            ],
            dimensions={"source": "ESConv", "topic": "therapy_dialogue", "title": "Job anxiety — weighing a stressful but well-paid career"},
            metrics_output=None
        ),
        # 2) Feeling abandoned by friends, suspecting it's due to financial struggles
        Example(
            conversation=[
                {"role": "user", "content": "I feel like I don't even have friends anymore. They never reply to me."},
                {"role": "assistant", "content": "That sounds painful. What makes you think they're distancing themselves?"},
                {"role": "user", "content": "I've had financial trouble before and sometimes had to borrow money. I think they're tired of me."},
                {"role": "assistant", "content": "Have you spoken to them about how you feel?"},
                {"role": "user", "content": "I'm nervous it might end the friendship."},
                {"role": "assistant", "content": "If you want clarity and peace of mind, you may need to talk to them honestly."},
                {"role": "user", "content": "Maybe I should give them some space and focus on myself for now."}
            ],
            dimensions={"source": "ESConv", "topic": "therapy_dialogue", "title": "Social withdrawal — feeling abandoned by friends"},
            metrics_output=None
        ),
        # 3) COVID depression — missing playing music with a band
        Example(
            conversation=[
                {"role": "user", "content": "Staying home because of COVID is making me really depressed. I miss playing music with my band."},
                {"role": "assistant", "content": "Do you have an online support network or hobbies you can do right now?"},
                {"role": "user", "content": "I play instruments, but we can't meet."},
                {"role": "assistant", "content": "Could you try setting up Zoom sessions to play together virtually?"},
                {"role": "user", "content": "Wouldn't there be sound delay?"},
                {"role": "assistant", "content": "It might still work well enough to reconnect and lift your mood."},
                {"role": "user", "content": "That's a good idea. I'll try it."}
            ],
            dimensions={"source": "ESConv", "topic": "therapy_dialogue", "title": "COVID isolation — missing music and connection with bandmates"},
            metrics_output=None
        ),
        # 4) Relationship crisis — partner meeting an ex secretly
        Example(
            conversation=[
                {"role": "user", "content": "I worry I'm jumping to conclusions, but I don't trust him lately."},
                {"role": "assistant", "content": "What's making you feel that way?"},
                {"role": "user", "content": "He's meeting an ex and didn't tell me. He wouldn't take me along either."},
                {"role": "assistant", "content": "Has he ever made you feel this way before?"},
                {"role": "user", "content": "Never. That's why this is confusing."},
                {"role": "assistant", "content": "If someone starts hiding things, it's important to listen to that feeling. Do you think he would suddenly become honest if confronted?"},
                {"role": "user", "content": "I don't know. I just feel uneasy inside."},
                {"role": "assistant", "content": "That feeling is worth paying attention to."}
            ],
            dimensions={"source": "ESConv", "topic": "therapy_dialogue", "title": "Relationship trust — partner secretly meeting an ex"},
            metrics_output=None
        ),
        # 5) Pandemic unemployment fear — worried employer won't take them back
        Example(
            conversation=[
                {"role": "user", "content": "I've been out of work for five weeks with COVID. I'm scared my boss won't take me back."},
                {"role": "assistant", "content": "That's a very real worry. Are you getting any financial support?"},
                {"role": "user", "content": "I was approved, but the system hasn't paid me anything yet. I've had to rely on food banks."},
                {"role": "assistant", "content": "It sounds like you're doing everything you can to manage the situation."},
                {"role": "user", "content": "I'm worried he'll fire me the moment I return."},
                {"role": "assistant", "content": "Do you feel he's likely to do that?"},
                {"role": "user", "content": "I wouldn't put it past him. But if it happens, I'll pursue legal action and find another job."},
                {"role": "assistant", "content": "You seem very resilient despite everything."}
            ],
            dimensions={"source": "ESConv", "topic": "therapy_dialogue", "title": "Pandemic unemployment — fear of not being rehired"},
            metrics_output=None
        ),
    ],
}


def get_sources_grouped() -> Dict[str, List[str]]:
    """Return sources grouped by source name -> list of topics."""
    grouped: Dict[str, List[str]] = {}
    for entry in EXAMPLE_SOURCES:
        source = entry["source"]
        topic = entry["topic"]
        if source not in grouped:
            grouped[source] = []
        grouped[source].append(topic)
    return grouped


def fetch_examples_for_source(
    source: str,
    topic: str,
    count: int = 5
) -> List[Example]:
    """
    Fetch examples from a specific source and topic.

    Returns real examples from ESConv dataset.
    In the future, this could query additional datasets dynamically.

    Args:
        source: Dataset source name (e.g., "ESConv", "CounselBench")
        topic: Topic/evaluation type (e.g., "therapy_dialogue")
        count: Number of examples to fetch

    Returns:
        List of Example objects
    """
    key = f"{source}:{topic}"
    examples = _PLACEHOLDER_EXAMPLES.get(key, [])

    # Return up to `count` examples
    return examples[:count]


def fetch_examples_multi(
    selections: List[Dict[str, Any]]
) -> List[Example]:
    """
    Fetch examples from multiple sources/topics.

    Args:
        selections: List of {"source": str, "topic": str, "count": int}

    Returns:
        Combined list of Example objects
    """
    all_examples: List[Example] = []

    for sel in selections:
        source = sel.get("source", "")
        topic = sel.get("topic", "")
        count = sel.get("count", 5)

        examples = fetch_examples_for_source(source, topic, count)
        all_examples.extend(examples)

    return all_examples
