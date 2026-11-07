import { useState } from 'react';
import type { FormEvent } from 'react';
import { LogIn, LogOut, RefreshCw, TrendingUp, UserPlus } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export function Login() {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const switchMode = () => {
    setMode((current) => (current === 'login' ? 'signup' : 'login'));
    setError('');
    setInfo('');
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setInfo('');
    if (!email.trim() || !password) { setError('Preencha e-mail e senha.'); return; }
    if (mode === 'signup' && !name.trim()) { setError('Informe seu nome.'); return; }
    if (mode === 'signup' && password.length < 6) { setError('A senha precisa ter pelo menos 6 caracteres.'); return; }
    setBusy(true);
    if (mode === 'login') {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (signInError) {
        setError(signInError.message.includes('not confirmed')
          ? 'Confirme seu e-mail pelo link que enviamos antes de entrar.'
          : 'E-mail ou senha incorretos.');
      }
    } else {
      const { data, error: signUpError } = await supabase.auth.signUp({ email: email.trim(), password, options: { data: { name: name.trim() } } });
      if (signUpError) {
        setError(signUpError.message.includes('already') ? 'Já existe uma conta com este e-mail.' : 'Não foi possível criar a conta.');
      } else if (!data.session) {
        setInfo('Conta criada. Abra o link enviado ao seu e-mail para confirmar e depois entre aqui.');
        setMode('login');
        setPassword('');
      }
    }
    setBusy(false);
  };

  return (
    <div className="auth-screen">
      <form className="auth-card" onSubmit={(event) => void submit(event)} noValidate>
        <div className="brand"><span className="brand-icon"><TrendingUp size={18} /></span>Acumula</div>
        <div className="auth-heading">
          <small>{mode === 'login' ? 'ACESSO' : 'NOVA CONTA'}</small>
          <h1>{mode === 'login' ? 'Entrar' : 'Criar conta de operador'}</h1>
          <p>{mode === 'login'
            ? 'Use o e-mail e a senha cadastrados.'
            : 'Depois de criar a conta, o administrador precisa liberar seu acesso.'}</p>
        </div>
        {mode === 'signup' && (
          <label htmlFor="auth-name">Nome
            <input id="auth-name" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Seu nome" />
          </label>
        )}
        <label htmlFor="auth-email">E-mail
          <input id="auth-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="voce@empresa.com" />
        </label>
        <label htmlFor="auth-password">Senha
          <input id="auth-password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={mode === 'login' ? 'Sua senha' : 'Mínimo de 6 caracteres'} />
        </label>
        {error && <p className="auth-error" role="alert">{error}</p>}
        {info && <div className="notice">{info}</div>}
        <button className="save auth-submit" type="submit" disabled={busy}>
          {busy ? 'Aguarde...' : mode === 'login' ? <><LogIn size={15} /> Entrar</> : <><UserPlus size={15} /> Criar conta</>}
        </button>
        <button type="button" className="auth-switch" onClick={switchMode}>
          {mode === 'login' ? 'Não tem conta? Criar conta de operador' : 'Já tem conta? Entrar'}
        </button>
      </form>
    </div>
  );
}

export function PendingAccess({ email, onRetry, onSignOut }: { email: string; onRetry: () => void; onSignOut: () => void }) {
  return (
    <div className="auth-screen">
      <section className="auth-card">
        <div className="brand"><span className="brand-icon"><TrendingUp size={18} /></span>Acumula</div>
        <div className="auth-heading">
          <small>AGUARDANDO LIBERAÇÃO</small>
          <h1>Acesso em análise</h1>
          <p>A conta <b>{email}</b> ainda não tem acesso. Peça ao administrador para liberar em Configurações, na aba Usuários.</p>
        </div>
        <button className="save auth-submit" type="button" onClick={onRetry}><RefreshCw size={15} /> Verificar novamente</button>
        <button className="auth-switch" type="button" onClick={onSignOut}><LogOut size={14} /> Sair e usar outra conta</button>
      </section>
    </div>
  );
}
