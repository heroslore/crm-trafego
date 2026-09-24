#!/bin/sh
# Testes que precisam de navegador (Playwright) e dos servidores locais.
# Sobe o site e o Graph API simulado, roda e derruba tudo.
set -e
cd "$(dirname "$0")/.."
python3 -m http.server 8777 >/dev/null 2>&1 &
SITE=$!
python3 testes/mock-meta.py 8899 >/dev/null 2>&1 &
MOCK=$!
sleep 2
trap 'kill $SITE $MOCK 2>/dev/null || true' EXIT
NODE_PATH="$(npm root -g)" node testes/navegador-meta.mjs
NODE_PATH="$(npm root -g)" node testes/sync-remapeia.mjs
