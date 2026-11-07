import { useEffect, useState } from 'react';
import { ShieldCheck, UserCheck, UserX } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/types';

export function UsersAdmin({ currentUserId, notify }: { currentUserId: string; notify: (text: string) => void }) {
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');

  const loadUsers = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('profiles').select('*').order('created_at');
    if (error) notify('Não foi possível carregar os usuários.');
    setUsers((data ?? []) as Profile[]);
    setLoading(false);
  };
  useEffect(() => { void loadUsers(); }, []);

  const updateUser = async (user: Profile, changes: Partial<Pick<Profile, 'role' | 'active'>>, done: string) => {
    setBusyId(user.id);
    const { error } = await supabase.from('profiles').update(changes).eq('id', user.id);
    if (error) notify('Não foi possível atualizar o usuário.');
    else { notify(done); await loadUsers(); }
    setBusyId('');
  };

  const waiting = users.filter((user) => !user.active).length;

  return (
    <div className="users-admin">
      <p className="settings-desc">
        Operadores criam a própria conta na tela de entrada. Libere o acesso aqui e defina quem é administrador.
        {waiting > 0 && <b className="users-waiting"> {waiting} {waiting === 1 ? 'conta aguardando' : 'contas aguardando'} liberação.</b>}
      </p>
      {loading ? <p className="empty">Carregando usuários...</p> : users.length ? (
        <div className="settings-ops-list">
          {users.map((user) => {
            const self = user.id === currentUserId;
            const busy = busyId === user.id;
            return (
              <div className="settings-op-row user-row" key={user.id}>
                <div className="user-info">
                  <b>{user.name}{self && ' (você)'}</b>
                  <small>{user.email}</small>
                </div>
                <div className="user-badges">
                  <i className={`pill ${user.active ? 'ok' : 'wait'}`}>{user.active ? 'Com acesso' : 'Aguardando liberação'}</i>
                  <i className={`pill ${user.role === 'admin' ? 'admin' : ''}`}>{user.role === 'admin' ? 'Administrador' : 'Operador'}</i>
                </div>
                {self ? <small className="user-self">Seu próprio acesso não pode ser alterado aqui.</small> : (
                  <div className="settings-op-actions">
                    <button className={`ghost ${user.active ? 'danger' : ''}`} disabled={busy} onClick={() => void updateUser(user, { active: !user.active }, user.active ? 'Acesso removido.' : 'Acesso liberado.')}>
                      {user.active ? <><UserX size={13} /> Remover acesso</> : <><UserCheck size={13} /> Liberar acesso</>}
                    </button>
                    <button className="ghost" disabled={busy} onClick={() => void updateUser(user, { role: user.role === 'admin' ? 'operator' : 'admin' }, user.role === 'admin' ? 'Usuário agora é operador.' : 'Usuário agora é administrador.')}>
                      <ShieldCheck size={13} /> {user.role === 'admin' ? 'Tornar operador' : 'Tornar administrador'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : <p className="empty">Nenhum usuário cadastrado.</p>}
    </div>
  );
}
