#!/bin/bash
# 双击启动 Focus Flight（本地运行，不需要联网；第一次运行会先下载离线地图）
cd "$(dirname "$0")"
if lsof -nP -iTCP:8742 -sTCP:LISTEN >/dev/null 2>&1; then
  open "http://localhost:8742/"
  exit 0
fi
if [ ! -f app/assets/map/base.mbtiles ] || [ ! -f app/assets/map/terrain.mbtiles ] || [ ! -f app/assets/map/lights.mbtiles ]; then
  echo "第一次运行：下载离线地图（约 900 MB，只需要一次，中断了再双击会接着下）"
  if ! /usr/bin/env python3 tools/fetch_map.py; then
    read -n 1 -s -r -p "地图没有下载完。按任意键关闭，稍后重新双击继续。"
    exit 1
  fi
fi
exec /usr/bin/env python3 server.py
