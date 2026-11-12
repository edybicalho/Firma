import { useCallback, useEffect, useState } from 'react';
import { KeyRound, Pencil, Plus, Save, ShieldCheck, Trash2, UserCheck, UserX, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { PASSWORD_MIN, USERNAME_PATTERN } from '@/lib/types';
import type { Profile, Role } from '@/lib/types';

const rpcError = (message: string, fallback: string) => {
  if (message.includes('usuario_existe')) return 'Já existe um usuário com esse nome de login.';
  if (message.includes('usuario_invalido')) return 'O usuário deve ter de 3 a 30 caracteres: letras minúsculas, números, ponto, hífen ou sublinhado.';
  if (message.includes('senha_curta')) return `A senha precisa ter pelo menos ${PASSWORD_MIN} caracteres.`;
  if (message.includes('sem_permissao')) return 'Só administradores podem fazer isso.';
  if (message.includes('nome_vazio')) return 'Informe o nome da pessoa.';
  if (message.includes('proprio_usuario')) return 'Você não pode excluir o próprio usuário.';
  if (message.includes('ultimo_admin')) return 'O sistema precisa ter pelo menos um administrador com acesso.';
  if (message.includes('usuario_nao_encontrado')) return 'Usuário não encontrado. Atualize a página.';
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
  const [editUser, setEditUser] = useState<Profile | null>(null);
  const [editName, setEditName] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('profiles').select('*').order('created_at');
    if (error) notify('Não foi possível carregar os usuários.');
    else setUsers((data ?? []) as Profile[]);
    setLoading(false);
  }, [notify]);
  useEffect(() => { void loadUsers(); }, [loadUsers]);

  const updateUser = async (user: Profile, changes: Partial<Pick<Profile, 'role' | 'active'>>, done: string) => {
    setBusyId(user.id);
    const { error } = await supabase.from('profiles').update(changes).eq('id', user.id);
    if (error) notify(rpcError(error.message, 'Não foi possível atualizar o usuário.'));
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
    if (newPassword.length < PASSWORD_MIN) { setFormError(rpcError('senha_curta', '')); return; }
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
    if (resetPassword.length < PASSWORD_MIN) { setFormError(rpcError('senha_curta', '')); return; }
    setSaving(true);
    const { error } = await supabase.rpc('admin_set_password', { p_user_id: passwordUser.id, p_password: resetPassword });
    setSaving(false);
    if (error) { setFormError(rpcError(error.message, 'Não foi possível trocar a senha.')); return; }
    notify(`Senha de ${passwordUser.username} alterada.`);
    setPasswordUser(null);
  };

  const openEdit = (user: Profile) => {
    setEditName(user.name); setEditUsername(user.username); setFormError('');
    setEditUser(user);
  };

  const saveEdit = async () => {
    if (!editUser) return;
    const username = editUsername.trim().toLowerCase();
    if (!editName.trim()) { setFormError(rpcError('nome_vazio', '')); return; }
    if (!USERNAME_PATTERN.test(username)) { setFormError(rpcError('usuario_invalido', '')); return; }
    setSaving(true);
    const { error } = await supabase.rpc('admin_update_user', { p_user_id: editUser.id, p_username: username, p_name: editName.trim() });
    setSaving(false);
    if (error) { setFormError(rpcError(error.message, 'Não foi possível salvar as alterações.')); return; }
    notify('Usuário atualizado.');
    setEditUser(null);
    await loadUsers();
  };

  const deleteUser = async (user: Profile) => {
    if (!confirm(`Excluir o usuário ${user.username} (${user.name})? A pessoa perde o acesso e isso não pode ser desfeito. Os lançamentos já feitos continuam no histórico.`)) return;
    setBusyId(user.id);
    const { error } = await supabase.rpc('admin_delete_user', { p_user_id: user.id });
    if (error) notify(rpcError(error.message, 'Não foi possível excluir o usuário.'));
    else { notify(`Usuário ${user.username} excluído.`); await loadUsers(); }
    setBusyId('');
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
                  <button className="ghost" disabled={busy} onClick={() => openEdit(user)}><Pencil size={13} /> Editar</button>
                  <button className="ghost" disabled={busy} onClick={() => openPassword(user)}><KeyRound size={13} /> Trocar senha</button>
                  {!self && (
                    <>
                      <button className="ghost" disabled={busy} onClick={() => void updateUser(user, { role: user.role === 'admin' ? 'operator' : 'admin' }, user.role === 'admin' ? 'Usuário agora é operador.' : 'Usuário agora é administrador.')}>
                        <ShieldCheck size={13} /> {user.role === 'admin' ? 'Tornar operador' : 'Tornar administrador'}
                      </button>
                      <button className={`ghost ${user.active ? 'danger' : ''}`} disabled={busy} onClick={() => void updateUser(user, { active: !user.active }, user.active ? 'Acesso desativado.' : 'Acesso liberado.')}>
                        {user.active ? <><UserX size={13} /> Desativar</> : <><UserCheck size={13} /> Liberar</>}
                      </button>
                      <button className="ghost danger" disabled={busy} onClick={() => void deleteUser(user)}><Trash2 size={13} /> Excluir</button>
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
              <label htmlFor="new-user-password">Senha<input id="new-user-password" type="text" autoComplete="off" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder={`Mínimo de ${PASSWORD_MIN} caracteres`} /></label>
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

      {editUser && (
        <div className="modal-backdrop">
          <section className="edit-modal">
            <div className="modal-heading"><div><small>EDITAR USUÁRIO</small><h3>{editUser.name}</h3></div><button className="close-modal" aria-label="Fechar" onClick={() => setEditUser(null)}><X size={18} /></button></div>
            <label htmlFor="edit-user-name">Nome da pessoa<input id="edit-user-name" value={editName} onChange={(event) => setEditName(event.target.value)} /></label>
            <label htmlFor="edit-user-login">Usuário (login)<input id="edit-user-login" autoCapitalize="none" spellCheck={false} value={editUsername} onChange={(event) => setEditUsername(event.target.value.toLowerCase())} /></label>
            {editUsername.trim().toLowerCase() !== editUser.username && <p className="settings-desc">A pessoa passa a entrar com <b>{editUsername.trim().toLowerCase() || '...'}</b>. A senha continua a mesma.</p>}
            {formError && <p className="auth-error" role="alert">{formError}</p>}
            <div className="modal-actions"><button className="ghost" onClick={() => setEditUser(null)}>Cancelar</button><button className="save modal-save" disabled={saving} onClick={() => void saveEdit()}><Save size={15} /> {saving ? 'Salvando...' : 'Salvar alterações'}</button></div>
          </section>
        </div>
      )}

      {passwordUser && (
        <div className="modal-backdrop">
          <section className="edit-modal">
            <div className="modal-heading"><div><small>TROCAR SENHA</small><h3>{passwordUser.name}</h3></div><button className="close-modal" aria-label="Fechar" onClick={() => setPasswordUser(null)}><X size={18} /></button></div>
            <p className="settings-desc">Usuário: <b>{passwordUser.username}</b>. Passe a nova senha para a pessoa; ela usa no próximo login.</p>
            <label htmlFor="reset-password">Nova senha<input id="reset-password" type="text" autoComplete="off" value={resetPassword} onChange={(event) => setResetPassword(event.target.value)} placeholder={`Mínimo de ${PASSWORD_MIN} caracteres`} /></label>
            {formError && <p className="auth-error" role="alert">{formError}</p>}
            <div className="modal-actions"><button className="ghost" onClick={() => setPasswordUser(null)}>Cancelar</button><button className="save modal-save" disabled={saving} onClick={() => void savePassword()}><Save size={15} /> {saving ? 'Salvando...' : 'Salvar senha'}</button></div>
          </section>
        </div>
      )}
    </div>
  );
}
