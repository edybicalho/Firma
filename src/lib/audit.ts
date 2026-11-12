import { money } from '@/lib/calc';

// Uma linha do registro de alterações (tabela audit_log do banco)
export type AuditEntry = {
  id: number;
  happened_at: string;
  user_id: string | null;
  username: string | null;
  table_name: string;
  action: string;
  row_id: string | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
};

export type AuditLookups = {
  projectName: (id: string) => string | undefined;
  operationLabel: (id: string) => string | undefined;
};

const str = (value: unknown) => (value === null || value === undefined ? '' : String(value));
const num = (value: unknown) => Number(value ?? 0);
const day = (value: unknown) => str(value).split('-').reverse().join('/');
const opLabel = (row: Record<string, unknown>) => `${String(row.operation_number ?? '').padStart(2, '0')} — ${str(row.name)}`;
const roleName = (value: unknown) => (value === 'admin' ? 'administrador' : 'operador');

/** Frase em português que explica o que a pessoa fez. */
export function describeAudit(entry: AuditEntry, lookups: AuditLookups): string {
  const before = entry.old_data ?? {};
  const after = entry.new_data ?? {};
  const row = entry.action === 'DELETE' ? before : after;
  const project = (id: unknown) => lookups.projectName(str(id)) ?? 'projeto excluído';
  const operation = (id: unknown) => lookups.operationLabel(str(id)) ?? 'operação excluída';

  switch (entry.table_name) {
    case 'projects': {
      if (entry.action === 'INSERT') return `Criou o projeto "${str(row.name)}"`;
      if (entry.action === 'DELETE') return `Excluiu o projeto "${str(row.name)}" (com as operações e lançamentos dele)`;
      const changes: string[] = [];
      if (before.name !== after.name) changes.push(`renomeou o projeto "${str(before.name)}" para "${str(after.name)}"`);
      if (before.notes !== after.notes) changes.push(`alterou as observações do projeto "${str(after.name)}"`);
      if (!changes.length) changes.push(`alterou o projeto "${str(after.name)}"`);
      return capitalize(changes.join(' e '));
    }
    case 'operations': {
      if (entry.action === 'INSERT') return `Criou a operação ${opLabel(row)} no projeto "${project(row.project_id)}"`;
      if (entry.action === 'DELETE') return `Excluiu a operação ${opLabel(row)} do projeto "${project(row.project_id)}" (com os lançamentos dela)`;
      return `Alterou a operação ${opLabel(before)} para ${opLabel(after)} no projeto "${project(after.project_id)}"`;
    }
    case 'movements': {
      const where = `${project(row.project_id)} / ${operation(row.operation_id)}`;
      if (entry.action === 'INSERT' && row.is_base) return `Lançou um novo jogo em ${where}: entrada ${money(num(row.entry_total))}, saída ${money(num(row.exit_total))} (dia ${day(row.recorded_at)}; não soma no resultado)`;
      if (entry.action === 'INSERT') return `Lançou em ${where}: entrada ${money(num(row.entry_total))}, saída ${money(num(row.exit_total))} (dia ${day(row.recorded_at)})`;
      if (entry.action === 'DELETE') return `Excluiu o lançamento de ${day(row.recorded_at)} em ${where} (entrada ${money(num(row.entry_total))}, saída ${money(num(row.exit_total))})`;
      return `Corrigiu o lançamento de ${day(before.recorded_at)} em ${where}: entrada ${money(num(before.entry_total))} → ${money(num(after.entry_total))}, saída ${money(num(before.exit_total))} → ${money(num(after.exit_total))}`;
    }
    case 'profiles': {
      if (entry.action === 'SENHA') return `Trocou a senha do usuário ${str(before.username)}`;
      if (entry.action === 'INSERT') return `Criou o usuário ${str(row.username)}`;
      if (entry.action === 'DELETE') return `Excluiu o usuário ${str(row.username)} (${str(row.name)})`;
      const changes: string[] = [];
      if (before.username !== after.username) changes.push(`mudou o login de ${str(before.username)} para ${str(after.username)}`);
      if (before.name !== after.name) changes.push(`mudou o nome de "${str(before.name)}" para "${str(after.name)}"`);
      if (before.role !== after.role) changes.push(`tornou ${str(after.username)} ${roleName(after.role)}`);
      if (before.active !== after.active) changes.push(`${after.active ? 'liberou' : 'desativou'} o acesso de ${str(after.username)}`);
      if (!changes.length) changes.push(`alterou o usuário ${str(after.username)}`);
      return capitalize(changes.join(', '));
    }
    default:
      return `${entry.action} em ${entry.table_name}`;
  }
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
