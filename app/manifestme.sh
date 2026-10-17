#!/bin/bash
# manifestme.sh -- write manifest.json for Posit Connect (FastAPI, entrypoint api:app).
# Run on YOUR machine, never in CI, then commit manifest.json.
# Re-run after any dependency change or after building frontend/dist.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

bash "$SCRIPT_DIR/bootstrap.sh"
bash "$SCRIPT_DIR/buildme.sh"
PY="../.venv/bin/python"
"$PY" -m pip install 'rsconnect-python==1.32.0'

# FastAPI is ASGI, so the mode is `fastapi` (the `api` mode is WSGI and fails on Connect).
# .python-version sets the Python requirement; requirements.txt is used as-is.
# The bundle gets api.py, qc.py, requirements.txt, scenario_data/*.csv and
# frontend/dist (if built); everything below is kept out.
"$PY" -m rsconnect.main write-manifest fastapi . \
  --entrypoint api:app \
  --overwrite \
  --exclude 'frontend/.vite/**/*' \
  --exclude 'frontend/node_modules/**/*' \
  --exclude 'frontend/src/**/*' \
  --exclude 'frontend/public/**/*' \
  --exclude 'frontend/scripts/**/*' \
  --exclude 'requirements-dev.txt' \
  --exclude 'frontend/*' \
  --exclude 'tests/**/*' \
  --exclude '**/__pycache__' \
  --exclude '**/*.pyc' \
  --exclude '**/.env' \
  --exclude '*.sh' \
  --exclude '.gitignore' \
  --exclude 'README.md'

echo "Done. manifest.json written in: $SCRIPT_DIR"
