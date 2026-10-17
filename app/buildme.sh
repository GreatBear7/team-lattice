#!/bin/bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/frontend"
if [ ! -d node_modules ]; then npm ci; fi
VITE_DATA_SOURCE=api VITE_API_BASE=api npm run build
