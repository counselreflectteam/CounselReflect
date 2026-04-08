# CLI Tool

Command-line interface for batch evaluation of therapeutic conversations.

Supports multiple LLM providers: OpenAI, Gemini, Claude, and Ollama.

## Installation

```bash
cd cli
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

## Usage

### Interactive Mode (Recommended)

```bash
python cli_tool.py
```

The CLI will guide you through:

1. Selecting an LLM provider and model (OpenAI, Gemini, Claude, Ollama)
2. Configuring API keys (with .env detection and validation)
3. Selecting the input directory
4. Selecting evaluator and literature metrics to evaluate
5. Viewing progress and generating reports

### Command-Line Mode

```bash
# Basic usage
python cli_tool.py --input ./test_conversations

# With custom backend
python cli_tool.py --input ./conversations --backend http://localhost:8000

# With specific provider and API keys
python cli_tool.py --input ./conversations --provider openai --model gpt-4o --api-key sk-... --hf-key hf_...

# Skip literature evaluation
python cli_tool.py --input ./conversations --skip-literature

# Verbose logging
python cli_tool.py --input ./conversations --verbose
```

## Configuration

### API Keys from .env

The CLI automatically detects API keys from `.env` files:

- Checks `api/.env` first
- Falls back to `cli/.env`

**Setup:**

```bash
# Copy the example file
cp .env.example .env

# Edit .env and add your actual API keys
nano .env  # or use your preferred editor
```

When a key is found, it will be automatically validated:

```
Found API key in .env (***abc)
Validating API key...
✓ API key is valid
```

If a key is not found or is invalid, you will be prompted to enter one manually.

### Supported .env Variables

```bash
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GEMINI_API_KEY=AIza...
HUGGINGFACE_API_KEY=hf_...
HF_API_KEY=hf_...  # Alternative name
BACKEND_URL=http://localhost:8000
```

Provider API keys are required depending on which provider you select (Ollama runs locally and does not require a key). The HuggingFace API key is required for some pre-trained evaluators.

## Input Format

Conversation files should be JSON in one of these formats:

**Format 1: Object with conversation array**

```json
{
  "conversation": [
    { "speaker": "Therapist", "text": "..." },
    { "speaker": "Patient", "text": "..." }
  ]
}
```

**Format 2: Direct array**

```json
[
  { "speaker": "Therapist", "text": "..." },
  { "speaker": "Patient", "text": "..." }
]
```

## Output

Results are saved in a `results/` subdirectory within the input directory (configurable with `--output`):

```
input_dir/
├── conversation1.json
├── conversation2.json
└── results/
    ├── conversation1_results.json
    ├── conversation1_results.xlsx  ← Excel report
    ├── conversation2_results.json
    └── conversation2_results.xlsx  ← Excel report
```

### Excel Reports

Each `.xlsx` file contains three sheets:

1. **Summary** - Overview with metrics count and status
2. **Turn-by-Turn Analysis** - Detailed table with:
   - Turn number
   - Speaker (Therapist/Patient)
   - Utterance text
   - All metric scores (color-coded)
3. **Raw Data** - Complete JSON for reference

Open in Excel, Google Sheets, or any spreadsheet application for easy analysis!

### JSON Files

Each result file contains:

```json
{
  "file": "path/to/input.json",
  "timestamp": "2024-...",
  "provider": "openai",
  "model": "gpt-4o",
  "evaluator_results": {...},
  "literature_results": {...},
  "errors": []
}
```

## Backend Server

To see how to setup the backend, read [backend README](../api/README.md).

Make sure the backend API is running:

```bash
cd api
source .venv/bin/activate
python main.py
```

Default: `http://localhost:8000`

