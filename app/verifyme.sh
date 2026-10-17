#!/bin/bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
bash "$SCRIPT_DIR/bootstrap.sh"
cd "$SCRIPT_DIR/.."
.venv/bin/python -m pip install -r app/requirements-dev.txt
bash app/buildme.sh
.venv/bin/python -m pytest tests -q
npm --prefix app/frontend test
