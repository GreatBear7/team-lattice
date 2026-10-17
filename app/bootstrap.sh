#!/bin/bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$SCRIPT_DIR")"
if [ ! -x "$ROOT/.venv/bin/python" ]; then python3 -m venv "$ROOT/.venv"; fi
PY="$ROOT/.venv/bin/python"
STAMP="$ROOT/.venv/responsewatch-requirements.txt"
if ! cmp -s "$SCRIPT_DIR/requirements.txt" "$STAMP"; then
  "$PY" -m pip install -r "$SCRIPT_DIR/requirements.txt"
  cp "$SCRIPT_DIR/requirements.txt" "$STAMP"
fi
