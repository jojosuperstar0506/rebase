#!/bin/bash
set -e

echo "=== Rebase Scraping Agent Setup ==="
echo ""

# Check Python 3
python3 --version || { echo "ERROR: Python 3 required. Install from https://python.org"; exit 1; }

echo "Installing Python dependencies..."
pip3 install -r requirements.txt

echo "Installing Chromium browser (for Playwright)..."
python3 -m playwright install chromium

# Create default session storage directory
mkdir -p ~/.rebase-scraper

echo ""
echo "========================================="
echo "Setup complete!"
echo "========================================="
echo ""
echo "Next steps:"
echo "  1. Set your API secret:"
echo "     export REBASE_API_SECRET=your_secret"
echo ""
echo "  2. Log into platforms (first time only):"
echo "     python3 agent.py --login"
echo ""
echo "  3. Test without pushing:"
echo "     python3 agent.py --dry-run --brand Songmont"
echo ""
echo "  4. Full run (scrape + push to ECS):"
echo "     python3 agent.py"
echo ""
echo "Browser sessions saved in: ~/.rebase-scraper/"
echo "(They persist between runs — you only need to log in once.)"
echo ""
