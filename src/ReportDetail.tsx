import { useMemo, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { addDays, money, reportDays, sumResults, todayIso } from '@/lib/calc';
import type { Movement } from '@/lib/calc';

type Project = { id: string; name: string };
type Operation = { id: string; project_id: string; operation_number: number; name: string };
type Period = '7' | '30' | 'mes' | 'tudo';

const PERIODS: { value: Period; label: string }[] = [
  { value: '7', label: '7 dias' },
  { value: '30', label: '30 dias' },
  { value: 'mes', label: 'Este mês' },
  { value: 'tudo', label: 'Tudo' },
];
const PAGE = 30;
const dayTitle = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
const hour = (iso: string) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
const title = (day: string) => { const text = dayTitle.format(new Date(`${day}T12:00:00Z`)); return text.charAt(0).toUpperCase() + text.slice(1); };
const tone = (value: number) => (value < 0 ? 'neg' : 'pos');

// Histórico de um projeto em Relatórios: dia a dia, com cada lançamento (entrada, saída e movimento).
export function ReportDetail({ project, operations, movements, net, onBack }: { project: Project; operations: Operation[]; movements: Movement[]; net: Map<string, number>; onBack: () => void }) {
  const [period, setPeriod] = useState<Period>('30');
  const [operationId, setOperationId] = useState('');
  const [shown, setShown] = useState(PAGE);
  const today = todayIso();
  const fichas = useMemo(() => operations.filter((op) => op.project_id === project.id), [operations, project.id]);
  const label = (id: string) => { const op = fichas.find((item) => item.id === id); return op ? `${String(op.operation_number).padStart(2, '0')} — ${op.name}` : 'Ficha excluída'; };
  const from = period === '7' ? addDays(today, -6) : period === '30' ? addDays(today, -29) : period === 'mes' ? `${today.slice(0, 8)}01` : undefined;
  const days = useMemo(() => reportDays(movements, net, project.id, { operationId: operationId || undefined, from, to: today }), [movements, net, project.id, operationId, from, today]);
  const total = sumResults(days);
  const launches = days.reduce((count, d) => count + d.launches.length, 0);
  const choose = (next: Period) => { setPeriod(next); setShown(PAGE); };

  return (
    <div className="report-detail">
      <button type="button" className="back-button" onClick={onBack}><ArrowLeft size={15} /> Todos os relatórios</button>
      <h2 className="report-detail-title">{project.name}</h2>

      <div className="report-filters">
        <div className="segmented" role="group" aria-label="Período">
          {PERIODS.map((item) => <button type="button" key={item.value} className={period === item.value ? 'active' : ''} aria-pressed={period === item.value} onClick={() => choose(item.value)}>{item.label}</button>)}
        </div>
        <select aria-label="Ficha" value={operationId} onChange={(event) => { setOperationId(event.target.value); setShown(PAGE); }}>
          <option value="">Todas as fichas</option>
          {fichas.map((op) => <option key={op.id} value={op.id}>{label(op.id)}</option>)}
        </select>
      </div>

      <div className={`report-summary ${tone(total)}`}>
        <div><small>Resultado do período</small><strong>{money(total)}</strong></div>
        <div><small>÷ 2</small><strong>{money(total / 2)}</strong></div>
        <div className="plain"><small>Dias</small><strong>{days.length}</strong></div>
        <div className="plain"><small>Lançamentos</small><strong>{launches}</strong></div>
      </div>

      {days.length ? days.slice(0, shown).map((d) => (
        <section className="report-day" key={d.day}>
          <div className="report-day-head">
            <div className="report-day-date"><b>{title(d.day)}</b><small>{d.launches.length} {d.launches.length === 1 ? 'lançamento' : 'lançamentos'}</small></div>
            <div className="report-day-values">
              <span><small>Resultado</small><strong className={tone(d.result)}>{money(d.result)}</strong></span>
              <span><small>÷ 2</small><strong className={tone(d.result)}>{money(d.result / 2)}</strong></span>
            </div>
          </div>
          <div className="rl-table">
            <div className="rl-row rl-header"><span>Ficha</span><span>Hora</span><span className="num">Entrada</span><span className="num">Saída</span><span className="num">Movimento</span></div>
            {d.launches.map((m) => {
              const value = net.get(m.id) ?? 0;
              return (
                <div className="rl-row" key={m.id}>
                  <span className="rl-ficha">{label(m.operation_id)}</span>
                  <span className="rl-hora" data-label="Hora">{hour(m.created_at)}</span>
                  <span className="num" data-label="Entrada">{money(m.entry_total)}</span>
                  <span className="num" data-label="Saída">{money(m.exit_total)}</span>
                  <span className="num" data-label="Movimento"><strong className={tone(value)}>{money(value)}</strong>{m.is_base && <em className="base-tag">novo jogo</em>}</span>
                </div>
              );
            })}
          </div>
        </section>
      )) : <p className="empty">Nenhum lançamento neste período.</p>}

      {days.length > shown && <button type="button" className="ghost report-more" onClick={() => setShown(shown + PAGE)}>Mostrar dias mais antigos ({days.length - shown})</button>}
    </div>
  );
}
