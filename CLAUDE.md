# Acumula (repositório Firma)

App web de controle financeiro por projeto. O dono do projeto fala português do Brasil: responda e escreva textos da interface em português.

## O que o app faz

- Cada **projeto** tem **operações** ("fichas", com número e nome).
- Em cada operação o usuário lança valores **acumulados** de entrada e saída (o total até agora, não o do dia). O movimento real é a diferença para o lançamento anterior da mesma operação.
- **Painel** (título "PONTOS"): abre numa **página de seleção de projeto** (quadros com nº de fichas, resultado do dia e última alteração). Ao tocar num projeto, entra nele: fichas em quadros (cada uma com o resultado do dia; tocar seleciona), lançamento novo, lançamento anterior, "Resultado do dia do projeto" (e ÷ 2) e a consulta de lançamentos. "← Todos os projetos" volta para a seleção. No quadro "Lançamento anterior", o quadro mostra sempre **só o último lançamento**; o **calendário** abre a lista de **todos os lançamentos** da ficha (por mês; dois lançamentos no mesmo dia aparecem em duas linhas, com o horário e o movimento de cada um); tocar num lançamento mostra ele no quadro (só consulta: o lançamento novo continua comparando com o último).
- **Relatórios**: um card por projeto com o **último resultado ÷ 2** (resultado do último dia com lançamento) e um botão de **Observações** ao lado do nome.
- **Configurações** (só administrador): criar, renomear e excluir projetos e operações.
- **Usuários** (só administrador, aba ao lado de Configurações): criar usuário, editar nome e login, trocar senha, tornar administrador ou operador, desativar e excluir.
- **Registro** (só administrador): quem criou, alterou ou excluiu o quê e quando (tabela `audit_log`, com cópia do antes e do depois; ninguém apaga).
- **Configurações** também tem "Baixar planilha de lançamentos" (CSV para Excel), como cópia de segurança.

## Tecnologia

- React 18 + TypeScript + Vite + Tailwind; ícones `lucide-react`.
- Supabase (`src/lib/supabase.ts`) com `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` no `.env` (fora do Git).
- Arquivos: `src/App.tsx` (app principal, `Workspace`, controle de login), `src/Login.tsx` (tela de entrada e de acesso desativado), `src/UsersAdmin.tsx` (gestão de usuários), `src/AuditLog.tsx` (tela Registro), `src/lib/calc.ts` (leitura de valores e todas as contas), `src/lib/audit.ts` (frases do registro), `src/lib/pages.ts` (busca em páginas), `src/lib/types.ts` (perfis e regra do login), `src/index.css` (todo o visual: tema claro primeiro e, no fim, o bloco do tema escuro com seletores `html[data-theme=dark]`; ao mudar uma cor, ajuste os dois), `src/lib/theme.ts` e `public/tema.js` (botão sol/lua; a escolha fica guardada no navegador de cada pessoa; padrão: claro).
- `public/_headers`: cabeçalhos de segurança do Cloudflare Pages (se trocar de hospedagem ou do Supabase, revisar o `connect-src`).
- O Supabase devolve no máximo 1.000 linhas por consulta: toda lista que pode crescer usa `fetchAllPages` com ordem fixa terminando em `id`.
- Importado do Bolt; o projeto **não volta para o Bolt**.

## Regras de negócio já decididas

- Login por **usuário e senha, sem e-mail**. O Supabase exige e-mail, então cada usuário recebe um interno `usuario@acumula.local` (`usernameToEmail`). Não existe cadastro público: só o administrador cria usuários.
- **Operador** vê só Painel e Relatórios; pode lançar, excluir **só lançamentos do dia** (horário de Brasília) e escrever observações.
- **Administrador** vê tudo. Ninguém altera, desativa ou exclui o próprio acesso. Sempre existe pelo menos um administrador ativo (o banco bloqueia o contrário).
- Senha mínima de **8** caracteres (tela e banco). Trocar a senha ou desativar alguém encerra as sessões abertas dessa pessoa.
- Valores digitados no jeito brasileiro (`1.234,56`; `1.500` = mil e quinhentos). Valor inválido é recusado com aviso, nunca vira zero. O acumulado novo não pode ser menor que o anterior, **exceto com o botão "Nova base"** ligado.
- **Nova base** (botão no quadro de novo lançamento): aceita qualquer número e ele vira o novo ponto de partida da ficha; o movimento desse lançamento é zero (não soma no resultado do dia) e os próximos comparam com ele. Fica marcado no banco em `movements.is_base` e aparece como "nova base" no histórico, na lista do calendário, na planilha e no Registro. O botão desliga sozinho depois de salvar e ao trocar de ficha.
- Excluir projeto pede para digitar o nome dele.
- Dois temas, **claro** (padrão) e **escuro**, trocados pelo botão sol/lua no topo, ao lado de Sair.
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
6. `20261113120000_nova_base.sql`: coluna `is_base` em `movements` (botão "Nova base").

Depois: `select public.create_first_admin('admin', 'senha', 'Nome');` e desligar os cadastros públicos em Authentication.

Na criação do projeto: Data API ligada, **"Automatically expose new tables" desligada** (a migração 5 libera cada tabela explicitamente) e "Enable automatic RLS" ligada. O `npm run test:db` testa os dois jeitos.

**Guia completo para o dono:** `docs/SUPABASE_SEGURO.md` (conta com MFA, plano Pro, cadastro fechado, migrações, primeiro administrador com senha temporária, chaves, rotina). Depois de instalar, `supabase/conferencia_seguranca.sql` (só lê) tem que mostrar ✅ em todas as linhas; o `npm run test:db` também roda essa conferência.

Se a migração 5 mostrar um "Aviso" (dados antigos fora da regra ou números de operação repetidos), nada foi perdido: corrigir os dados e rodar a 5 de novo.

**Testes:** `npm run check` (tipos, verificador e 46 testes das contas). `npm run test:db` roda as migrações e 93 verificações de acesso num PostgreSQL local, com uma imitação do Supabase (`supabase/tests/`), num banco novo e num banco antigo do Bolt com dados.

**Situação (novembro de 2026):**
- Supabase **novo** criado (projeto `acumula`, região São Paulo, **plano gratuito por enquanto**), com conta protegida por autenticação em dois fatores. Criado com "Automatically expose new tables" desligado e "Enable automatic RLS" ligado; GitHub **não** conectado ao Supabase.
- As 5 primeiras migrações rodaram com sucesso (a 6, nova base, ainda precisa ser rodada pelo dono), o primeiro administrador foi criado e a conferência de segurança deu ✅ nas 12 linhas. O Security Advisor mostra 0 erros e 9 avisos esperados (funções de administrador chamáveis por usuários logados, que conferem `is_admin()` por dentro; `rls_auto_enable` do próprio Supabase; proteção de senhas vazadas, que só existe no Pro).
- **Endereços:** app oficial https://firma-6l0.pages.dev (branch `main`); site de teste https://teste.firma-6l0.pages.dev (branch `teste`, atualiza sozinho a cada envio; o dono só dá F5). Projeto no Cloudflare: `firma-6l0`. Os endereços com código (`xxxxxxxx.firma-6l0.pages.dev`) são de uma publicação específica e não mudam.
- App publicado no **Cloudflare Pages** a partir da `main`, com `VITE_SUPABASE_URL` (só o endereço base, sem `/rest/v1/`), `VITE_SUPABASE_ANON_KEY` (chave `sb_publishable_...`) e `NODE_VERSION=22`. O login funcionou de verdade.
- Ainda **sem dados reais**: antes, mudar para o plano Pro e ligar "Prevent use of leaked passwords".

## Próximos passos combinados

1. Terminar os testes no app publicado: trocar a senha temporária do administrador, colocar o endereço do app em Authentication → URL Configuration → Site URL, testar um operador de teste (e apagar depois) e confirmar que "Allow new users to sign up" está desligado.
2. Mudar para o plano Pro antes de usar com dados reais.
3. (Feito) Supabase novo, migrações e publicação no Cloudflare Pages.
4. Pendências de funcionalidade: o administrador **corrigir lançamentos de dias anteriores** pela tela (o banco já permite e registra). O registro de alterações já existe.
5. Antes de usar com dados reais: plano Pro (backup diário) e, de vez em quando, baixar a planilha de lançamentos.

## Forma de trabalho

- O dono não é programador: explique em linguagem simples, sem jargão.
- **Envio automático (autorizado pelo dono):** depois de testar (`npm run check`, e `npm run test:db` se mexer no banco), faça commit e `git push` sem pedir permissão, **sempre na versão fixa `teste`**, nunca direto na `main` e sem criar outras versões (o dono não quer várias versões de teste).
- **Uma versão de teste só:** a branch `teste` tem endereço fixo no Cloudflare (https://teste.firma-6l0.pages.dev). Existe **um único pedido de junção** `teste` → `main`; se não houver um aberto, abra. Passe ao dono o link do pedido e lembre do endereço de teste.
- **Juntar na `main` (o app oficial) é decisão do dono:** ele clica em Merge no GitHub. O Cloudflare publica sozinho em uns 2 minutos. Depois de juntar, a `teste` continua existindo: antes da próxima mudança, atualize a `teste` com a `main` (`git merge origin/main`) e siga trabalhando nela.
- **Mudanças no banco não são automáticas:** quando houver arquivo novo em `supabase/migrations/`, avise o dono e passe o link "raw" para ele rodar no SQL Editor, conferindo com `supabase/conferencia_seguranca.sql`.
- O endereço de teste usa o **mesmo banco** do app oficial: avise para testar com dados de teste e apagar depois.
- Commits pequenos, com mensagem em português.
