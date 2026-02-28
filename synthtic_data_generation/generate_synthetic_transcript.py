#!/usr/bin/env python3
"""Rank topics/questions from question-response data.

Workflow:
1) De-duplicate questions by question ID.
2) Rank topics by number of unique questions.
3) Keep top-N topics (default: 10).
4) Rank questions within each selected topic by max response upvotes.

Examples:
  python generate_synthetic_transcript.py --hf-dataset nbertagnolli/counsel-chat
  python generate_synthetic_transcript.py --generate-synthetic
"""

from __future__ import annotations

import argparse
import json
import os
import time
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional


QUESTION_ID_KEY = "questionID"
TOPIC_KEY = "topic"
QUESTION_TEXT_KEY = "questionText"
QUESTION_TITLE_KEY = "questionTitle"
ANSWER_TEXT_KEY = "answerText"
UPVOTES_KEY = "upvotes"
SKIPPED_QUESTION_IDS = {"486"}


class SimpleProgressBar:
    def __init__(self, total: int, desc: str = "Progress") -> None:
        self.total = max(total, 0)
        self.current = 0
        self.desc = desc

    def __enter__(self) -> "SimpleProgressBar":
        print(f"{self.desc}: 0/{self.total} (0%)", end="", flush=True)
        return self

    def update(self, step: int = 1) -> None:
        self.current += step
        percent = int((self.current / self.total) * 100) if self.total > 0 else 100
        print(f"\r{self.desc}: {self.current}/{self.total} ({percent}%)", end="", flush=True)
        if self.current >= self.total:
            print()

    def __exit__(self, exc_type, exc, tb) -> None:
        if self.current < self.total:
            print()


def make_progress_bar(total: int, desc: str):
    try:
        from tqdm import tqdm

        return tqdm(total=total, desc=desc, unit="transcript")
    except ImportError:
        return SimpleProgressBar(total=total, desc=desc)


@dataclass
class QuestionAggregate:
    question_id: str
    question_text: str = ""
    best_answer_text: str = ""
    topic_counts: Counter[str] = field(default_factory=Counter)
    max_response_upvotes: int = 0

    def apply(
        self,
        *,
        topic: str,
        question_text: str,
        answer_text: str,
        upvotes: Iterable[int],
    ) -> None:
        if topic:
            self.topic_counts[topic] += 1
        if question_text and not self.question_text:
            self.question_text = question_text
        max_up = max(upvotes, default=None)
        if max_up is not None and max_up > self.max_response_upvotes:
            self.max_response_upvotes = max_up
            self.best_answer_text = answer_text
        elif answer_text and not self.best_answer_text:
            self.best_answer_text = answer_text

    @property
    def topic(self) -> str:
        if not self.topic_counts:
            return "unknown"
        return self.topic_counts.most_common(1)[0][0]


def _to_str(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    return str(value).strip()


def _to_int(value: Any) -> Optional[int]:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return int(value)
    if isinstance(value, str):
        raw = value.strip().replace(",", "")
        if not raw:
            return None
        try:
            return int(float(raw))
        except ValueError:
            return None
    return None


def _collect_upvotes(record: Dict[str, Any]) -> List[int]:
    upvote = _to_int(record.get(UPVOTES_KEY))
    return [upvote] if upvote is not None else []


def _extract_question_text(record: Dict[str, Any]) -> str:
    text = _to_str(record.get(QUESTION_TEXT_KEY))
    title = _to_str(record.get(QUESTION_TITLE_KEY))

    if title and text and title != text:
        return f"{title}\n\n{text}".strip()
    return text or title


def load_hf_records(dataset_name: str, split: str, config_name: str | None = None) -> List[Dict[str, Any]]:
    try:
        from datasets import load_dataset
    except ImportError as exc:
        raise SystemExit(
            "Loading from Hugging Face requires the `datasets` package. "
            "Install with: pip install datasets"
        ) from exc

    kwargs: Dict[str, Any] = {"path": dataset_name}
    if config_name:
        kwargs["name"] = config_name

    try:
        dataset = load_dataset(**kwargs, split=split)
    except Exception as split_exc:
        try:
            ds_dict = load_dataset(**kwargs)
        except Exception as dict_exc:
            raise SystemExit(
                "Failed to load Hugging Face dataset "
                f"'{dataset_name}' (split='{split}'). "
                "Check dataset name/split and internet access.\n"
                f"Original errors: split load: {split_exc} | dict load: {dict_exc}"
            ) from dict_exc

        if split in ds_dict:
            dataset = ds_dict[split]
        elif "train" in ds_dict:
            dataset = ds_dict["train"]
        else:
            first_split = next(iter(ds_dict.keys()))
            dataset = ds_dict[first_split]

    return [dict(row) for row in dataset]


def dedupe_questions(records: List[Dict[str, Any]]) -> tuple[Dict[str, QuestionAggregate], int]:
    by_qid: Dict[str, QuestionAggregate] = {}
    skipped_without_id = 0

    for row in records:
        question_id = _to_str(row.get(QUESTION_ID_KEY))
        if not question_id:
            skipped_without_id += 1
            continue

        topic = _to_str(row.get(TOPIC_KEY)) or "unknown"
        question_text = _extract_question_text(row)
        answer_text = _to_str(row.get(ANSWER_TEXT_KEY))
        upvotes = _collect_upvotes(row)

        agg = by_qid.get(question_id)
        if agg is None:
            agg = QuestionAggregate(question_id=question_id)
            by_qid[question_id] = agg
        agg.apply(
            topic=topic,
            question_text=question_text,
            answer_text=answer_text,
            upvotes=upvotes,
        )

    return by_qid, skipped_without_id


def rank_topics_and_questions(
    deduped: Dict[str, QuestionAggregate],
    top_topics: int,
) -> List[Dict[str, Any]]:
    per_topic: Dict[str, List[QuestionAggregate]] = defaultdict(list)
    for agg in deduped.values():
        per_topic[agg.topic].append(agg)

    ranked_topics = sorted(
        per_topic.items(),
        key=lambda item: (-len(item[1]), item[0].lower()),
    )[:top_topics]

    result: List[Dict[str, Any]] = []
    for topic_rank, (topic, questions) in enumerate(ranked_topics, start=1):
        ranked_pool = [q for q in questions if q.question_id not in SKIPPED_QUESTION_IDS]
        sorted_questions = sorted(
            ranked_pool,
            key=lambda q: (-q.max_response_upvotes, q.question_id),
        )

        result.append(
            {
                "topic_rank": topic_rank,
                "topic": topic,
                "unique_question_count": len(ranked_pool),
                "questions": [
                    {
                        "question_rank": question_rank,
                        "questionID": q.question_id,
                        "max_response_upvotes": q.max_response_upvotes,
                        "questionText": q.question_text,
                        "answerText": q.best_answer_text,
                    }
                    for question_rank, q in enumerate(sorted_questions, start=1)
                ],
            }
        )
    return result


def print_summary(result: List[Dict[str, Any]]) -> None:
    print("Top topics (ranked by number of unique questions):")
    for topic_info in result:
        print(
            f"- #{topic_info['topic_rank']} {topic_info['topic']} "
            f"(unique questions: {topic_info['unique_question_count']})"
        )
        top_questions = topic_info["questions"][:5]
        for q in top_questions:
            print(
                f"    - q#{q['question_rank']} id={q['questionID']} "
                f"max_upvotes={q['max_response_upvotes']}"
            )


def _json_loads_or_raise(raw: str, context: str) -> Dict[str, Any]:
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Model returned invalid JSON for {context}: {exc}") from exc

    if not isinstance(parsed, dict):
        raise ValueError(f"Model returned non-object JSON for {context}")
    return parsed


def generate_synthetic_record_with_gpt4o(
    *,
    api_key: str,
    model: str,
    topic: str,
    question_id: str,
    question_text: str,
    answer_text: str,
    max_response_upvotes: int,
    example_index: int,
) -> Dict[str, Any]:
    try:
        from openai import OpenAI
    except ImportError as exc:
        raise SystemExit(
            "Generating synthetic data requires the `openai` package. Install with: pip install openai"
        ) from exc

    client = OpenAI(api_key=api_key)

    system_prompt = (
        "You are a data generation assistant for mental-health research. "
        "Your task is to create realistic, ethically safe, fully synthetic counseling transcripts "
        "for research prototyping. Do not include any real personal information. "
        "Output valid JSON only with no additional commentary."
    )

    user_prompt = (
        "Generate one fully synthetic therapy session inspired by the source material below.\n\n"
        
        "OBJECTIVE:\n"
        "Create a naturalistic, emotionally coherent counseling dialogue suitable for research use.\n"
        "Also generate a structured session summary that serves TWO purposes:\n"
        "  (1) Concisely summarize what happened in the session.\n"
        "  (2) Provide enough structured signal to guide regeneration of a similar transcript.\n\n"
            
        "CONSTRAINTS:\n"
        "- The conversation must be entirely fictional and non-identifying.\n"
        "- Approximately 28–32 turns total.\n"
        "- Maintain therapeutic realism in tone, pacing, and interaction quality.\n"
        "- Avoid extreme crisis content unless clearly handled safely and appropriately.\n"
        "- Do not copy or paraphrase the source text directly.\n\n"
        
        "OUTPUT FORMAT (JSON only, no extra text):\n"
        "Return a JSON object with exactly these keys:\n"
        "  summary: string\n"
        "  transcript: array\n\n"
        
        "The transcript must be an array of objects with this exact schema:\n"
        "  {\"role\": \"Client\" or \"Therapist\", \"text\": \"utterance\"}\n\n"
        
        f"Topic: {topic}\n"
        f"Source question:\n{question_text}\n\n"
        f"Source top answer:\n{answer_text}\n"
    )

    completion = client.chat.completions.create(
        model=model,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    )

    content = completion.choices[0].message.content
    synthetic = _json_loads_or_raise(content, context=f"{topic}/{question_id}/{example_index}")

    transcript = synthetic.get("transcript", [])
    if not isinstance(transcript, list):
        transcript = []

    normalized_turns: List[Dict[str, str]] = []
    for turn in transcript:
        if not isinstance(turn, dict):
            continue
        role = _to_str(turn.get("role")).lower()
        text = _to_str(turn.get("text"))
        if role not in {"client", "therapist"} or not text:
            raise ValueError(
                f"Invalid transcript turn in {topic}/{question_id}/{example_index}: "
                f"each turn must be an object with 'role' ('Client' or 'Therapist') and non-empty 'text'. Got: {turn}"
            )
        normalized_turns.append({"role": role, "text": text})

    return {
        "source": {
            "topic": topic,
            "questionID": question_id,
            "questionText": question_text,
            "answerText": answer_text,
            "max_response_upvotes": max_response_upvotes,
            "example_index": example_index,
        },
        "summary": _to_str(synthetic.get("summary")),
        "transcript": normalized_turns,
        "model": model,
    }


def generate_synthetic_dataset(
    *,
    ranked_topics: List[Dict[str, Any]],
    api_key: str,
    model: str,
    questions_per_topic: int,
    synthetic_per_question: int,
    sleep_seconds: float,
) -> List[Dict[str, Any]]:
    generated: List[Dict[str, Any]] = []
    jobs: List[Dict[str, Any]] = []

    for topic_info in ranked_topics:
        topic = _to_str(topic_info.get("topic")) or "unknown"
        questions = topic_info.get("questions", [])
        if not isinstance(questions, list):
            continue

        chosen_questions = questions[:questions_per_topic]
        for q in chosen_questions:
            if not isinstance(q, dict):
                continue
            question_id = _to_str(q.get("questionID"))
            question_text = _to_str(q.get("questionText"))
            answer_text = _to_str(q.get("answerText"))
            max_upvotes = _to_int(q.get("max_response_upvotes")) or 0

            if not question_id:
                continue
            if not question_text:
                question_text = f"Synthetic counseling question about {topic}"

            for idx in range(1, synthetic_per_question + 1):
                jobs.append(
                    {
                        "topic": topic,
                        "question_id": question_id,
                        "question_text": question_text,
                        "answer_text": answer_text,
                        "max_upvotes": max_upvotes,
                        "example_index": idx,
                    }
                )

    if not jobs:
        return generated

    with make_progress_bar(total=len(jobs), desc="Generating synthetic transcripts") as progress:
        for job in jobs:
            record = generate_synthetic_record_with_gpt4o(
                api_key=api_key,
                model=model,
                topic=job["topic"],
                question_id=job["question_id"],
                question_text=job["question_text"],
                answer_text=job["answer_text"],
                max_response_upvotes=job["max_upvotes"],
                example_index=job["example_index"],
            )
            generated.append(record)
            progress.update(1)
            if sleep_seconds > 0:
                time.sleep(sleep_seconds)

    return generated


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "De-duplicate questions by questionID, rank topics by unique question count, "
            "select top topics, and rank questions by max response upvotes."
        )
    )
    parser.add_argument(
        "--hf-dataset",
        type=str,
        default="nbertagnolli/counsel-chat",
        help="Hugging Face dataset name (default: nbertagnolli/counsel-chat)",
    )
    parser.add_argument(
        "--hf-split",
        type=str,
        default="train",
        help="Dataset split for Hugging Face loading (default: train)",
    )
    parser.add_argument(
        "--hf-config",
        type=str,
        default=None,
        help="Optional Hugging Face dataset config/subset name",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("ranked_topics_questions.json"),
        help="Path to output JSON file (default: ranked_topics_questions.json)",
    )
    parser.add_argument(
        "--top-topics",
        type=int,
        default=10,
        help="How many top topics to keep (default: 10)",
    )
    parser.add_argument(
        "--generate-synthetic",
        action="store_true",
        help="Generate synthetic counseling transcripts with GPT-4o from ranked questions",
    )
    parser.add_argument(
        "--openai-model",
        type=str,
        default="gpt-4o",
        help="OpenAI model for synthetic generation (default: gpt-4o)",
    )
    parser.add_argument(
        "--openai-api-key",
        type=str,
        default=None,
        help="OpenAI API key (default: read from OPENAI_API_KEY env var)",
    )
    parser.add_argument(
        "--synthetic-questions-per-topic",
        type=int,
        default=1,
        help="How many top-ranked questions per topic to synthesize (default: 1)",
    )
    parser.add_argument(
        "--synthetic-per-question",
        type=int,
        default=1,
        help="How many synthetic transcripts to create per selected question (default: 1)",
    )
    parser.add_argument(
        "--synthetic-output",
        type=Path,
        default=Path("top10_synthetic_transcripts_gpt4o.json"),
        help="Path to synthetic transcript output JSON (default: top10_synthetic_transcripts_gpt4o.json)",
    )
    parser.add_argument(
        "--request-delay-seconds",
        type=float,
        default=0.0,
        help="Optional delay between generation requests, in seconds (default: 0)",
    )
    args = parser.parse_args()

    if args.top_topics <= 0:
        raise SystemExit("--top-topics must be greater than 0")
    if args.synthetic_questions_per_topic <= 0:
        raise SystemExit("--synthetic-questions-per-topic must be greater than 0")
    if args.synthetic_per_question <= 0:
        raise SystemExit("--synthetic-per-question must be greater than 0")
    if args.request_delay_seconds < 0:
        raise SystemExit("--request-delay-seconds cannot be negative")

    records = load_hf_records(
        dataset_name=args.hf_dataset,
        split=args.hf_split,
        config_name=args.hf_config,
    )
    input_source = f"hf://{args.hf_dataset}[{args.hf_split}]"

    deduped, skipped_without_id = dedupe_questions(records)
    ranked = rank_topics_and_questions(deduped, top_topics=args.top_topics)

    output_payload = {
        "input_source": input_source,
        "total_rows": len(records),
        "unique_questions_after_dedupe": len(deduped),
        "rows_skipped_without_questionID": skipped_without_id,
        "top_topics_limit": args.top_topics,
        "topics": ranked,
    }

    args.output.write_text(json.dumps(output_payload, indent=2) + "\n", encoding="utf-8")
    print_summary(ranked)
    print(f"\nSaved ranked result to: {args.output}")

    if args.generate_synthetic:
        api_key = args.openai_api_key or os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise SystemExit(
                "Synthetic generation requested but no OpenAI API key found. "
                "Provide --openai-api-key or set OPENAI_API_KEY."
            )

        synthetic_records = generate_synthetic_dataset(
            ranked_topics=ranked,
            api_key=api_key,
            model=args.openai_model,
            questions_per_topic=args.synthetic_questions_per_topic,
            synthetic_per_question=args.synthetic_per_question,
            sleep_seconds=args.request_delay_seconds,
        )

        synthetic_payload = {
            "input_source": input_source,
            "model": args.openai_model,
            "top_topics_limit": args.top_topics,
            "synthetic_questions_per_topic": args.synthetic_questions_per_topic,
            "synthetic_per_question": args.synthetic_per_question,
            "generated_count": len(synthetic_records),
            "records": synthetic_records,
        }
        args.synthetic_output.write_text(json.dumps(synthetic_payload, indent=2) + "\n", encoding="utf-8")
        print(f"Saved synthetic transcripts to: {args.synthetic_output}")


if __name__ == "__main__":
    main()
