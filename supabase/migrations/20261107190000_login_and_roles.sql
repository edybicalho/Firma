-- Login por usuário e senha, com perfis de administrador e operador.
-- O administrador cadastra os usuários pelo app. Operadores usam Painel e Relatórios;
-- só administradores mexem em projetos, operações e usuários.
-- O Supabase exige e-mail no login, então cada usuário recebe um e-mail interno
-- (usuario@acumula.local) que ninguém precisa digitar.

create extension if not exists pgcrypto with schema extensions;

-- 1. Perfis
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique,
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

-- 2. Qualquer conta criada fora do app (ex.: pelo painel do Supabase) ganha perfil desativado
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username, name, role, active)
  values (
    new.id,
    split_part(new.email, '@', 1),
    coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), split_part(new.email, '@', 1)),
    'operator',
    false
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 3. Criação de usuário (uso interno das funções abaixo)
create or replace function public._create_login(p_username text, p_password text, p_name text, p_role text)
returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_username text := lower(trim(p_username));
  v_email text := lower(trim(p_username)) || '@acumula.local';
  v_id uuid := gen_random_uuid();
begin
  if v_username !~ '^[a-z0-9._-]{3,30}$' then raise exception 'usuario_invalido'; end if;
  if length(coalesce(p_password, '')) < 6 then raise exception 'senha_curta'; end if;
  if p_role not in ('admin', 'operator') then raise exception 'perfil_invalido'; end if;
  if exists (select 1 from public.profiles where username = v_username)
     or exists (select 1 from auth.users where email = v_email) then
    raise exception 'usuario_existe';
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change, email_change_token_new
  ) values (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email,
    crypt(p_password, gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', jsonb_build_object('name', trim(p_name)), now(), now(),
    '', '', '', ''
  );

  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (
    gen_random_uuid(), v_id, v_id::text,
    jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true),
    'email', now(), now(), now()
  );

  -- O gatilho já criou o perfil desativado; aqui ele recebe os dados certos
  update public.profiles
     set username = v_username, name = trim(p_name), role = p_role, active = true
   where id = v_id;

  return v_id;
end;
$$;
revoke all on function public._create_login(text, text, text, text) from public, anon, authenticated;

-- 4. Administrador cria usuário pelo app
create or replace function public.admin_create_user(p_username text, p_password text, p_name text, p_role text default 'operator')
returns uuid
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'sem_permissao'; end if;
  return public._create_login(p_username, p_password, p_name, p_role);
end;
$$;
revoke all on function public.admin_create_user(text, text, text, text) from public, anon;
grant execute on function public.admin_create_user(text, text, text, text) to authenticated;

-- 5. Administrador troca a senha de alguém
create or replace function public.admin_set_password(p_user_id uuid, p_password text)
returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.is_admin() then raise exception 'sem_permissao'; end if;
  if length(coalesce(p_password, '')) < 6 then raise exception 'senha_curta'; end if;
  update auth.users set encrypted_password = crypt(p_password, gen_salt('bf')), updated_at = now()
   where id = p_user_id;
end;
$$;
revoke all on function public.admin_set_password(uuid, text) from public, anon;
grant execute on function public.admin_set_password(uuid, text) to authenticated;

-- 6. Primeiro administrador: rodar UMA vez no SQL Editor, com o usuário e a senha desejados:
--    select public.create_first_admin('admin', 'sua-senha-aqui', 'Seu nome');
--    Só funciona enquanto não existir nenhum administrador.
create or replace function public.create_first_admin(p_username text, p_password text, p_name text)
returns uuid
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.profiles where role = 'admin') then
    raise exception 'Já existe um administrador. Crie novos usuários pelo app.';
  end if;
  return public._create_login(p_username, p_password, p_name, 'admin');
end;
$$;
revoke all on function public.create_first_admin(text, text, text) from public, anon, authenticated;

-- 7. Regras dos perfis: cada um vê o próprio; o administrador vê e altera os outros (nunca o próprio)
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update to authenticated
  using (public.is_admin() and id <> auth.uid())
  with check (public.is_admin() and id <> auth.uid());

-- 8. Remove as regras antigas (abertas a qualquer visitante) das tabelas do app
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

-- 9. Projetos: todos com acesso leem; operadores só podem alterar as observações
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

-- 10. Operações: todos com acesso leem; só administradores alteram
create policy operations_read on public.operations
  for select to authenticated using (public.is_active_user());
create policy operations_admin on public.operations
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- 11. Lançamentos: todos com acesso leem, lançam e excluem os do dia (horário de Brasília);
--     administradores podem tudo
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
