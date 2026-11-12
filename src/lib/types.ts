export type Role = 'admin' | 'operator';

export type Profile = {
  id: string;
  username: string;
  name: string;
  role: Role;
  active: boolean;
  created_at: string;
};

// O Supabase exige e-mail no login; cada usuário recebe um e-mail interno que ninguém precisa digitar.
export const LOGIN_DOMAIN = 'acumula.local';
export const usernameToEmail = (username: string) => `${username.trim().toLowerCase()}@${LOGIN_DOMAIN}`;
export const emailToUsername = (email: string) => email.split('@')[0];
export const USERNAME_PATTERN = /^[a-z0-9._-]{3,30}$/;
// Tamanho mínimo da senha (o banco confere a mesma regra)
export const PASSWORD_MIN = 8;
