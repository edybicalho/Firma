#!/usr/bin/env bash
# Testa as migrações do banco num PostgreSQL local (não usa o Supabase de verdade).
# Uso: PGHOST=... PGPORT=... PGUSER=postgres scripts/testar-banco.sh
set -euo pipefail
cd "$(dirname "$0")/.."
export PGOPTIONS="-c client_min_messages=warning"
PSQL=(psql -X -q -v ON_ERROR_STOP=1)
migrations=(supabase/migrations/*.sql)

rodar_migracoes() {
  for f in "${migrations[@]}"; do "${PSQL[@]}" -d "$1" -f "$f" >/dev/null; done
}

novo_banco() {
  "${PSQL[@]}" -d postgres -c "drop database if exists $1" -c "create database $1" >/dev/null
  "${PSQL[@]}" -d "$1" -f supabase/tests/00_supabase_stub.sql >/dev/null
}

echo "1) Supabase novo: migrações duas vezes seguidas e testes de acesso"
novo_banco teste_novo
rodar_migracoes teste_novo
rodar_migracoes teste_novo
"${PSQL[@]}" -d teste_novo -At -f supabase/tests/10_regras_de_acesso.sql

echo "2) Supabase antigo (criado pelo Bolt), com dados"
novo_banco teste_bolt
"${PSQL[@]}" -d teste_bolt -f supabase/tests/01_banco_antigo_bolt.sql >/dev/null
rodar_migracoes teste_bolt
"${PSQL[@]}" -d teste_bolt -At -f supabase/tests/20_banco_antigo_conferencia.sql

"${PSQL[@]}" -d postgres -c "drop database teste_novo" -c "drop database teste_bolt" >/dev/null
echo "Tudo certo."
