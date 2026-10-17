#!/bin/bash
# deployme.sh -- publish the ResponseWatch API to Posit Connect from this machine.
# Targets Posit Connect (not Connect Cloud, which cannot host APIs).
# Needs CONNECT_SERVER and CONNECT_API_KEY, handed out at the event: put them in a
# gitignored app/.env (never commit them), or use a saved `rsconnect add` account.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

PY="python"
if [ -x "../.venv/bin/python" ]; then
  PY="../.venv/bin/python"
fi

if ! "$PY" -m rsconnect.main version >/dev/null 2>&1; then
  if command -v uv >/dev/null 2>&1; then
    uv pip install --python "$PY" rsconnect-python
  else
    "$PY" -m pip install rsconnect-python
  fi
fi

# Optional: load CONNECT_SERVER and CONNECT_API_KEY from .env
if [ -f ".env" ]; then
  # shellcheck disable=SC1091
  source .env
fi

# Same entrypoint and excludes as manifestme.sh.
"$PY" -m rsconnect.main deploy fastapi \
  ${CONNECT_SERVER:+--server "$CONNECT_SERVER"} \
  ${CONNECT_API_KEY:+--api-key "$CONNECT_API_KEY"} \
  --entrypoint api:app \
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
  --exclude 'README.md' \
  .
