-- Conferência de segurança do banco. SÓ LÊ, não altera nada.
-- Rode no SQL Editor do Supabase depois das 5 migrações (e sempre que quiser conferir).
-- Cada linha mostra ✅ (certo) ou ❌ (precisa de atenção) e o que fazer.

with checks(ordem, item, ok, o_que_fazer) as (
  select 1, 'Todas as tabelas têm regras de acesso ligadas (RLS)',
    not exists (select 1 from pg_tables where schemaname = 'public' and not rowsecurity),
    'Alguma tabela está sem RLS. Rode as migrações de novo, na ordem.'
  union all
  select 2, 'Nenhuma regra de acesso libera visitantes sem login',
    not exists (select 1 from pg_policies where schemaname = 'public' and (roles && array['anon', 'public']::name[])),
    'Existe regra aberta a visitantes (provavelmente antiga, do Bolt). Rode a migração 3 de novo.'
  union all
  select 3, 'Visitantes sem login não leem nenhuma tabela do app',
    not (has_table_privilege('anon', 'public.projects', 'select') or has_table_privilege('anon', 'public.operations', 'select')
      or has_table_privilege('anon', 'public.movements', 'select') or has_table_privilege('anon', 'public.profiles', 'select')
      or has_table_privilege('anon', 'public.audit_log', 'select')),
    'Rode a migração 5 de novo.'
  union all
  select 4, 'Registro de alterações ligado nas 4 tabelas',
    (select count(*) from pg_trigger where not tgisinternal and tgname in ('audit_projects', 'audit_operations', 'audit_movements', 'audit_profiles')) = 4,
    'Rode a migração 4 de novo.'
  union all
  select 5, 'Registro de alterações protegido contra apagamento',
    exists (select 1 from pg_trigger where tgname = 'audit_log_no_change') and exists (select 1 from pg_trigger where tgname = 'audit_log_no_truncate'),
    'Rode a migração 4 de novo.'
  union all
  select 6, 'Existe pelo menos um administrador ativo',
    exists (select 1 from public.profiles where role = 'admin' and active),
    'Crie o primeiro administrador: select public.create_first_admin(''usuario'', ''senha'', ''Nome'');'
  union all
  select 7, 'Nenhuma conta criada por fora do app (cadastro público)',
    not exists (select 1 from auth.users where email not like '%@acumula.local'),
    'Há contas com e-mail de verdade: alguém se cadastrou sozinho. Desligue "Allow new users to sign up" em Authentication e exclua essas contas.'
  union all
  select 8, 'Toda conta de login tem perfil',
    not exists (select 1 from auth.users u where not exists (select 1 from public.profiles p where p.id = u.id)),
    'Há conta sem perfil. Ela não acessa nada, mas convém excluir em Authentication > Users.'
  union all
  select 9, 'Funções com poder especial têm caminho fixo (search_path)',
    not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'public' and p.prosecdef and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')),
    'Alguma função está sem search_path. Rode as migrações de novo, na ordem.'
  union all
  select 10, 'Funções de administrador bloqueadas para visitantes',
    not (has_function_privilege('anon', 'public.admin_create_user(text, text, text, text)', 'execute')
      or has_function_privilege('anon', 'public.admin_set_password(uuid, text)', 'execute')
      or has_function_privilege('authenticated', 'public.create_first_admin(text, text, text)', 'execute')),
    'Rode a migração 5 de novo.'
  union all
  select 11, 'Regras de validação de valores ativas',
    (select count(*) from pg_constraint where conname in ('movements_values_valid', 'operations_number_valid', 'operations_name_valid', 'projects_name_valid', 'projects_notes_valid')) = 5,
    'Rode a migração 5 de novo.'
  union all
  select 12, 'Número de operação único por projeto',
    exists (select 1 from pg_indexes where indexname = 'operations_project_number_key'),
    'Há operações com número repetido no mesmo projeto. Corrija os números em Configurações e rode a migração 5 de novo.'
  union all
  select 13, 'Banco confere o acumulado e salva uma pessoa de cada vez por ficha',
    exists (select 1 from pg_trigger where tgname = 'movements_check_accumulated' and not tgisinternal),
    'Rode a migração 7 (20261114120000_conferencia_acumulado.sql).'
  union all
  select 14, 'Botão "Novo jogo" ativo no banco',
    exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'movements' and column_name = 'is_base'),
    'Rode a migração 6 (20261113120000_nova_base.sql).'
)
select ordem as "nº", case when ok then '✅' else '❌' end as "situação", item as "conferência",
       case when ok then '' else o_que_fazer end as "o que fazer"
from checks order by ordem;
