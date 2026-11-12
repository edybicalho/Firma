// Tema claro ou escuro. A escolha fica guardada neste navegador (cada pessoa escolhe o seu).
// O arquivo public/tema.js aplica a escolha antes do app abrir, para a tela não "piscar".
export type Theme = 'light' | 'dark';
const KEY = 'acumula-tema';

export function currentTheme(): Theme {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

export function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
  try { localStorage.setItem(KEY, theme); } catch { /* navegador sem armazenamento: vale só até fechar */ }
}
