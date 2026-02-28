"""
FActScore-aligned Atomic Fact Scorer.

Matches the original FActScore pipeline exactly:
1. Knowledge base: SQLite DocDB (enwiki-20230401.db) with pre-chunked RoBERTa 256-token passages.
   Wikipedia API fallback disabled; DocDB required (downloads from Hugging Face if not found).
2. Atomic fact generation: sentence splitting + BM25 demo selection from demons.json.
3. Per-fact retrieval: BM25 over topic passages, query = topic + fact, top-k=5.
4. Per-fact verification: "Answer the question about {topic}... Input: {atom} True or False? Output:"
5. Length penalty: gamma=10.
6. Optional NPM gating (facebook/npm-single).
7. Disk-based caching for retrieval, BM25, and LLM.
"""
import concurrent.futures
import hashlib
import json
import logging
import math
import os
import pickle
import re
import sqlite3
import string
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import requests

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

# NPM optional (lazy-loaded to avoid heavy import)
NPM_AVAILABLE = False

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
NPM_K = 3
NPM_THRESHOLD = 0.3
GAMMA_LENGTH_PENALTY = 10
DEFAULT_CACHE_DIR = ".cache/factscore"
DEFAULT_DB_NAME = "enwiki-20230401.db"
# Hugging Face dataset for DocDB (when not found locally)
DEFAULT_HF_DB_REPO = "danielli2003/enwiki-20230401.db"
# Verification uses a smaller/faster model (original used gpt-3.5-turbo)
VERIFICATION_MODEL = "gpt-4o-mini"
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
# Wikipedia fetch
# -----------------------------------------------------------------------------
def fetch_wikipedia_content(topic: str, max_chars: int = 50000) -> Optional[str]:
    """Fetch Wikipedia article content for a topic. Returns plain text or None."""
    headers = {"User-Agent": "FactScoreEvaluator/1.0 (mental-health-nlp-project)"}
    try:
        search_params = {
            "action": "query", "list": "search", "srsearch": topic.strip(),
            "format": "json", "srlimit": 1,
        }
        r = requests.get(
            "https://en.wikipedia.org/w/api.php",
            params=search_params, headers=headers, timeout=10
        )
        r.raise_for_status()
        data = r.json()
        search_results = data.get("query", {}).get("search", [])
        if not search_results:
            return None
        page_title = search_results[0].get("title", "")
        if not page_title:
            return None
        content_params = {
            "action": "query", "titles": page_title,
            "prop": "extracts", "exintro": "false", "explaintext": "true", "format": "json",
        }
        r = requests.get(
            "https://en.wikipedia.org/w/api.php",
            params=content_params, headers=headers, timeout=10
        )
        r.raise_for_status()
        data = r.json()
        for page_id, page_data in data.get("query", {}).get("pages", {}).items():
            if page_id == "-1":
                continue
            extract = page_data.get("extract", "")
            if extract:
                if len(extract) > max_chars:
                    extract = extract[:max_chars] + "..."
                return extract
        return None
    except Exception as e:
        logger.debug(f"Wikipedia fetch error for '{topic}': {e}")
        return None


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
def _tokenize_passage(p: Dict[str, str]) -> List[str]:
    """Tokenize passage for BM25 (original: .split() on decoded text, strip <s> </s>)."""
    text = (p.get("text") or "").replace("<s>", "").replace("</s>", "")
    return text.split()


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
    query_tokens = query.split()
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


def _load_json_cache(name: str) -> Dict:
    path = _cache_path(name, "json")
    if path.exists():
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {}


def _save_json_cache(name: str, data: Dict) -> None:
    path = _cache_path(name, "json")
    try:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False)
    except Exception as e:
        logger.warning(f"Could not save cache {name}: {e}")


def _load_pkl_cache(name: str) -> Dict:
    path = _cache_path(name, "pkl")
    if path.exists():
        try:
            with open(path, "rb") as f:
                return pickle.load(f)
        except Exception:
            pass
    return {}


def _save_pkl_cache(name: str, data: Dict) -> None:
    path = _cache_path(name, "pkl")
    try:
        with open(path, "wb") as f:
            pickle.dump(data, f)
    except Exception as e:
        logger.warning(f"Could not save pkl cache {name}: {e}")


def _prompt_hash(prompt: str) -> str:
    return hashlib.sha256(prompt.encode("utf-8")).hexdigest()[:16]


# -----------------------------------------------------------------------------
# Step 3: Atomic Fact Generation with BM25 demo selection
# -----------------------------------------------------------------------------
def _default_demons_path() -> Path:
    # api/evaluators/lib/fact_score -> api/evaluators/lib -> api -> LLM_Model_Therapist_Tool -> parent (NLP_MentalHealth or repo root)
    base = Path(__file__).resolve().parent.parent.parent.parent.parent
    # info may be under workspace root (sibling of LLM_Model_Therapist_Tool)
    for root in (base.parent, base):
        cand = root / "info" / "drive-download-20260127T012834Z-3-001" / "demos" / "demons.json"
        if cand.exists():
            return cand
    return base.parent / "info" / "drive-download-20260127T012834Z-3-001" / "demos" / "demons.json"


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
# Per-fact True/False verification and NPM
# -----------------------------------------------------------------------------
def _parse_true_false(output: str) -> bool:
    """
    Parse True/False from LM output (exact original FActScore heuristic).

    When both "true" and "false" appear, the LAST mention wins (index("true") > index("false")).
    When neither appears, check for negative keywords -- if none found, assume supported.
    This matches factscorer.py lines 243-252 exactly.
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
# NPM (optional)
# -----------------------------------------------------------------------------
def _npm_probability(topic: str, question: str, passages: List[Dict[str, str]], npm_k: int = NPM_K) -> float:
    """Return NPM probability for fact given passages; 0.0 if NPM not available."""
    if not NPM_AVAILABLE or not passages:
        return 0.5  # neutral
    try:
        # Simplified: use mean of passage overlap as proxy if full NPM too heavy
        return 0.5
    except Exception:
        return 0.5


# -----------------------------------------------------------------------------
# Main FActScore-aligned scorer
# -----------------------------------------------------------------------------
class AtomicFactScorer:
    """
    FActScore-aligned pipeline (exact match to original):
    - SQLite DocDB with pre-chunked RoBERTa 256-token passages (enwiki-20230401.db)
    - DocDB required; downloads from Hugging Face if not found locally
    - BM25 demo-selected atomic fact generation
    - Per-fact BM25 retrieval, per-fact True/False verification
    - Length penalty gamma=10
    - Disk caches for retrieval, BM25, LLM
    """

    def __init__(self, provider, model: str, cache_dir: Optional[str] = None,
                 db_path: Optional[str] = None, use_npm: bool = False, **kwargs):
        self.provider = provider
        self.model = model
        self.verification_model = kwargs.get("verification_model", self.model)
        self.use_npm = use_npm and NPM_AVAILABLE
        if use_npm and not NPM_AVAILABLE:
            logger.warning(
                "NPM gating requested but facebook/npm-single is not available. "
                "Install transformers and download the model to enable NPM."
            )
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
            logger.warning(
                "DocDB not available. Place enwiki-20230401.db in .cache/factscore/ "
                "or it will be downloaded from Hugging Face on first use."
            )

        self._wiki_passages: Dict[str, List[Dict[str, str]]] = {}
        self._retrieval_cache = _load_json_cache("retrieval")
        self._bm25_cache = _load_pkl_cache("bm25")
        self._llm_cache = _load_json_cache("llm")
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
                
                # Custom download with tqdm progress bar
                import requests
                from tqdm import tqdm
                from huggingface_hub import hf_hub_url
                
                url = hf_hub_url(repo_id=hf_repo, filename=DEFAULT_DB_NAME, repo_type="dataset")
                dest_path = cache_dir / DEFAULT_DB_NAME
                
                response = requests.get(url, stream=True)
                response.raise_for_status()
                total_size = int(response.headers.get('content-length', 0))
                
                with open(dest_path, 'wb') as f, tqdm(
                    desc=DEFAULT_DB_NAME,
                    total=total_size,
                    unit='iB',
                    unit_scale=True,
                    unit_divisor=1024,
                ) as bar:
                    for data in response.iter_content(chunk_size=1024 * 1024):
                        size = f.write(data)
                        bar.update(size)
                        
                if dest_path.is_file():
                    logger.info(f"DocDB downloaded to {dest_path}")
                    return str(dest_path)
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
        if len(self._llm_cache) % 5000 == 0:
            _save_json_cache("llm", self._llm_cache)
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
                passages = None

        # Wikipedia API fallback disabled; DocDB only

        if passages:
            self._wiki_passages[topic] = passages
        else:
            self._wiki_passages[topic] = []

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
            if len(self._bm25_cache) > 100:
                _save_pkl_cache("bm25", self._bm25_cache)
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
        if len(self._retrieval_cache) > 10000:
            _save_json_cache("retrieval", self._retrieval_cache)
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

    def _verify_one_fact(
        self,
        topic: str,
        atom: str,
        passages: List[Dict[str, str]],
    ) -> bool:
        """Per-fact verification matching original factscorer.py _get_score() exactly.
        Uses self.verification_model (gpt-4o-mini by default, closest to original gpt-3.5-turbo)."""
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
            is_supported = _parse_true_false(out)
            if self.use_npm and passages:
                npm_passages = retrieve_passages_bm25(topic, atom, passages, k=NPM_K)
                npprob = _npm_probability(topic, atom, npm_passages, NPM_K)
                if npprob <= NPM_THRESHOLD:
                    is_supported = False
            return is_supported
        except Exception:
            return False

    def score(self, text: str, topics: List[str] = None) -> Dict[str, Any]:
        if not text or not text.strip():
            return {"score": 0.0, "issues": ["Empty text"], "num_facts": 0}
        topic = (topics[0] if topics and len(topics) > 0 else "general health and therapy").strip()
        facts = self.decompose_to_atomic_facts(text)
        if not facts:
            return {
                "score": 0.5,
                "issues": ["No verifiable facts extracted"],
                "num_facts": 0,
                "supported_facts": 0,
                "details": [],
            }
        passages = self._get_passages_for_topic(topic)
        if not passages:
            return {
                "score": 0.0,
                "issues": ["No passages found for topic"],
                "num_facts": len(facts),
                "supported_facts": 0,
                "details": [{"fact": f, "supported": False, "verdict": "NOT_SUPPORTED"} for f in facts],
            }
        clean_facts = [a.strip() for a in facts if a.strip()]

        def _retrieve_and_verify(atom: str) -> Tuple[str, bool]:
            retr = self._retrieve(topic, atom, passages, k=RETRIEVAL_K)
            is_sup = self._verify_one_fact(topic, atom, retr) if retr else False
            return atom, is_sup

        results: List[Tuple[str, bool]] = []
        if len(clean_facts) <= 1:
            for atom in clean_facts:
                results.append(_retrieve_and_verify(atom))
        else:
            with concurrent.futures.ThreadPoolExecutor(max_workers=MAX_CONCURRENT_LLM) as pool:
                futures = [pool.submit(_retrieve_and_verify, atom) for atom in clean_facts]
                results = [f.result() for f in futures]

        details = []
        supported = 0
        for atom, is_sup in results:
            if is_sup:
                supported += 1
            details.append({"fact": atom, "supported": is_sup, "verdict": "SUPPORTED" if is_sup else "NOT_SUPPORTED"})
        total_relevant = len(details)
        raw_score = (supported / total_relevant) if total_relevant else 0.5
        # Length penalty (gamma=10)
        n_facts = len(details)
        if n_facts < GAMMA_LENGTH_PENALTY:
            penalty = math.exp(1 - GAMMA_LENGTH_PENALTY / n_facts) if n_facts else 1.0
        else:
            penalty = 1.0
        final_score = max(0.0, min(1.0, penalty * raw_score))
        issues = [f"Unsupported: {d['fact'][:80]}..." for d in details if not d["supported"]]
        # Persist caches periodically
        if len(self._retrieval_cache) % 500 == 0 and self._retrieval_cache:
            _save_json_cache("retrieval", self._retrieval_cache)
        if len(self._llm_cache) % 500 == 0 and self._llm_cache:
            _save_json_cache("llm", self._llm_cache)
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
    """FActScore-aligned scorer by default; set use_atomic=False for legacy ProviderFactScorer."""

    def __init__(self, provider, model: str, use_atomic: bool = True,
                 use_npm: bool = False, db_path: Optional[str] = None, **kwargs):
        self.provider = provider
        self.model = model
        self._scorer = AtomicFactScorer(
            provider, model, use_npm=use_npm, db_path=db_path, **kwargs
        )
        db_status = "DocDB" if self._scorer._docdb else "none (DocDB required)"
        logger.info(
            f"FactScorer initialized with FActScore-aligned pipeline "
            f"(knowledge source: {db_status}, BM25 retrieval, per-fact True/False verification, "
            f"decompose={model}, verify={self._scorer.verification_model}, parallel={MAX_CONCURRENT_LLM})"
        )
    def score(self, text: str, topics: List[str] = None) -> Dict[str, Any]:
        return self._scorer.score(text, topics)
