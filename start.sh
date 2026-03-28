#!/bin/bash
# Agent Dashboard v2 - Startup Script

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "========================================"
echo "  Agent Dashboard v2.0"
echo "========================================"

# Check Python
if ! command -v python3 &> /dev/null; then
    echo "❌ Python3 not found. Please install Python 3.8+"
    exit 1
fi

# Check pip
if ! command -v pip3 &> /dev/null; then
    echo "❌ pip3 not found. Please install pip"
    exit 1
fi

# Install dependencies
echo "📦 Checking dependencies..."
pip3 install -q -r requirements.txt --break-system-packages 2>/dev/null || pip3 install -q -r requirements.txt

# Create necessary directories
mkdir -p data/avatars

# Start server
echo "🚀 Starting Agent Dashboard..."
echo ""

python3 dashboard_server.py
