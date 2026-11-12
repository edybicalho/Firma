import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { describeAudit } from '@/lib/audit';
import type { AuditEntry } from '@/lib/audit';

type Named = { id: string; name: string };
type NumberedOperation = Named & { operation_number: number };

const PAGE = 100;
const when = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'medium' });
const FILTERS: { value: string; label: string }[] = [
  { value: '', label: 'Tudo' },
  { value: 'movements', label: 'Lançamentos' },
  { value: 'projects', label: 'Projetos' },
  { value: 'operations', label: 'Operações' },
  { value: 'profiles', label: 'Usuários' },
];

export function AuditLog({ projects, operations }: { projects: Named[]; operations: NumberedOperation[] }) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const [filter, setFilter] = useState('');

  const lookups = useMemo(() => ({
    projectName: (id: string) => projects.find((project) => project.id === id)?.name,
    operationLabel: (id: string) => {
      const op = operations.find((operation) => operation.id === id);
      return op ? `${String(op.operation_number).padStart(2, '0')} — ${op.name}` : undefined;
    },
  }), [projects, operations]);

  const fetchPage = useCallback(async (offset: number) => {
    setLoading(true);
    let query = supabase.from('audit_log').select('*').order('id', { ascending: false }).range(offset, offset + PAGE - 1);
    if (filter) query = query.eq('table_name', filter);
    const { data, error: loadError } = await query;
    setLoading(false);
    if (loadError) { setError('Não foi possível carregar o registro.'); return; }
    setError('');
    const rows = (data ?? []) as AuditEntry[];
    setEntries((current) => (offset === 0 ? rows : [...current, ...rows]));
    setHasMore(rows.length === PAGE);
  }, [filter]);

  useEffect(() => { void fetchPage(0); }, [fetchPage]);

  return (
    <div className="audit-log">
      <div className="users-head">
        
        <div className="audit-tools">
          <select aria-label="Filtrar registro" value={filter} onChange={(event) => setFilter(event.target.value)}>
            {FILTERS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
          <button className="ghost" onClick={() => void fetchPage(0)}><RefreshCw size={14} /> Atualizar</button>
        </div>
      </div>
      {error && <p className="auth-error" role="alert">{error}</p>}
      {entries.length ? (
        <div className="settings-ops-list">
          {entries.map((entry) => (
            <div className="settings-op-row audit-row" key={entry.id}>
              <div className="audit-meta">
                <b>{entry.username ?? 'Sistema'}</b>
                <small>{when.format(new Date(entry.happened_at))}</small>
              </div>
              <p className="audit-text">{describeAudit(entry, lookups)}</p>
            </div>
          ))}
        </div>
      ) : !loading && <p className="empty">Nenhuma alteração registrada ainda.</p>}
      {loading && <p className="empty">Carregando...</p>}
      {hasMore && !loading && <button className="ghost audit-more" onClick={() => void fetchPage(entries.length)}>Carregar mais</button>}
    </div>
  );
}
