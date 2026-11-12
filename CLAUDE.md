# Acumula (repositório Firma)

App web de controle financeiro por projeto. O dono do projeto fala português do Brasil: responda e escreva textos da interface em português.

## O que o app faz

- Cada **projeto** tem **operações** ("fichas", com número e nome).
- Em cada operação o usuário lança valores **acumulados** de entrada e saída (o total até agora, não o do dia). O movimento real é a diferença para o lançamento anterior da mesma operação.
- **Painel** (título "PONTOS"): lançamento novo, lançamento anterior, "Resultado do dia" (e ÷ 2) e a consulta de lançamentos.
- **Relatórios**: um card por projeto com o **último resultado ÷ 2** (resultado do último dia com lançamento) e um botão de **Observações** ao lado do nome.
- **Configurações** (só administrador): criar, renomear e excluir projetos e operações.
- **Usuários** (só administrador, aba ao lado de Configurações): criar usuário, editar nome e login, trocar senha, tornar administrador ou operador, desativar e excluir.
- **Registro** (só administrador): quem criou, alterou ou excluiu o quê e quando (tabela `audit_log`, com cópia do antes e do depois; ninguém apaga).
- **Configurações** também tem "Baixar planilha de lançamentos" (CSV para Excel), como cópia de segurança.

## Tecnologia

- React 18 + TypeScript + Vite + Tailwind; ícones `lucide-react`.
- Supabase (`src/lib/supabase.ts`) com `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` no `.env` (fora do Git).
- Arquivos: `src/App.tsx` (app principal, `Workspace`, controle de login), `src/Login.tsx` (tela de entrada e de acesso desativado), `src/UsersAdmin.tsx` (gestão de usuários), `src/AuditLog.tsx` (tela Registro), `src/lib/calc.ts` (leitura de valores e todas as contas), `src/lib/audit.ts` (frases do registro), `src/lib/pages.ts` (busca em páginas), `src/lib/types.ts` (perfis e regra do login), `src/index.css` (todo o visual, tema escuro).
- `public/_headers`: cabeçalhos de segurança do Cloudflare Pages (se trocar de hospedagem ou do Supabase, revisar o `connect-src`).
- O Supabase devolve no máximo 1.000 linhas por consulta: toda lista que pode crescer usa `fetchAllPages` com ordem fixa terminando em `id`.
- Importado do Bolt; o projeto **não volta para o Bolt**.

## Regras de negócio já decididas

- Login por **usuário e senha, sem e-mail**. O Supabase exige e-mail, então cada usuário recebe um interno `usuario@acumula.local` (`usernameToEmail`). Não existe cadastro público: só o administrador cria usuários.
- **Operador** vê só Painel e Relatórios; pode lançar, excluir **só lançamentos do dia** (horário de Brasília) e escrever observações.
- **Administrador** vê tudo. Ninguém altera, desativa ou exclui o próprio acesso. Sempre existe pelo menos um administrador ativo (o banco bloqueia o contrário).
- Senha mínima de **8** caracteres (tela e banco). Trocar a senha ou desativar alguém encerra as sessões abertas dessa pessoa.
- Valores digitados no jeito brasileiro (`1.234,56`; `1.500` = mil e quinhentos). Valor inválido é recusado com aviso, nunca vira zero. O acumulado novo não pode ser menor que o anterior.
- Excluir projeto pede para digitar o nome dele.
- As janelas (modais) só fecham pelo X, Cancelar ou ao salvar; clicar fora não fecha.
- No celular, a consulta de lançamentos vira blocos empilhados (sem rolagem lateral) e o menu abre em lista vertical.
- As regras de acesso também ficam no banco (RLS e funções), não só na interface.

## Banco de dados (Supabase)

Migrações em `supabase/migrations/`, a rodar **nesta ordem** no SQL Editor (todas podem rodar de novo sem estragar nada):

1. `20261107170000_base_tables.sql`: cria `projects`, `operations` e `movements` num Supabase novo; num banco do Bolt só completa o que faltar.
2. `20261107180000_project_notes.sql`: coluna `notes` em `projects`.
3. `20261107190000_login_and_roles.sql`: tabela `profiles`, funções de usuários e as regras de acesso (RLS).
4. `20261112120000_registro_alteracoes.sql`: registro de alterações (`audit_log`).
5. `20261112130000_seguranca.sql`: validação de valores, número de operação único por projeto, quem lançou (`created_by`), senha mínima 8, último administrador, encerrar sessões, e corte de permissões de visitantes. **Precisa rodar depois da 3**, porque substitui funções dela.

Depois: `select public.create_first_admin('admin', 'senha', 'Nome');` e desligar os cadastros públicos em Authentication.

Se a migração 5 mostrar um "Aviso" (dados antigos fora da regra ou números de operação repetidos), nada foi perdido: corrigir os dados e rodar a 5 de novo.

**Testes:** `npm run check` (tipos, verificador e 46 testes das contas). `npm run test:db` roda as migrações e 93 verificações de acesso num PostgreSQL local, com uma imitação do Supabase (`supabase/tests/`), num banco novo e num banco antigo do Bolt com dados.

**Situação:** as migrações ainda **não foram rodadas** em nenhum Supabase real. Foram testadas num PostgreSQL local com a imitação do Supabase; os campos de login gravados em `auth.users` foram conferidos com o código oficial do Supabase Auth. Falta o teste final no Supabase real (entrar com o usuário criado). O app hoje não está publicado em lugar nenhum.

## Próximos passos combinados

1. Confirmar se o dono tem acesso ao Supabase criado pelo Bolt ou criar um novo (região São Paulo; plano Pro recomendado por causa do backup diário).
2. Rodar as migrações, criar o primeiro administrador e testar login, operador e regras de acesso de verdade.
3. Publicar o app no **Cloudflare Pages** a partir do GitHub (o plano gratuito da Vercel não permite uso comercial). Configurar as variáveis `VITE_SUPABASE_*` lá.
4. Pendências de funcionalidade: o administrador **corrigir lançamentos de dias anteriores** pela tela (o banco já permite e registra). O registro de alterações já existe.
5. Antes de usar com dados reais: plano Pro (backup diário) e, de vez em quando, baixar a planilha de lançamentos.

## Forma de trabalho

- O dono não é programador: explique em linguagem simples, sem jargão.
- Mostre o resultado antes de enviar e só faça `git push` quando ele aprovar.
- Commits pequenos, com mensagem em português.
