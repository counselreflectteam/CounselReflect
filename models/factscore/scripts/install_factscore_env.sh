#!/bin/bash
# Install dependencies for the Atomic Fact Scorer pipeline
# This creates a virtual environment with the OpenAI client and evaluation dependencies

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FACTSCORE_DIR="$(dirname "$SCRIPT_DIR")"
VENV_DIR="$FACTSCORE_DIR/.venv_factscore"

echo "=== Atomic Fact Scorer Environment Setup ==="
echo "Installing in: $VENV_DIR"
echo ""

# Create or recreate virtualenv
if [ -d "$VENV_DIR" ]; then
    if [ ! -f "$VENV_DIR/bin/activate" ]; then
        echo "Existing venv is broken, recreating..."
        rm -rf "$VENV_DIR"
    fi
fi

if [ ! -d "$VENV_DIR" ]; then
    echo "Creating virtual environment..."
    python3 -m venv "$VENV_DIR"
fi

# Activate
source "$VENV_DIR/bin/activate"
echo "Activated: $(which python)"

# Upgrade pip
pip install --upgrade pip

# Install dependencies
echo ""
echo "Installing OpenAI client and evaluation dependencies..."
pip install "openai>=1.0.0" "numpy>=1.21.0" "scipy>=1.7.0" "python-dotenv>=1.0.0"

echo ""
echo "=== Installation Complete ==="
echo ""
echo "To use the environment:"
echo "  source $VENV_DIR/bin/activate"
echo ""
echo "To run the atomic fact scorer:"
echo "  export OPENAI_API_KEY='your-key'"
echo "  cd $FACTSCORE_DIR/evaluation"
echo "  python evaluate_factscore_pipeline.py --limit 10 --verbose"
echo ""
echo "To deactivate: deactivate"
