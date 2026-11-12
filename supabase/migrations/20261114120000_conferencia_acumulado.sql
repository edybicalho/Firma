-- Conferência do acumulado dentro do banco.
-- O valor acumulado de uma ficha não pode diminuir em relação ao último lançamento dela,
-- a não ser num "Novo jogo". A tela já conferia isso; agora o banco também confere, e salva
-- uma pessoa de cada vez por ficha (duas pessoas salvando no mesmo instante não passam juntas).
-- Lançamentos com data anterior ao último (correção feita pelo administrador) não são bloqueados.
-- Não muda nenhum lançamento já existente. Pode rodar mais de uma vez sem problema.

create or replace function public.movements_check_accumulated() returns trigger
language plpgsql set search_path = public as $$
declare
  v_last record;
begin
  -- Uma pessoa de cada vez por ficha, até o fim do salvamento
  perform pg_advisory_xact_lock(hashtextextended('movements:' || new.operation_id::text, 0));

  if coalesce(new.is_base, false) then
    return new;
  end if;

  select entry_total, exit_total, recorded_at into v_last
    from public.movements
   where operation_id = new.operation_id
   order by recorded_at desc, created_at desc, id desc
   limit 1;

  if found and new.recorded_at >= v_last.recorded_at
     and (new.entry_total < v_last.entry_total or new.exit_total < v_last.exit_total) then
    raise exception 'acumulado_menor: o acumulado não pode ser menor que o do último lançamento desta ficha (use Novo jogo)'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
revoke all on function public.movements_check_accumulated() from public, anon, authenticated;

-- Roda depois de movements_before_write (os gatilhos rodam em ordem alfabética)
drop trigger if exists movements_check_accumulated on public.movements;
create trigger movements_check_accumulated
  before insert on public.movements
  for each row execute function public.movements_check_accumulated();
