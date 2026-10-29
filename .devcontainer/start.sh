#!/usr/bin/env bash
set -euo pipefail
cd /workspace/real7
# Do not launch a second server if lifecycle commands run again.
if node -e 'fetch("http://127.0.0.1:3000").then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))'; then
  exit 0
fi
nohup npm run dev > /tmp/jn-preview-server.log 2>&1 < /dev/null &
