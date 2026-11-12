-- Último acesso de cada usuário, para a aba Usuários (só administradores).
-- A data do último login fica no sistema de login do Supabase (auth.users), que o app não lê
-- diretamente; esta função entrega só o necessário, e só para administradores.
-- Não muda nenhum dado. Pode rodar mais de uma vez sem problema.

create or replace function public.admin_list_users()
returns table (id uuid, username text, name text, role text, active boolean, created_at timestamptz, last_sign_in_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'sem_permissao'; end if;
  return query
    select p.id, p.username, p.name, p.role, p.active, p.created_at, u.last_sign_in_at
      from public.profiles p
      left join auth.users u on u.id = p.id
     order by p.created_at;
end;
$$;
revoke all on function public.admin_list_users() from public, anon;
grant execute on function public.admin_list_users() to authenticated;
