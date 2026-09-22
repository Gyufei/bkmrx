#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "embedded runtime contract requires macOS WKWebView" >&2
  exit 2
fi

export BKMRX_EMBEDDED_RUNTIME_CONTRACT=1
export VITE_EMBEDDED_RUNTIME_CONTRACT=1

pnpm tauri dev
