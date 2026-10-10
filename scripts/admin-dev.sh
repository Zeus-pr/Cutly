#!/bin/zsh
# Prod-like local admin: ensure API is up + watched, then Vite on :5174.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API="$ROOT/scripts/cutly-api.sh"
VITE="$ROOT/admin/node_modules/.bin/vite"
RUN="$ROOT/.run"
mkdir -p "$RUN"

chmod +x "$API" 2>/dev/null || true

# LaunchAgent (com.prajesh.cutly-api) keeps API alive — just ensure once here.
"$API" ensure

if [[ ! -x "$VITE" ]]; then
  echo "Installing admin deps…"
  npm --prefix "$ROOT/admin" install --silent
fi

echo "Admin → http://127.0.0.1:5174/  (API: LaunchAgent + $API)"
cd "$ROOT/admin"
export PATH="/opt/homebrew/bin:/usr/local/bin:${PATH:-}"
NODE="$(command -v node)"
# Avoid shebang `/usr/bin/env node` failures
exec "$NODE" "$ROOT/admin/node_modules/vite/bin/vite.js" --host 127.0.0.1 --port 5174
