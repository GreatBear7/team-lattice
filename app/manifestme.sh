#!/bin/bash
# manifestme.sh -- write manifest.json for Posit Connect (FastAPI, entrypoint api:app).
# Run on YOUR machine, never in CI, then commit manifest.json.
# Re-run after any dependency change or after building frontend/dist.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

PY="python"
if [ -x "../.venv/bin/python" ]; then
  PY="../.venv/bin/python"
fi

if ! "$PY" -m rsconnect.main version >/dev/null 2>&1; then
  echo "Installing rsconnect-python..."
  if command -v uv >/dev/null 2>&1; then
    uv pip install --python "$PY" rsconnect-python
  else
    "$PY" -m pip install rsconnect-python
  fi
fi

# FastAPI is ASGI, so the mode is `fastapi` (the `api` mode is WSGI and fails on Connect).
# .python-version sets the Python requirement; requirements.txt is used as-is.
# The bundle gets api.py, qc.py, requirements.txt, scenario_data/*.csv and
# frontend/dist (if built); everything below is kept out.
"$PY" -m rsconnect.main write-manifest fastapi . \
  --entrypoint api:app \
  --overwrite \
  --exclude 'frontend/node_modules/**/*' \
  --exclude 'frontend/src/**/*' \
  --exclude 'frontend/public/**/*' \
  --exclude 'frontend/*' \
  --exclude 'tests/**/*' \
  --exclude '**/__pycache__' \
  --exclude '**/*.pyc' \
  --exclude '**/.env' \
  --exclude '*.sh' \
  --exclude '.gitignore' \
  --exclude 'README.md'

echo "Done. manifest.json written in: $SCRIPT_DIR"
