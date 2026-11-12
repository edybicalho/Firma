// Contas e formatos usados no app. Ficam aqui, separados da tela, para poderem ser testados.

export type Movement = {
  id: string;
  project_id: string;
  operation_id: string;
  entry_total: number;
  exit_total: number;
  recorded_at: string;
  created_at: string;
  /** Nova base: não soma no resultado; os próximos lançamentos comparam com este. */
  is_base?: boolean | null;
};

export const MAX_AMOUNT = 999_999_999_999.99;

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
  const value = Math.round(Number(normalized) * 100) / 100;
  if (!Number.isFinite(value) || value < 0 || value > MAX_AMOUNT) return null;
  return value;
}

// Valor para preencher o campo de digitação, no jeito brasileiro (1234,50)
export const formatAmountInput = (value: number) => Number(value).toFixed(2).replace('.', ',');

const byDateAsc = (a: Movement, b: Movement) =>
  `${a.recorded_at}${a.created_at}`.localeCompare(`${b.recorded_at}${b.created_at}`);
export const byDateDesc = (a: Movement, b: Movement) => byDateAsc(b, a);

/** Movimento real de um lançamento: (entrada - entrada anterior) - (saída - saída anterior).
 *  Uma "nova base" tem movimento zero: ela só marca o novo ponto de partida. */
export const netMovement = (current: Movement, previous?: Movement) => current.is_base ? 0 :
  (Number(current.entry_total) - (previous ? Number(previous.entry_total) : 0)) -
  (Number(current.exit_total) - (previous ? Number(previous.exit_total) : 0));

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
  for (const m of movements) if (m.project_id === projectId && m.recorded_at === day) total += net.get(m.id) ?? 0;
  return Math.round(total * 100) / 100;
}

/** Resultado do dia de cada operação (ficha) de um projeto. Fichas sem lançamento no dia ficam de fora. */
export function operationDayResults(movements: Movement[], net: Map<string, number>, projectId: string, day: string) {
  const result = new Map<string, number>();
  for (const m of movements) {
    if (m.project_id !== projectId || m.recorded_at !== day) continue;
    result.set(m.operation_id, Math.round(((result.get(m.operation_id) ?? 0) + (net.get(m.id) ?? 0)) * 100) / 100);
  }
  return result;
}

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
  // Textos que começam com = + - @ viram fórmula no Excel; o apóstrofo impede isso
  const cell = (value: string) => `"${(/^[=+\-@\t\r]/.test(value) ? `'${value}` : value).replace(/"/g, '""')}"`;
  const num = (value: number) => Number(value).toFixed(2).replace('.', ',');
  const rows = [...movements].sort(byDateAsc).map((m) => [
    cell(projectName(m.project_id)),
    cell(operationLabel(m.operation_id)),
    m.recorded_at.split('-').reverse().join('/'),
    num(m.entry_total),
    num(m.exit_total),
    num(net.get(m.id) ?? 0),
    m.is_base ? 'Sim' : 'Não',
  ].join(';'));
  const header = ['Projeto', 'Operação', 'Data', 'Entrada acumulada', 'Saída acumulada', 'Movimento líquido', 'Nova base'].join(';');
  return `\uFEFF${[header, ...rows].join('\r\n')}\r\n`;
}
