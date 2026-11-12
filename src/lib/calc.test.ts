import { describe, expect, it } from 'vitest';
import { dayResult, formatAmountInput, lastDayByProject, movementsCsv, netById, operationDayResults, parseAmount, todayIso } from '@/lib/calc';
import type { Movement } from '@/lib/calc';

describe('parseAmount: leitura dos valores digitados', () => {
  it.each([
    ['1.234,56', 1234.56],
    ['1234,56', 1234.56],
    ['1234,5', 1234.5],
    ['1.500', 1500],
    ['1.234.567,89', 1234567.89],
    ['1.234.567', 1234567],
    ['1500', 1500],
    ['1500.25', 1500.25],
    ['10.5', 10.5],
    ['0', 0],
    ['0,00', 0],
    ['R$ 2.000,00', 2000],
    [' 300 ', 300],
    ['12,345', 12.35],
    ['100,', 100],
  ])('"%s" vira %s', (text, value) => {
    expect(parseAmount(text)).toBe(value);
  });

  it.each(['', '   ', 'abc', '-10', '1,2,3', '1.2.3', '12.3456', '1.23,45', '10a', '1e5', '9.999.999.999.999,00'])(
    '"%s" é recusado (o app avisa em vez de gravar zero)',
    (text) => {
      expect(parseAmount(text)).toBeNull();
    },
  );

  it('o valor que o app preenche no campo é lido de volta igual', () => {
    for (const value of [0, 1, 1.5, 1500, 1234.56, 999999.99, 0.1 + 0.2]) {
      expect(parseAmount(formatAmountInput(value))).toBe(Math.round(value * 100) / 100);
    }
  });
});

describe('todayIso: dia de hoje no horário de Brasília', () => {
  it('às 22h de Brasília ainda é o mesmo dia (em UTC já seria o dia seguinte)', () => {
    expect(todayIso(new Date('2026-11-12T01:30:00Z'))).toBe('2026-11-11');
  });
  it('à meia-noite e meia de Brasília já é o dia seguinte', () => {
    expect(todayIso(new Date('2026-11-12T03:30:00Z'))).toBe('2026-11-12');
  });
});

const mv = (id: string, operation: string, entry: number, exit: number, day: string, at = '10:00', project = 'p1'): Movement => ({
  id, project_id: project, operation_id: operation, entry_total: entry, exit_total: exit, recorded_at: day, created_at: `${day}T${at}:00Z`,
});

describe('cálculo dos resultados', () => {
  const movements = [
    mv('a1', 'op1', 1000, 400, '2026-11-10'),
    mv('a2', 'op1', 1500, 500, '2026-11-11'),
    mv('a3', 'op1', 1800, 700, '2026-11-12'),
    mv('b1', 'op2', 200, 50, '2026-11-11'),
    mv('b2', 'op2', 260, 50, '2026-11-12', '09:00'),
    mv('b3', 'op2', 300, 60, '2026-11-12', '15:00'),
    mv('c1', 'op3', 999, 0, '2026-11-12', '10:00', 'p2'),
  ];
  const net = netById(movements);

  it('primeiro lançamento de uma operação conta inteiro', () => {
    expect(net.get('a1')).toBe(600);
    expect(net.get('b1')).toBe(150);
  });
  it('os seguintes contam só a diferença para o anterior da mesma operação', () => {
    expect(net.get('a2')).toBe(500 - 100);
    expect(net.get('a3')).toBe(300 - 200);
    expect(net.get('b2')).toBe(60);
    expect(net.get('b3')).toBe(40 - 10);
  });
  it('a ordem em que os lançamentos chegam do banco não muda o resultado', () => {
    const shuffled = netById([...movements].reverse());
    for (const [id, value] of net) expect(shuffled.get(id)).toBe(value);
  });
  it('resultado do dia soma todas as operações do projeto, só daquele dia', () => {
    expect(dayResult(movements, net, 'p1', '2026-11-12')).toBe(100 + 60 + 30);
    expect(dayResult(movements, net, 'p1', '2026-11-11')).toBe(400 + 150);
    expect(dayResult(movements, net, 'p2', '2026-11-12')).toBe(999);
    expect(dayResult(movements, net, 'p1', '2026-11-01')).toBe(0);
  });
  it('centavos não acumulam erro de arredondamento', () => {
    const cents = [mv('x1', 'o', 0.1, 0, '2026-01-01'), mv('x2', 'o', 0.3, 0, '2026-01-02'), mv('y1', 'q', 0.2, 0, '2026-01-02')];
    expect(dayResult(cents, netById(cents), 'p1', '2026-01-02')).toBe(0.4);
  });
  it('último dia com lançamento de cada projeto', () => {
    expect(lastDayByProject(movements)).toEqual({ p1: '2026-11-12', p2: '2026-11-12' });
  });
  it('funciona com muitos lançamentos (mais de 1.000) rapidamente', () => {
    const many: Movement[] = [];
    for (let i = 0; i < 20000; i++) many.push(mv(`m${i}`, `op${i % 50}`, i * 10, i, `2026-${String((i % 12) + 1).padStart(2, '0')}-01`, String(i % 24).padStart(2, '0') + ':00'));
    const start = performance.now();
    const n = netById(many);
    dayResult(many, n, 'p1', '2026-05-01');
    expect(n.size).toBe(20000);
    expect(performance.now() - start).toBeLessThan(1000);
  });
});

describe('planilha de lançamentos (cópia de segurança)', () => {
  const movements = [mv('a1', 'op1', 1000.5, 400, '2026-11-10'), mv('a2', 'op1', 1500, 500, '2026-11-11')];
  const csv = movementsCsv(movements, () => 'Obra "Norte"', () => '01 — Fundação');
  it('abre no Excel em português (acentos, ponto e vírgula, vírgula decimal)', () => {
    expect(csv.startsWith('﻿Projeto;Operação;Data')).toBe(true);
    expect(csv).toContain('"Obra ""Norte""";"01 — Fundação";10/11/2026;1000,50;400,00;600,50');
    expect(csv).toContain(';11/11/2026;1500,00;500,00;399,50');
  });
  it('nomes que começam com = não viram fórmula no Excel', () => {
    const evil = movementsCsv(movements, () => '=HYPERLINK("http://x")', () => '+1');
    expect(evil).toContain(`"'=HYPERLINK(""http://x"")";"'+1"`);
  });
});

describe('resultado do dia por ficha', () => {
  const movements = [
    mv('a1', 'op1', 1000, 400, '2026-11-11'),
    mv('a2', 'op1', 1500, 500, '2026-11-12'),
    mv('b1', 'op2', 200, 50, '2026-11-12', '09:00'),
    mv('b2', 'op2', 260, 300, '2026-11-12', '15:00'),
    mv('c1', 'op3', 100, 0, '2026-11-11'),
    mv('d1', 'op9', 999, 0, '2026-11-12', '10:00', 'p2'),
  ];
  const net = netById(movements);
  const results = operationDayResults(movements, net, 'p1', '2026-11-12');
  it('cada ficha tem o próprio resultado do dia', () => {
    expect(results.get('op1')).toBe(400);
    expect(results.get('op2')).toBe(150 + (60 - 250));
  });
  it('ficha sem lançamento no dia fica sem resultado', () => {
    expect(results.has('op3')).toBe(false);
  });
  it('não mistura fichas de outro projeto', () => {
    expect(results.has('op9')).toBe(false);
  });
  it('a soma das fichas é o resultado do dia do projeto', () => {
    expect([...results.values()].reduce((a, b) => a + b, 0)).toBe(dayResult(movements, net, 'p1', '2026-11-12'));
  });
});
