import { useState } from 'react';
import type { FormEvent } from 'react';
import { LogIn, LogOut, RefreshCw, TrendingUp } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { usernameToEmail } from '@/lib/types';

export function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    if (!username.trim() || !password) { setError('Preencha usuário e senha.'); return; }
    setBusy(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: usernameToEmail(username), password });
    if (signInError) setError(/invalid login credentials/i.test(signInError.message) ? 'Usuário ou senha incorretos.' : /fetch|network/i.test(signInError.message) || !navigator.onLine ? 'Sem conexão com a internet. Confira a conexão e tente de novo.' : 'Não foi possível entrar agora. Tente de novo em instantes.');
    setBusy(false);
  };

  return (
    <div className="auth-screen">
      <form className="auth-card" onSubmit={(event) => void submit(event)} noValidate>
        <div className="brand"><span className="brand-icon"><TrendingUp size={18} /></span>Acumula</div>
        <div className="auth-heading">
          <small>ACESSO</small>
          <h1>Entrar</h1>
          <p>Use o usuário e a senha que o administrador cadastrou para você.</p>
        </div>
        <label htmlFor="auth-username">Usuário
          <input id="auth-username" autoComplete="username" autoCapitalize="none" spellCheck={false} value={username} onChange={(event) => setUsername(event.target.value)} placeholder="ex: joao.silva" />
        </label>
        <label htmlFor="auth-password">Senha
          <input id="auth-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Sua senha" />
        </label>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button className="save auth-submit" type="submit" disabled={busy}>
          {busy ? 'Entrando...' : <><LogIn size={15} /> Entrar</>}
        </button>
        <p className="auth-hint">Esqueceu a senha? Peça ao administrador para criar uma nova.</p>
      </form>
    </div>
  );
}

export function PendingAccess({ username, onRetry, onSignOut }: { username: string; onRetry: () => void; onSignOut: () => void }) {
  return (
    <div className="auth-screen">
      <section className="auth-card">
        <div className="brand"><span className="brand-icon"><TrendingUp size={18} /></span>Acumula</div>
        <div className="auth-heading">
          <small>ACESSO DESATIVADO</small>
          <h1>Sem acesso no momento</h1>
          <p>O usuário <b>{username}</b> está desativado. Fale com o administrador para liberar novamente.</p>
        </div>
        <button className="save auth-submit" type="button" onClick={onRetry}><RefreshCw size={15} /> Verificar novamente</button>
        <button className="auth-switch" type="button" onClick={onSignOut}><LogOut size={14} /> Sair e usar outro usuário</button>
      </section>
    </div>
  );
}
