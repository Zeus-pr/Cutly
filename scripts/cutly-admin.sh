#!/bin/zsh
# Keep admin Vite (:5174) alive — same pattern as cutly-api.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RUN="$ROOT/.run"
LOG="$RUN/admin-vite.log"
PIDFILE="$RUN/admin-vite.pid"
PORT=5174
PAGE="http://127.0.0.1:${PORT}/"

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"
NODE="$(command -v node || true)"
[[ -z "${NODE}" && -x /opt/homebrew/bin/node ]] && NODE=/opt/homebrew/bin/node
VITE_JS="$ROOT/admin/node_modules/vite/bin/vite.js"

mkdir -p "$RUN"

page_ok() {
  curl -sf --max-time 2 -o /dev/null "$PAGE"
}

listener_pid() {
  lsof -nP -iTCP:"$PORT" -sTCP:LISTEN -t 2>/dev/null | head -1 || true
}

start_admin() {
  if [[ -z "${NODE:-}" || ! -x "$NODE" ]]; then
    echo "node not found" >&2
    exit 1
  fi
  if [[ ! -f "$VITE_JS" ]]; then
    npm --prefix "$ROOT/admin" install --silent
  fi
  # API must be up for useful admin work
  zsh "$ROOT/scripts/cutly-api.sh" ensure >/dev/null || zsh "$ROOT/scripts/cutly-api.sh" ensure

  if page_ok; then
    echo "Admin already up → $PAGE (pid $(listener_pid))"
    echo "$(listener_pid)" >"$PIDFILE"
    return 0
  fi

  local old
  old="$(listener_pid)"
  [[ -n "${old:-}" ]] && kill "$old" 2>/dev/null || true
  sleep 0.3

  cd "$ROOT/admin"
  nohup "$NODE" "$VITE_JS" --host 127.0.0.1 --port "$PORT" >>"$LOG" 2>&1 &
  echo $! >"$PIDFILE"
  disown 2>/dev/null || true

  local i
  for i in {1..20}; do
    sleep 0.3
    page_ok && break
  done
  if page_ok; then
    echo "Admin → $PAGE  (pid $(listener_pid))  log=$LOG"
  else
    echo "Admin failed to start — see $LOG" >&2
    tail -20 "$LOG" >&2 || true
    exit 1
  fi
}

stop_admin() {
  local p
  p="$(listener_pid)"
  [[ -n "${p:-}" ]] && kill "$p" 2>/dev/null || true
  [[ -f "$PIDFILE" ]] && kill "$(cat "$PIDFILE" 2>/dev/null)" 2>/dev/null || true
  rm -f "$PIDFILE"
  echo "Admin stopped"
}

watch_admin() {
  echo "Watching admin on :$PORT"
  while true; do
    if ! page_ok; then
      echo "$(date '+%H:%M:%S') admin down — restarting…"
      start_admin || true
    fi
    sleep 3
  done
}

case "${1:-ensure}" in
  start|ensure) start_admin ;;
  stop) stop_admin ;;
  status)
    if page_ok; then echo "up pid=$(listener_pid) $PAGE"; exit 0; fi
    echo "down"; exit 1
    ;;
  watch) watch_admin ;;
  *) echo "Usage: $0 start|stop|status|ensure|watch" >&2; exit 2 ;;
esac
