-- Simula um banco antigo criado pelo Bolt: tabelas já existentes, regras abertas a qualquer
-- visitante e alguns dados "imperfeitos". Serve para testar se as migrações rodam sem perder nada.
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text default 'Em andamento',
  total_entry numeric default 0,
  total_exit numeric default 0,
  created_at timestamptz default now()
);
create table public.operations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects (id) on delete cascade,
  operation_number integer not null,
  name text not null
);
create table public.movements (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects (id) on delete cascade,
  operation_id uuid references public.operations (id) on delete cascade,
  entry_total numeric default 0,
  exit_total numeric default 0,
  recorded_at date default current_date,
  created_at timestamptz default now()
);
alter table public.projects enable row level security;
alter table public.operations enable row level security;
alter table public.movements enable row level security;
create policy "Allow all" on public.projects for all using (true) with check (true);
create policy "Allow all" on public.operations for all using (true) with check (true);
create policy "Allow all" on public.movements for all using (true) with check (true);

insert into public.projects (id, name) values ('11111111-1111-1111-1111-111111111111', 'Projeto antigo');
insert into public.operations (id, project_id, operation_number, name) values
  ('22222222-2222-2222-2222-222222222221', '11111111-1111-1111-1111-111111111111', 1, 'Ficha A'),
  ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 1, 'Ficha B (número repetido)');
insert into public.movements (project_id, operation_id, entry_total, exit_total, recorded_at)
select '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222221', g * 100, g * 40, current_date - (2000 - g)
from generate_series(1, 1500) g;
-- valor negativo antigo (dado imperfeito)
insert into public.movements (project_id, operation_id, entry_total, exit_total, recorded_at)
values ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', -5, 0, current_date - 3);
