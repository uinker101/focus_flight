#!/bin/bash
# 双击启动 Focus Flight（本地运行，不需要联网）
cd "$(dirname "$0")"
if lsof -nP -iTCP:8742 -sTCP:LISTEN >/dev/null 2>&1; then
  open "http://localhost:8742/"
  exit 0
fi
exec /usr/bin/env python3 server.py
