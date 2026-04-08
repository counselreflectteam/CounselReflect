.PHONY: help setup clean run-api run-frontend run-cli install-cli build-extension install-api install-shared install-frontend install-extension

# Default target
help:
	@echo "LLM Model Therapist Tool - Development Commands"
	@echo ""
	@echo "Setup Commands:"
	@echo "  setup          - Run automated setup script"
	@echo ""
	@echo "Application Commands:"
	@echo "  run-api        - Run the FastAPI backend"
	@echo "  run-frontend   - Run the frontend application"
	@echo "  run-cli        - Run the CLI tool"
	@echo ""
	@echo "Module-specific Commands:"
	@echo "  install-api    - Install api module dependencies"
	@echo "  install-cli    - Install CLI module dependencies"
	@echo "  install-node   - Install Node.js workspace dependencies (frontend, extension, shared)"
	@echo ""
	@echo "Extension Commands:"
	@echo "  build-extension - Build the Chrome extension"
	@echo ""
	@echo "Cleanup Commands:"
	@echo "  clean          - Remove Python cache files"

# Setup commands
setup:
	@echo "🚀 Setting up LLM Model Therapist Tool..."
	@if [ -f setup.sh ]; then chmod +x setup.sh && ./setup.sh; \
	else echo "❌ setup.sh not found"; fi


# Development commands
clean:
	@echo "🧹 Cleaning up..."
	find . -type f -name "*.pyc" -delete
	find . -type d -name "__pycache__" -delete
	find . -type d -name "*.egg-info" -exec rm -rf {} +
	find . -type d -name ".pytest_cache" -exec rm -rf {} +
	find . -type d -name ".mypy_cache" -exec rm -rf {} +
	find . -type d -name ".coverage" -exec rm -rf {} +

# Application commands
run-api:
	@echo "🌐 Starting FastAPI backend..."
	@if [ -d api ]; then \
		cd api && \
		if [ -f .venv/bin/activate ]; then \
			. .venv/bin/activate && uvicorn main:app --reload --host 0.0.0.0 --port 8000; \
		else \
			echo "❌ API virtual environment not found. Run 'make setup' first."; \
		fi; \
	else \
		echo "❌ API module not found"; \
	fi

run-cli:
	@echo "🔧 Running CLI tool..."
	@if [ -d cli ]; then \
		cd cli && \
		if [ -f .venv/bin/activate ]; then \
			. .venv/bin/activate && python cli_tool.py --help; \
		else \
			echo "❌ CLI virtual environment not found. Run 'make setup' first."; \
		fi; \
	else \
		echo "❌ CLI module not found"; \
	fi

run-frontend:
	@echo "🎨 Starting frontend and extension..."
	npm run dev

# Module-specific installation commands
install-api:
	@echo "📦 Installing api module dependencies..."
	@if [ -d api ]; then \
		cd api && \
		if [ ! -d .venv ]; then python3 -m venv .venv; fi && \
		. .venv/bin/activate && \
		pip install --upgrade pip && \
		pip install -e ".[dev]" && \
		echo "✅ API module dependencies installed"; \
	else \
		echo "❌ API module not found"; \
	fi

install-cli:
	@echo "📦 Installing CLI module dependencies..."
	@if [ -d cli ]; then \
		cd cli && \
		if [ ! -d .venv ]; then python3 -m venv .venv; fi && \
		. .venv/bin/activate && \
		pip install --upgrade pip && \
		if [ -f requirements.txt ]; then \
			pip install -r requirements.txt && \
			echo "✅ CLI dependencies installed"; \
		else \
			echo "⚠️  No requirements.txt found"; \
		fi; \
	else \
		echo "❌ CLI module not found"; \
	fi

install-node:
	@echo "📦 Installing Node.js workspace dependencies (frontend, extension, shared)..."
	@if command -v npm &> /dev/null; then \
		if [ -f package.json ]; then \
			npm install && \
			echo "✅ Workspace dependencies installed"; \
		else \
			echo "❌ Root package.json not found"; \
		fi \
	else \
		echo "⚠️  npm not found. Please install Node.js to install workspace dependencies"; \
	fi

build-extension:
	@echo "🔨 Building Chrome extension..."
	@if [ -d extension ]; then \
		cd extension && \
		npm run build && \
		echo "📦 Extension built in: $$(pwd)/dist"; \
		echo "To load: chrome://extensions/ -> Load unpacked -> Select 'dist' folder"; \
	else \
		echo "❌ Extension module not found"; \
	fi

