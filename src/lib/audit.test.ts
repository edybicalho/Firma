import { describe, expect, it } from 'vitest';
import { describeAudit } from '@/lib/audit';
import type { AuditEntry } from '@/lib/audit';

const lookups = {
  projectName: (id: string) => ({ p1: 'Obra Norte' } as Record<string, string>)[id],
  operationLabel: (id: string) => ({ o1: '01 — Fundação' } as Record<string, string>)[id],
};
const entry = (table_name: string, action: string, old_data: AuditEntry['old_data'], new_data: AuditEntry['new_data']): AuditEntry => ({
  id: 1, happened_at: '2026-11-12T12:00:00Z', user_id: 'u', username: 'chefe', table_name, action, row_id: 'x', old_data, new_data,
});

describe('frases do registro de alterações', () => {
  it('lançamento', () => {
    expect(describeAudit(entry('movements', 'INSERT', null, { project_id: 'p1', operation_id: 'o1', entry_total: 1500, exit_total: 500, recorded_at: '2026-11-12' }), lookups))
      .toBe('Lançou em Obra Norte / 01 — Fundação: entrada R$ 1.500,00, saída R$ 500,00 (dia 12/11/2026)');
  });
  it('exclusão de lançamento de projeto que já não existe', () => {
    expect(describeAudit(entry('movements', 'DELETE', { project_id: 'zz', operation_id: 'zz', entry_total: 10, exit_total: 0, recorded_at: '2026-11-01' }, null), lookups))
      .toContain('projeto excluído / operação excluída');
  });
  it('projeto renomeado', () => {
    expect(describeAudit(entry('projects', 'UPDATE', { name: 'A', notes: null }, { name: 'B', notes: null }), lookups)).toBe('Renomeou o projeto "A" para "B"');
  });
  it('usuário desativado e tornado administrador', () => {
    expect(describeAudit(entry('profiles', 'UPDATE', { username: 'joao', name: 'J', role: 'operator', active: true }, { username: 'joao', name: 'J', role: 'admin', active: false }), lookups))
      .toBe('Tornou joao administrador, desativou o acesso de joao');
  });
  it('troca de senha', () => {
    expect(describeAudit(entry('profiles', 'SENHA', { username: 'joao' }, null), lookups)).toBe('Trocou a senha do usuário joao');
  });
});
