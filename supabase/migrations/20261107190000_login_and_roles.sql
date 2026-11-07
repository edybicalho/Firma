-- Login com perfis de administrador e operador.
-- Operadores usam Painel e Relatórios; só administradores mexem em projetos, operações e usuários.

-- 1. Perfis de usuário
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  name text not null default '',
  role text not null default 'operator' check (role in ('admin', 'operator')),
  active boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create or replace function public.is_active_user() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active);
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active and role = 'admin');
$$;

-- 2. Toda conta nova ganha um perfil. A primeira vira administradora com acesso;
--    as seguintes entram como operador aguardando liberação.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  has_admin boolean;
begin
  select exists (select 1 from public.profiles where role = 'admin') into has_admin;
  insert into public.profiles (id, email, name, role, active)
  values (
    new.id,
    new.email,
    coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), split_part(new.email, '@', 1)),
    case when has_admin then 'operator' else 'admin' end,
    not has_admin
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Contas que já existiam antes desta migração entram aguardando liberação
insert into public.profiles (id, email, name)
select u.id, u.email, split_part(u.email, '@', 1)
from auth.users u
on conflict (id) do nothing;

-- 3. Regras dos perfis: cada um vê o próprio; o administrador vê e altera os outros (nunca o próprio)
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update to authenticated
  using (public.is_admin() and id <> auth.uid())
  with check (public.is_admin() and id <> auth.uid());

-- 4. Remove as regras antigas (abertas a qualquer visitante) das tabelas do app
do $$
declare
  pol record;
begin
  for pol in
    select policyname, tablename from pg_policies
    where schemaname = 'public' and tablename in ('projects', 'operations', 'movements')
  loop
    execute format('drop policy %I on public.%I', pol.policyname, pol.tablename);
  end loop;
end;
$$;

alter table public.projects enable row level security;
alter table public.operations enable row level security;
alter table public.movements enable row level security;

-- 5. Projetos: todos com acesso leem; operadores só podem alterar as observações
create policy projects_read on public.projects
  for select to authenticated using (public.is_active_user());
create policy projects_admin on public.projects
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy projects_notes on public.projects
  for update to authenticated using (public.is_active_user()) with check (public.is_active_user());

create or replace function public.only_notes_for_operators() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_admin() then
    return new;
  end if;
  -- Para quem não é administrador, mantém tudo como estava e aceita só a observação
  return jsonb_populate_record(old, jsonb_build_object('notes', new.notes));
end;
$$;

drop trigger if exists projects_only_notes on public.projects;
create trigger projects_only_notes
  before update on public.projects
  for each row execute function public.only_notes_for_operators();

-- 6. Operações: todos com acesso leem; só administradores alteram
create policy operations_read on public.operations
  for select to authenticated using (public.is_active_user());
create policy operations_admin on public.operations
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- 7. Lançamentos: todos com acesso leem, lançam e excluem os do dia (horário de Brasília);
--    administradores podem tudo
create policy movements_read on public.movements
  for select to authenticated using (public.is_active_user());
create policy movements_insert_today on public.movements
  for insert to authenticated
  with check (public.is_active_user() and recorded_at::date = (now() at time zone 'America/Sao_Paulo')::date);
create policy movements_delete_today on public.movements
  for delete to authenticated
  using (public.is_active_user() and recorded_at::date = (now() at time zone 'America/Sao_Paulo')::date);
create policy movements_admin on public.movements
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
