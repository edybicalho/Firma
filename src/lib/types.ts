export type Role = 'admin' | 'operator';

export type Profile = {
  id: string;
  email: string;
  name: string;
  role: Role;
  active: boolean;
  created_at: string;
};
