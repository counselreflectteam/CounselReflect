# CounselReflect

**CounselReflect** is a comprehensive toolset designed for analyzing and evaluating therapeutic conversations with AI models. It provides meaningful metrics and feedback on mental health interactions, helping to assess the quality and safety of LLM-based responses.

The project is composed of four main modules:

- **Frontend**: A web dashboard for deeper analysis and visualization, available at [www.counselreflect.com](https://www.counselreflect.com/).
- **Extension**: A Chrome extension that overlays analytics on popular LLM platforms (Gemini, ChatGPT, Claude).
- **API**: A FastAPI backend service for processing and analyzing conversation data.
- **CLI**: A command-line interface for batch processing and testing.

## 🚀 Features

- **Real-time Analysis**: Analyze conversations directly within your browser on supported LLM platforms.
- **Comprehensive Mental Health Metrics**: Specialized scoring for empathy, safety, and therapeutic alignment.
- **AI-Assisted Custom Pipelines**: Define, refine, and lock custom evaluation metrics using natural language.
- **Research-Backed Literature Evaluation**: Analyze conversations against extensive rubrics based on mental health communication research.
- **Multi-Platform Support**: Works interactively with Gemini, ChatGPT, and Claude.
- **Broad LLM Provider Integration**: Evaluators support OpenAI, Google Gemini, Anthropic Claude, and local Ollama models. [It is easy to integrate your own LLM providers](api/providers/README.md#adding-a-new-provider).
- **Extensible Architecture**: [Easily add your own custom evaluators](api/evaluators/README.md#creating-a-new-evaluator) to expand the tool's capabilities.
- **Modular Architecture**: Separate components for flexible usage, batch processing, and continuous development.

## 📋 Prerequisites

Before setting up the project, ensure you have the following installed:

- **Python**: Version 3.8 or higher
- **Node.js**: LTS version recommended (includes npm)
- **Make** (optional, for using the Makefile commands)

## 🛠️ Installation & Setup

The project includes automated scripts to set up the development environment for all modules.

### Quick Setup

In the root directory, run:

```bash
make setup
# OR if you don't have make:
./setup.sh
```

This script will:

1.  Check for required tools (Python, Node.js).
2.  Create virtual environments for Python modules (root, api, cli).
3.  Install Python dependencies.
4.  Install Node.js dependencies for the frontend and extension.

### Individual Module Installation (Manual)

If you prefer to install modules individually:

- **API**: `cd api && python -m venv .venv && source .venv/bin/activate && pip install -e ".[dev]"`
- **CLI**: `cd cli && python -m venv .venv && source .venv/bin/activate && pip install -e .`
- **Frontend**: `cd frontend && npm install`
- **Extension**: `cd extension && npm install`

## 💻 Usage

You can use `make` commands to run different parts of the application.

### Backend API

Starts the FastAPI server (default: http://localhost:8000).

```bash
make run-api
```

### Web Frontend

Starts the development server for the web dashboard.

```bash
make run-frontend
```

### CLI Tool

Runs the command-line interface.

```bash
make run-cli
```

### Chrome Extension

To use the **CounselReflect** extension:

1.  **Build the extension**:

    ```bash
    make build-extension
    ```

    (Or `cd extension && npm run build`)

2.  **Load in Chrome**:

    - Open Chrome and navigate to `chrome://extensions/`.
    - Enable **Developer mode** (top right toggle).
    - Click **Load unpacked**.
    - Select the `extension/dist` directory.

3.  **Navigate to an LLM**: Go to [Gemini](https://gemini.google.com), [ChatGPT](https://chatgpt.com), or [Claude](https://claude.ai) to see the sidebar in action.

## 📂 Project Structure

```
├── api/            # Python FastAPI backend
├── cli/            # Python Command Line Interface
├── extension/      # Chrome Extension (React/TypeScript)
├── frontend/       # Web Dashboard (React/TypeScript)
├── models/         # Data models and shared logic
├── setup.sh        # Main setup script
├── Makefile        # Command shortcuts
└── README.md       # Project documentation
```
