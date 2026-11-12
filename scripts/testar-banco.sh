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
echo "   Conferência de segurança (supabase/conferencia_seguranca.sql):"
conferencia=$("${PSQL[@]}" -d teste_novo -At -F ' | ' -f supabase/conferencia_seguranca.sql)
echo "$conferencia" | sed 's/^/   /'
if echo "$conferencia" | grep -q '❌'; then echo "FALHOU: a conferência de segurança encontrou problemas"; exit 1; fi

echo "2) Supabase novo com \"Automatically expose new tables\" desligado"
novo_banco teste_sem_exposicao
"${PSQL[@]}" -d teste_sem_exposicao -f supabase/tests/02_sem_exposicao_automatica.sql >/dev/null
rodar_migracoes teste_sem_exposicao
"${PSQL[@]}" -d teste_sem_exposicao -At -f supabase/tests/10_regras_de_acesso.sql
if "${PSQL[@]}" -d teste_sem_exposicao -At -F ' | ' -f supabase/conferencia_seguranca.sql | grep -q '❌'; then echo "FALHOU: conferência de segurança"; exit 1; fi
echo "   Conferência de segurança: tudo ✅"

echo "   Limpeza dos dados de treino:"
antes=$("${PSQL[@]}" -d teste_novo -At -c "select count(*) from public.movements")
if "${PSQL[@]}" -d teste_novo -f supabase/limpeza_dados_de_treino.sql >/dev/null 2>&1; then echo "FALHOU: a limpeza rodou sem a frase de confirmação"; exit 1; fi
[ "$("${PSQL[@]}" -d teste_novo -At -c "select count(*) from public.movements")" = "$antes" ] || { echo "FALHOU: apagou algo sem confirmação"; exit 1; }
echo "   - sem a frase de confirmação: nada apagado ($antes lançamentos continuam)"
sed "s/'DIGITE AQUI'/'APAGAR DADOS DE TREINO'/" supabase/limpeza_dados_de_treino.sql | "${PSQL[@]}" -d teste_novo -At -F ' ' | sed 's/^/   - com a frase: projetos fichas lançamentos usuários registro = /'
"${PSQL[@]}" -d teste_novo -At -c "select case when (select count(*) from public.projects)=0 and (select count(*) from public.movements)=0 and (select count(*) from public.audit_log)=1 and (select count(*) from public.profiles where role='admin' and active)>=1 then 'ok' else 'FALHOU' end" | grep -q ok || { echo "FALHOU: limpeza"; exit 1; }
if "${PSQL[@]}" -d teste_novo -At -F ' | ' -f supabase/conferencia_seguranca.sql | grep -q '❌'; then echo "FALHOU: conferência depois da limpeza"; exit 1; fi
echo "   - depois da limpeza: conferência de segurança tudo ✅"
"${PSQL[@]}" -d teste_novo >/dev/null <<'SQL'
set role authenticated;
select tests.login('chefe');
insert into public.projects (name) values ('Projeto real');
insert into public.operations (project_id, operation_number, name) select id, 1, 'Ficha' from public.projects;
insert into public.movements (project_id, operation_id, entry_total, exit_total, is_base) select project_id, id, 1260000.75, 352000.5, true from public.operations;
select tests.check((select count(*) = 4 from public.audit_log), 'registro volta a anotar normalmente depois da limpeza');
SQL
echo "   - depois da limpeza: dá para criar projeto, ficha e lançar normalmente; o Registro volta a anotar"

echo "3) Supabase antigo (criado pelo Bolt), com dados"
novo_banco teste_bolt
"${PSQL[@]}" -d teste_bolt -f supabase/tests/01_banco_antigo_bolt.sql >/dev/null
rodar_migracoes teste_bolt
"${PSQL[@]}" -d teste_bolt -At -f supabase/tests/20_banco_antigo_conferencia.sql
echo "   Conferência no banco antigo (deve apontar o número repetido e a falta de administrador):"
"${PSQL[@]}" -d teste_bolt -At -F ' | ' -f supabase/conferencia_seguranca.sql | grep '❌' | sed 's/^/   /'

"${PSQL[@]}" -d postgres -c "drop database teste_novo" -c "drop database teste_sem_exposicao" -c "drop database teste_bolt" >/dev/null
echo "Tudo certo."
