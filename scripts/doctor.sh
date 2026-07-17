#!/usr/bin/env bash
# Checks that the local toolchain matches what DevFlow development requires.
# Run this first when anything about your environment misbehaves.
set -euo pipefail

failures=0

check() {
  local label="$1" ok="$2" detail="$3"
  if [ "$ok" = "yes" ]; then
    printf '  \033[32mOK\033[0m   %s (%s)\n' "$label" "$detail"
  else
    printf '  \033[31mFAIL\033[0m %s — %s\n' "$label" "$detail"
    failures=$((failures + 1))
  fi
}

echo "DevFlow doctor"
echo

# Node >= 20.19
if command -v node >/dev/null 2>&1; then
  node_version="$(node --version | sed 's/^v//')"
  node_major="${node_version%%.*}"
  node_minor="$(echo "$node_version" | cut -d. -f2)"
  if [ "$node_major" -gt 20 ] || { [ "$node_major" -eq 20 ] && [ "$node_minor" -ge 19 ]; }; then
    check "Node.js >= 20.19" yes "v$node_version"
  else
    check "Node.js >= 20.19" no "found v$node_version — install Node 22 LTS (nvm install 22)"
  fi
else
  check "Node.js >= 20.19" no "not found — install Node 22 LTS"
fi

# pnpm (via corepack or global)
if command -v pnpm >/dev/null 2>&1; then
  check "pnpm" yes "$(pnpm --version)"
elif command -v corepack >/dev/null 2>&1; then
  check "pnpm" no "not activated — run: corepack enable"
else
  check "pnpm" no "neither pnpm nor corepack found — install Node 22, then: corepack enable"
fi

# Docker + Compose v2
if command -v docker >/dev/null 2>&1; then
  check "Docker" yes "$(docker --version | sed 's/Docker version //;s/,.*//')"
  if docker compose version >/dev/null 2>&1; then
    check "Docker Compose v2" yes "$(docker compose version --short 2>/dev/null || echo present)"
  else
    check "Docker Compose v2" no "docker is present but 'docker compose' is not — update Docker"
  fi
else
  check "Docker" no "not found — install Docker Desktop or Docker Engine"
fi

# git
if command -v git >/dev/null 2>&1; then
  check "git" yes "$(git --version | sed 's/git version //')"
else
  check "git" no "not found"
fi

echo
if [ "$failures" -gt 0 ]; then
  echo "$failures check(s) failed. Fix the items above, then re-run."
  exit 1
fi
echo "All checks passed. Next: docker compose up -d && pnpm install && pnpm verify"
