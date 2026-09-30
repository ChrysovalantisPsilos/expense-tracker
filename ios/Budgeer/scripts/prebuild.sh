#!/bin/bash
# Before the app builds: the JavaScript core (core.js, the BudgeerCore
# package's resource) and the strings (Resources/Generated) must be the
# current ones, built from the web's source. The scheme's pre-action runs
# this without an argument; the target's first build phase runs it with
# `check`, which only verifies the files exist (a build started outside the
# scheme, or a machine without Node, fails here with a clear message).
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
CORE="$ROOT/ios/BudgeerCore/Sources/BudgeerCore/Resources/core.js"
STRINGS="$ROOT/ios/Budgeer/Budgeer/Resources/Generated/en.lproj/Localizable.strings"

if [ "${1:-}" = "check" ]; then
  for f in "$CORE" "$STRINGS"; do
    if [ ! -s "$f" ]; then
      echo "error: $f is missing. Run: npm run ios:prepare (or npm run core:build && npm run ios:strings)" >&2
      exit 1
    fi
  done
  exit 0
fi

# Xcode's scripts get a minimal PATH; find Node where Homebrew, nvm, fnm or
# Volta put it.
export PATH="$PATH:/opt/homebrew/bin:/usr/local/bin:$HOME/.volta/bin:$HOME/.fnm/aliases/default/bin"
if ! command -v node >/dev/null 2>&1 && [ -s "$HOME/.nvm/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "$HOME/.nvm/nvm.sh"
fi
if ! command -v npm >/dev/null 2>&1; then
  echo "error: npm not found; install Node 22 and run npm ci once in $ROOT" >&2
  exit 1
fi
cd "$ROOT"
[ -d node_modules ] || npm ci --no-audit --no-fund
npm run --silent core:build
npm run --silent ios:strings
