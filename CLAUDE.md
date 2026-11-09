# Acumula (repositório Firma)

App web de controle financeiro por projeto. O dono do projeto fala português do Brasil: responda e escreva textos da interface em português.

## O que o app faz

- Cada **projeto** tem **operações** ("fichas", com número e nome).
- Em cada operação o usuário lança valores **acumulados** de entrada e saída (o total até agora, não o do dia). O movimento real é a diferença para o lançamento anterior da mesma operação.
- **Painel** (título "PONTOS"): lançamento novo, lançamento anterior, "Resultado do dia" (e ÷ 2) e a consulta de lançamentos.
- **Relatórios**: um card por projeto com o **último resultado ÷ 2** (resultado do último dia com lançamento) e um botão de **Observações** ao lado do nome.
- **Configurações** (só administrador): criar, renomear e excluir projetos e operações.
- **Usuários** (só administrador, aba ao lado de Configurações): criar usuário, editar nome e login, trocar senha, tornar administrador ou operador, desativar e excluir.

## Tecnologia

- React 18 + TypeScript + Vite + Tailwind; ícones `lucide-react`.
- Supabase (`src/lib/supabase.ts`) com `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` no `.env` (fora do Git).
- Arquivos: `src/App.tsx` (app principal, `Workspace`, controle de login), `src/Login.tsx` (tela de entrada e de acesso desativado), `src/UsersAdmin.tsx` (gestão de usuários), `src/lib/types.ts` (perfis e regra do login), `src/index.css` (todo o visual, tema escuro).
- Importado do Bolt; o projeto **não volta para o Bolt**.

## Regras de negócio já decididas

- Login por **usuário e senha, sem e-mail**. O Supabase exige e-mail, então cada usuário recebe um interno `usuario@acumula.local` (`usernameToEmail`). Não existe cadastro público: só o administrador cria usuários.
- **Operador** vê só Painel e Relatórios; pode lançar, excluir **só lançamentos do dia** (horário de Brasília) e escrever observações.
- **Administrador** vê tudo. Ninguém altera, desativa ou exclui o próprio acesso.
- As janelas (modais) só fecham pelo X, Cancelar ou ao salvar; clicar fora não fecha.
- No celular, a consulta de lançamentos vira blocos empilhados (sem rolagem lateral) e o menu abre em lista vertical.
- As regras de acesso também ficam no banco (RLS e funções), não só na interface.

## Banco de dados (Supabase)

Migrações em `supabase/migrations/`, a rodar nesta ordem no SQL Editor:

1. `20261107180000_project_notes.sql`: coluna `notes` em `projects`.
2. `20261107190000_login_and_roles.sql`: tabela `profiles`, funções `admin_create_user`, `admin_set_password`, `admin_update_user`, `admin_delete_user`, `create_first_admin` e as regras de acesso (RLS) de `projects`, `operations` e `movements`.

Depois: `select public.create_first_admin('admin', 'senha', 'Nome');` e desligar os cadastros públicos em Authentication.

**Situação:** as migrações ainda **não foram rodadas** em nenhum Supabase real; tudo foi testado só numa prévia com dados simulados. O app hoje não está publicado em lugar nenhum.

## Próximos passos combinados

1. Confirmar se o dono tem acesso ao Supabase criado pelo Bolt ou criar um novo (região São Paulo; plano Pro recomendado por causa do backup diário).
2. Rodar as migrações, criar o primeiro administrador e testar login, operador e regras de acesso de verdade.
3. Publicar o app no **Cloudflare Pages** a partir do GitHub (o plano gratuito da Vercel não permite uso comercial). Configurar as variáveis `VITE_SUPABASE_*` lá.
4. Pendências de funcionalidade: o administrador **corrigir lançamentos de dias anteriores** e um **registro de alterações** (quem fez o quê e quando).

## Forma de trabalho

- O dono não é programador: explique em linguagem simples, sem jargão.
- Mostre o resultado antes de enviar e só faça `git push` quando ele aprovar.
- Commits pequenos, com mensagem em português.
