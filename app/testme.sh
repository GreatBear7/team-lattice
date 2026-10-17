#!/bin/bash
# One command: dependencies, production UI build, same-origin UI + API.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
bash "$SCRIPT_DIR/bootstrap.sh"
bash "$SCRIPT_DIR/buildme.sh"
cd "$SCRIPT_DIR"
exec ../.venv/bin/python -m uvicorn api:app --host 127.0.0.1 --port "${RESPONSEWATCH_PORT:-8000}" --workers 1
