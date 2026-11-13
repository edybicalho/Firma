// Conferência rigorosa das contas, com valores na casa dos milhões.
// Cada resultado do app é comparado com uma conta de referência feita em centavos inteiros (exata).
import { describe, expect, it } from 'vitest';
import { byDateAsc, dayResult, halfOf, formatAmountInput, netById, operationDayResults, parseAmount, timeKey } from '@/lib/calc';
import type { Movement } from '@/lib/calc';

// Gerador de números aleatórios com semente fixa: o teste é sempre o mesmo
function rng(seed: number) { return () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }; }
const reais = (c: bigint) => Number(c) / 100;

type Ref = { m: Movement; netCents: bigint };

function gerar(seed: number, fichas: number, dias: number, maxPorDia: number) {
  const r = rng(seed);
  const refs: Ref[] = [];
  for (let f = 0; f < fichas; f++) {
    let entrada = BigInt(Math.floor(r() * 500_000_000)); // até R$ 5 milhões de partida
    let saida = BigInt(Math.floor(r() * 200_000_000));
    let anteriorE = 0n, anteriorS = 0n, primeiro = true;
    for (let d = 0; d < dias; d++) {
      const day = new Date(Date.UTC(2026, 0, 1 + d)).toISOString().slice(0, 10);
      const n = Math.floor(r() * (maxPorDia + 1));
      for (let k = 0; k < n; k++) {
        const novoJogo = !primeiro && r() < 0.05;
        if (novoJogo) { entrada = BigInt(Math.floor(r() * 10_000_000)); saida = BigInt(Math.floor(r() * 5_000_000)); }
        else { entrada += BigInt(Math.floor(r() * 25_000_000)); saida += BigInt(Math.floor(r() * 9_000_000)); }
        const netCents = novoJogo ? 0n : (entrada - anteriorE) - (saida - anteriorS);
        const hh = String(8 + k).padStart(2, '0');
        refs.push({ netCents, m: { id: `f${f}-${d}-${k}`, project_id: f % 2 ? 'p2' : 'p1', operation_id: `op${f}`, entry_total: reais(entrada), exit_total: reais(saida), recorded_at: day, created_at: `${day}T${hh}:00:00.${String(k).padStart(3, '0')}+00:00`, is_base: novoJogo } });
        anteriorE = entrada; anteriorS = saida; primeiro = false;
      }
    }
  }
  return refs;
}

describe('contas com milhões, comparadas com a conta exata em centavos', () => {
  const refs = gerar(20261112, 12, 120, 3);
  const movements = refs.map((x) => x.m).sort(() => 0.5 - Math.random()); // ordem bagunçada, como pode vir do banco
  const net = netById(movements);

  it(`movimento de cada lançamento (${refs.length} lançamentos) bate centavo por centavo`, () => {
    const errados = refs.filter((x) => Math.round((net.get(x.m.id) ?? NaN) * 100) !== Number(x.netCents) || Math.abs((net.get(x.m.id) ?? 0) - reais(x.netCents)) > 1e-6);
    expect(errados.slice(0, 3).map((x) => [x.m.id, net.get(x.m.id), reais(x.netCents)])).toEqual([]);
  });

  it('o valor guardado de cada movimento já é exato em centavos (sem "sobras" como ,650000002)', () => {
    const tortos = refs.filter((x) => (net.get(x.m.id) ?? 0) !== reais(x.netCents));
    expect(tortos.slice(0, 3).map((x) => [x.m.id, net.get(x.m.id), reais(x.netCents)])).toEqual([]);
  });

  it('resultado do dia de cada projeto e de cada ficha bate em todos os dias', () => {
    const dias = [...new Set(refs.map((x) => x.m.recorded_at))];
    const erros: unknown[] = [];
    for (const day of dias) for (const p of ['p1', 'p2']) {
      const exato = refs.filter((x) => x.m.project_id === p && x.m.recorded_at === day).reduce((a, x) => a + x.netCents, 0n);
      if (dayResult(movements, net, p, day) !== reais(exato)) erros.push([p, day, dayResult(movements, net, p, day), reais(exato)]);
      const fichas = operationDayResults(movements, net, p, day);
      for (const [op, valor] of fichas) {
        const exatoFicha = refs.filter((x) => x.m.operation_id === op && x.m.recorded_at === day).reduce((a, x) => a + x.netCents, 0n);
        if (valor !== reais(exatoFicha)) erros.push([op, day, valor, reais(exatoFicha)]);
      }
      // a soma das fichas é igual ao resultado do projeto
      const soma = [...fichas.values()].reduce((a, v) => a + BigInt(Math.round(v * 100)), 0n);
      if (fichas.size && reais(soma) !== dayResult(movements, net, p, day)) erros.push(['soma das fichas', p, day]);
    }
    expect(erros.slice(0, 3)).toEqual([]);
  });

  it('÷ 2 em centavos: meio centavo arredonda para longe do zero, em 100 mil valores aleatórios', () => {
    expect(halfOf(0.03)).toBe(0.02); expect(halfOf(-0.03)).toBe(-0.02); expect(halfOf(0.01)).toBe(0.01); expect(halfOf(0)).toBe(0);
    expect(halfOf(1234567.89)).toBe(617283.95); expect(halfOf(9999999.99)).toBe(5000000);
    const r = rng(5);
    for (let i = 0; i < 100000; i++) {
      const c = BigInt(Math.floor(r() * 2e11)) - 100000000000n; // -R$ 1 bilhão a +R$ 1 bilhão
      const esperado = c >= 0n ? (c + 1n) / 2n : -((-c + 1n) / 2n);
      if (halfOf(Number(c) / 100) !== Number(esperado) / 100) throw new Error(`÷ 2 errado para ${Number(c) / 100}`);
    }
  });
  it('o ÷ 2 de qualquer resultado em milhões aparece certo (meio centavo arredonda para cima)', () => {
    const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
    expect(brl.format(1234567.89 / 2)).toBe('R$ 617.283,95'); // 617.283,945
    expect(brl.format(9999999.99 / 2)).toBe('R$ 5.000.000,00'); // 4.999.999,995
    expect(brl.format(-1234567.89 / 2)).toBe('-R$ 617.283,95');
  });
});

describe('digitação de valores em milhões', () => {
  it('o campo vem preenchido com pontos de milhar', () => {
    expect(formatAmountInput(1260000.75)).toBe('1.260.000,75');
    expect(formatAmountInput(999.5)).toBe('999,50');
    expect(formatAmountInput(0)).toBe('0,00');
  });
  it('movimento que deveria dar zero dá zero de verdade (não "-R$ 0,00")', () => {
    const a: Movement = { id: 'a', project_id: 'p', operation_id: 'o', entry_total: 0.1 + 0.2, exit_total: 0.3, recorded_at: '2026-01-01', created_at: '1' };
    const b: Movement = { ...a, id: 'b', entry_total: 0.3, exit_total: 0.1 + 0.2, recorded_at: '2026-01-02' };
    const n = netById([a, b]);
    expect(Object.is(n.get('b'), 0)).toBe(true);
  });
  it.each([
    ['1.234.567,89', 1234567.89], ['1234567,89', 1234567.89], ['1234567.89', 1234567.89], ['1.234.567', 1234567],
    ['9.999.999.999,99', 9999999999.99], ['999.999.999.999,99', 999999999999.99], ['12.345.678,9', 12345678.9],
  ])('"%s" vira %s', (texto, valor) => expect(parseAmount(texto)).toBe(valor));

  it('o valor que o app preenche no campo é lido de volta exatamente igual (20 mil valores aleatórios)', () => {
    const r = rng(7);
    const errados: number[] = [];
    for (let i = 0; i < 20000; i++) {
      const v = Math.floor(r() * 99_999_999_999) / 100; // até ~R$ 1 bilhão
      if (parseAmount(formatAmountInput(v)) !== v) errados.push(v);
    }
    expect(errados.slice(0, 5)).toEqual([]);
  });
});

describe('ordem dos lançamentos (o movimento depende dela)', () => {
  const base = { project_id: 'p', operation_id: 'o', recorded_at: '2026-11-12' };
  it('horário sem fração vem antes do mesmo horário com fração', () => {
    expect(timeKey('2026-11-12T12:00:00+00:00') < timeKey('2026-11-12T12:00:00.5+00:00')).toBe(true);
    expect(timeKey('2026-11-12T12:00:00.000001+00:00') > timeKey('2026-11-12T12:00:00+00:00')).toBe(true);
    expect(timeKey('2026-11-12T12:00:00.45+00:00') < timeKey('2026-11-12T12:00:00.5+00:00')).toBe(true);
    expect(timeKey('2026-11-12T09:00:00-03:00')).toBe(timeKey('2026-11-12T12:00:00Z'));
  });
  it('empate exato: o resultado não depende da ordem em que o banco devolve', () => {
    const a = { ...base, created_at: '2026-11-12T12:00:00+00:00', id: 'aaa', entry_total: 100, exit_total: 0 };
    const b = { ...base, created_at: '2026-11-12T12:00:00+00:00', id: 'bbb', entry_total: 300, exit_total: 0 };
    const n1 = netById([a, b]), n2 = netById([b, a]);
    expect([n1.get('aaa'), n1.get('bbb')]).toEqual([n2.get('aaa'), n2.get('bbb')]);
  });
  it('mil embaralhadas diferentes dão sempre os mesmos movimentos', () => {
    const r = rng(99); const movs: Movement[] = [];
    for (let i = 0; i < 60; i++) movs.push({ ...base, operation_id: `o${i % 3}`, id: `m${i}`, created_at: `2026-11-12T12:00:0${i % 3}${i % 2 ? '' : '.5'}+00:00`, entry_total: Math.floor(r() * 1e9) / 100, exit_total: Math.floor(r() * 1e8) / 100 });
    const referencia = netById(movs);
    for (let k = 0; k < 1000; k++) {
      const n = netById([...movs].sort(() => r() - 0.5));
      for (const m of movs) if (n.get(m.id) !== referencia.get(m.id)) throw new Error(`mudou em ${m.id}`);
    }
    expect([...movs].sort(byDateAsc).map((m) => m.id)).toEqual([...movs].reverse().sort(byDateAsc).map((m) => m.id));
  });
});
