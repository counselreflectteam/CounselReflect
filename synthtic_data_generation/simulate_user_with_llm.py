#!/usr/bin/env python3
"""Interactive user simulator for mental-health support conversations.

This script reads user seeds from ranked_topics_questions.json and runs an
interactive loop:
1) Print a simulated user utterance.
2) Wait for you to paste the assistant/LLM response in terminal.
3) Generate the next user utterance with an LLM.
4) Repeat until max turns are reached (default: 30).
"""

from __future__ import annotations

import argparse
import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple


DEFAULT_MODEL = "gpt-4o"
DEFAULT_RANKED_JSON = Path("ranked_topics_questions.json")
DEFAULT_OUTPUT_JSONL = Path("simulated_user_sessions.jsonl")
DEFAULT_MAX_TURNS = 10
DEFAULT_MAX_OUTPUT_TOKENS = 512


SIM_USER_SYSTEM_PROMPT = """You are simulating a single user seeking mental-health support.
You must produce ONLY the user's next utterance.

Rules:
- Stay consistent with the user's background and issue.
- Write naturally, like a real chat user.
- Do not add role labels, JSON, bullets, or stage directions.
- Do not switch to therapist voice.
- Keep content safe and non-graphic.
"""


@dataclass
class UserProfile:
    topic: str
    topic_rank: int
    question_rank: int
    question_id: str
    question_text: str
    answer_text: str
    max_response_upvotes: int


def _to_str(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    return str(value).strip()


def _to_int(value: Any, default: int = 0) -> int:
    if isinstance(value, bool):
        return default
    if isinstance(value, (int, float)):
        return int(value)
    if isinstance(value, str):
        raw = value.strip().replace(",", "")
        if not raw:
            return default
        try:
            return int(float(raw))
        except ValueError:
            return default
    return default


def load_user_profiles(ranked_json_path: Path) -> List[UserProfile]:
    payload = json.loads(ranked_json_path.read_text(encoding="utf-8"))
    topics = payload.get("topics", [])
    if not isinstance(topics, list):
        raise SystemExit("Invalid ranked topics file: `topics` must be a list.")

    profiles: List[UserProfile] = []
    for topic_info in topics:
        if not isinstance(topic_info, dict):
            continue
        topic = _to_str(topic_info.get("topic")) or "unknown"
        topic_rank = _to_int(topic_info.get("topic_rank"), default=0)
        questions = topic_info.get("questions", [])
        if not isinstance(questions, list):
            continue

        top_question: Optional[Dict[str, Any]] = None
        for question in questions:
            if not isinstance(question, dict):
                continue
            if _to_int(question.get("question_rank"), default=0) == 1:
                top_question = question
                break

        if top_question is None:
            continue

        question_id = _to_str(top_question.get("questionID"))
        question_text = _to_str(top_question.get("questionText"))
        if not question_id or not question_text:
            continue

        profiles.append(
            UserProfile(
                topic=topic,
                topic_rank=topic_rank,
                question_rank=_to_int(top_question.get("question_rank"), default=0),
                question_id=question_id,
                question_text=question_text,
                answer_text=_to_str(top_question.get("answerText")),
                max_response_upvotes=_to_int(top_question.get("max_response_upvotes"), default=0),
            )
        )

    return profiles


def filter_profiles(
    profiles: Sequence[UserProfile],
    topic_filter: Optional[str],
    start_user_index: int,
    max_users: Optional[int],
) -> List[UserProfile]:
    selected = list(profiles)
    if topic_filter:
        topic_lc = topic_filter.strip().lower()
        selected = [p for p in selected if p.topic.lower() == topic_lc]
    if start_user_index > 0:
        selected = selected[start_user_index:]
    if max_users is not None:
        selected = selected[: max_users]
    return selected


def _normalize_generated_utterance(raw_text: str) -> str:
    text = raw_text.strip()
    prefixes = ("user:", "client:", "patient:", "human:")
    lower = text.lower()
    for prefix in prefixes:
        if lower.startswith(prefix):
            text = text[len(prefix) :].strip()
            break
    return text


def _render_history_for_prompt(history: Sequence[Dict[str, str]]) -> str:
    lines: List[str] = []
    for turn in history:
        role = "User" if turn["role"] == "user" else "Assistant"
        lines.append(f"{role}: {turn['text']}")
    return "\n".join(lines)


def _build_persona(profile: UserProfile) -> str:
    return (
        f"Topic: {profile.topic}\n"
        f"Initial issue from user:\n{profile.question_text}\n"
    )


def generate_next_user_utterance(
    *,
    client: Any,
    model: str,
    profile: UserProfile,
    history: Sequence[Dict[str, str]],
    max_turns: int,
    temperature: float,
    max_output_tokens: int,
) -> str:
    persona = _build_persona(profile)
    history_text = _render_history_for_prompt(history)
    next_turn_number = len(history) + 1
    user_prompt = (
        f"{persona}\n"
        f"Conversation so far ({len(history)} turns):\n{history_text}\n\n"
        f"Write the next USER turn for turn {next_turn_number} of up to {max_turns} total turns.\n"
        "Maintain natural conversational flow and continuity.\n"
        "Output only the user's message text."
    )
    completion = client.chat.completions.create(
        model=model,
        temperature=temperature,
        max_tokens=max_output_tokens,
        messages=[
            {"role": "system", "content": SIM_USER_SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
    )
    content = _to_str(completion.choices[0].message.content)
    utterance = _normalize_generated_utterance(content)
    if not utterance:
        raise ValueError("LLM returned an empty user utterance.")
    return utterance


def generate_initial_user_utterance(
    *,
    client: Any,
    model: str,
    profile: UserProfile,
    temperature: float,
    max_output_tokens: int,
) -> str:
    persona = _build_persona(profile)
    user_prompt = (
        f"{persona}\n"
        "Based on the persona above, write the very first message this user would send to an LLM for mental health support.\n"
        "Ensure the message is natural, realistic, and consistent with the persona.\n"
        "Output only the user's message text, with no additional commentary or formatting."
    )

    completion = client.chat.completions.create(
        model=model,
        temperature=temperature,
        max_tokens=max_output_tokens,
        messages=[
            {"role": "system", "content": SIM_USER_SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
    )
    content = _to_str(completion.choices[0].message.content)
    utterance = _normalize_generated_utterance(content)
    if not utterance:
        raise ValueError("LLM returned an empty initial user utterance.")
    return utterance


def read_manual_response() -> Tuple[str, Optional[str]]:
    print("Paste assistant response.")
    print("Commands: /end (submit), /skip (next user), /exit (stop program)")

    lines: List[str] = []
    while True:
        line = input("> " if not lines else "")
        stripped = line.strip()
        if not lines and stripped in {"/skip", "/exit"}:
            return "", stripped
        if stripped == "/end":
            break
        lines.append(line)

    return "\n".join(lines).strip(), None


def append_jsonl(path: Path, record: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(record, ensure_ascii=False) + "\n")


def run_single_session(
    *,
    client: Any,
    model: str,
    profile: UserProfile,
    max_turns: int,
    temperature: float,
    max_output_tokens: int,
) -> Tuple[List[Dict[str, str]], str]:
    history: List[Dict[str, str]] = []

    initial_user_utterance = generate_initial_user_utterance(
        client=client,
        model=model,
        profile=profile,
        temperature=temperature,
        max_output_tokens=max_output_tokens,
    )
    history.append({"role": "user", "text": initial_user_utterance})
    print(f"\n[Turn 1/{max_turns}] USER")
    print(initial_user_utterance)

    while len(history) < max_turns:
        assistant_text, command = read_manual_response()
        if command == "/exit":
            return history, "exit_program"
        if command == "/skip":
            return history, "skip_user"
        if not assistant_text:
            print("Assistant response was empty. Please paste text or use /skip.")
            continue

        history.append({"role": "assistant", "text": assistant_text})
        print(f"\n[Turn {len(history)}/{max_turns}] ASSISTANT")
        print(assistant_text)

        if len(history) >= max_turns:
            break

        user_utterance = generate_next_user_utterance(
            client=client,
            model=model,
            profile=profile,
            history=history,
            max_turns=max_turns,
            temperature=temperature,
            max_output_tokens=max_output_tokens,
        )
        history.append({"role": "user", "text": user_utterance})
        print(f"\n[Turn {len(history)}/{max_turns}] USER")
        print(user_utterance)

    return history, "completed"


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Simulate users from ranked_topics_questions.json in a manual-in-the-loop chat.\n"
            "The script generates user turns with an LLM, and you paste assistant turns manually."
        )
    )
    parser.add_argument(
        "--ranked-json",
        type=Path,
        default=DEFAULT_RANKED_JSON,
        help=f"Path to ranked topics file (default: {DEFAULT_RANKED_JSON})",
    )
    parser.add_argument(
        "--output-jsonl",
        type=Path,
        default=DEFAULT_OUTPUT_JSONL,
        help=f"Output JSONL path (default: {DEFAULT_OUTPUT_JSONL})",
    )
    parser.add_argument(
        "--append-output",
        action="store_true",
        help="Append to output file instead of overwriting it at start.",
    )
    parser.add_argument(
        "--model",
        type=str,
        default=DEFAULT_MODEL,
        help=f"OpenAI model for user simulation (default: {DEFAULT_MODEL})",
    )
    parser.add_argument(
        "--openai-api-key",
        type=str,
        default=None,
        help="OpenAI API key (default: read from OPENAI_API_KEY env var)",
    )
    parser.add_argument(
        "--temperature",
        type=float,
        default=0.8,
        help="Sampling temperature for user utterance generation (default: 0.8)",
    )
    parser.add_argument(
        "--max-output-tokens",
        type=int,
        default=DEFAULT_MAX_OUTPUT_TOKENS,
        help=f"Max tokens per generated user turn (default: {DEFAULT_MAX_OUTPUT_TOKENS})",
    )
    parser.add_argument(
        "--max-turns",
        type=int,
        default=DEFAULT_MAX_TURNS,
        help=f"Max total turns (user+assistant) per session (default: {DEFAULT_MAX_TURNS})",
    )
    parser.add_argument(
        "--topic",
        type=str,
        default=None,
        help="Optional exact topic filter (e.g. depression)",
    )
    parser.add_argument(
        "--start-user-index",
        type=int,
        default=0,
        help="Start from this user index after filtering (0-based, default: 0)",
    )
    parser.add_argument(
        "--max-users",
        type=int,
        default=None,
        help="Maximum users/sessions to run (default: all selected users)",
    )
    return parser


def main() -> None:
    args = build_arg_parser().parse_args()
    if args.max_turns <= 0:
        raise SystemExit("--max-turns must be greater than 0")
    if args.max_output_tokens <= 0:
        raise SystemExit("--max-output-tokens must be greater than 0")
    if args.temperature < 0.0 or args.temperature > 2.0:
        raise SystemExit("--temperature must be in [0.0, 2.0]")
    if args.start_user_index < 0:
        raise SystemExit("--start-user-index must be >= 0")
    if args.max_users is not None and args.max_users <= 0:
        raise SystemExit("--max-users must be > 0 when provided")

    if not args.ranked_json.exists():
        raise SystemExit(f"Ranked topics file not found: {args.ranked_json}")

    api_key = args.openai_api_key or os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise SystemExit(
            "Missing OpenAI API key. Set OPENAI_API_KEY or pass --openai-api-key."
        )

    try:
        from openai import OpenAI
    except ImportError as exc:
        raise SystemExit(
            "This script requires the `openai` package. Install with: pip install openai"
        ) from exc

    profiles = load_user_profiles(args.ranked_json)
    selected = filter_profiles(
        profiles=profiles,
        topic_filter=args.topic,
        start_user_index=args.start_user_index,
        max_users=args.max_users,
    )
    if not selected:
        raise SystemExit("No users matched the requested filters.")

    if not args.append_output:
        args.output_jsonl.parent.mkdir(parents=True, exist_ok=True)
        args.output_jsonl.write_text("", encoding="utf-8")

    client = OpenAI(api_key=api_key)
    total = len(selected)
    print(f"Loaded {len(profiles)} users; running {total} session(s).")
    print(f"Writing sessions to: {args.output_jsonl}")

    for i, profile in enumerate(selected, start=1):
        print("\n" + "=" * 80)
        print(
            f"Session {i}/{total} | topic={profile.topic} | "
            f"question_id={profile.question_id} | question_rank={profile.question_rank}"
        )
        print("=" * 80)

        history, status = run_single_session(
            client=client,
            model=args.model,
            profile=profile,
            max_turns=args.max_turns,
            temperature=args.temperature,
            max_output_tokens=args.max_output_tokens,
        )

        session_record = {
            "topic": profile.topic,
            "topic_rank": profile.topic_rank,
            "question_rank": profile.question_rank,
            "questionID": profile.question_id,
            "max_response_upvotes": profile.max_response_upvotes,
            "max_turns": args.max_turns,
            "turn_count": len(history),
            "status": status,
            "transcript": history,
        }
        append_jsonl(args.output_jsonl, session_record)
        print(f"Saved session ({len(history)} turns, status={status}).")

        if status == "exit_program":
            print("Exiting by user command.")
            break


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nInterrupted by user.")
