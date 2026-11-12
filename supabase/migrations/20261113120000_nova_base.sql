-- Nova base: lançamento que só define um novo ponto de partida (por exemplo, quando o
-- contador recomeça). O movimento dele não entra no resultado do dia; os próximos
-- lançamentos da ficha passam a ser comparados com ele.
-- Pode rodar mais de uma vez sem problema. Não muda nenhum lançamento já existente.
alter table public.movements add column if not exists is_base boolean not null default false;
comment on column public.movements.is_base is 'Nova base: não soma no resultado do dia; os próximos lançamentos comparam com este.';
