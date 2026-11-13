-- Apagar automaticamente o que tiver mais de 30 dias: lançamentos e histórico do Registro.
-- Um lançamento feito no dia D é apagado na madrugada em que completa 30 dias (dia D + 30).
-- Antes de apagar, guarda só a entrada e a saída acumuladas do último lançamento apagado de
-- cada ficha (tabela operation_baselines): é o ponto de comparação do lançamento seguinte,
-- para as contas continuarem certas. A limpeza NÃO deixa cópia dos dados apagados no Registro;
-- anota só quantos lançamentos saíram.
-- Roda sozinha toda madrugada (03:15 de Brasília) pelo agendador do Supabase (pg_cron).
-- Pode rodar mais de uma vez sem problema.

-- 1. Ponto de comparação de cada ficha (último lançamento já apagado)
create table if not exists public.operation_baselines (
  operation_id uuid primary key references public.operations (id) on delete cascade,
  entry_total numeric(14,2) not null,
  exit_total numeric(14,2) not null,
  recorded_at date not null,
  updated_at timestamptz not null default now()
);
-- Hora e identificação do lançamento de origem, para comparar na mesma ordem do app (dia, hora, id)
alter table public.operation_baselines add column if not exists source_created_at timestamptz;
alter table public.operation_baselines add column if not exists source_id uuid;
alter table public.operation_baselines enable row level security;
drop policy if exists operation_baselines_read on public.operation_baselines;
create policy operation_baselines_read on public.operation_baselines
  for select to authenticated using (public.is_active_user());
revoke all on public.operation_baselines from anon;
revoke insert, update, delete, truncate, references, trigger on public.operation_baselines from authenticated;
grant select on public.operation_baselines to authenticated;
grant all on public.operation_baselines to service_role;

-- 2. Durante a limpeza automática, o Registro não guarda cópia do que sai
--    e as linhas antigas do Registro podem ser apagadas. Só vale dentro da função de limpeza,
--    numa conexão do próprio banco (agendador ou SQL Editor). Conexões do app entram como
--    "authenticator", então nunca ativam isso, nem tentando.
create or replace function public.purging() returns boolean
language sql stable set search_path = public as $$
  select coalesce(current_setting('acumula.purging', true), '') = 'on'
     and session_user in ('postgres', 'supabase_admin')
$$;
revoke all on function public.purging() from public, anon, authenticated;

create or replace function public.write_audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_username text;
begin
  if public.purging() then return null; end if;
  if tg_op <> 'INSERT' then v_old := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then v_new := to_jsonb(new); end if;
  if tg_op = 'UPDATE' and v_old = v_new then return null; end if;
  select username into v_username from public.profiles where id = auth.uid();
  insert into public.audit_log (user_id, username, table_name, action, row_id, old_data, new_data)
  values (auth.uid(), v_username, tg_table_name, tg_op, coalesce(v_new ->> 'id', v_old ->> 'id'), v_old, v_new);
  return null;
end;
$$;
revoke all on function public.write_audit() from public, anon, authenticated;

create or replace function public.audit_log_immutable() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' and public.purging() then return old; end if;
  raise exception 'registro_imutavel: o registro de alterações não pode ser alterado nem apagado';
end;
$$;

-- 3. A conferência do acumulado também compara com o ponto de comparação guardado,
--    quando a ficha não tem mais lançamentos (todos já apagados)
create or replace function public.movements_check_accumulated() returns trigger
language plpgsql set search_path = public as $$
declare
  v_last record;
begin
  perform pg_advisory_xact_lock(hashtextextended('movements:' || new.operation_id::text, 0));

  if coalesce(new.is_base, false) then
    return new;
  end if;

  select entry_total, exit_total, recorded_at into v_last
    from public.movements
   where operation_id = new.operation_id
   order by recorded_at desc, created_at desc, id desc
   limit 1;
  if not found then
    select entry_total, exit_total, recorded_at into v_last
      from public.operation_baselines
     where operation_id = new.operation_id;
  end if;

  if found and new.recorded_at >= v_last.recorded_at
     and (new.entry_total < v_last.entry_total or new.exit_total < v_last.exit_total) then
    raise exception 'acumulado_menor: o acumulado não pode ser menor que o do último lançamento desta ficha (use Novo jogo)'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
revoke all on function public.movements_check_accumulated() from public, anon, authenticated;

-- 4. A limpeza
create or replace function public.purge_old_data(p_days integer default 30) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_cutoff date := (now() at time zone 'America/Sao_Paulo')::date - p_days; -- apaga recorded_at <= v_cutoff
  v_count integer;
begin
  if p_days < 30 then raise exception 'prazo_minimo: o prazo mínimo é de 30 dias'; end if;
  perform set_config('acumula.purging', 'on', true);

  -- Guarda o último lançamento que vai sair de cada ficha (só se for mais novo que o já guardado)
  insert into public.operation_baselines (operation_id, entry_total, exit_total, recorded_at, source_created_at, source_id, updated_at)
  select distinct on (operation_id) operation_id, entry_total, exit_total, recorded_at, created_at, id, now()
    from public.movements
   where recorded_at <= v_cutoff
   order by operation_id, recorded_at desc, created_at desc, id desc
  on conflict (operation_id) do update
     set entry_total = excluded.entry_total, exit_total = excluded.exit_total, recorded_at = excluded.recorded_at,
         source_created_at = excluded.source_created_at, source_id = excluded.source_id, updated_at = now()
   where (excluded.recorded_at, excluded.source_created_at, excluded.source_id)
         >= (public.operation_baselines.recorded_at,
             coalesce(public.operation_baselines.source_created_at, '-infinity'::timestamptz),
             coalesce(public.operation_baselines.source_id, '00000000-0000-0000-0000-000000000000'::uuid));

  delete from public.movements where recorded_at <= v_cutoff;
  get diagnostics v_count = row_count;

  -- Registro: mesmo critério dos lançamentos (dia de Brasília)
  delete from public.audit_log where (happened_at at time zone 'America/Sao_Paulo')::date <= v_cutoff;

  perform set_config('acumula.purging', 'off', true);

  if v_count > 0 then
    insert into public.audit_log (table_name, action, username, new_data)
    values ('sistema', 'LIMPEZA_30_DIAS', 'sistema', jsonb_build_object('lancamentos', v_count));
  end if;
  return v_count;
end;
$$;
revoke all on function public.purge_old_data(integer) from public, anon, authenticated;

-- 5. Agendamento: toda madrugada, 03:15 de Brasília (06:15 UTC)
do $$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'Aviso: não foi possível ligar o agendador (pg_cron): %. Ligue em Database → Extensions → pg_cron e rode este arquivo de novo.', sqlerrm;
    return;
  end;
  perform cron.unschedule(jobid) from cron.job where jobname = 'apagar-mais-de-30-dias';
  perform cron.schedule('apagar-mais-de-30-dias', '15 6 * * *', 'select public.purge_old_data(30)');
end;
$$;
