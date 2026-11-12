import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
if (!url || !anonKey) {
  throw new Error('Faltam as variáveis VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY (veja o arquivo .env.example).');
}

export const supabase = createClient(url, anonKey);

// Traduz erros do banco para mensagens que a pessoa entende.
export function friendlyError(error: { message?: string; code?: string } | null | undefined, fallback: string) {
  const text = `${error?.message ?? ''}`;
  if ((typeof navigator !== 'undefined' && !navigator.onLine) || /failed to fetch|networkerror|load failed|network request failed|internetdisconnected/i.test(text)) return 'Sem conexão com a internet. Confira a conexão e tente de novo.';
  if (error?.code === '42501' || /row-level security|permission denied/i.test(text)) return 'O banco não permitiu esta ação. Seu acesso pode ter mudado: clique em Atualizar ou entre de novo.';
  if (/acumulado_menor/i.test(text)) return 'O acumulado ficou menor que o último lançamento desta ficha (alguém pode ter lançado agora). Clique em Atualizar e confira, ou use "Novo jogo".';
  if (/movements_values_valid|numeric field overflow/i.test(text)) return 'Valor fora do permitido.';
  if (/_name_valid|_notes_valid|value too long/i.test(text)) return 'Texto grande demais. Encurte e tente de novo.';
  return fallback;
}
