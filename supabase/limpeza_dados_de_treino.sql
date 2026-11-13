-- LIMPEZA DOS DADOS DE TREINO — rodar UMA vez, antes de começar o uso real.
--
-- APAGA: todos os projetos, fichas, lançamentos e o histórico da aba Registro.
-- MANTÉM: todos os usuários e senhas, a estrutura e a segurança do banco.
-- Não dá para desfazer (no plano Pro, só pelo backup do Supabase).
--
-- Para confirmar, troque  DIGITE AQUI  na linha abaixo por:  APAGAR DADOS DE TREINO
-- Sem isso, o arquivo para e não apaga nada.

begin;
set local acumula.confirmar = 'DIGITE AQUI';

do $$
begin
  if current_setting('acumula.confirmar', true) is distinct from 'APAGAR DADOS DE TREINO' then
    raise exception 'Nada foi apagado. Para confirmar, troque DIGITE AQUI por APAGAR DADOS DE TREINO e rode de novo.';
  end if;
end;
$$;

-- Projetos (as fichas e os lançamentos vão junto)
delete from public.movements;
delete from public.operations;
delete from public.projects;

-- Histórico do Registro: a proteção contra apagar é desligada só durante a limpeza
alter table public.audit_log disable trigger audit_log_no_truncate;
truncate public.audit_log restart identity;
alter table public.audit_log enable trigger audit_log_no_truncate;

-- Deixa anotado no Registro quando os dados de treino foram apagados
insert into public.audit_log (table_name, action, username)
values ('sistema', 'LIMPEZA', 'administrador (SQL Editor)');

commit;

-- Conferência: tem que mostrar 0 projetos, 0 fichas, 0 lançamentos e 1 linha no registro
select (select count(*) from public.projects) as projetos,
       (select count(*) from public.operations) as fichas,
       (select count(*) from public.movements) as lancamentos,
       (select count(*) from public.profiles) as usuarios_mantidos,
       (select count(*) from public.audit_log) as linhas_no_registro;
