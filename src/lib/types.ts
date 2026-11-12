export type Role = 'admin' | 'operator';

export type Profile = {
  id: string;
  username: string;
  name: string;
  role: Role;
  active: boolean;
  created_at: string;
  /** Último login (só vem para administradores, pela função admin_list_users) */
  last_sign_in_at?: string | null;
};

// O Supabase exige e-mail no login; cada usuário recebe um e-mail interno que ninguém precisa digitar.
export const LOGIN_DOMAIN = 'acumula.local';
export const usernameToEmail = (username: string) => `${username.trim().toLowerCase()}@${LOGIN_DOMAIN}`;
export const emailToUsername = (email: string) => email.split('@')[0];
export const USERNAME_PATTERN = /^[a-z0-9._-]{3,30}$/;
// Tamanho mínimo da senha (o banco confere a mesma regra)
export const PASSWORD_MIN = 8;

// "hoje às 14:30", "ontem às 09:12", "há 5 dias", "12/03/2026" (horário de Brasília)
export function lastAccessLabel(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return 'Nunca entrou';
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return 'Nunca entrou';
  const day = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d);
  const hour = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }).format(when);
  const days = Math.round((Date.parse(`${day(now)}T12:00:00Z`) - Date.parse(`${day(when)}T12:00:00Z`)) / 864e5);
  if (days <= 0) return `hoje às ${hour}`;
  if (days === 1) return `ontem às ${hour}`;
  if (days < 30) return `há ${days} dias`;
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' }).format(when);
}
