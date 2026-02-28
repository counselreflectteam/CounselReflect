#!/bin/bash

# Setup script for LLM Model Therapist Tool
# This script sets up virtual environments for each module

set -e

echo "🚀 Setting up LLM Model Therapist Tool..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper Functions
print_status() { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Cross-platform activate function
activate_venv() {
    if [ -f ".venv/Scripts/activate" ]; then
        source .venv/Scripts/activate
    else
        source .venv/bin/activate
    fi
}

# Check if Python is installed
if ! command -v python3 &> /dev/null; then
    print_error "Python 3 is not installed. Please install Python 3.8 or higher."
    exit 1
fi

# Check Python version
PYTHON_VERSION=$(python3 -c 'import sys; print(".".join(map(str, sys.version_info[:2])))')
REQUIRED_VERSION="3.8"

if [ "$(printf '%s\n' "$REQUIRED_VERSION" "$PYTHON_VERSION" | sort -V | head -n1)" != "$REQUIRED_VERSION" ]; then
    print_error "Python $REQUIRED_VERSION or higher is required. Current version: $PYTHON_VERSION"
    exit 1
fi

print_success "Python $PYTHON_VERSION detected"

# Setup root development environment
print_status "Setting up root development environment..."
if [ ! -d ".venv" ]; then
    python3 -m venv .venv
    print_success "Created root virtual environment"
else
    print_warning "Root virtual environment already exists"
fi

activate_venv  # Uses the helper function
python -m pip install --upgrade pip
pip install -e ".[dev]"
print_success "Root development environment ready"

# Setup api module
if [ -d "api" ]; then
    print_status "Setting up api module..."
    cd api

    if [ ! -d ".venv" ]; then
        python3 -m venv .venv
        print_success "Created api virtual environment"
    else
        print_warning "API virtual environment already exists"
    fi

    activate_venv # Uses the helper function
    python -m pip install --upgrade pip
    pip install -e ".[dev]"
    print_success "API module ready"
    cd ..
fi

# Setup cli module
if [ -d "cli" ]; then
    print_status "Setting up CLI module..."
    cd cli

    if [ ! -d ".venv" ]; then
        python3 -m venv .venv
        print_success "Created CLI virtual environment"
    else
        print_warning "CLI virtual environment already exists"
    fi

    activate_venv # Uses the helper function
    python -m pip install --upgrade pip
    
    # Install dependencies from requirements.txt if it exists
    if [ -f "requirements.txt" ]; then
        pip install -r requirements.txt
        print_success "CLI dependencies installed"
    fi
    
    print_success "CLI module ready"
    cd ..
fi

# Setup Node.js workspace (frontend, extension, shared)
print_status "Setting up Node.js workspace (frontend, extension, shared)..."

if ! command -v node &> /dev/null; then
    print_error "Node.js is not installed. Please install Node.js."
    print_warning "Skipping Node.js workspace setup..."
else
    NODE_VERSION=$(node -v)
    print_success "Node.js $NODE_VERSION detected"

    if ! command -v npm &> /dev/null; then
        print_error "npm is not installed. Please install npm."
        print_warning "Skipping Node.js workspace setup..."
    else
        if [ -f "package.json" ]; then
            print_status "Installing workspace dependencies..."
            npm install
            print_success "Workspace dependencies installed"
        else
            print_warning "No root package.json found"
        fi
    fi
fi

print_success "🎉 Setup complete!"
echo ""
echo "Module-specific virtual environments have been created."
echo ""
echo "To activate environments:"
if [ -d ".venv/Scripts" ]; then
    # Windows Instructions
    echo "  API: cd api && source .venv/Scripts/activate"
    echo "  CLI: cd cli && source .venv/Scripts/activate"
else
    # macOS/Linux Instructions
    echo "  API: cd api && source .venv/bin/activate"
    echo "  CLI: cd cli && source .venv/bin/activate"
fi

echo ""
echo "To run the API server:"
echo "  cd api && source .venv/bin/activate && uvicorn main:app --reload"
echo ""
echo "To run the CLI tool:"
echo "  cd cli && source .venv/bin/activate && python cli_tool.py --help"
echo ""
echo "To run the frontend & extension:"
echo "  npm run dev"
echo ""
echo "To load the Chrome extension:"
echo "  1. Open Chrome and go to chrome://extensions/"
echo "  2. Enable 'Developer mode'"
echo "  3. Click 'Load unpacked'"
echo "  4. Select the 'extension/dist' directory"