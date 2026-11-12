// O Supabase entrega no máximo 1.000 linhas por vez. Esta função busca página por página
// até trazer tudo, para os cálculos nunca usarem dados pela metade.
export const PAGE_SIZE = 1000;
type PageResult<T> = { data: T[] | null; error: { message: string } | null };
// A consulta precisa ter uma ordem fixa (terminando no id) para nenhuma linha se repetir ou sumir entre as páginas.
export async function fetchAllPages<T>(page: (from: number, to: number) => PromiseLike<PageResult<T>>): Promise<{ data: T[]; error: string | null }> {
  const all: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) return { data: all, error: error.message };
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < PAGE_SIZE) return { data: all, error: null };
  }
}
