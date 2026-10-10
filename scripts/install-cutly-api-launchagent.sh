#!/bin/zsh
# Install macOS LaunchAgent so CUTLY API stays up like cutly-ops (survives reboot / Cursor exit).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LABEL="com.prajesh.cutly-api"
PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"
API="$ROOT/scripts/cutly-api.sh"
RUN="$ROOT/.run"
LOG="$RUN/cutly-api-launchd.log"

mkdir -p "$HOME/Library/LaunchAgents" "$RUN"
chmod +x "$API"

cat >"$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string>
    <string>${API}</string>
    <string>watch</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${ROOT}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>5</integer>
  <key>StandardOutPath</key>
  <string>${LOG}</string>
  <key>StandardErrorPath</key>
  <string>${LOG}</string>
</dict>
</plist>
EOF

launchctl bootout "gui/$(id -u)/${LABEL}" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
launchctl enable "gui/$(id -u)/${LABEL}" 2>/dev/null || true
launchctl kickstart -k "gui/$(id -u)/${LABEL}" 2>/dev/null || launchctl start "$LABEL" || true

sleep 1
"$API" status || true
echo "Installed LaunchAgent ${LABEL}"
echo "  plist: $PLIST"
echo "  stop:  launchctl bootout gui/\$(id -u)/${LABEL}"
echo "  start: launchctl bootstrap gui/\$(id -u) $PLIST"
