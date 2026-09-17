"""
FActScore-aligned Atomic Fact Scorer with per-fact dynamic Wikipedia topics.

Pipeline (based on Min et al., EMNLP 2023 and github.com/shmsw25/FActScore):
1. Knowledge base: SQLite DocDB (enwiki-20230401.db, full English Wikipedia snapshot)
   with pre-chunked RoBERTa 256-token passages. DocDB required (downloads from
   Hugging Face if not found); no other knowledge fallback.
2. Atomic fact generation: sentence splitting + BM25 demo selection from the
   official demons.json (7 fixed + 1 BM25-matched demos, as in the original).
3. Decontextualization + topic assignment (extension over the original): one LLM
   call per utterance rewrites each fact to be self-contained (pronouns resolved)
   and names the Wikipedia article to verify it against; titles are resolved
   against the DocDB, unresolvable ones fall back to the configured default topic.
4. Per-fact retrieval: BM25 over the fact's topic passages, query = topic + fact,
   top-k=5. (The original defaults to GTR-t5-large; per paper Table 12 the two
   retrievers perform equivalently.)
5. Per-fact verification: "Answer the question about {topic}... Input: {atom}
   True or False? Output:" -- prompt and answer parsing identical to the original.
6. Length penalty: gamma=10 (over evaluated facts).
7. Disk-based caching for retrieval, BM25, and LLM.

Known deviations from the original: chat-model AFG at temperature 0 (original:
InstructGPT at 0.7), BM25 with normalized tokens instead of GTR retrieval, no NPM
ensemble, no spaCy postprocessing of atomic facts, and the per-fact dynamic topic
step above.

Provenance:
    CounselReflect's re-implementation of FActScore. It follows the reference
    implementation at https://github.com/shmsw25/FActScore (MIT License,
    Copyright (c) 2023 Sewon Min) and adapts parts of it directly: the DocDB class
    mirrors retrieval.py; the demonstration selection, the sentence-splitter repair
    (_fix_sentence_splitter) and the atomic-fact prompting follow atomic_facts.py;
    the verification prompt and answer parsing follow factscorer.py. data/demons.json
    is the upstream demonstration file, unmodified. Everything else, including the
    per-fact dynamic topic step, was written for CounselReflect. The upstream
    copyright notice above applies to the adapted portions; the root LICENSE covers
    the rest.

References:
    Min, S., Krishna, K., Lyu, X., Lewis, M., Yih, W., Koh, P. W., Iyyer, M.,
    Zettlemoyer, L., & Hajishirzi, H. (2023). FActScore: Fine-grained Atomic
    Evaluation of Factual Precision in Long Form Text Generation. In Proceedings of
    EMNLP 2023. https://aclanthology.org/2023.emnlp-main.741/
    (arXiv preprint: https://arxiv.org/abs/2305.14251)
    Code: https://github.com/shmsw25/FActScore
"""
import concurrent.futures
import hashlib
import json
import logging
import math
import os
import re
import sqlite3
import string
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

# Optional heavy deps
try:
    import numpy as np
    NUMPY_AVAILABLE = True
except ImportError:
    NUMPY_AVAILABLE = False

try:
    from rank_bm25 import BM25Okapi
    BM25_AVAILABLE = True
except ImportError:
    BM25Okapi = None
    BM25_AVAILABLE = False

try:
    from transformers import RobertaTokenizer
    ROBERTA_AVAILABLE = True
except ImportError:
    RobertaTokenizer = None
    ROBERTA_AVAILABLE = False

try:
    import nltk
    NLTK_AVAILABLE = True
except ImportError:
    NLTK_AVAILABLE = False

try:
    from huggingface_hub import hf_hub_download
    HF_HUB_AVAILABLE = True
except ImportError:
    hf_hub_download = None
    HF_HUB_AVAILABLE = False

# -----------------------------------------------------------------------------
# Constants (matching original FActScore)
# -----------------------------------------------------------------------------
MAX_PASSAGE_LENGTH = 256
SPECIAL_SEPARATOR = "####SPECIAL####SEPARATOR####"
RETRIEVAL_K = 5
GAMMA_LENGTH_PENALTY = 10
DEFAULT_CACHE_DIR = ".cache/factscore"
DEFAULT_DB_NAME = "enwiki-20230401.db"
# Hugging Face dataset for DocDB (when not found locally)
DEFAULT_HF_DB_REPO = "danielli2003/enwiki-20230401.db"
# Max parallel LLM calls (avoid rate-limit bursts)
MAX_CONCURRENT_LLM = 8


# -----------------------------------------------------------------------------
# DocDB: SQLite-backed document storage (matching original FActScore retrieval.py)
# -----------------------------------------------------------------------------
class DocDB:
    """
    SQLite backed document storage -- mirrors the original FActScore DocDB.
    The DB stores (title, text) where text is pre-chunked RoBERTa 256-token
    passages joined by SPECIAL_SEPARATOR.
    """

    def __init__(self, db_path: str):
        self.db_path = db_path
        if not os.path.exists(db_path):
            raise FileNotFoundError(f"DocDB file not found: {db_path}")
        self.connection = sqlite3.connect(db_path, check_same_thread=False)
        # Verify the DB has data
        cursor = self.connection.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
        tables = cursor.fetchall()
        if not tables:
            raise ValueError(f"DocDB is empty (no tables): {db_path}")
        cursor.close()
        logger.info(f"DocDB loaded from {db_path}")

    def close(self):
        """Close the connection to the database."""
        self.connection.close()

    def get_text_from_title(self, title: str) -> Optional[List[Dict[str, str]]]:
        """
        Fetch pre-chunked passages for a topic title.
        Returns list of {"title": title, "text": passage_text} or None if not found.
        """
        cursor = self.connection.cursor()
        cursor.execute("SELECT text FROM documents WHERE title = ?", (title,))
        results = cursor.fetchall()
        cursor.close()
        if not results or len(results) == 0:
            return None
        # Split pre-chunked passages on SPECIAL_SEPARATOR
        passages = [
            {"title": title, "text": para}
            for para in results[0][0].split(SPECIAL_SEPARATOR)
        ]
        return passages if passages else None


# -----------------------------------------------------------------------------
# Step 1: RoBERTa 256-token passage chunking (DocDB-style)
# -----------------------------------------------------------------------------
def _get_roberta_tokenizer():
    if not ROBERTA_AVAILABLE or RobertaTokenizer is None:
        return None
    try:
        return RobertaTokenizer.from_pretrained("roberta-large")
    except Exception as e:
        logger.warning(f"Could not load RoBERTa tokenizer: {e}")
        return None


def chunk_into_passages(text: str, title: str) -> List[Dict[str, str]]:
    """
    Chunk text into 256-token passages using RoBERTa tokenizer (matching DocDB).
    Returns list of {"title": title, "text": passage_text}.
    """
    if not ROBERTA_AVAILABLE or not text or not text.strip():
        # Fallback: single passage
        return [{"title": title, "text": text.strip()}] if text and text.strip() else []
    tokenizer = _get_roberta_tokenizer()
    if tokenizer is None:
        return [{"title": title, "text": text.strip()[:8000]}]
    tokens = tokenizer.encode(text, add_special_tokens=False, truncation=True, max_length=100000)
    passages = []
    for i in range(0, len(tokens), MAX_PASSAGE_LENGTH):
        chunk_tokens = tokens[i : i + MAX_PASSAGE_LENGTH]
        passage_text = tokenizer.decode(chunk_tokens, skip_special_tokens=True)
        if passage_text.strip():
            passages.append({"title": title, "text": passage_text})
    if not passages:
        passages = [{"title": title, "text": text.strip()[:8000]}]
    return passages


# -----------------------------------------------------------------------------
# Step 2: Per-fact BM25 retrieval
# -----------------------------------------------------------------------------
_PUNCT_TABLE = str.maketrans("", "", string.punctuation)


def _bm25_tokens(text: str) -> List[str]:
    """Lowercased, punctuation-stripped tokens for passage BM25.

    Deviation from the original's raw .split(): the original's primary retriever is
    dense (GTR), so its BM25 path could afford raw tokens. As our primary retriever,
    raw-split BM25 misses surface mismatches like '1960s,' vs '1960s.'."""
    return text.lower().translate(_PUNCT_TABLE).split()


def _tokenize_passage(p: Dict[str, str]) -> List[str]:
    """Tokenize passage for BM25 (strip <s> </s>, normalize tokens)."""
    text = (p.get("text") or "").replace("<s>", "").replace("</s>", "")
    return _bm25_tokens(text)


def retrieve_passages_bm25(
    topic: str,
    fact: str,
    passages: List[Dict[str, str]],
    k: int = RETRIEVAL_K,
    bm25_index: Optional[Any] = None,
) -> List[Dict[str, str]]:
    """Retrieve top-k passages for query = topic + fact using BM25 (original FActScore style)."""
    if not passages or not NUMPY_AVAILABLE:
        return passages[:k] if passages else []
    query = (topic + " " + (fact or "").strip()).strip()
    query_tokens = _bm25_tokens(query)
    if not query_tokens:
        return passages[:k]
    if bm25_index is not None and BM25_AVAILABLE:
        scores = bm25_index.get_scores(query_tokens)
        top_indices = np.argsort(-scores)[:k]
        return [passages[i] for i in top_indices]
    if not BM25_AVAILABLE:
        return passages[:k]
    corpus = [_tokenize_passage(p) for p in passages]
    if not corpus:
        return passages[:k]
    bm25 = BM25Okapi(corpus)
    scores = bm25.get_scores(query_tokens)
    top_indices = np.argsort(-scores)[:k]
    return [passages[i] for i in top_indices]


# -----------------------------------------------------------------------------
# Disk caching
# -----------------------------------------------------------------------------
def _cache_dir() -> Path:
    d = os.environ.get("FACTSCORE_CACHE_DIR", DEFAULT_CACHE_DIR)
    p = Path(d)
    p.mkdir(parents=True, exist_ok=True)
    return p


def _cache_path(name: str, ext: str = "json") -> Path:
    return _cache_dir() / f"factscore_{name}.{ext}"


# Retrieval/LLM caches hold transcript-derived text (extracted facts appear
# verbatim in retrieval keys; LLM values restate chatbot-turn content), so
# they must never touch disk: the server promises not to persist submitted
# transcripts. They live in memory for one scorer's lifetime only. This scrub
# removes files written by older versions (the prod compose mounts the cache
# dir as a persistent volume, so stale files would otherwise survive forever).
_LEGACY_TRANSCRIPT_CACHE_NAMES = ("retrieval", "llm")


def _scrub_legacy_transcript_caches() -> None:
    for name in _LEGACY_TRANSCRIPT_CACHE_NAMES:
        for ext in ("json", "pkl"):
            path = _cache_path(name, ext)
            for candidate in (path, path.with_name(path.name + ".tmp")):
                try:
                    candidate.unlink(missing_ok=True)
                except Exception:
                    pass


def _prompt_hash(prompt: str) -> str:
    return hashlib.sha256(prompt.encode("utf-8")).hexdigest()[:16]


# -----------------------------------------------------------------------------
# Step 3: Atomic Fact Generation with BM25 demo selection
# -----------------------------------------------------------------------------
def _default_demons_path() -> Path:
    # Vendored copy of the official FActScore demos (demos.zip from the paper's data release)
    return Path(__file__).resolve().parent / "data" / "demons.json"


def _load_demons() -> Dict[str, List[str]]:
    path = os.environ.get("FACTSCORE_DEMONS_PATH")
    if path and os.path.isfile(path):
        p = Path(path)
    else:
        p = _default_demons_path()
    if not p.exists():
        logger.warning(f"Demons file not found: {p}")
        return {}
    try:
        with open(p, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        logger.warning(f"Could not load demons: {e}")
        return {}


def _sent_tokenize(text: str) -> List[str]:
    if not NLTK_AVAILABLE:
        return [s.strip() for s in re.split(r"[.!?]+", text) if s.strip()]
    try:
        nltk.data.find("tokenizers/punkt")
    except LookupError:
        nltk.download("punkt", quiet=True)
    return nltk.sent_tokenize(text)


def _get_top_demos_bm25(query_sentence: str, demon_sentences: List[str], bm25: Any, k: int = 1) -> List[str]:
    if not BM25_AVAILABLE or not demon_sentences or not query_sentence:
        return []
    tokenized_query = query_sentence.split()
    if not tokenized_query:
        return []
    scores = bm25.get_scores(tokenized_query)
    if not NUMPY_AVAILABLE:
        return []
    top_idx = np.argsort(-scores)[:k]
    return [demon_sentences[i] for i in top_idx if i < len(demon_sentences)]


def _text_to_sentences_original(text: str) -> List[str]:
    """Original FActScore parsing: split on '- ' and drop preamble (atomic_facts.py:155-163)."""
    parts = text.split("- ")[1:]
    sentences = []
    for s in parts:
        s = s.strip()
        if not s:
            continue
        if s[-1] == '\n':
            s = s[:-1].strip()
        if s:
            sentences.append(s)
    if sentences and sentences[-1] and sentences[-1][-1] != '.':
        sentences[-1] += '.'
    return sentences


def _fix_sentence_splitter(sentences: List[str]) -> List[str]:
    """Merge broken sentences (adapted from original atomic_facts.py:303-334, without detect_initials)."""
    if not sentences:
        return sentences
    result: List[str] = []
    combine = False
    for i, sent in enumerate(sentences):
        if len(sent.split()) <= 1 and i == 0:
            combine = True
            result.append(sent)
        elif len(sent.split()) <= 1 and result:
            result[-1] += " " + sent
        elif sent[0].isalpha() and not sent[0].isupper() and result:
            result[-1] += " " + sent
        elif combine and result:
            result[-1] += " " + sent
            combine = False
        else:
            result.append(sent)
    return result


# Sentence-level skip prefixes (original atomic_facts.py:74-82)
_SKIP_SENTENCE_PREFIXES = ("Sure", "Please", "Here are", "This sentence does not contain any facts")

# Meta-text patterns used in fallback line-by-line parser only
_AFG_META_PATTERNS = (
    r"^certainly!?\s*",
    r"^here is the breakdown",
    r"^here are the breakdowns",
    r"^independent facts?\s*:?\s*",
    r"^\*?\s*sentence\s*:?\s*\*?$",
    r"^let me know if you need",
    r"^if you (provide|want)",
    r"^for now,?\s*here",
    r"^the following (sentence|facts?)",
    r"^sure!?\s*",
    r"^of course!?\s*",
)


def _is_meta_line(line: str) -> bool:
    """True if line looks like LLM meta/formatting, not an atomic fact (fallback parser only)."""
    if not line or len(line) < 4:
        return True
    lower = line.lower()
    for pat in _AFG_META_PATTERNS:
        if re.search(pat, lower):
            return True
    return False


def _fallback_parse_facts(text: str) -> List[str]:
    """Line-by-line fallback for when original '- ' parser returns nothing."""
    facts = []
    for line in text.split("\n"):
        line = line.strip()
        line = re.sub(r"^(\d+[\.\)]\s*|-\s*|\*\s*)", "", line).strip()
        if line and len(line) > 3 and not _is_meta_line(line):
            facts.append(line)
    return facts


# -----------------------------------------------------------------------------
# Per-fact True/False verification
# -----------------------------------------------------------------------------
def _parse_true_false(output: str) -> bool:
    """
    Parse True/False from LM output (original FActScore heuristic).

    When both "true" and "false" appear, the LAST mention wins (index("true") > index("false")).
    When neither appears, check for negative keywords -- if none found, assume supported.
    Matches factscorer.py lines 243-252 with one deliberate deviation: an EMPTY
    output returns False here, whereas the original's empty-token-list fallback
    (all() over []) would return True.
    """
    if not output:
        return False
    generated_answer = output.lower().strip()
    if "true" in generated_answer or "false" in generated_answer:
        if "true" in generated_answer and "false" not in generated_answer:
            return True
        elif "false" in generated_answer and "true" not in generated_answer:
            return False
        else:
            # Both present: last mention wins (original uses >)
            return generated_answer.index("true") > generated_answer.index("false")
    else:
        # Neither "true" nor "false": check for negative keywords (original fallback)
        cleaned = generated_answer.lower().translate(
            str.maketrans("", "", string.punctuation)
        ).split()
        return all(
            keyword not in cleaned
            for keyword in ["not", "cannot", "unknown", "information"]
        )


# -----------------------------------------------------------------------------
# JSON parsing helper (for the decontextualization/topic-assignment call)
# -----------------------------------------------------------------------------
def _parse_json_array(text: str) -> List[Any]:
    """Extract the first JSON array of objects from an LLM response.

    Tolerates code fences, surrounding prose (including bracket noise like '[1]',
    which is itself valid JSON but not an array of objects), and responses
    truncated at the token cap (salvages the complete leading objects)."""
    if not text:
        return []
    decoder = json.JSONDecoder()
    starts = [m.start() for m in re.finditer(r"\[", text)]
    fallback_list: Optional[List[Any]] = None
    for s in starts:
        try:
            parsed, _ = decoder.raw_decode(text, s)
        except Exception:
            continue
        if isinstance(parsed, list):
            if parsed and all(isinstance(x, dict) for x in parsed):
                return parsed
            if fallback_list is None:
                fallback_list = parsed
    # Salvage a truncated array of objects: close after the last complete object.
    # Only attempt from '[' positions that open an object array (next char '{').
    for s in starts:
        rest = text[s + 1 :].lstrip()
        if not rest.startswith("{"):
            continue
        closes = [i for i, ch in enumerate(text) if ch == "}" and i > s]
        for e in reversed(closes[-200:]):
            try:
                parsed = json.loads(text[s : e + 1] + "]")
            except Exception:
                continue
            if isinstance(parsed, list) and parsed and all(isinstance(x, dict) for x in parsed):
                logger.warning(
                    f"Salvaged truncated JSON array ({len(parsed)} items) from LLM response"
                )
                return parsed
        break  # only the first object-array start is worth salvaging
    return fallback_list if fallback_list is not None else []


# -----------------------------------------------------------------------------
# Main FActScore-aligned scorer
# -----------------------------------------------------------------------------
class AtomicFactScorer:
    """
    FActScore-aligned pipeline with per-fact dynamic topics:
    - SQLite DocDB with pre-chunked RoBERTa 256-token passages (enwiki-20230401.db)
    - DocDB required; downloads from Hugging Face if not found locally
    - BM25 demo-selected atomic fact generation (official demons.json)
    - Decontextualization + per-fact Wikipedia topic assignment (one LLM call),
      titles resolved against the DocDB with a configurable fallback topic
    - Per-fact BM25 retrieval, per-fact True/False verification
    - Length penalty gamma=10
    - Disk caches for retrieval, BM25, LLM
    """

    def __init__(self, provider, model: str, cache_dir: Optional[str] = None,
                 db_path: Optional[str] = None, **kwargs):
        self.provider = provider
        self.model = model
        self.verification_model = kwargs.get("verification_model", self.model)
        self._cache_dir = Path(cache_dir) if cache_dir else _cache_dir()

        # --- DocDB: primary knowledge source (matching original FActScore) ---
        self._docdb: Optional[DocDB] = None
        resolved_db_path = self._resolve_db_path(db_path)
        if resolved_db_path:
            try:
                self._docdb = DocDB(resolved_db_path)
                logger.info(f"Using DocDB knowledge source: {resolved_db_path}")
            except Exception as e:
                logger.warning(f"Could not open DocDB at {resolved_db_path}: {e}")
                self._docdb = None

        if self._docdb is None:
            logger.error(
                "DocDB not available -- fact verification cannot run and all utterances "
                "will score Not Applicable. Place a valid enwiki-20230401.db in "
                ".cache/factscore/ (or set FACTSCORE_DB_PATH)."
            )

        self._wiki_passages: Dict[str, List[Dict[str, str]]] = {}
        self._title_cache: Dict[str, bool] = {}
        # Retrieval/LLM caches are in-memory only: their keys/values carry
        # transcript-derived text, and the server promises not to persist
        # submitted transcripts. One evaluation reuses them heavily; across
        # requests they would only ever hit on a re-run of the same transcript.
        self._retrieval_cache: Dict[str, Any] = {}
        # BM25 indexes are cheap to rebuild (ms per article) -- in-memory only, no
        # disk persistence (a shared pkl was a corruption hazard under concurrency)
        self._bm25_cache: Dict[str, Any] = {}
        self._llm_cache: Dict[str, str] = {}
        _scrub_legacy_transcript_caches()
        self._demons = _load_demons()
        self._demon_sentences = list(self._demons.keys())
        self._bm25_demos = None
        if self._demon_sentences and BM25_AVAILABLE:
            try:
                tokenized = [s.split() for s in self._demon_sentences]
                self._bm25_demos = BM25Okapi(tokenized)
            except Exception as e:
                logger.warning(f"BM25 over demons failed: {e}")

    @staticmethod
    def _resolve_db_path(db_path: Optional[str]) -> Optional[str]:
        """Resolve the enwiki DB path, trying several common locations."""
        # 1. Explicit path
        if db_path and os.path.isfile(db_path):
            return db_path
        # 2. Environment variable
        env_path = os.environ.get("FACTSCORE_DB_PATH")
        if env_path and os.path.isfile(env_path):
            return env_path
        # 3. Default cache dir
        cache_dir = _cache_dir()
        default = cache_dir / DEFAULT_DB_NAME
        if default.is_file():
            return str(default)
        # 4. Relative to workspace root (common project layout)
        workspace = Path(__file__).resolve().parent.parent.parent.parent.parent
        for candidate in [
            workspace / ".cache" / "factscore" / DEFAULT_DB_NAME,
            workspace / DEFAULT_CACHE_DIR / DEFAULT_DB_NAME,
        ]:
            if candidate.is_file():
                return str(candidate)
        # 5. Download from Hugging Face if not found locally
        if HF_HUB_AVAILABLE and hf_hub_download is not None:
            hf_repo = os.environ.get("FACTSCORE_DB_HF_REPO", DEFAULT_HF_DB_REPO)
            try:
                logger.info(f"DocDB not found locally. Downloading from Hugging Face ({hf_repo})...")
                # hf_hub_download stages to a temp file and moves it into place only
                # when complete, so an interrupted download cannot leave a partial DB
                # at the resolved path (the previous custom streaming download did
                # exactly that once, producing a truncated 17GB file)
                path = hf_hub_download(
                    repo_id=hf_repo,
                    filename=DEFAULT_DB_NAME,
                    repo_type="dataset",
                    local_dir=str(cache_dir),
                )
                # Validate before accepting
                conn = sqlite3.connect(path)
                try:
                    cur = conn.cursor()
                    cur.execute("SELECT name FROM sqlite_master WHERE type='table';")
                    tables = cur.fetchall()
                finally:
                    conn.close()
                if not tables:
                    logger.warning(f"Downloaded DocDB has no tables; refusing to use it: {path}")
                    return None
                logger.info(f"DocDB downloaded to {path}")
                return str(path)
            except Exception as e:
                logger.warning(f"Failed to download DocDB from Hugging Face: {e}")
        return None

    def _chat(self, messages: List[Dict[str, str]], max_tokens: int = 500,
              model: Optional[str] = None) -> str:
        response = self.provider.chat_completion(
            messages=messages, model=model or self.model,
            temperature=0.0, max_tokens=max_tokens,
        )
        return (response or "").strip()

    def _llm_cached(self, prompt: str, max_tokens: int = 500,
                    model: Optional[str] = None) -> str:
        effective_model = model or self.model
        if effective_model != self.model:
            key = _prompt_hash(prompt + "\n__model__:" + effective_model)
        else:
            key = _prompt_hash(prompt)
        if key in self._llm_cache:
            return self._llm_cache[key]
        msg = [{"role": "user", "content": prompt}]
        out = self._chat(msg, max_tokens=max_tokens, model=effective_model)
        self._llm_cache[key] = out
        return out

    def _get_passages_for_topic(self, topic: str) -> List[Dict[str, str]]:
        """
        Get passages for a topic.
        DocDB only (pre-chunked, matching original FActScore exactly).
        Wikipedia API fallback disabled.
        """
        if topic in self._wiki_passages:
            return self._wiki_passages[topic]

        passages = None

        # Primary: DocDB lookup (exact title match, like original)
        if self._docdb is not None:
            try:
                passages = self._docdb.get_text_from_title(topic)
                if passages:
                    logger.debug(f"DocDB hit for '{topic}': {len(passages)} passages")
            except Exception as e:
                logger.debug(f"DocDB lookup failed for '{topic}': {e}")
                return []  # transient failure: do not cache the negative

        # Wikipedia API fallback disabled; DocDB only

        self._wiki_passages[topic] = passages if passages else []
        return self._wiki_passages[topic]

    def _bm25_for_topic(self, passages: List[Dict[str, str]]) -> Optional[Any]:
        """Get or build BM25 index for topic passages (cached per topic)."""
        if not passages or not BM25_AVAILABLE:
            return None
        # Use first passage's title as topic key (all same topic)
        topic = passages[0].get("title", "")
        if topic in self._bm25_cache:
            return self._bm25_cache[topic]
        corpus = [_tokenize_passage(p) for p in passages]
        if not corpus:
            return None
        try:
            self._bm25_cache[topic] = BM25Okapi(corpus)
            return self._bm25_cache[topic]
        except Exception:
            return None

    def _retrieve(self, topic: str, fact: str, passages: List[Dict[str, str]], k: int = RETRIEVAL_K) -> List[Dict[str, str]]:
        cache_key = topic + "#" + (topic + " " + fact.strip()).strip()
        if cache_key in self._retrieval_cache:
            return self._retrieval_cache[cache_key]
        bm25_index = self._bm25_for_topic(passages)
        result = retrieve_passages_bm25(topic, fact, passages, k=k, bm25_index=bm25_index)
        self._retrieval_cache[cache_key] = result
        return result

    def _build_decompose_prompt(self, sent: str) -> str:
        """Build the AFG prompt for a single sentence (pure, no I/O)."""
        n_fixed = 7
        k_bm25 = 1
        prompt_parts: List[str] = []
        for i in range(min(n_fixed, len(self._demon_sentences))):
            s = self._demon_sentences[i]
            facts_str = "\n".join("- " + f for f in self._demons.get(s, []))
            prompt_parts.append(f"Please breakdown the following sentence into independent facts: {s}\n{facts_str}")
        if self._bm25_demos and k_bm25 > 0:
            top = _get_top_demos_bm25(sent, self._demon_sentences, self._bm25_demos, k=k_bm25)
            for s in top:
                if s not in self._demon_sentences[:n_fixed]:
                    facts_str = "\n".join("- " + f for f in self._demons.get(s, []))
                    prompt_parts.append(f"Please breakdown the following sentence into independent facts: {s}\n{facts_str}")
        prompt_parts.append(f"Please breakdown the following sentence into independent facts: {sent}\n")
        return "\n".join(prompt_parts)

    def _decompose_one(self, sent: str, prompt: str) -> List[str]:
        """Run one decomposition call and parse the result."""
        try:
            content = self._llm_cached(prompt, max_tokens=800)
            parsed = _text_to_sentences_original(content)
            if not parsed:
                parsed = _fallback_parse_facts(content)
            return parsed
        except Exception as e:
            logger.warning(f"AFG error for sentence: {e}")
            return []

    def decompose_to_atomic_facts(self, text: str) -> List[str]:
        """Atomic fact generation with BM25 demo selection (original FActScore style)."""
        sentences = _sent_tokenize(text)
        sentences = _fix_sentence_splitter(sentences)
        if not sentences:
            return []

        tasks: List[Tuple[str, str]] = []
        for sent in sentences:
            sent = sent.strip()
            if len(sent) < 10:
                continue
            if sent.startswith(_SKIP_SENTENCE_PREFIXES):
                continue
            tasks.append((sent, self._build_decompose_prompt(sent)))

        all_facts: List[str] = []
        if len(tasks) <= 1:
            for sent, prompt in tasks:
                all_facts.extend(self._decompose_one(sent, prompt))
        else:
            with concurrent.futures.ThreadPoolExecutor(max_workers=MAX_CONCURRENT_LLM) as pool:
                futures = [pool.submit(self._decompose_one, s, p) for s, p in tasks]
                for future in futures:
                    all_facts.extend(future.result())

        seen: set = set()
        unique: List[str] = []
        for f in all_facts:
            if f not in seen:
                seen.add(f)
                unique.append(f)
        return unique[:50]

    # -------------------------------------------------------------------------
    # Per-fact dynamic topics: decontextualize facts + assign Wikipedia titles
    # -------------------------------------------------------------------------
    def _decontextualize_and_assign_topics(
        self, facts: List[str], utterance: str
    ) -> List[Tuple[str, Optional[str]]]:
        """One LLM call: rewrite each fact to be self-contained (pronouns resolved
        from the utterance) and name the Wikipedia article to verify it against.
        Falls back to (raw fact, None) for any item that cannot be parsed."""
        numbered = "\n".join(f"{i + 1}. {f}" for i, f in enumerate(facts))
        prompt = (
            "You are preparing atomic facts for verification against Wikipedia.\n"
            "Below is a speaker's utterance and the atomic facts extracted from it.\n\n"
            f'Utterance:\n"""{utterance}"""\n\n'
            f"Atomic facts:\n{numbered}\n\n"
            "For each fact:\n"
            "1. Rewrite it to be fully self-contained: replace pronouns and vague "
            'references (it, this, that, he, she, they, "this approach", ...) with the '
            "specific entity they refer to, using the utterance. Do not add information "
            "that is not in the utterance and keep the meaning unchanged.\n"
            "2. Give the title of the English Wikipedia article whose page most likely "
            'contains the evidence to verify the fact (e.g. "Cognitive behavioral '
            'therapy", "Selective serotonin reuptake inhibitor").\n\n'
            "Return ONLY a JSON array with one object per fact, where i is the fact's "
            "number in the list above:\n"
            '[{"i": 1, "fact": "<self-contained fact>", "topic": "<Wikipedia article title>"}, ...]'
        )
        pairs: List[Tuple[str, Optional[str]]] = [(f, None) for f in facts]
        try:
            out = self._llm_cached(prompt, max_tokens=4096)
            items = _parse_json_array(out)
            if len(items) != len(facts):
                logger.warning(
                    f"Decontextualization returned {len(items)} items for {len(facts)} facts; "
                    "unmatched facts keep their raw form and the fallback topic"
                )
            # Align by the echoed index when present; fall back to position
            for pos, item in enumerate(items):
                if not isinstance(item, dict):
                    continue
                idx = item.get("i")
                if isinstance(idx, int) and 1 <= idx <= len(facts):
                    i = idx - 1
                elif pos < len(facts):
                    i = pos
                else:
                    continue
                fact = str(item.get("fact") or "").strip() or facts[i]
                topic = str(item.get("topic") or "").strip() or None
                pairs[i] = (fact, topic)
        except Exception as e:
            logger.warning(f"Decontextualization/topic assignment failed, using raw facts: {e}")
        return pairs

    def _title_exists(self, title: str) -> bool:
        """Check whether a title exists in the DocDB (cached; main thread only)."""
        if self._docdb is None or not title:
            return False
        if title in self._title_cache:
            return self._title_cache[title]
        try:
            cursor = self._docdb.connection.cursor()
            cursor.execute("SELECT 1 FROM documents WHERE title = ? LIMIT 1", (title,))
            found = cursor.fetchone() is not None
            cursor.close()
        except Exception as e:
            logger.debug(f"Title lookup failed for '{title}': {e}")
            return False  # transient failure: do not cache the negative
        self._title_cache[title] = found
        return found

    def _resolve_topic_title(self, candidate: Optional[str], fallback: str) -> Optional[str]:
        """Resolve an LLM-proposed article title against the DocDB (exact match, then
        first-letter capitalization). Unresolvable candidates fall back to `fallback`;
        returns None only when the fallback is not in the DB either."""
        variants: List[str] = []
        if candidate:
            cand = candidate.strip().strip('"').strip("'").replace("_", " ").strip()
            if cand:
                variants.append(cand)
                if cand[0].islower():
                    variants.append(cand[0].upper() + cand[1:])
        for v in variants:
            if self._title_exists(v):
                return v
        if candidate:
            logger.debug(f"Topic '{candidate}' not in DocDB; falling back to '{fallback}'")
        return fallback if self._title_exists(fallback) else None

    def _verify_one_fact(
        self,
        topic: str,
        atom: str,
        passages: List[Dict[str, str]],
    ) -> Optional[bool]:
        """Per-fact True/False verification; prompt and answer parsing identical to
        original factscorer.py _get_score() (which used gpt-3.5-turbo).
        Returns None (NOT_EVALUATED) when the verifier LLM call itself fails --
        an infrastructure failure is not evidence of unfactuality."""
        definition = "Answer the question about {} based on the given context.\n\n".format(topic)
        context = ""
        for psg in reversed(passages):
            context += "Title: {}\nText: {}\n\n".format(
                psg.get("title", topic),
                (psg.get("text") or "").replace("<s>", "").replace("</s>", ""),
            )
        definition += context.strip()
        if definition and definition[-1] not in string.punctuation:
            definition += "."
        prompt = "{}\n\nInput: {} True or False?\nOutput:".format(definition.strip(), atom.strip())
        try:
            out = self._llm_cached(prompt, max_tokens=50, model=self.verification_model)
            return _parse_true_false(out)
        except Exception as e:
            logger.warning(f"Verification LLM call failed for fact '{atom[:60]}...': {e}")
            return None

    def score(self, text: str, topics: List[str] = None) -> Dict[str, Any]:
        if not text or not text.strip():
            return {"score": 0.0, "issues": ["Empty text"], "num_facts": 0}
        fallback_topic = (topics[0] if topics and len(topics) > 0 else "Psychotherapy").strip()
        raw_facts = [a.strip() for a in self.decompose_to_atomic_facts(text) if a.strip()]
        if not raw_facts:
            return {
                "score": 0.5,
                "issues": ["No verifiable facts extracted"],
                "num_facts": 0,
                "supported_facts": 0,
                "details": [],
            }
        if self._docdb is None:
            # Knowledge source unavailable: score=None signals "could not evaluate" --
            # callers must not treat this as 0.0
            return {
                "score": None,
                "issues": ["Knowledge source unavailable: DocDB not loaded"],
                "num_facts": len(raw_facts),
                "supported_facts": None,
                "details": [
                    {"fact": f, "topic": None, "supported": None, "verdict": "NOT_EVALUATED"}
                    for f in raw_facts
                ],
            }

        # Per-fact dynamic topics: decontextualize + assign Wikipedia titles (one LLM
        # call), then resolve each title against the DocDB (fallback_topic if unresolved)
        pairs = self._decontextualize_and_assign_topics(raw_facts, text)
        resolved: List[Tuple[str, Optional[str]]] = [
            (fact, self._resolve_topic_title(candidate, fallback_topic))
            for fact, candidate in pairs
        ]

        # Prefetch passages and BM25 indexes per topic in the main thread
        # (the sqlite connection must not be shared with worker threads)
        for t in {t for _, t in resolved if t}:
            self._bm25_for_topic(self._get_passages_for_topic(t))

        def _retrieve_and_verify(atom: str, topic: Optional[str]) -> Optional[bool]:
            if not topic:
                return None
            passages = self._wiki_passages.get(topic) or []
            if not passages:
                return None
            retr = self._retrieve(topic, atom, passages, k=RETRIEVAL_K)
            return self._verify_one_fact(topic, atom, retr) if retr else False

        results: List[Optional[bool]] = []
        if len(resolved) <= 1:
            results = [_retrieve_and_verify(f, t) for f, t in resolved]
        else:
            with concurrent.futures.ThreadPoolExecutor(max_workers=MAX_CONCURRENT_LLM) as pool:
                futures = [pool.submit(_retrieve_and_verify, f, t) for f, t in resolved]
                results = [fu.result() for fu in futures]

        details = []
        supported = 0
        evaluated = 0
        for (fact, topic), is_sup in zip(resolved, results):
            if is_sup is None:
                verdict = "NOT_EVALUATED"
            elif is_sup:
                verdict = "SUPPORTED"
                supported += 1
                evaluated += 1
            else:
                verdict = "NOT_SUPPORTED"
                evaluated += 1
            details.append({"fact": fact, "topic": topic, "supported": is_sup, "verdict": verdict})

        if evaluated == 0:
            return {
                "score": None,
                "issues": [
                    "No facts could be evaluated (knowledge source or verifier "
                    f"unavailable; fallback topic '{fallback_topic}')"
                ],
                "num_facts": len(details),
                "supported_facts": None,
                "details": details,
            }

        raw_score = supported / evaluated
        # Length penalty (gamma=10) over evaluated facts
        n_facts = len(details)
        if evaluated < GAMMA_LENGTH_PENALTY:
            penalty = math.exp(1 - GAMMA_LENGTH_PENALTY / evaluated)
        else:
            penalty = 1.0
        final_score = max(0.0, min(1.0, penalty * raw_score))
        issues = [f"Unsupported: {d['fact'][:80]}..." for d in details if d["verdict"] == "NOT_SUPPORTED"]
        return {
            "score": final_score,
            "issues": issues[:5],
            "num_facts": n_facts,
            "supported_facts": supported,
            "details": details,
        }


# -----------------------------------------------------------------------------
# Main FactScorer
# -----------------------------------------------------------------------------
class FactScorer:
    """FActScore-aligned scorer with per-fact dynamic Wikipedia topics."""

    def __init__(self, provider, model: str, db_path: Optional[str] = None, **kwargs):
        self.provider = provider
        self.model = model
        self._scorer = AtomicFactScorer(provider, model, db_path=db_path, **kwargs)
        db_status = "DocDB" if self._scorer._docdb else "none (DocDB required)"
        logger.info(
            f"FactScorer initialized with FActScore-aligned pipeline "
            f"(knowledge source: {db_status}, per-fact dynamic topics, BM25 retrieval, "
            f"per-fact True/False verification, decompose={model}, "
            f"verify={self._scorer.verification_model}, parallel={MAX_CONCURRENT_LLM})"
        )
    def score(self, text: str, topics: List[str] = None) -> Dict[str, Any]:
        return self._scorer.score(text, topics)
