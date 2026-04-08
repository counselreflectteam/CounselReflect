# Therapist Tool API

FastAPI backend for the Therapist Tool Chrome Extension. This API provides comprehensive endpoints for evaluating and analyzing therapist-patient conversations using pre-trained models, literature-based rubrics, and custom AI-powered metrics.

## Overview

The Therapist Tool API is a RESTful service that analyzes therapeutic conversations and provides structured evaluation results across three main modules:

1. **Evaluators**: Pre-trained ML models for specific therapeutic metrics (empathy, talk type, toxicity, etc.)
2. **Literature**: Research-backed evaluation rubrics with GPT-4 powered analysis
3. **CustomizePipeline**: OpenAI-powered custom metric creation, refinement, and profile management

## Features

### Core Features
- **Health Check Endpoint**: Monitor API status and version
- **Metrics Discovery**: List all available evaluation metrics with metadata
- **Conversation Evaluation**: Evaluate conversations using one or more pre-trained metrics
- **Flexible Input Format**: Supports multiple conversation input formats
- **CORS Support**: Configured for Chrome extension integration
- **Extensible Architecture**: Registry pattern for easy evaluator addition

### Advanced Features
- **Literature-Based Evaluation**: 50+ research-backed therapeutic metrics with GPT-4 scoring
- **Custom Metric Creation**: AI-assisted metric definition and refinement workflow
- **Example Management**: Curated dataset of therapeutic conversations across multiple sources
- **Profile System**: Lock and reuse custom evaluation profiles with canonical examples
- **Toxicity Detection**: Real-time toxic content detection using Perspective API and local models
- **Fact Checking**: Wikipedia-based fact verification for therapeutic claims

## Project Structure

```
api/
├── main.py                          # FastAPI application entry point
├── schemas.py                       # Pydantic models and type definitions
├── pyproject.toml                   # Project configuration and dependencies
├── requirements.txt                 # Python dependencies
├── evaluators/                      # Pre-trained evaluator modules
│   ├── base.py                      # Base evaluator class
│   ├── registry.py                  # Evaluator registration system
│   ├── routes.py                    # Evaluator API endpoints
│   └── impl/                        # Concrete evaluator implementations
│       ├── talk_type_evaluator.py
│       ├── empathy_er_evaluator.py
│       ├── empathy_ex_evaluator.py
│       ├── empathy_ip_evaluator.py
│       ├── emotion_evaluator.py
│       ├── toxicity_evaluator.py
│       ├── perspective_evaluator.py
│       ├── fact_evaluator.py
│       ├── pair_evaluator.py
│       └── emotional_support_strategy_evaluator.py
├── literature/                      # Literature-based evaluation
│   ├── evaluator.py                 # GPT-4 powered rubric evaluator
│   ├── routes.py                    # Literature API endpoints
│   ├── literature_rubrics.json      # 50+ research-backed metric rubrics
│   └── convert_csv_to_rubrics.py    # Utility for rubric generation
├── customizePipeline/               # Custom metric creation system
│   ├── routes.py                    # CustomizePipeline API endpoints
│   ├── metrics_service.py           # Core metric refinement logic
│   ├── llm_client.py                # OpenAI client wrapper
│   ├── prompts.py                   # LLM prompts for metric refinement
│   ├── examples.py                  # Example selection algorithms
│   ├── example_store.py             # Example dataset management
│   ├── definitions.py               # TypedDict definitions
│   └── models.py                    # Pydantic models
├── utils/                           # Utility functions
│   ├── conversation_parser.py       # Conversation parsing logic
│   └── evaluation_helpers.py        # Helper functions for creating results
└── tests/                           # Test files and scripts
```

## Installation

### Option 1: Docker Setup (Highly Recommended)

If you prefer to use Docker, you can run the API without installing Python or dependencies locally. It's the most reliable way to avoid environment issues.

1. **Build and run using Docker Compose**:
   ```bash
   # From the api directory
   docker compose up --build
   ```
   The API will be available at `http://localhost:8000`.

### Option 2: Automated Local Setup

Use the project's automated setup script from the root directory:

```bash
# From project root
./setup.sh    # macOS/Linux
# or
setup.bat     # Windows
```

This will create a virtual environment in `api/.venv` and install all dependencies.

### Option 3: Manual Local Setup

1. **Navigate to the API directory**:
   ```bash
   cd api
   ```

2. **Set up virtual environment and install dependencies**:

   **Recommended method (using `uv` for 10-100x faster installation)**:
   ```bash
   # Install uv if you haven't already: curl -LsSf https://astral.sh/uv/install.sh | sh
   
   uv sync
   ```

   **Alternative method (using standard `pip`)**:
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate  # On Windows: .venv\Scripts\activate
   pip install --upgrade pip
   pip install -e ".[dev]"
   ```

---

### Set up Environment Variables

Regardless of which setup option you choose, you need to configure your environment variables:

Create a `.env` file in the `api` directory based on `.env.example`:
   ```env
   REPLICATE_API_TOKEN=your_replicate_api_key_here
   PERSPECTIVE_API_KEY=your_perspective_api_key_here
   ```
   Or set environment variables directly:
   ```bash
   export REPLICATE_API_TOKEN=your_replicate_api_key_here
   export PERSPECTIVE_API_KEY=your_perspective_api_key_here
   ```
   
   **Note**: 
   - `REPLICATE_API_TOKEN` is used for some ML model evaluators
   - `PERSPECTIVE_API_KEY` is required for the Perspective API toxicity evaluator
   - OpenAI and HuggingFace API keys are passed per-request in the API calls

## Running the API

### Development Server

1. **Activate the virtual environment** (if using standard pip setup):
   ```bash
   cd api
   source .venv/bin/activate  # macOS/Linux
   # or
   .venv\Scripts\activate.bat  # Windows
   ```
   *(Note: If you are using `uv`, you can skip this step and prepend commands with `uv run`, e.g., `uv run python main.py`)*

2. **Run the server**:
   ```bash
   # Using uv (Recommended)
   uv run python main.py
   
   # Using activated environment
   python main.py
   ```
   
   Or using uvicorn directly:
   ```bash
   uv run uvicorn main:app --reload --host 0.0.0.0 --port 8000
   ```

3. **Using Make** (from project root):
   ```bash
   make run-api
   ```

The API will be available at `http://localhost:8000`


### API Documentation

Once the server is running, you can access:
- **Interactive API docs**: `http://localhost:8000/docs` (Swagger UI)
- **Alternative docs**: `http://localhost:8000/redoc` (ReDoc)

## API Endpoints

The API is organized into three main modules, each with its own set of endpoints:

### Base Endpoints

#### `GET /`

Health check endpoint.

**Response**:
```json
{
  "status": "healthy",
  "version": "0.1.0"
}
```

### Module 1: Evaluators (`/metrics`, `/evaluate`)

Pre-trained machine learning models for evaluating therapeutic conversations.

#### `GET /metrics`

List all available pre-trained evaluation metrics.

**Response**:
```json
{
  "metrics": [
    {
      "name": "talk_type",
      "label": "Talk Type (Change/Neutral/Sustain)",
      "description": "Classifies patient utterances into change talk, sustain talk, or neutral",
      "category": "Communication"
    },
    {
      "name": "empathy_er",
      "label": "Empathy (Emotional Reaction)",
      "description": "Evaluates emotional reaction component of empathy",
      "category": "Empathy"
    }
  ],
  "total": 11,
  "by_category": {
    "Communication": ["talk_type"],
    "Empathy": ["empathy_er", "empathy_ex", "empathy_ip"],
    "Safety": ["toxicity", "perspective"],
    "Support": ["emotional_support_strategy", "emotion"],
    "Other": ["fact", "pair", "generic"]
  }
}
```

**Available Evaluators**:
- `talk_type`: Change/Sustain/Neutral talk classification
- `empathy_er`: Empathy - Emotional Reaction
- `empathy_ex`: Empathy - Exploration
- `empathy_ip`: Empathy - Interpretation
- `emotion`: Emotion classification
- `emotional_support_strategy`: Emotional support strategy detection
- `toxicity`: Local toxicity detection (Detoxify model)
- `perspective`: Google Perspective API toxicity detection
- `fact`: Wikipedia-based fact checking
- `pair`: PAIR evaluator
- `generic`: Generic evaluator template

#### `POST /evaluate`

Evaluate a conversation using specified pre-trained metrics.

**Request Body**:
```json
{
  "conversation": [
    {"speaker": "Therapist", "text": "Hello, how are you feeling today?"},
    {"speaker": "Patient", "text": "I've been pretty anxious this week."}
  ],
  "metrics": ["talk_type", "empathy_er"],
  "OpenAI_API_KEY": "sk-...",
  "HuggingFace_API_KEY": "hf_..."
}
```

**Request Parameters**:
- `conversation` (required): List of utterances with `speaker` and `text` fields
- `metrics` (required): List of metric names to evaluate (at least one)
- `OpenAI_API_KEY` (optional): OpenAI API key for models that require it
- `HuggingFace_API_KEY` (optional): HuggingFace API key for models that require it

**Response**:
```json
{
  "results": {
    "talk_type": {
      "granularity": "utterance",
      "overall": null,
      "per_utterance": [
        {
          "index": 0,
          "metrics": {}
        },
        {
          "index": 1,
          "metrics": {
            "talk_type": {
              "type": "categorical",
              "label": "Change",
              "confidence": 0.85
            }
          }
        }
      ],
      "per_segment": null
    }
  },
  "status": "success",
  "message": null
}
```

### Module 2: Literature (`/literature/*`)

Research-backed therapeutic metrics with GPT-4 powered evaluation using detailed rubrics.

#### `GET /literature/metrics`

List all literature-based therapeutic metrics with research references and AI-generated rubrics.

**Response**:
```json
{
  "metrics": [
    {
      "metric_name": "Empathy",
      "definition": "Understands and communicates understanding of the client's emotional state.",
      "why_this_matters": "The strongest consistent predictor of therapeutic outcomes; it reduces client isolation, fosters safety, and encourages deeper self-disclosure.",
      "references": [
        "https://pmc.ncbi.nlm.nih.gov/articles/PMC10157460/",
        "..."
      ],
      "need_highlight": false,
      "category": "Core Conditions",
      "target": "therapist",
      "level_1_description": "Ignores, dismisses, or minimizes the client's emotional state; responds with coldness or judgment.",
      "level_3_description": "Acknowledges explicit emotions but misses deeper or implicit feelings; responses are somewhat generic or repetitive.",
      "level_5_description": "Accurately identifies and articulates complex emotions and underlying needs; validates the client's experience deeply and compassionately."
    }
  ],
  "total": 52
}
```

#### `POST /literature/evaluate`

Evaluate a conversation using literature-based rubrics and GPT-4.

**Request Body**:
```json
{
  "conversation": [
    {"role": "therapist", "content": "How are you feeling today?"},
    {"role": "client", "content": "I feel overwhelmed."},
    {"role": "therapist", "content": "It sounds like things are really difficult."}
  ],
  "metric_names": ["Empathy", "Therapeutic Alliance"],
  "openai_api_key": "sk-..."
}
```

**Response**:
```json
{
  "results": {
    "Empathy": {
      "granularity": "utterance",
      "overall": null,
      "per_utterance": [
        {
          "index": 0,
          "metrics": {
            "Empathy": {
              "type": "numerical",
              "value": 4,
              "max_value": 5,
              "label": "High",
              "rationale": "The therapist demonstrates understanding..."
            }
          }
        }
      ]
    }
  },
  "status": "success",
  "message": "Successfully evaluated 2 metric(s)",
  "metrics_evaluated": 2,
  "total_metrics": 2
}
```

### Module 3: CustomizePipeline (`/openai/*`)

AI-assisted custom metric creation, refinement, and profile management.

#### `POST /openai/refine_metrics`

Create or refine custom evaluation metrics from natural language descriptions.

**Request Body**:
```json
{
  "raw_notes": "I want to measure how well the therapist validates the client's emotions",
  "openai_api_key": "sk-...",
  "feedback": "Focus more on specific verbal validations",
  "current_refined_metrics": null
}
```

**Response**:
```json
{
  "version": "v1",
  "metrics": [
    {
      "name": "Emotional_Validation",
      "description": "Measures the therapist's explicit acknowledgment of client emotions",
      "scale": "1-5",
      "guidance": "Look for phrases that directly acknowledge feelings...",
      "examples": ["That must feel really difficult", "I hear that you're frustrated"]
    }
  ],
  "notes": "Refined based on user feedback",
  "raw_notes": "I want to measure how well the therapist validates..."
}
```

#### `POST /openai/score_metric`

Score a single text using a custom metric definition.

**Request Body**:
```json
{
  "text": "It sounds like you're feeling really overwhelmed right now.",
  "metric_name": "Emotional_Validation",
  "description": "Measures explicit acknowledgment of client emotions",
  "scale": "1-5",
  "guidance": "Look for direct emotion acknowledgment",
  "openai_api_key": "sk-..."
}
```

**Response**:
```json
{
  "value": 5,
  "rationale": "This response directly acknowledges the client's emotional state...",
  "label": "Excellent"
}
```

#### `GET /openai/list_sources`

List available example sources and evaluation topics.

**Response**:
```json
{
  "sources": [
    {"source": "esconv", "topic": "emotional_support"},
    {"source": "AnnoMI", "topic": "motivational_interviewing"}
  ],
  "grouped": {
    "esconv": ["emotional_support"],
    "AnnoMI": ["motivational_interviewing"]
  },
  "total_sources": 2,
  "total_topics": 2
}
```

#### `POST /openai/select_from_sources`

Select examples from specified sources and topics for training/calibration.

**Request Body**:
```json
{
  "selections": [
    {"source": "esconv", "topic": "emotional_support", "count": 5},
    {"source": "AnnoMI", "topic": "motivational_interviewing", "count": 3}
  ],
  "seed": 42
}
```

**Response**:
```json
{
  "preview": {
    "total_selected": 8,
    "by_source": {"esconv": 5, "AnnoMI": 3},
    "by_topic": {"emotional_support": 5, "motivational_interviewing": 3},
    "seed": 42
  },
  "examples": [
    {
      "conversation": [...],
      "dimensions": {"source": "esconv", "topic": "emotional_support"},
      "metrics_output": {...}
    }
  ]
}
```

#### `POST /openai/lock_profile`

Lock a finalized custom evaluation profile for reuse.

**Request Body**:
```json
{
  "rubric": {
    "version": "v3",
    "metrics": [...],
    "notes": "Finalized after 3 iterations"
  },
  "user_preferences": "Prefer specific examples over general guidance",
  "canonical_examples": [...],
  "version": "profile_v1"
}
```

#### `POST /openai/score_with_profile`

Score a new conversation using a locked profile.

**Request Body**:
```json
{
  "conversation": [...],
  "profile": {
    "version": "profile_v1",
    "rubric": {...},
    "user_preferences": "...",
    "canonical_examples": [...]
  },
  "openai_api_key": "sk-..."
}
```

**Other CustomizePipeline Endpoints**:
- `POST /openai/update_example_outputs`: Update example outputs based on feedback
- `POST /openai/update_rubric_from_examples`: Update rubric from example outputs
- `POST /openai/rescore_examples`: Rescore examples with updated rubric
- `POST /openai/list_examples`: (Legacy) List all available examples
- `POST /openai/select_examples`: (Legacy) Select examples by dimension filters

## Conversation Format

The API accepts conversations in multiple formats:

### Format 1: List of Utterances (Recommended)
```json
[
  {"speaker": "Therapist", "text": "Hello"},
  {"speaker": "Patient", "text": "Hi"}
]
```

### Format 2: Dictionary with 'conversation' Key
```json
{
  "conversation": [
    {"speaker": "Therapist", "text": "Hello"},
    {"speaker": "Patient", "text": "Hi"}
  ]
}
```

### Format 3: Dictionary Mapping Speakers to Messages
```json
{
  "Therapist": ["Hello", "How are you?"],
  "Patient": ["Hi", "I'm fine"]
}
```

## Evaluation Results

Each metric returns an `EvaluationResult` with one of three granularities:

1. **Conversation-level** (`granularity: "conversation"`): Overall scores for the entire conversation
2. **Utterance-level** (`granularity: "utterance"`): Scores for each individual utterance
3. **Segment-level** (`granularity: "segment"`): Scores for groups of utterances

Each score can be either:
- **Categorical**: `{"type": "categorical", "label": "High", "confidence": 0.9}`
- **Numerical**: `{"type": "numerical", "value": 8.5, "max_value": 10.0, "label": "High"}`

## Deployment

The API can be deployed to cloud platforms like AWS EC2. For detailed deployment instructions, see the root-level `EC2_DEPLOYMENT.md` file.

### Key Deployment Considerations:

1. **Environment Variables**: Ensure all required API keys are set in production
2. **CORS**: Restrict allowed origins in production (see CORS Configuration section)
3. **Security**: Use HTTPS and secure API key management
4. **Scaling**: Consider using Docker for consistent deployment
5. **Monitoring**: Set up health check monitoring on the `/` endpoint

### Docker Support

Check the project documentation for Docker configuration files that enable containerized deployment.

## Adding New Evaluators

To add new pre-trained evaluators to the `evaluators` module:

1. Create a new evaluator class in `evaluators/impl/` that inherits from `BaseEvaluator`
2. Implement the required `execute()` method
3. Register the evaluator in `evaluators/impl/__init__.py`
4. Add appropriate metadata (name, description, category)

For detailed instructions, see the [Evaluators README](evaluators/README.md) if available.

## Testing

Test scripts are available in the `tests/` directory:

```bash
# Navigate to api directory
cd api

# Test health endpoint
bash tests/test_health.sh

# Test evaluation endpoint (if available)
python tests/test_evaluate.py
```

For automated testing with pytest:
```bash
pytest tests/ -v
```

## Error Handling

The API returns appropriate HTTP status codes:
- `200`: Success
- `400`: Bad request (invalid conversation format, invalid metrics, etc.)
- `500`: Internal server error

Error responses include a `detail` field with a description of the issue.

## CORS Configuration

The API is configured to allow CORS from all origins (for development). In production, you should restrict this to specific origins:

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://your-extension-id.chromiumapp.org"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

## Dependencies

### Core Framework
- **FastAPI** (≥0.100.0): Modern web framework for building APIs
- **Uvicorn[standard]** (≥0.23.0): ASGI server for running FastAPI
- **Pydantic** (≥2.0.0): Data validation using Python type annotations
- **python-dotenv** (≥1.0.0): Environment variable management

### AI/ML Models & APIs
- **OpenAI** (≥1.0.0): GPT-4 for literature evaluation and custom metrics
- **Replicate** (≥0.25.0): API client for running hosted ML models
- **HuggingFace Hub** (≥0.20.0): Access to HuggingFace models
- **Torch** (≥2.0.0): PyTorch for local model inference
- **Transformers** (≥4.30.0): HuggingFace transformers library
- **Detoxify** (≥0.5.0): Local toxicity detection models
- **Groq** (≥0.4.0): Groq API client for fast inference

### Utilities
- **Requests** (≥2.31.0): HTTP library for API calls
- **Backoff** (≥2.0.0): Retry logic with exponential backoff
- **Wikipedia-API** (≥0.6.0): Wikipedia integration for fact checking
- **Rich** (≥13.0.0): Terminal formatting and progress bars

### Development
- **pytest** (≥7.0.0): Testing framework
- **pytest-cov** (≥4.0.0): Coverage reporting
- **pytest-asyncio** (≥0.21.0): Async test support
- **httpx** (≥0.24.0): Async HTTP client for testing

## Architecture Notes

### Evaluation Result Structure

All evaluators return results in a standardized format with three possible granularities:

1. **Conversation-level**: Overall score for the entire conversation
2. **Utterance-level**: Individual scores for each utterance
3. **Segment-level**: Scores for groups of utterances

Scores can be:
- **Categorical**: `{"type": "categorical", "label": "High", "confidence": 0.9}`
- **Numerical**: `{"type": "numerical", "value": 8.5, "max_value": 10.0, "label": "High"}`

### API Key Management

The API supports flexible API key provision:
- **Environment variables** (`.env` file): For keys used by all requests (Replicate, Perspective)
- **Per-request keys**: OpenAI and HuggingFace keys passed in request body
- **Profile-embedded keys**: API keys can be stored in locked profiles

## Related Documentation

- **Chrome Extension**: See `../extension/README.md` for the Chrome extension that uses this API
- **Frontend**: See `../frontend/README.md` for the web interface
- **Deployment**: See `../EC2_DEPLOYMENT.md` for AWS deployment instructions

## Support & Issues

For issues, feature requests, or questions:
1. Check the inline API documentation at `/docs` when running the server
2. Review the conversation history and related documentation
3. Consult the evaluator-specific README files in module directories

## License

MIT License (or as specified in root LICENSE file)

## Contributing

Contributions are welcome! When contributing:

1. **New Evaluators**: Follow the pattern in `evaluators/impl/` and register properly
2. **API Changes**: Update this README and the OpenAPI schema
3. **Testing**: Add appropriate tests in the `tests/` directory
4. **Documentation**: Update relevant documentation for any feature changes

