#!/usr/bin/env bash
# Testa situações do dia a dia no navegador (duas pessoas na mesma ficha, meia-noite, sem internet,
# celular com data errada, sair do app no meio da digitação, login). Usa um banco simulado: não toca no Supabase.
set -euo pipefail
cd "$(dirname "$0")/.."
out=$(mktemp -d)
VITE_SUPABASE_URL=https://teste.supabase.co VITE_SUPABASE_ANON_KEY=chave-teste npx vite build --outDir "$out" >/dev/null
python3 -m http.server 4173 --bind 127.0.0.1 --directory "$out" >/dev/null 2>&1 &
server=$!
trap 'kill $server 2>/dev/null; rm -rf "$out"' EXIT
sleep 1
node e2e/cenarios.cjs
