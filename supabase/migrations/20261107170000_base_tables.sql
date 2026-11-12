-- Tabelas principais do app: projetos, operações e lançamentos.
-- Num Supabase novo, cria tudo. Num Supabase que já tem as tabelas (criadas pelo Bolt),
-- não apaga nem muda nada do que existe: só completa colunas e índices que faltarem.
-- Pode rodar mais de uma vez sem problema.

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'Ativo',
  total_entry numeric(14,2) not null default 0,
  total_exit numeric(14,2) not null default 0,
  created_at timestamptz not null default now()
);
alter table public.projects add column if not exists status text not null default 'Ativo';
alter table public.projects add column if not exists total_entry numeric(14,2) not null default 0;
alter table public.projects add column if not exists total_exit numeric(14,2) not null default 0;
alter table public.projects add column if not exists created_at timestamptz not null default now();

create table if not exists public.operations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  operation_number integer not null,
  name text not null,
  created_at timestamptz not null default now()
);
alter table public.operations add column if not exists created_at timestamptz not null default now();

create table if not exists public.movements (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  operation_id uuid not null references public.operations (id) on delete cascade,
  entry_total numeric(14,2) not null default 0,
  exit_total numeric(14,2) not null default 0,
  -- Dia do lançamento no horário de Brasília (só a data, sem hora)
  recorded_at date not null default ((now() at time zone 'America/Sao_Paulo')::date),
  created_at timestamptz not null default now()
);
alter table public.movements add column if not exists created_at timestamptz not null default now();

-- Índices para o app continuar rápido quando houver muitos lançamentos
create index if not exists operations_project_idx on public.operations (project_id);
create index if not exists movements_project_idx on public.movements (project_id);
create index if not exists movements_operation_day_idx on public.movements (operation_id, recorded_at, created_at);

-- Ninguém acessa nada até as regras de acesso (próximas migrações) liberarem
alter table public.projects enable row level security;
alter table public.operations enable row level security;
alter table public.movements enable row level security;
