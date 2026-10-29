#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if ! command -v docker >/dev/null 2>&1; then
  echo "没有找到 Docker。请先安装 Docker Desktop，再重新运行这条命令。"
  exit 1
fi
docker compose -f searxng/docker-compose.yml up -d
echo "SearXNG 已在 http://127.0.0.1:8088 启动。第一次拉取镜像可能要等一会儿。"
