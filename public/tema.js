// Aplica o tema escolhido (claro ou escuro) antes do app abrir. Padrão: claro.
try {
  document.documentElement.setAttribute('data-theme', localStorage.getItem('acumula-tema') === 'dark' ? 'dark' : 'light');
} catch (e) {
  document.documentElement.setAttribute('data-theme', 'light');
}
