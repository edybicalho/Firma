import { describe, expect, it } from 'vitest';
import { fromCents, toCents, dayResult, formatAmountInput, lastDayByProject, movementsCsv, netById, diffsById, anchorsFrom, reportDays, sumResults, addDays, operationDayResults, parseAmount, todayIso } from '@/lib/calc';
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
    expect(csv).toContain('"Obra ""Norte""";"01 — Fundação";10/11/2026;1000,50;400,00;1000,50;400,00;600,50;Não');
    expect(csv).toContain(';11/11/2026;1500,00;500,00;499,50;100,00;399,50;Não');
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

describe('lançamentos no mesmo dia', () => {
  const all = [
    mv('a1', 'op1', 1000, 400, '2026-11-05'),
    mv('a2', 'op1', 1500, 500, '2026-11-10', '09:00'),
    mv('a2b', 'op1', 1600, 650, '2026-11-10', '15:00'),
  ];
  const net = netById(all);
  it('cada lançamento tem o próprio movimento (comparado com o anterior, mesmo no mesmo dia)', () => {
    expect(net.get('a2')).toBe(400);
    expect(net.get('a2b')).toBe(-50);
  });
  it('o resultado do dia da ficha soma os dois', () => {
    expect(operationDayResults(all, net, 'p1', '2026-11-10').get('op1')).toBe(350);
  });
});

describe('novo jogo (nova base)', () => {
  const base = (m: Movement): Movement => ({ ...m, is_base: true });
  const all = [
    mv('a1', 'op1', 5000, 2000, '2026-11-10'),
    base(mv('b1', 'op1', 100, 50, '2026-11-11', '08:00')),
    mv('a2', 'op1', 400, 150, '2026-11-11', '17:00'),
    mv('a3', 'op1', 900, 300, '2026-11-12'),
  ];
  const net = netById(all);
  it('o lançamento de nova base não soma (movimento zero), mesmo com valor menor que o anterior', () => {
    expect(net.get('b1')).toBe(0);
  });
  it('os próximos lançamentos comparam com a nova base', () => {
    expect(net.get('a2')).toBe((400 - 100) - (150 - 50));
    expect(net.get('a3')).toBe((900 - 400) - (300 - 150));
  });
  it('o resultado do dia ignora a nova base e soma só os outros', () => {
    expect(dayResult(all, net, 'p1', '2026-11-11')).toBe(200);
  });
  it('a planilha indica qual lançamento é nova base', () => {
    const csv = movementsCsv(all, () => 'P', () => 'O');
    expect(csv).toContain(';11/11/2026;100,00;50,00;0,00;0,00;0,00;Sim');
  });
});

describe('histórico de relatórios (dia a dia)', () => {
  const all = [
    mv('a1', 'op1', 1000, 400, '2026-11-05'),
    mv('a2', 'op1', 1500, 500, '2026-11-10', '09:00'),
    mv('a3', 'op1', 1600, 650, '2026-11-10', '15:00'),
    mv('b1', 'op2', 200, 50, '2026-11-10', '10:00'),
    mv('b2', 'op2', 300, 60, '2026-11-12'),
    mv('x1', 'op9', 999, 0, '2026-11-10', '10:00', 'p2'),
  ];
  const net = netById(all);
  it('agrupa por dia, do mais novo para o mais antigo, com o resultado de cada dia', () => {
    const days = reportDays(all, net, 'p1');
    expect(days.map((d) => d.day)).toEqual(['2026-11-12', '2026-11-10', '2026-11-05']);
    expect(days[1].result).toBe(400 + (-50) + 150);
    expect(days[1].launches.map((m) => m.id)).toEqual(['a3', 'b1', 'a2']);
  });
  it('filtra por ficha e por período', () => {
    expect(reportDays(all, net, 'p1', { operationId: 'op2' }).map((d) => d.day)).toEqual(['2026-11-12', '2026-11-10']);
    expect(reportDays(all, net, 'p1', { from: '2026-11-06', to: '2026-11-11' }).map((d) => d.day)).toEqual(['2026-11-10']);
  });
  it('não mistura outros projetos', () => {
    expect(reportDays(all, net, 'p1').flatMap((d) => d.launches).some((m) => m.project_id === 'p2')).toBe(false);
  });
  it('resultado do período é a soma exata dos dias', () => {
    const days = reportDays(all, net, 'p1');
    expect(sumResults(days)).toBe(600 + 500 + 90);
  });
  it('conta de datas atravessa mês e ano', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2026-11-12', -29)).toBe('2026-10-14');
  });
});

describe('sobra de entrada e de saída de cada lançamento', () => {
  const all = [
    mv('a1', 'op1', 1000000.5, 400000.25, '2026-11-05'),
    mv('a2', 'op1', 1500000.75, 500000.5, '2026-11-10'),
    { ...mv('a3', 'op1', 100, 50, '2026-11-11'), is_base: true },
    mv('a4', 'op1', 400, 90, '2026-11-12'),
  ];
  const diffs = diffsById(all);
  const net = netById(all);
  it('é a diferença para o lançamento anterior da mesma ficha', () => {
    expect(diffs.get('a1')).toEqual({ entry: 1000000.5, exit: 400000.25 });
    expect(diffs.get('a2')).toEqual({ entry: 500000.25, exit: 100000.25 });
    expect(diffs.get('a4')).toEqual({ entry: 300, exit: 40 });
  });
  it('novo jogo: sobras zero', () => {
    expect(diffs.get('a3')).toEqual({ entry: 0, exit: 0 });
  });
  it('movimento = sobra de entrada - sobra de saída, sempre', () => {
    for (const m of all) expect(net.get(m.id)).toBe(fromCents(toCents(diffs.get(m.id)!.entry) - toCents(diffs.get(m.id)!.exit)));
  });
});

describe('limpeza de 30 dias: ponto de comparação (âncora)', () => {
  const anchors = anchorsFrom([{ operation_id: 'op1', entry_total: 1200000, exit_total: 450000, recorded_at: '2026-10-14' }], [{ id: 'op1', project_id: 'p1' }]);
  const restantes = [mv('a1', 'op1', 1260000.75, 452000.5, '2026-10-15'), mv('a2', 'op1', 1300000, 460000, '2026-11-08')];
  const all = [...restantes, ...anchors];
  const net = netById(all);
  it('o primeiro lançamento que sobrou compara com o último apagado (não conta o valor inteiro)', () => {
    expect(net.get('a1')).toBe((1260000.75 - 1200000) - (452000.5 - 450000));
    expect(diffsById(all).get('a1')).toEqual({ entry: 60000.75, exit: 2000.5 });
  });
  it('sem a âncora, o primeiro contaria o valor inteiro (o problema que ela evita)', () => {
    expect(netById(restantes).get('a1')).toBe(1260000.75 - 452000.5);
  });
  it('a âncora nunca aparece: nem no resultado do dia, nem no histórico, nem na última alteração', () => {
    expect(dayResult(all, net, 'p1', '2026-10-14')).toBe(0);
    expect(operationDayResults(all, net, 'p1', '2026-10-14').size).toBe(0);
    expect(reportDays(all, net, 'p1').flatMap((d) => d.launches).some((m) => m.is_anchor)).toBe(false);
    expect(lastDayByProject(anchors)).toEqual({});
  });
  it('a planilha usa a âncora nas contas mas não lista ela', () => {
    const csv = movementsCsv(restantes, () => 'P', () => 'O', anchors);
    expect(csv).toContain(';15/10/2026;1260000,75;452000,50;60000,75;2000,50;58000,25;Não');
    expect(csv.split('\r\n').filter(Boolean)).toHaveLength(3);
  });
  it('âncora de ficha que não existe mais é ignorada', () => {
    expect(anchorsFrom([{ operation_id: 'sumiu', entry_total: 1, exit_total: 1, recorded_at: '2026-01-01' }], [])).toEqual([]);
  });
});
