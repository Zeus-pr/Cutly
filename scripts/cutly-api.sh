#!/bin/zsh
# Keep CUTLY API alive outside Cursor (ops-style). Safe to re-run.
# Usage: scripts/cutly-api.sh start|stop|status|ensure|watch
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RUN="$ROOT/.run"
LOG="$RUN/cutly-api.log"
PIDFILE="$RUN/cutly-api.pid"
PORT=4000
# T2: admin routes live on a separate loopback-only listener.
ADMIN_PORT=4001
ADMIN_HEALTH="http://127.0.0.1:${ADMIN_PORT}/api/admin/ping"
HEALTH="http://127.0.0.1:${PORT}/health"
SERVER="$ROOT/backend/src/main.ts"

# launchd PATH is tiny — Homebrew node must be explicit.
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"
NODE="$(command -v node || true)"
if [[ -z "${NODE}" && -x /opt/homebrew/bin/node ]]; then NODE=/opt/homebrew/bin/node; fi
if [[ -z "${NODE}" && -x /usr/local/bin/node ]]; then NODE=/usr/local/bin/node; fi
# Prefer node + tsx entry (tsx shebang uses /usr/bin/env node — fails under launchd).
TSX_CLI="$ROOT/node_modules/tsx/dist/cli.mjs"
TSX_BIN="$ROOT/node_modules/.bin/tsx"

mkdir -p "$RUN"

health_ok() {
  curl -sf --max-time 2 "$HEALTH" >/dev/null 2>&1 || return 1
  # Admin listener answers 401/503 without the secret — any HTTP reply means it is up.
  local code
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 2 "$ADMIN_HEALTH" 2>/dev/null || true)"
  [[ -n "$code" && "$code" != "000" ]]
}

admin_listener_pid() {
  lsof -nP -iTCP:"$ADMIN_PORT" -sTCP:LISTEN -t 2>/dev/null | head -1 || true
}

listener_pid() {
  lsof -nP -iTCP:"$PORT" -sTCP:LISTEN -t 2>/dev/null | head -1 || true
}

start_api() {
  if [[ -z "${NODE:-}" || ! -x "$NODE" ]]; then
    echo "node not found (need Homebrew node on PATH)" >&2
    exit 1
  fi
  if [[ ! -f "$TSX_CLI" && ! -x "$TSX_BIN" ]]; then
    echo "Missing tsx — run npm install in $ROOT" >&2
    exit 1
  fi
  # SEC-01: never write the weak documented default. Generate a strong secret if missing.
  if ! grep -q '^ADMIN_SECRET=' "$ROOT/.env" 2>/dev/null; then
    local gen
    gen="$(openssl rand -hex 32 2>/dev/null || "$NODE" -e 'console.log(require("crypto").randomBytes(32).toString("hex"))')"
    printf 'ADMIN_SECRET=%s\n' "$gen" >>"$ROOT/.env"
    echo "Appended a new random ADMIN_SECRET to .env (copy into Admin portal unlock)."
  fi

  if health_ok; then
    echo "API already healthy → $HEALTH (pid $(listener_pid))"
    echo "$(listener_pid)" >"$PIDFILE"
    return 0
  fi

  # Clear stale / dead listeners on :4000 and :4001
  local old
  for old in "$(listener_pid)" "$(admin_listener_pid)"; do
    if [[ -n "${old:-}" ]]; then
      kill "$old" 2>/dev/null || true
      sleep 0.4
    fi
  done

  cd "$ROOT"
  # Detach fully so Cursor/agent shell exit cannot kill the API
  if [[ -f "$TSX_CLI" ]]; then
    nohup "$NODE" "$TSX_CLI" "$SERVER" >>"$LOG" 2>&1 &
  else
    nohup "$NODE" "$TSX_BIN" "$SERVER" >>"$LOG" 2>&1 &
  fi
  local pid=$!
  echo "$pid" >"$PIDFILE"
  disown "$pid" 2>/dev/null || true

  local i ok=0
  for i in {1..20}; do
    sleep 0.35
    if health_ok; then
      ok=1
      break
    fi
  done
  if [[ "$ok" -eq 1 ]]; then
    echo "CUTLY API → $HEALTH  (pid $(listener_pid || echo $pid))  log=$LOG"
  else
    echo "API failed to become healthy — see $LOG" >&2
    tail -20 "$LOG" >&2 || true
    exit 1
  fi
}

stop_api() {
  local p
  p="$(listener_pid)"
  if [[ -n "${p:-}" ]]; then
    kill "$p" 2>/dev/null || true
    sleep 0.3
  fi
  if [[ -f "$PIDFILE" ]]; then
    local saved
    saved="$(cat "$PIDFILE" 2>/dev/null || true)"
    [[ -n "${saved:-}" ]] && kill "$saved" 2>/dev/null || true
    rm -f "$PIDFILE"
  fi
  p="$(admin_listener_pid)"
  [[ -n "${p:-}" ]] && kill "$p" 2>/dev/null || true
  echo "API stopped (ports $PORT, $ADMIN_PORT)"
}

status_api() {
  if health_ok; then
    echo "up pid=$(listener_pid) $HEALTH"
    exit 0
  fi
  echo "down"
  exit 1
}

ensure_api() {
  if health_ok; then
    echo "API ok (pid $(listener_pid))"
    return 0
  fi
  start_api
}

# Restart forever if the process dies (used while admin:dev runs).
watch_api() {
  echo "Watching API on :$PORT (Ctrl+C to stop watch only — API stays up)"
  while true; do
    if ! health_ok; then
      echo "$(date '+%H:%M:%S') API down — restarting…"
      start_api || true
    fi
    sleep 2
  done
}

cmd="${1:-ensure}"
case "$cmd" in
  start) start_api ;;
  stop) stop_api ;;
  status) status_api ;;
  ensure) ensure_api ;;
  watch) watch_api ;;
  *)
    echo "Usage: $0 start|stop|status|ensure|watch" >&2
    exit 2
    ;;
esac
