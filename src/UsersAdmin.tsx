import { useEffect, useState } from 'react';
import { KeyRound, Plus, Save, ShieldCheck, UserCheck, UserX, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { USERNAME_PATTERN } from '@/lib/types';
import type { Profile, Role } from '@/lib/types';

const rpcError = (message: string, fallback: string) => {
  if (message.includes('usuario_existe')) return 'Já existe um usuário com esse nome de login.';
  if (message.includes('usuario_invalido')) return 'O usuário deve ter de 3 a 30 caracteres: letras minúsculas, números, ponto, hífen ou sublinhado.';
  if (message.includes('senha_curta')) return 'A senha precisa ter pelo menos 6 caracteres.';
  if (message.includes('sem_permissao')) return 'Só administradores podem fazer isso.';
  return fallback;
};

export function UsersAdmin({ currentUserId, notify }: { currentUserId: string; notify: (text: string) => void }) {
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<Role>('operator');
  const [passwordUser, setPasswordUser] = useState<Profile | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

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

  const openCreate = () => {
    setNewName(''); setNewUsername(''); setNewPassword(''); setNewRole('operator'); setFormError('');
    setCreating(true);
  };

  const createUser = async () => {
    const username = newUsername.trim().toLowerCase();
    if (!newName.trim()) { setFormError('Informe o nome da pessoa.'); return; }
    if (!USERNAME_PATTERN.test(username)) { setFormError(rpcError('usuario_invalido', '')); return; }
    if (newPassword.length < 6) { setFormError(rpcError('senha_curta', '')); return; }
    setSaving(true);
    const { error } = await supabase.rpc('admin_create_user', { p_username: username, p_password: newPassword, p_name: newName.trim(), p_role: newRole });
    setSaving(false);
    if (error) { setFormError(rpcError(error.message, 'Não foi possível criar o usuário.')); return; }
    setCreating(false);
    notify(`Usuário ${username} criado.`);
    await loadUsers();
  };

  const openPassword = (user: Profile) => {
    setResetPassword(''); setFormError('');
    setPasswordUser(user);
  };

  const savePassword = async () => {
    if (!passwordUser) return;
    if (resetPassword.length < 6) { setFormError(rpcError('senha_curta', '')); return; }
    setSaving(true);
    const { error } = await supabase.rpc('admin_set_password', { p_user_id: passwordUser.id, p_password: resetPassword });
    setSaving(false);
    if (error) { setFormError(rpcError(error.message, 'Não foi possível trocar a senha.')); return; }
    notify(`Senha de ${passwordUser.username} alterada.`);
    setPasswordUser(null);
  };

  return (
    <div className="users-admin">
      <div className="users-head">
        <p className="settings-desc">Cadastre quem vai usar o app. Cada pessoa entra com o usuário e a senha que você criar.</p>
        <button className="add-operation" onClick={openCreate}><Plus size={15} /> Novo usuário</button>
      </div>
      {loading ? <p className="empty">Carregando usuários...</p> : users.length ? (
        <div className="settings-ops-list">
          {users.map((user) => {
            const self = user.id === currentUserId;
            const busy = busyId === user.id;
            return (
              <div className="settings-op-row user-row" key={user.id}>
                <div className="user-info">
                  <b>{user.name}{self && ' (você)'}</b>
                  <small>Usuário: {user.username}</small>
                </div>
                <div className="user-badges">
                  <i className={`pill ${user.active ? 'ok' : 'wait'}`}>{user.active ? 'Com acesso' : 'Desativado'}</i>
                  <i className={`pill ${user.role === 'admin' ? 'admin' : ''}`}>{user.role === 'admin' ? 'Administrador' : 'Operador'}</i>
                </div>
                <div className="settings-op-actions">
                  <button className="ghost" disabled={busy} onClick={() => openPassword(user)}><KeyRound size={13} /> Trocar senha</button>
                  {!self && (
                    <>
                      <button className="ghost" disabled={busy} onClick={() => void updateUser(user, { role: user.role === 'admin' ? 'operator' : 'admin' }, user.role === 'admin' ? 'Usuário agora é operador.' : 'Usuário agora é administrador.')}>
                        <ShieldCheck size={13} /> {user.role === 'admin' ? 'Tornar operador' : 'Tornar administrador'}
                      </button>
                      <button className={`ghost ${user.active ? 'danger' : ''}`} disabled={busy} onClick={() => void updateUser(user, { active: !user.active }, user.active ? 'Acesso desativado.' : 'Acesso liberado.')}>
                        {user.active ? <><UserX size={13} /> Desativar</> : <><UserCheck size={13} /> Liberar</>}
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : <p className="empty">Nenhum usuário cadastrado.</p>}

      {creating && (
        <div className="modal-backdrop">
          <section className="edit-modal">
            <div className="modal-heading"><div><small>NOVO USUÁRIO</small><h3>Cadastrar usuário</h3></div><button className="close-modal" aria-label="Fechar" onClick={() => setCreating(false)}><X size={18} /></button></div>
            <label htmlFor="new-user-name">Nome da pessoa<input id="new-user-name" value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Ex: João Silva" /></label>
            <div className="modal-grid">
              <label htmlFor="new-user-login">Usuário (login)<input id="new-user-login" autoCapitalize="none" spellCheck={false} value={newUsername} onChange={(event) => setNewUsername(event.target.value.toLowerCase())} placeholder="joao.silva" /></label>
              <label htmlFor="new-user-password">Senha<input id="new-user-password" type="text" autoComplete="off" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="Mínimo de 6 caracteres" /></label>
            </div>
            <label htmlFor="new-user-role">Tipo de acesso
              <select id="new-user-role" value={newRole} onChange={(event) => setNewRole(event.target.value as Role)}>
                <option value="operator">Operador: Painel e Relatórios</option>
                <option value="admin">Administrador: tudo, inclusive Configurações</option>
              </select>
            </label>
            {formError && <p className="auth-error" role="alert">{formError}</p>}
            <div className="modal-actions"><button className="ghost" onClick={() => setCreating(false)}>Cancelar</button><button className="save modal-save" disabled={saving} onClick={() => void createUser()}><Save size={15} /> {saving ? 'Criando...' : 'Criar usuário'}</button></div>
          </section>
        </div>
      )}

      {passwordUser && (
        <div className="modal-backdrop">
          <section className="edit-modal">
            <div className="modal-heading"><div><small>TROCAR SENHA</small><h3>{passwordUser.name}</h3></div><button className="close-modal" aria-label="Fechar" onClick={() => setPasswordUser(null)}><X size={18} /></button></div>
            <p className="settings-desc">Usuário: <b>{passwordUser.username}</b>. Passe a nova senha para a pessoa; ela usa no próximo login.</p>
            <label htmlFor="reset-password">Nova senha<input id="reset-password" type="text" autoComplete="off" value={resetPassword} onChange={(event) => setResetPassword(event.target.value)} placeholder="Mínimo de 6 caracteres" /></label>
            {formError && <p className="auth-error" role="alert">{formError}</p>}
            <div className="modal-actions"><button className="ghost" onClick={() => setPasswordUser(null)}>Cancelar</button><button className="save modal-save" disabled={saving} onClick={() => void savePassword()}><Save size={15} /> {saving ? 'Salvando...' : 'Salvar senha'}</button></div>
          </section>
        </div>
      )}
    </div>
  );
}
