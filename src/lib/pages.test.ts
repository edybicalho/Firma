import { describe, expect, it } from 'vitest';
import { fetchAllPages, PAGE_SIZE } from '@/lib/pages';

describe('busca em páginas (limite de 1.000 linhas do Supabase)', () => {
  const rows = Array.from({ length: 2345 }, (_, i) => i);
  const fakeServer = (from: number, to: number) => Promise.resolve({ data: rows.slice(from, Math.min(to + 1, from + PAGE_SIZE)), error: null });

  it('traz todas as linhas, mesmo passando de 1.000', async () => {
    const { data, error } = await fetchAllPages(fakeServer);
    expect(error).toBeNull();
    expect(data).toEqual(rows);
  });
  it('quando o total é múltiplo exato de 1.000, não para antes nem repete', async () => {
    const exact = Array.from({ length: 2000 }, (_, i) => i);
    const { data } = await fetchAllPages((from, to) => Promise.resolve({ data: exact.slice(from, to + 1), error: null }));
    expect(data).toEqual(exact);
  });
  it('avisa se uma das páginas falhar', async () => {
    const { error } = await fetchAllPages((from) => Promise.resolve(from === 0 ? { data: rows.slice(0, PAGE_SIZE), error: null } : { data: null, error: { message: 'sem internet' } }));
    expect(error).toBe('sem internet');
  });
});
