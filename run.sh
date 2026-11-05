#!/usr/bin/env bash
set -euo pipefail

cd -- "$(dirname -- "${BASH_SOURCE[0]}")"

if ! command -v uv >/dev/null 2>&1; then
  printf 'Error: uv is required to run the FastAPI server.\n' >&2
  exit 1
fi

env_args=()
if [[ -f .env ]]; then
  env_args=(--env-file .env)
fi
exec uv run "${env_args[@]}" python server.py "$@"
