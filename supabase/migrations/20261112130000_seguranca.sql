-- Reforço de segurança e proteção dos dados.
-- Pode rodar mais de uma vez sem problema.

-- 0. Conferência: a data do lançamento precisa ser só o dia (tipo date), senão a regra
--    de "lançamentos de hoje" ficaria errada. Se não for, para tudo aqui com um aviso claro.
do $$
begin
  if (select data_type from information_schema.columns
       where table_schema = 'public' and table_name = 'movements' and column_name = 'recorded_at') <> 'date' then
    raise exception 'A coluna movements.recorded_at não é do tipo date. Pare aqui e peça ajuda antes de continuar.';
  end if;
end;
$$;

-- 1. Validação dos valores gravados. Vale para tudo que for gravado daqui em diante;
--    se os dados antigos também estiverem certos, a regra passa a valer para eles também.
do $$
declare
  c record;
begin
  for c in
    select * from (values
      ('movements', 'movements_values_valid', 'check (entry_total >= 0 and exit_total >= 0 and entry_total < 1e12 and exit_total < 1e12)'),
      ('operations', 'operations_number_valid', 'check (operation_number >= 1)'),
      ('operations', 'operations_name_valid', 'check (length(btrim(name)) between 1 and 200)'),
      ('projects', 'projects_name_valid', 'check (length(btrim(name)) between 1 and 200)'),
      ('projects', 'projects_notes_valid', 'check (notes is null or length(notes) <= 10000)')
    ) as t(tbl, name, def)
  loop
    if not exists (select 1 from pg_constraint where conname = c.name) then
      execute format('alter table public.%I add constraint %I %s not valid', c.tbl, c.name, c.def);
    end if;
    begin
      execute format('alter table public.%I validate constraint %I', c.tbl, c.name);
    exception when check_violation then
      raise notice 'Aviso: há dados antigos em % que não seguem a regra %. Eles foram mantidos; só os novos são conferidos.', c.tbl, c.name;
    end;
  end loop;
end;
$$;

-- 2. Número de operação único dentro de cada projeto
do $$
begin
  if not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'operations_project_number_key') then
    if exists (select 1 from public.operations group by project_id, operation_number having count(*) > 1) then
      raise notice 'Aviso: há operações com o mesmo número no mesmo projeto. Corrija os números e rode esta migração de novo para ativar a regra.';
    else
      create unique index operations_project_number_key on public.operations (project_id, operation_number);
    end if;
  end if;
end;
$$;

-- 3. Lançamentos: quem lançou fica gravado, e o projeto sempre é o da operação escolhida
alter table public.movements add column if not exists created_by uuid references auth.users (id) on delete set null;

create or replace function public.movements_before_write() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_project uuid;
begin
  select project_id into v_project from public.operations where id = new.operation_id;
  if v_project is null then raise exception 'operacao_inexistente'; end if;
  new.project_id := v_project;
  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new.created_by := auth.uid();
      new.created_at := now();
    end if;
  else
    -- Quem lançou não pode ser trocado; só fica vazio se o usuário for excluído
    if new.created_by is not null then new.created_by := old.created_by; end if;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;
revoke all on function public.movements_before_write() from public, anon, authenticated;
drop trigger if exists movements_before_write on public.movements;
create trigger movements_before_write
  before insert or update on public.movements
  for each row execute function public.movements_before_write();

-- 4. Perfis: pelo app só dá para mudar o tipo de acesso e ativar/desativar.
--    Nome e login mudam só pela função admin_update_user (que também atualiza o login de entrada).
revoke insert, update, delete, truncate, references, trigger on public.profiles from anon, authenticated;
grant update (role, active) on public.profiles to authenticated;

-- Sempre precisa existir pelo menos um administrador com acesso
create or replace function public.profiles_keep_admin() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.profiles) and not exists (select 1 from public.profiles where role = 'admin' and active) then
    raise exception 'ultimo_admin';
  end if;
  return null;
end;
$$;
revoke all on function public.profiles_keep_admin() from public, anon, authenticated;
drop trigger if exists profiles_keep_admin on public.profiles;
create trigger profiles_keep_admin
  after update or delete on public.profiles
  for each statement execute function public.profiles_keep_admin();

-- Quem é desativado é desconectado (encerra as sessões abertas)
create or replace function public.profiles_end_sessions() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.active and not new.active then
    begin
      delete from auth.sessions where user_id = new.id;
    exception when others then
      raise notice 'Não foi possível encerrar as sessões: %', sqlerrm;
    end;
  end if;
  return null;
end;
$$;
revoke all on function public.profiles_end_sessions() from public, anon, authenticated;
drop trigger if exists profiles_end_sessions on public.profiles;
create trigger profiles_end_sessions
  after update of active on public.profiles
  for each row execute function public.profiles_end_sessions();

-- Contas criadas fora do app ganham perfil desativado; se o login já existir, não trava o cadastro
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
  on conflict do nothing;
  return new;
end;
$$;
revoke all on function public.handle_new_user() from public, anon, authenticated;

-- 5. Funções de usuários com regras mais firmes (senha mínima de 8 caracteres)
create or replace function public._create_login(p_username text, p_password text, p_name text, p_role text)
returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_username text := lower(trim(p_username));
  v_email text := lower(trim(p_username)) || '@acumula.local';
  v_id uuid := gen_random_uuid();
begin
  if v_username !~ '^[a-z0-9._-]{3,30}$' then raise exception 'usuario_invalido'; end if;
  if length(coalesce(p_password, '')) < 8 then raise exception 'senha_curta'; end if;
  if length(p_password) > 72 then raise exception 'senha_longa'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'nome_vazio'; end if;
  if p_role not in ('admin', 'operator') then raise exception 'perfil_invalido'; end if;
  if exists (select 1 from public.profiles where username = v_username)
     or exists (select 1 from auth.users where email = v_email) then
    raise exception 'usuario_existe';
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change, email_change_token_new,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token
  ) values (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email,
    crypt(p_password, gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', jsonb_build_object('name', trim(p_name)), now(), now(),
    '', '', '', '', '', '', '', ''
  );

  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (
    gen_random_uuid(), v_id, v_id::text,
    jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true),
    'email', now(), now(), now()
  );

  update public.profiles
     set username = v_username, name = trim(p_name), role = p_role, active = true
   where id = v_id;

  return v_id;
end;
$$;
revoke all on function public._create_login(text, text, text, text) from public, anon, authenticated;

create or replace function public.admin_set_password(p_user_id uuid, p_password text)
returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.is_admin() then raise exception 'sem_permissao'; end if;
  if length(coalesce(p_password, '')) < 8 then raise exception 'senha_curta'; end if;
  if length(p_password) > 72 then raise exception 'senha_longa'; end if;
  update auth.users set encrypted_password = crypt(p_password, gen_salt('bf')), updated_at = now()
   where id = p_user_id;
  if not found then raise exception 'usuario_nao_encontrado'; end if;
  -- Quem teve a senha trocada precisa entrar de novo com a senha nova
  if p_user_id <> auth.uid() then
    begin
      delete from auth.sessions where user_id = p_user_id;
    exception when others then
      raise notice 'Não foi possível encerrar as sessões: %', sqlerrm;
    end;
  end if;
  insert into public.audit_log (user_id, username, table_name, action, row_id, old_data)
  values (
    auth.uid(), (select username from public.profiles where id = auth.uid()), 'profiles', 'SENHA', p_user_id::text,
    jsonb_build_object('username', (select username from public.profiles where id = p_user_id))
  );
end;
$$;
revoke all on function public.admin_set_password(uuid, text) from public, anon;
grant execute on function public.admin_set_password(uuid, text) to authenticated;

create or replace function public.admin_update_user(p_user_id uuid, p_username text, p_name text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_username text := lower(trim(p_username));
  v_email text := lower(trim(p_username)) || '@acumula.local';
begin
  if not public.is_admin() then raise exception 'sem_permissao'; end if;
  if v_username !~ '^[a-z0-9._-]{3,30}$' then raise exception 'usuario_invalido'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'nome_vazio'; end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then raise exception 'usuario_nao_encontrado'; end if;
  if exists (select 1 from public.profiles where username = v_username and id <> p_user_id)
     or exists (select 1 from auth.users where email = v_email and id <> p_user_id) then
    raise exception 'usuario_existe';
  end if;
  update auth.users set email = v_email, updated_at = now() where id = p_user_id;
  update auth.identities
     set identity_data = identity_data || jsonb_build_object('email', v_email), updated_at = now()
   where user_id = p_user_id and provider = 'email';
  update public.profiles set username = v_username, name = trim(p_name) where id = p_user_id;
end;
$$;
revoke all on function public.admin_update_user(uuid, text, text) from public, anon;
grant execute on function public.admin_update_user(uuid, text, text) to authenticated;

create or replace function public.admin_delete_user(p_user_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'sem_permissao'; end if;
  if p_user_id = auth.uid() then raise exception 'proprio_usuario'; end if;
  delete from auth.users where id = p_user_id;
  if not found then raise exception 'usuario_nao_encontrado'; end if;
end;
$$;
revoke all on function public.admin_delete_user(uuid) from public, anon;
grant execute on function public.admin_delete_user(uuid) to authenticated;

-- 6. Funções de checagem: só usuários logados usam
revoke all on function public.is_admin() from public, anon;
revoke all on function public.is_active_user() from public, anon;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_active_user() to authenticated;
revoke all on function public.only_notes_for_operators() from public, anon, authenticated;
revoke all on function public.create_first_admin(text, text, text) from public, anon, authenticated;

-- 7. Visitantes sem login não têm nenhum acesso às tabelas; usuários logados não podem
--    usar comandos que passam por cima das regras (como esvaziar uma tabela inteira)
revoke all on public.projects, public.operations, public.movements, public.profiles from anon;
revoke truncate, references, trigger on public.projects, public.operations, public.movements from authenticated;

-- 8. Liberação explícita, tabela por tabela, do que o app precisa. Assim tudo funciona mesmo com
--    a opção "Automatically expose new tables" desligada no Supabase (recomendado), e nenhuma
--    tabela nova fica exposta por descuido. Quem decide linha a linha continuam sendo as regras (RLS).
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.projects, public.operations, public.movements to authenticated;
grant select on public.profiles to authenticated;
grant select on public.audit_log to authenticated;
grant all on public.projects, public.operations, public.movements, public.profiles, public.audit_log to service_role;
do $$
begin
  revoke create on schema public from anon, authenticated;
exception when others then
  raise notice 'Não foi possível ajustar a permissão do schema public: %', sqlerrm;
end;
$$;
