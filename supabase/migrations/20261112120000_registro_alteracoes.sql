-- Registro de alterações: guarda quem criou, alterou ou excluiu cada projeto, operação,
-- lançamento e usuário, com a data e hora e uma cópia do antes e do depois.
-- Serve para saber quem fez o quê e para recuperar dados excluídos por engano.
-- Só administradores leem. Ninguém consegue alterar ou apagar o registro pelo app.
-- Pode rodar mais de uma vez sem problema.

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  happened_at timestamptz not null default now(),
  user_id uuid,
  username text,
  table_name text not null,
  action text not null,
  row_id text,
  old_data jsonb,
  new_data jsonb
);
create index if not exists audit_log_table_idx on public.audit_log (table_name, id desc);
create index if not exists audit_log_row_idx on public.audit_log (row_id);

alter table public.audit_log enable row level security;
drop policy if exists audit_log_admin_read on public.audit_log;
create policy audit_log_admin_read on public.audit_log
  for select to authenticated using (public.is_admin());

revoke all on public.audit_log from anon;
revoke insert, update, delete, truncate, references, trigger on public.audit_log from authenticated;

-- O registro não pode ser alterado nem apagado (nem pelo SQL Editor, sem antes desligar esta proteção)
create or replace function public.audit_log_immutable() returns trigger
language plpgsql as $$
begin
  raise exception 'registro_imutavel: o registro de alterações não pode ser alterado nem apagado';
end;
$$;
drop trigger if exists audit_log_no_change on public.audit_log;
create trigger audit_log_no_change
  before update or delete on public.audit_log
  for each row execute function public.audit_log_immutable();
drop trigger if exists audit_log_no_truncate on public.audit_log;
create trigger audit_log_no_truncate
  before truncate on public.audit_log
  for each statement execute function public.audit_log_immutable();

-- Grava uma linha no registro a cada alteração
create or replace function public.write_audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_username text;
begin
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

drop trigger if exists audit_projects on public.projects;
create trigger audit_projects after insert or update or delete on public.projects
  for each row execute function public.write_audit();
drop trigger if exists audit_operations on public.operations;
create trigger audit_operations after insert or update or delete on public.operations
  for each row execute function public.write_audit();
drop trigger if exists audit_movements on public.movements;
create trigger audit_movements after insert or update or delete on public.movements
  for each row execute function public.write_audit();
drop trigger if exists audit_profiles on public.profiles;
create trigger audit_profiles after insert or update or delete on public.profiles
  for each row execute function public.write_audit();
