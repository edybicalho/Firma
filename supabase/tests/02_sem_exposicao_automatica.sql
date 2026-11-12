-- Simula a opção "Automatically expose new tables" DESLIGADA no Supabase:
-- tabelas e funções novas não dão acesso a ninguém até serem liberadas uma a uma.
alter default privileges in schema public revoke all on tables from anon, authenticated, service_role;
alter default privileges in schema public revoke all on sequences from anon, authenticated, service_role;
alter default privileges in schema public revoke all on functions from anon, authenticated, service_role;
alter default privileges revoke execute on functions from public;
