-- Testes da limpeza automática (lançamentos e Registro com mais de 30 dias).
\set ON_ERROR_STOP 1
set client_min_messages = warning;
reset role;
select set_config('request.jwt.claim.sub', '', false);

-- Cenário: ficha P1 com lançamentos de 40, 35, 31, 30, 29, 5 e 0 dias atrás; ficha P2 só com antigos (45 e 40 dias)
create temp table d as select (now() at time zone 'America/Sao_Paulo')::date as hoje;
insert into public.projects (name) values ('Obra Purga');
insert into public.operations (project_id, operation_number, name) select id, 1, 'P1' from public.projects where name = 'Obra Purga';
insert into public.operations (project_id, operation_number, name) select id, 2, 'P2' from public.projects where name = 'Obra Purga';
insert into public.movements (project_id, operation_id, entry_total, exit_total, recorded_at)
select o.project_id, o.id, v.e, v.s, (select hoje from d) - v.dias
from public.operations o, (values (40, 1000000, 400000), (35, 1100000, 420000), (31, 1150000, 430000), (30, 1200000, 450000), (29, 1260000.75, 452000.5), (5, 1300000, 460000), (0, 1350000, 470000)) v(dias, e, s)
where o.name = 'P1' order by v.dias desc;
insert into public.movements (project_id, operation_id, entry_total, exit_total, recorded_at)
select o.project_id, o.id, v.e, v.s, (select hoje from d) - v.dias
from public.operations o, (values (45, 500, 100), (40, 800, 150)) v(dias, e, s)
where o.name = 'P2' order by v.dias desc;
-- Registro: uma linha de 40 dias atrás e uma de 10 dias atrás
insert into public.audit_log (happened_at, table_name, action, username) values (now() - interval '40 days', 'teste', 'ANTIGA', 'x'), (now() - interval '10 days', 'teste', 'RECENTE', 'x');

select tests.fails($$select public.purge_old_data(10)$$, 'prazo menor que 30 dias', 'prazo_minimo');
create temp table antigos as select count(*) as n from public.movements where recorded_at <= (select hoje from d) - 30;
create temp table apagados as select public.purge_old_data(30) as n;
select tests.check((select n from apagados) = (select n from antigos) and (select n from apagados) >= 6, 'apaga todos os lançamentos com 30 dias ou mais (inclusive os 6 deste teste)');
select tests.check(tests.total($$select * from public.movements where recorded_at <= (now() at time zone 'America/Sao_Paulo')::date - 30$$) = 0, 'não sobra nenhum lançamento com 30 dias ou mais');
select tests.check((select array_agg((select hoje from d) - recorded_at order by recorded_at desc) from public.movements m join public.operations o on o.id = m.operation_id where o.name = 'P1') = array[0, 5, 29], 'ficam só os de menos de 30 dias (0, 5 e 29 dias)');
select tests.check((select count(*) = 0 from public.movements m join public.operations o on o.id = m.operation_id where o.name = 'P2'), 'ficha só com antigos fica sem lançamentos');
select tests.check((select entry_total = 1200000 and exit_total = 450000 and recorded_at = (select hoje from d) - 30 from public.operation_baselines b join public.operations o on o.id = b.operation_id where o.name = 'P1'), 'ponto de comparação de P1 = último apagado (30 dias)');
select tests.check((select entry_total = 800 and exit_total = 150 from public.operation_baselines b join public.operations o on o.id = b.operation_id where o.name = 'P2'), 'ponto de comparação de P2 = último apagado (40 dias)');
select tests.check(tests.total($$select * from public.audit_log where table_name = 'movements' and action = 'DELETE' and old_data ->> 'operation_id' in (select id::text from public.operations where name in ('P1', 'P2'))$$) = 0, 'a limpeza não deixa cópia dos apagados no Registro');
select tests.check(tests.total($$select * from public.audit_log where action = 'ANTIGA'$$) = 0, 'Registro com mais de 30 dias é apagado');
select tests.check(tests.total($$select * from public.audit_log where action = 'RECENTE'$$) = 1, 'Registro recente fica');
select tests.check((select (new_data ->> 'lancamentos')::int = (select n from apagados) from public.audit_log where action = 'LIMPEZA_30_DIAS'), 'Registro anota quantos lançamentos saíram');
select tests.check(public.purge_old_data(30) = 0 and tests.total($$select * from public.audit_log where action = 'LIMPEZA_30_DIAS'$$) = 1, 'rodar de novo não apaga nada e não anota de novo');
select tests.fails($$delete from public.audit_log where action = 'RECENTE'$$, 'apagar o Registro fora da limpeza continua proibido', 'registro_imutavel');

-- A regra do acumulado usa o ponto de comparação quando a ficha não tem mais lançamentos
select tests.fails($$insert into public.movements (project_id, operation_id, entry_total, exit_total) select project_id, id, 700, 150 from public.operations where name = 'P2'$$, 'P2 sem lançamentos: menor que o ponto de comparação é recusado', 'acumulado_menor');
insert into public.movements (project_id, operation_id, entry_total, exit_total) select project_id, id, 900, 160 from public.operations where name = 'P2';
select tests.check(tests.total($$select * from public.movements m join public.operations o on o.id = m.operation_id where o.name = 'P2'$$) = 1, 'P2: maior que o ponto de comparação é aceito');

-- Ninguém além do sistema dispara a limpeza
set role authenticated;
select tests.login('chefe');
select tests.fails($$select public.purge_old_data(30)$$, 'administrador pelo app não dispara a limpeza', 'permission denied');
select set_config('acumula.purging', 'on', false);
select tests.fails($$delete from public.audit_log$$, 'nem fingindo estar na limpeza dá para apagar o Registro', 'permission denied');
select tests.check(tests.total('select * from public.operation_baselines') >= 2, 'administrador lê os pontos de comparação');
select tests.fails($$update public.operation_baselines set entry_total = 0$$, 'ninguém altera o ponto de comparação pelo app', 'permission denied');
select set_config('acumula.purging', '', false);
reset role;
set role anon;
select tests.fails($$select * from public.operation_baselines$$, 'visitante não lê os pontos de comparação', 'permission denied');
reset role;

-- Agendamento (só onde o agendador existe)
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform tests.check((select count(*) = 1 from cron.job where jobname = 'apagar-mais-de-30-dias' and schedule = '15 6 * * *'), 'limpeza agendada para 03:15 de Brasília');
  end if;
end $$;

select 'LIMPEZA DE 30 DIAS: TODOS OS TESTES PASSARAM' as resultado;
