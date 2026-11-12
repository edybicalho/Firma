-- Confere o banco antigo (Bolt) depois das migrações: nada se perdeu e as regras abertas sumiram.
\set ON_ERROR_STOP 1
set client_min_messages = warning;
do $$
begin
  assert (select count(*) from public.movements) = 1501, 'FALHOU: lançamentos antigos preservados';
  assert (select count(*) from public.operations) = 2, 'FALHOU: operações antigas preservadas';
  assert (select name from public.projects) = 'Projeto antigo', 'FALHOU: projeto antigo preservado';
  assert (select status from public.projects) = 'Em andamento', 'FALHOU: status antigo preservado';
  assert not exists (select 1 from pg_policies where policyname = 'Allow all'), 'FALHOU: regras abertas do Bolt removidas';
  assert not exists (select 1 from pg_indexes where indexname = 'operations_project_number_key'), 'FALHOU: regra de número único só entra sem repetições';
  assert (select not convalidated from pg_constraint where conname = 'movements_values_valid'), 'FALHOU: valor negativo antigo mantido';
  assert (select convalidated from pg_constraint where conname = 'projects_name_valid'), 'FALHOU: regra validada quando os dados antigos estão certos';
  assert not has_table_privilege('anon', 'public.movements', 'select'), 'FALHOU: visitante sem acesso';
end $$;
select 'BANCO ANTIGO: MIGRAÇÕES OK, NENHUM DADO PERDIDO' as resultado;
