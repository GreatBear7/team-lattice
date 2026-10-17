#!/bin/bash
# testme.sh -- run the ResponseWatch API locally. One command, no arguments.
# Then open http://127.0.0.1:8000/docs

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

PY="python"
if [ -x "../.venv/bin/python" ]; then
  PY="../.venv/bin/python"
fi

exec "$PY" -m uvicorn api:app --host 127.0.0.1 --port 8000
