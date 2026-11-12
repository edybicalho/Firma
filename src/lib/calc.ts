// Contas e formatos usados no app. Ficam aqui, separados da tela, para poderem ser testados.

export type Movement = {
  id: string;
  project_id: string;
  operation_id: string;
  entry_total: number;
  exit_total: number;
  recorded_at: string;
  created_at: string;
  /** Novo jogo (nova base): não soma no resultado; os próximos lançamentos comparam com este. */
  is_base?: boolean | null;
};

export const MAX_AMOUNT = 999_999_999_999.99;

// Todas as contas são feitas em centavos inteiros: assim não sobra fração de centavo
// (o computador erra contas com vírgula, como 0,1 + 0,2 = 0,30000000000000004).
export const toCents = (value: number | string | null | undefined) => Math.round(Number(value ?? 0) * 100);
export const fromCents = (cents: number) => cents / 100;

// Dia de hoje no horário de Brasília, no formato AAAA-MM-DD
export const todayIso = (now: Date = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(now);

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const money = (value: number) => brl.format(Number.isFinite(value) ? value : 0);

/**
 * Lê um valor digitado. Aceita o jeito brasileiro (1.234,56) e também ponto como
 * decimal quando não há dúvida (1234.5). "1.500" é lido como mil e quinhentos.
 * Devolve null quando o texto não é um valor válido, para o app avisar em vez de gravar zero.
 */
export function parseAmount(raw: string): number | null {
  const text = raw.replace(/R\$/gi, '').replace(/\s/g, '');
  if (!text) return null;
  let normalized: string;
  if (text.includes(',')) {
    if (!/^(\d{1,3}(\.\d{3})+|\d+),\d*$/.test(text)) return null;
    normalized = text.replace(/\./g, '').replace(',', '.');
  } else if (text.includes('.')) {
    if (/^\d{1,3}(\.\d{3})+$/.test(text)) normalized = text.replace(/\./g, '');
    else if (/^\d+\.\d{1,2}$/.test(text)) normalized = text;
    else return null;
  } else {
    if (!/^\d+$/.test(text)) return null;
    normalized = text;
  }
  const value = fromCents(toCents(normalized));
  if (!Number.isFinite(value) || value < 0 || value > MAX_AMOUNT) return null;
  return value;
}

// Valor para preencher o campo de digitação, no jeito brasileiro (1.260.000,75)
const inputFormat = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const formatAmountInput = (value: number) => inputFormat.format(Number(value));

// Chave de horário que ordena certo até o microssegundo (o banco manda, por exemplo,
// "2026-11-12T12:00:00.123456+00:00" ou, quando o microssegundo é zero, "2026-11-12T12:00:00+00:00").
// Nunca usar localeCompare aqui: ele põe "12:00:00.5" antes de "12:00:00".
export function timeKey(iso: string | null | undefined): string {
  const text = String(iso ?? '');
  const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(Z|[+-]00(?::?00)?)?$/.exec(text);
  if (m) return `${m[1]}T${m[2]}.${(m[3] ?? '').padEnd(6, '0')}`;
  const ms = Date.parse(text); // outro fuso: converte para UTC (precisão de milissegundos)
  return Number.isNaN(ms) ? '' : `${new Date(ms).toISOString().slice(0, 19)}.${String(ms % 1000).padStart(3, '0')}000`;
}
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
/** Ordem dos lançamentos: dia do lançamento, depois horário exato e, em empate, o id (o mesmo critério do banco). */
export const byDateAsc = (a: Movement, b: Movement) =>
  cmp(a.recorded_at, b.recorded_at) || cmp(timeKey(a.created_at), timeKey(b.created_at)) || cmp(a.id, b.id);
export const byDateDesc = (a: Movement, b: Movement) => byDateAsc(b, a);

/** Movimento real de um lançamento: (entrada - entrada anterior) - (saída - saída anterior).
 *  Um "novo jogo" (nova base) tem movimento zero: ela só marca o novo ponto de partida. */
export const netMovement = (current: Movement, previous?: Movement) => current.is_base ? 0 : fromCents(
  (toCents(current.entry_total) - toCents(previous?.entry_total)) -
  (toCents(current.exit_total) - toCents(previous?.exit_total)));

export type Diff = { entry: number; exit: number };

/** Para cada lançamento, quanto sobrou de entrada e de saída desde o anterior da mesma ficha
 *  (a diferença de cada um). Num "novo jogo" as duas sobras são zero. */
export function diffsById(movements: Movement[]): Map<string, Diff> {
  const result = new Map<string, Diff>();
  const byOperation = new Map<string, Movement[]>();
  for (const m of movements) {
    const list = byOperation.get(m.operation_id) ?? [];
    list.push(m);
    byOperation.set(m.operation_id, list);
  }
  for (const list of byOperation.values()) {
    list.sort(byDateAsc);
    list.forEach((m, i) => {
      const prev = list[i - 1];
      result.set(m.id, m.is_base ? { entry: 0, exit: 0 } : {
        entry: fromCents(toCents(m.entry_total) - toCents(prev?.entry_total)),
        exit: fromCents(toCents(m.exit_total) - toCents(prev?.exit_total)),
      });
    });
  }
  return result;
}

/** Para cada lançamento, o seu movimento real (comparando com o anterior da mesma operação). */
export function netById(movements: Movement[]): Map<string, number> {
  const result = new Map<string, number>();
  const byOperation = new Map<string, Movement[]>();
  for (const m of movements) {
    const list = byOperation.get(m.operation_id) ?? [];
    list.push(m);
    byOperation.set(m.operation_id, list);
  }
  for (const list of byOperation.values()) {
    list.sort(byDateAsc);
    list.forEach((m, i) => result.set(m.id, netMovement(m, list[i - 1])));
  }
  return result;
}

/** Resultado de um projeto num dia: soma dos movimentos reais lançados naquele dia. */
export function dayResult(movements: Movement[], net: Map<string, number>, projectId: string, day: string) {
  let total = 0;
  for (const m of movements) if (m.project_id === projectId && m.recorded_at === day) total += toCents(net.get(m.id));
  return fromCents(total);
}

/** Resultado do dia de cada operação (ficha) de um projeto. Fichas sem lançamento no dia ficam de fora. */
export function operationDayResults(movements: Movement[], net: Map<string, number>, projectId: string, day: string) {
  const cents = new Map<string, number>();
  for (const m of movements) {
    if (m.project_id !== projectId || m.recorded_at !== day) continue;
    cents.set(m.operation_id, (cents.get(m.operation_id) ?? 0) + toCents(net.get(m.id)));
  }
  return new Map([...cents].map(([op, c]) => [op, fromCents(c)]));
}

/** Soma (ou subtrai) dias de uma data AAAA-MM-DD. */
export function addDays(day: string, n: number) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export type ReportDay = { day: string; result: number; launches: Movement[] };

/** Histórico de um projeto, dia a dia (do mais novo para o mais antigo), para a tela de Relatórios.
 *  Pode filtrar por ficha e por período (datas inclusivas). */
export function reportDays(movements: Movement[], net: Map<string, number>, projectId: string, filter: { operationId?: string; from?: string; to?: string } = {}): ReportDay[] {
  const days = new Map<string, { cents: number; launches: Movement[] }>();
  for (const m of movements) {
    if (m.project_id !== projectId) continue;
    if (filter.operationId && m.operation_id !== filter.operationId) continue;
    if (filter.from && m.recorded_at < filter.from) continue;
    if (filter.to && m.recorded_at > filter.to) continue;
    const entry = days.get(m.recorded_at) ?? { cents: 0, launches: [] };
    entry.cents += toCents(net.get(m.id));
    entry.launches.push(m);
    days.set(m.recorded_at, entry);
  }
  return [...days.entries()]
    .sort((a, b) => cmp(b[0], a[0]))
    .map(([day, { cents, launches }]) => ({ day, result: fromCents(cents), launches: launches.sort(byDateDesc) }));
}

/** Soma exata (em centavos) dos resultados de vários dias. */
export const sumResults = (days: ReportDay[]) => fromCents(days.reduce((total, d) => total + toCents(d.result), 0));

/** Último dia com lançamento em cada projeto. */
export function lastDayByProject(movements: Movement[]) {
  const acc: Record<string, string> = {};
  for (const m of movements) if (!acc[m.project_id] || m.recorded_at > acc[m.project_id]) acc[m.project_id] = m.recorded_at;
  return acc;
}

/** Planilha (CSV) com todos os lançamentos, pronta para abrir no Excel em português. */
export function movementsCsv(
  movements: Movement[],
  projectName: (id: string) => string,
  operationLabel: (id: string) => string,
) {
  const net = netById(movements);
  const diffs = diffsById(movements);
  // Textos que começam com = + - @ viram fórmula no Excel; o apóstrofo impede isso
  const cell = (value: string) => `"${(/^[=+\-@\t\r]/.test(value) ? `'${value}` : value).replace(/"/g, '""')}"`;
  const num = (value: number) => Number(value).toFixed(2).replace('.', ',');
  const rows = [...movements].sort(byDateAsc).map((m) => [
    cell(projectName(m.project_id)),
    cell(operationLabel(m.operation_id)),
    m.recorded_at.split('-').reverse().join('/'),
    num(m.entry_total),
    num(m.exit_total),
    num(diffs.get(m.id)?.entry ?? 0),
    num(diffs.get(m.id)?.exit ?? 0),
    num(net.get(m.id) ?? 0),
    m.is_base ? 'Sim' : 'Não',
  ].join(';'));
  const header = ['Projeto', 'Operação', 'Data', 'Entrada acumulada', 'Saída acumulada', 'Sobra de entrada', 'Sobra de saída', 'Movimento líquido', 'Novo jogo'].join(';');
  return `\uFEFF${[header, ...rows].join('\r\n')}\r\n`;
}
