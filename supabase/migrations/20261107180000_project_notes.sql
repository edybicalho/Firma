-- Observações por projeto, usadas na tela de Relatórios
alter table public.projects add column if not exists notes text;
