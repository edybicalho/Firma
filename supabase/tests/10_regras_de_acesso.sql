-- Testes das regras de acesso e de proteção dos dados.
-- Rodam como cada tipo de pessoa (administrador, operador, visitante sem login)
-- e param no primeiro problema, com a mensagem "FALHOU: ...".
\set ON_ERROR_STOP 1
set client_min_messages = warning;

-- Ferramentas de teste -------------------------------------------------------
create schema tests;
grant usage on schema tests to anon, authenticated;

create function tests.check(p_ok boolean, p_label text) returns void language plpgsql as $$
begin
  if p_ok is distinct from true then raise exception 'FALHOU: %', p_label; end if;
end $$;

create function tests.fails(p_sql text, p_label text, p_expect text default null) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if p_expect is not null and position(p_expect in sqlerrm) = 0 then
      raise exception 'FALHOU: % (erro diferente do esperado: %)', p_label, sqlerrm;
    end if;
    return;
  end;
  raise exception 'FALHOU: % (deveria ter sido bloqueado)', p_label;
end $$;

create function tests.affected(p_sql text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
end $$;

create function tests.total(p_sql text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute format('select count(*) from (%s) x', p_sql) into n;
  return n;
end $$;

-- "Entra" como um usuário (simula o login do Supabase)
create function tests.login(p_username text) returns void language plpgsql security definer as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce((select id::text from public.profiles where username = p_username), ''), false);
end $$;
create function tests.uid(p_username text) returns uuid language sql security definer as $$
  select id from public.profiles where username = p_username
$$;
create function tests.op(p_name text) returns uuid language sql security definer as $$
  select id from public.operations where name = p_name
$$;
create function tests.op_project(p_name text) returns uuid language sql security definer as $$
  select project_id from public.operations where name = p_name
$$;
grant execute on all functions in schema tests to anon, authenticated;

-- 1. Primeiro administrador -----------------------------------------------------
select public.create_first_admin('chefe', 'senha-forte-1', 'Chefe');
select tests.fails($$select public.create_first_admin('outro', 'senha-forte-2', 'Outro')$$, 'segundo create_first_admin', 'Já existe um administrador');
select tests.check((select encrypted_password = extensions.crypt('senha-forte-1', encrypted_password) from auth.users where email = 'chefe@acumula.local'), 'senha do administrador confere');
select tests.check((select count(*) = 1 from auth.identities where email = 'chefe@acumula.local'), 'identidade de login criada');
select tests.check((select role = 'admin' and active from public.profiles where username = 'chefe'), 'perfil do administrador ativo');

-- 2. Administrador ----------------------------------------------------------------
set role authenticated;
select tests.login('chefe');

select public.admin_create_user('joao', 'senha-joao-1', 'João', 'operator');
select public.admin_create_user('maria', 'senha-maria-1', 'Maria', 'admin');
select tests.fails($$select public.admin_create_user('joao', 'outrasenha1', 'J', 'operator')$$, 'login repetido', 'usuario_existe');
select tests.fails($$select public.admin_create_user('JOAO ', 'outrasenha1', 'J', 'operator')$$, 'login repetido com maiúscula', 'usuario_existe');
select tests.fails($$select public.admin_create_user('pedro', '1234567', 'Pedro', 'operator')$$, 'senha curta', 'senha_curta');
select tests.fails($$select public.admin_create_user('pe', 'senha-longa-ok', 'Pedro', 'operator')$$, 'login curto', 'usuario_invalido');
select tests.fails($$select public.admin_create_user('pedro silva', 'senha-longa-ok', 'Pedro', 'operator')$$, 'login com espaço', 'usuario_invalido');
select tests.fails($$select public.admin_create_user('pedro', 'senha-longa-ok', '  ', 'operator')$$, 'nome vazio', 'nome_vazio');
select tests.fails($$select public.admin_create_user('pedro', 'senha-longa-ok', 'Pedro', 'dono')$$, 'tipo de acesso inválido', 'perfil_invalido');

insert into public.projects (name) values ('Obra Norte'), ('Obra Sul');
insert into public.operations (project_id, operation_number, name)
select id, 1, 'Fundação' from public.projects where name = 'Obra Norte';
insert into public.operations (project_id, operation_number, name)
select id, 1, 'Terraplenagem' from public.projects where name = 'Obra Sul';
select tests.fails($$insert into public.operations (project_id, operation_number, name) select id, 1, 'Repetida' from public.projects where name = 'Obra Norte'$$, 'número de operação repetido', 'operations_project_number_key');
select tests.fails($$insert into public.operations (project_id, operation_number, name) select id, 0, 'Zero' from public.projects where name = 'Obra Norte'$$, 'número de operação zero', 'operations_number_valid');
select tests.fails($$insert into public.projects (name) values ('   ')$$, 'projeto sem nome', 'projects_name_valid');

-- Administrador pode lançar em dia anterior (correção)
insert into public.movements (project_id, operation_id, entry_total, exit_total, recorded_at)
select o.project_id, o.id, 1000, 400, (now() at time zone 'America/Sao_Paulo')::date - 1
from public.operations o where o.name = 'Fundação';
select tests.fails($$insert into public.movements (project_id, operation_id, entry_total, exit_total) select project_id, id, -1, 0 from public.operations where name = 'Fundação'$$, 'valor negativo');
select tests.fails($$insert into public.movements (project_id, operation_id, entry_total, exit_total, is_base) select project_id, id, -1, 0, true from public.operations where name = 'Fundação'$$, 'valor negativo nem em novo jogo', 'movements_values_valid');
select tests.fails($$insert into public.movements (project_id, operation_id, entry_total, exit_total) select project_id, id, 1e13, 0 from public.operations where name = 'Fundação'$$, 'valor absurdo');
select tests.fails($$insert into public.movements (project_id, operation_id, entry_total, exit_total) select project_id, gen_random_uuid(), 1, 0 from public.operations where name = 'Fundação'$$, 'operação inexistente', 'operacao_inexistente');

-- Ninguém mexe no próprio acesso
select tests.check(tests.affected($$update public.profiles set role = 'operator' where id = auth.uid()$$) = 0, 'admin não rebaixa a si mesmo');
select tests.check(tests.affected($$update public.profiles set active = false where id = auth.uid()$$) = 0, 'admin não desativa a si mesmo');
select tests.fails($$select public.admin_delete_user(auth.uid())$$, 'admin não exclui a si mesmo', 'proprio_usuario');
-- Nome e login só mudam pela função própria (que também troca o login de entrada)
select tests.fails($$update public.profiles set username = 'hack' where username = 'joao'$$, 'mudar login direto na tabela', 'permission denied');
select tests.fails($$insert into public.profiles (id, username) values (gen_random_uuid(), 'fantasma')$$, 'criar perfil direto na tabela', 'permission denied');

select public.admin_update_user(tests.uid('maria'), 'mariana', 'Mariana Souza');
reset role;
select tests.check((select email = 'mariana@acumula.local' from auth.users where id = tests.uid('mariana')), 'login de entrada acompanha a mudança');
select tests.check((select email = 'mariana@acumula.local' from auth.identities where user_id = tests.uid('mariana')), 'identidade acompanha a mudança');
insert into auth.sessions (user_id) select id from public.profiles where username = 'joao';
set role authenticated;
select tests.login('chefe');
select tests.fails($$select public.admin_update_user(tests.uid('mariana'), 'joao', 'X')$$, 'renomear para login já usado', 'usuario_existe');

select public.admin_set_password(tests.uid('joao'), 'nova-senha-joao');
select tests.fails($$select public.admin_set_password(tests.uid('joao'), 'curta')$$, 'troca de senha curta', 'senha_curta');
select tests.fails($$select public.admin_set_password(gen_random_uuid(), 'senha-qualquer-1')$$, 'troca de senha de usuário inexistente', 'usuario_nao_encontrado');
reset role;
select tests.check((select encrypted_password = extensions.crypt('nova-senha-joao', encrypted_password) from auth.users where id = tests.uid('joao')), 'senha nova do operador confere');
select tests.check((select count(*) = 0 from auth.sessions where user_id = tests.uid('joao')), 'troca de senha desconecta a pessoa');
set role authenticated;
select tests.login('chefe');

select tests.check(tests.total('select * from public.audit_log') > 0, 'administrador lê o registro');
select tests.check(tests.total($$select * from public.audit_log where action = 'SENHA'$$) = 1, 'troca de senha fica registrada');
select tests.fails($$delete from public.audit_log$$, 'administrador apagar o registro', 'permission denied');
select tests.fails($$update public.audit_log set username = 'x'$$, 'administrador alterar o registro', 'permission denied');
select tests.fails($$insert into public.audit_log (table_name, action) values ('x', 'y')$$, 'administrador inventar registro', 'permission denied');
select tests.fails($$truncate public.movements$$, 'esvaziar a tabela de lançamentos', 'permission denied');

-- 3. Operador -------------------------------------------------------------------
select tests.login('joao');
select tests.check(tests.total('select * from public.projects') = 2, 'operador vê os projetos');
select tests.check(tests.total('select * from public.operations') = 2, 'operador vê as operações');
select tests.check(tests.total('select * from public.movements') = 1, 'operador vê os lançamentos');
select tests.check(tests.total('select * from public.profiles') = 1, 'operador vê só o próprio perfil');
select tests.check(tests.total('select * from public.audit_log') = 0, 'operador não vê o registro');

-- Lança hoje; mesmo informando o projeto errado, o lançamento fica no projeto da operação
insert into public.movements (project_id, operation_id, entry_total, exit_total)
select (select id from public.projects where name = 'Obra Sul'), id, 1500, 500 from public.operations where name = 'Fundação';
select tests.check((select p.name = 'Obra Norte' from public.movements m join public.projects p on p.id = m.project_id where m.entry_total = 1500), 'lançamento fica no projeto certo');
select tests.check((select created_by = auth.uid() from public.movements where entry_total = 1500), 'fica gravado quem lançou');
select tests.check((select not is_base from public.movements where entry_total = 1500), 'lançamento comum não é nova base');
insert into public.movements (project_id, operation_id, entry_total, exit_total, is_base)
select project_id, id, 10, 5, true from public.operations where name = 'Fundação';
select tests.check((select is_base from public.movements where entry_total = 10), 'operador salva nova base, mesmo com valor menor');
reset role;
select tests.check(tests.total($$select * from public.audit_log where table_name = 'movements' and new_data ->> 'is_base' = 'true'$$) = 1, 'registro guarda que foi nova base');
set role authenticated;
select tests.login('joao');
select tests.check(tests.affected($$delete from public.movements where entry_total = 10$$) = 1, 'operador exclui a nova base de hoje');
-- O banco não deixa o acumulado diminuir (a não ser em "Novo jogo" ou correção de data antiga)
select tests.fails($$insert into public.movements (project_id, operation_id, entry_total, exit_total) select project_id, id, 1400, 600 from public.operations where name = 'Fundação'$$, 'entrada menor que o último lançamento', 'acumulado_menor');
select tests.fails($$insert into public.movements (project_id, operation_id, entry_total, exit_total) select project_id, id, 1600, 400 from public.operations where name = 'Fundação'$$, 'saída menor que o último lançamento', 'acumulado_menor');
insert into public.movements (project_id, operation_id, entry_total, exit_total) select project_id, id, 1500, 500 from public.operations where name = 'Fundação';
select tests.check(tests.affected($$delete from public.movements where entry_total = 1500 and exit_total = 500 and id = (select id from public.movements where entry_total = 1500 order by created_at desc limit 1)$$) = 1, 'valor igual ao último é aceito');
insert into public.movements (project_id, operation_id, entry_total, exit_total, is_base) select project_id, id, 7, 3, true from public.operations where name = 'Fundação';
select tests.check(tests.affected($$delete from public.movements where entry_total = 7$$) = 1, 'novo jogo com valor menor é aceito');
reset role;
select tests.login('chefe');
set role authenticated;
insert into public.movements (project_id, operation_id, entry_total, exit_total, recorded_at)
select project_id, id, 1, 1, (now() at time zone 'America/Sao_Paulo')::date - 5 from public.operations where name = 'Fundação';
select tests.check(tests.affected($$delete from public.movements where entry_total = 1 and exit_total = 1$$) = 1, 'administrador corrige lançamento de data antiga sem bloqueio');
select tests.login('joao');
select tests.fails($$insert into public.movements (project_id, operation_id, entry_total, exit_total, recorded_at) select project_id, id, 2000, 600, current_date - 2 from public.operations where name = 'Fundação'$$, 'operador lançar em dia anterior', 'row-level security');
select tests.fails($$insert into public.movements (project_id, operation_id, entry_total, exit_total, recorded_at) select project_id, id, 2000, 600, current_date + 5 from public.operations where name = 'Fundação'$$, 'operador lançar em dia futuro', 'row-level security');
select tests.check(tests.affected($$update public.movements set entry_total = 9999$$) = 0, 'operador não altera lançamentos');
select tests.check(tests.affected($$delete from public.movements where recorded_at < (now() at time zone 'America/Sao_Paulo')::date$$) = 0, 'operador não exclui lançamento de dia anterior');
select tests.check(tests.affected($$delete from public.movements where entry_total = 1500$$) = 1, 'operador exclui lançamento de hoje');

-- Observações sim; o resto do projeto não
select tests.check(tests.affected($$update public.projects set name = 'Invadido', status = 'x', notes = 'Chuva atrasou' where name = 'Obra Norte'$$) = 1, 'operador salva observação');
select tests.check((select name = 'Obra Norte' and status = 'Ativo' and notes = 'Chuva atrasou' from public.projects where notes is not null), 'operador não renomeia projeto');
select tests.fails($$insert into public.projects (name) values ('Novo')$$, 'operador criar projeto', 'row-level security');
select tests.check(tests.affected($$delete from public.projects$$) = 0, 'operador não exclui projeto');
select tests.fails($$insert into public.operations (project_id, operation_number, name) select id, 9, 'X' from public.projects limit 1$$, 'operador criar operação', 'row-level security');
select tests.check(tests.affected($$update public.operations set name = 'X'$$) = 0, 'operador não altera operação');
select tests.check(tests.affected($$delete from public.operations$$) = 0, 'operador não exclui operação');

-- Usuários: nada
select tests.check(tests.affected($$update public.profiles set role = 'admin' where id = auth.uid()$$) = 0, 'operador não vira administrador');
select tests.fails($$select public.admin_create_user('intruso', 'senha-intruso', 'I', 'admin')$$, 'operador criar usuário', 'sem_permissao');
select tests.fails($$select public.admin_set_password(tests.uid('chefe'), 'senha-roubada')$$, 'operador trocar senha', 'sem_permissao');
select tests.fails($$select public.admin_update_user(tests.uid('chefe'), 'chefe', 'X')$$, 'operador editar usuário', 'sem_permissao');
select tests.fails($$select public.admin_delete_user(tests.uid('chefe'))$$, 'operador excluir usuário', 'sem_permissao');
select tests.fails($$select public.create_first_admin('x2', 'senha-forte-x', 'X')$$, 'operador usar create_first_admin', 'permission denied');
select tests.fails($$select public._create_login('x3', 'senha-forte-x', 'X', 'admin')$$, 'operador usar função interna', 'permission denied');
select tests.fails($$create table public.invasao (id int)$$, 'operador criar tabela', 'permission denied');
select tests.fails($$create function public.invasao() returns int language sql as 'select 1'$$, 'operador criar função', 'permission denied');

-- 4. Visitante sem login --------------------------------------------------------
reset role;
set role anon;
select tests.login(null);
select tests.fails($$select * from public.projects$$, 'visitante ler projetos', 'permission denied');
select tests.fails($$select * from public.movements$$, 'visitante ler lançamentos', 'permission denied');
select tests.fails($$select * from public.profiles$$, 'visitante ler usuários', 'permission denied');
select tests.fails($$select * from public.audit_log$$, 'visitante ler registro', 'permission denied');
select tests.fails($$insert into public.projects (name) values ('x')$$, 'visitante criar projeto', 'permission denied');
select tests.fails($$select public.admin_create_user('x', 'senha-forte-x', 'X', 'admin')$$, 'visitante criar usuário', 'permission denied');

-- 5. Desativar, último administrador, excluir -----------------------------------
reset role;
insert into auth.sessions (user_id) values (tests.uid('joao'));
set role authenticated;
select tests.login('chefe');
select tests.check(tests.affected($$update public.profiles set active = false where username = 'joao'$$) = 1, 'administrador desativa operador');
reset role;
select tests.check((select count(*) = 0 from auth.sessions where user_id = tests.uid('joao')), 'desativado é desconectado');
set role authenticated;
select tests.login('joao');
select tests.check(tests.total('select * from public.projects') = 0, 'desativado não vê projetos');
select tests.check(tests.total('select * from public.movements') = 0, 'desativado não vê lançamentos');
select tests.fails($$insert into public.movements (project_id, operation_id, entry_total, exit_total) values (tests.op_project('Fundação'), tests.op('Fundação'), 1, 0)$$, 'desativado lançar', 'row-level security');

select tests.login('chefe');
select tests.check(tests.affected($$update public.profiles set role = 'operator' where username = 'mariana'$$) = 1, 'administrador rebaixa outro administrador');
reset role;
select tests.fails($$update public.profiles set role = 'operator' where username = 'chefe'$$, 'ficar sem nenhum administrador', 'ultimo_admin');
set role authenticated;
select tests.login('chefe');

-- Excluir usuário: os lançamentos continuam; o registro guarda quem era
reset role;
select tests.login('joao');
insert into public.movements (project_id, operation_id, entry_total, exit_total)
select project_id, id, 3000, 900 from public.operations where name = 'Terraplenagem';
select tests.check((select created_by = tests.uid('joao') from public.movements where entry_total = 3000), 'lançamento feito pelo joao');
select tests.login('chefe');
select tests.check(tests.affected($$update public.movements set created_by = tests.uid('chefe') where entry_total = 3000$$) = 1, 'atualização roda');
select tests.check((select created_by = tests.uid('joao') from public.movements where entry_total = 3000), 'ninguém troca quem lançou');
set role authenticated;
select tests.login('chefe');
select public.admin_delete_user(tests.uid('joao'));
select tests.check(tests.total($$select * from public.profiles where username = 'joao'$$) = 0, 'usuário excluído');
select tests.check((select created_by is null from public.movements where entry_total = 3000), 'lançamentos do usuário excluído continuam');
select tests.check(tests.total($$select * from public.audit_log where table_name = 'profiles' and action = 'DELETE' and old_data ->> 'username' = 'joao'$$) = 1, 'exclusão de usuário registrada');
select tests.check(tests.total($$select * from public.audit_log where table_name = 'movements' and action = 'INSERT' and username = 'joao'$$) >= 1, 'registro guarda quem lançou');

-- Excluir projeto: tudo vai junto, mas o registro guarda uma cópia para recuperar
select tests.check(tests.affected($$delete from public.projects where name = 'Obra Norte'$$) = 1, 'administrador exclui projeto');
select tests.check(tests.total('select * from public.operations o join public.projects p on p.id = o.project_id where p.name = $x$Obra Norte$x$') = 0, 'operações do projeto excluídas junto');
select tests.check(tests.total($$select * from public.audit_log where table_name = 'movements' and action = 'DELETE' and old_data ->> 'entry_total' = '1000.00'$$) = 1, 'lançamento excluído pode ser recuperado do registro');
select tests.check(tests.total($$select * from public.audit_log where table_name = 'projects' and action = 'DELETE' and old_data ->> 'notes' = 'Chuva atrasou'$$) = 1, 'projeto excluído pode ser recuperado do registro');

-- 6. O registro não pode ser apagado nem pelo dono do banco ------------------------
reset role;
select tests.fails($$delete from public.audit_log$$, 'apagar o registro pelo SQL', 'registro_imutavel');
select tests.fails($$update public.audit_log set username = 'x'$$, 'alterar o registro pelo SQL', 'registro_imutavel');
select tests.fails($$truncate public.audit_log$$, 'esvaziar o registro pelo SQL', 'registro_imutavel');

-- 7. Busca de muitos lançamentos em páginas (como o app faz)
insert into public.movements (project_id, operation_id, entry_total, exit_total, recorded_at)
select o.project_id, o.id, g, 0, current_date - (3000 - g) from public.operations o, generate_series(1, 2500) g where o.name = 'Terraplenagem';
set role authenticated;
select tests.login('chefe');
select tests.check(
  (select count(distinct id) from (
     (select id from public.movements order by recorded_at desc, created_at desc, id limit 1000 offset 0)
     union all (select id from public.movements order by recorded_at desc, created_at desc, id limit 1000 offset 1000)
     union all (select id from public.movements order by recorded_at desc, created_at desc, id limit 1000 offset 2000)
   ) x) = (select count(*) from public.movements),
  'busca em páginas traz todos os lançamentos, sem repetir');
reset role;

select 'TODOS OS TESTES DO BANCO PASSARAM' as resultado;
