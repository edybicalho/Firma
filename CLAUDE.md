# Acumula (repositório Firma)

App web de controle financeiro por projeto. O dono do projeto fala português do Brasil: responda e escreva textos da interface em português.

## O que o app faz

- Cada **projeto** tem **operações** ("fichas", com número e nome).
- Em cada operação o usuário lança valores **acumulados** de entrada e saída (o total até agora, não o do dia). O movimento real é a diferença para o lançamento anterior da mesma operação.
- **Painel** (título "PONTOS"): abre numa **página de seleção de projeto** (quadros com nº de fichas, resultado do dia e ÷ 2 um embaixo do outro, e última alteração). Ao tocar num projeto, entra nele: fichas em quadros (cada uma com o resultado do dia; tocar seleciona), lançamento novo, lançamento anterior, "Resultado do dia do projeto" (e ÷ 2) e a consulta de lançamentos. "← Todos os projetos" volta para a seleção. No quadro "Lançamento anterior", o quadro mostra sempre **só o último lançamento**; o **calendário** abre a lista de **todos os lançamentos** da ficha (por mês; dois lançamentos no mesmo dia aparecem em duas linhas, com o horário e o movimento de cada um); tocar num lançamento mostra ele no quadro (só consulta: o lançamento novo continua comparando com o último).
- **Relatórios**: um card por projeto com o **último resultado ÷ 2** (resultado do último dia com lançamento), um botão de **Observações** ao lado do nome e **"Ver histórico"** (`src/ReportDetail.tsx`): página do projeto com filtros de período (7 dias, 30 dias, este mês, tudo) e de ficha, resumo do período (resultado, ÷ 2, dias, lançamentos) e cada dia com resultado, ÷ 2 e todos os lançamentos (ficha, hora, entrada, saída, **sobra de entrada**, **sobra de saída**, movimento). Sobra = diferença para o lançamento anterior da mesma ficha (`diffsById`); movimento = sobra de entrada − sobra de saída; num novo jogo as sobras são zero. A planilha também tem as colunas de sobra. Operadores também veem (só consulta).
- **Configurações** (só administrador): criar, renomear e excluir projetos e operações.
- **Usuários** (só administrador, aba ao lado de Configurações): criar usuário, editar nome e login, trocar senha, tornar administrador ou operador, desativar e excluir. Mostra o **último acesso** de cada pessoa ("hoje às 14:30", "há 9 dias", "Nunca entrou"), pela função `admin_list_users` (só administradores); sem a função no banco, a lista aparece sem essa linha.
- **Registro** (só administrador): quem criou, alterou ou excluiu o quê e quando (tabela `audit_log`, com cópia do antes e do depois; ninguém apaga).
- **Configurações** também tem "Baixar planilha de lançamentos" (CSV para Excel), como cópia de segurança.

## Tecnologia

- React 18 + TypeScript + Vite + Tailwind; ícones `lucide-react`.
- Supabase (`src/lib/supabase.ts`) com `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` no `.env` (fora do Git).
- Arquivos: `src/App.tsx` (app principal, `Workspace`, controle de login), `src/Login.tsx` (tela de entrada e de acesso desativado), `src/UsersAdmin.tsx` (gestão de usuários), `src/AuditLog.tsx` (tela Registro), `src/ReportDetail.tsx` (histórico do projeto em Relatórios), `src/lib/calc.ts` (leitura de valores e todas as contas), `src/lib/audit.ts` (frases do registro), `src/lib/pages.ts` (busca em páginas), `src/lib/types.ts` (perfis e regra do login), `src/index.css` (todo o visual: tema claro primeiro e, no fim, o bloco do tema escuro com seletores `html[data-theme=dark]`; ao mudar uma cor, ajuste os dois), `src/lib/theme.ts` e `public/tema.js` (botão sol/lua; a escolha fica guardada no navegador de cada pessoa; padrão: claro).
- `public/_headers`: cabeçalhos de segurança do Cloudflare Pages (se trocar de hospedagem ou do Supabase, revisar o `connect-src`).
- O Supabase devolve no máximo 1.000 linhas por consulta: toda lista que pode crescer usa `fetchAllPages` com ordem fixa terminando em `id`.
- Importado do Bolt; o projeto **não volta para o Bolt**.

## Regras de negócio já decididas

- Login por **usuário e senha, sem e-mail**. O Supabase exige e-mail, então cada usuário recebe um interno `usuario@acumula.local` (`usernameToEmail`). Não existe cadastro público: só o administrador cria usuários.
- **Operador** vê só Painel e Relatórios; pode lançar, excluir **só lançamentos do dia** (horário de Brasília) e escrever observações.
- **Administrador** vê tudo. Ninguém altera, desativa ou exclui o próprio acesso. Sempre existe pelo menos um administrador ativo (o banco bloqueia o contrário).
- Senha mínima de **8** caracteres (tela e banco). Trocar a senha ou desativar alguém encerra as sessões abertas dessa pessoa.
- Valores digitados no jeito brasileiro (`1.234,56`; `1.500` = mil e quinhentos). Valor inválido é recusado com aviso, nunca vira zero. O acumulado novo não pode ser menor que o anterior, **exceto com o botão "Novo jogo"** ligado.
- **Novo jogo** (botão no quadro de novo lançamento; por dentro é uma "nova base"): aceita qualquer número e ele vira o novo ponto de partida da ficha; o movimento desse lançamento é zero (não soma no resultado do dia) e os próximos comparam com ele. Fica marcado no banco em `movements.is_base` e aparece como "novo jogo" no histórico, na lista do calendário, na planilha e no Registro. O botão desliga sozinho depois de salvar e ao trocar de ficha. **No primeiro lançamento de uma ficha ele já vem ligado** (com a marca "1º lançamento"), para o valor que o contador já tem virar o ponto de partida em vez de entrar inteiro no resultado do dia; dá para desligar.
- **Ordem dos lançamentos** (o movimento depende dela): dia, depois horário exato até o microssegundo (`timeKey`) e, em empate, o id — igual no app (`byDateAsc`), na conferência antes de salvar e no gatilho do banco. Nunca usar `localeCompare` para horários (ele põe "12:00:00.5" antes de "12:00:00").
- **Contas sempre em centavos inteiros** (`toCents`/`fromCents` em `src/lib/calc.ts`), nunca somando valores com vírgula direto: evita sobras de fração de centavo e "-R$ 0,00". Campos de valor vêm preenchidos com pontos de milhar (1.260.000,75). Entrada e Saída mostram o valor do último lançamento; ao tocar, o campo esvazia para digitar o novo (o antigo fica clarinho no fundo) e, se sair sem digitar, o antigo volta.
- **Uso real, com várias pessoas e celular** (testado em `e2e/cenarios.cjs`):
  - Antes de salvar, o app confere no banco se alguém lançou na mesma ficha; se sim, atualiza os valores e pede para conferir (não grava por cima).
  - A **data do lançamento é a do servidor** (o app não manda `recorded_at`; o banco usa a data de Brasília), então celular com data errada não atrapalha.
  - A data de "hoje" na tela vira sozinha à meia-noite (confere a cada 30 s).
  - Ao voltar para o app (trocar de aba, desbloquear o celular), busca os dados novos (no máximo a cada 20 s) e reconfere se o acesso continua ativo; o que estava digitado não se perde.
  - Sem internet: mensagens dizem que é a conexão (`friendlyError` em `src/lib/supabase.ts`); se falhar ao abrir, mostra "Não foi possível conectar" com "Tentar de novo" (nunca "usuário desativado").
  - Campos de texto têm limite (nomes 200, observações 10.000, nome de pessoa 100), iguais aos do banco.
- **Apagar após 30 dias (decisão do dono, apagar de verdade):** toda madrugada (03:15 de Brasília, pg_cron `apagar-mais-de-30-dias`) a função `purge_old_data(30)` apaga os lançamentos com `recorded_at <= hoje - 30` e as linhas do Registro com mais de 30 dias, **sem deixar cópia no Registro** (o gatilho de auditoria e a proteção do Registro só se desligam dentro dela, via `acumula.purging` + `current_user` postgres). Antes, guarda em `operation_baselines` a entrada e a saída do último lançamento apagado de cada ficha: o app transforma isso em "âncoras" (`anchorsFrom`, `is_anchor`) que **só entram nas contas** (movimento/sobra do primeiro lançamento restante, comparação do lançamento novo, regra do acumulado no banco) e **nunca aparecem** em telas, totais ou planilha. Ficha sem lançamentos mas com âncora: o quadro mostra "Último lançamento (já apagado: mais de 30 dias)" e o "Novo jogo" não vem ligado. O Registro anota "Limpeza automática: apagou N lançamentos". Prazo mínimo 30 dias; só o sistema (não o app) dispara.
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
6. `20261113120000_nova_base.sql`: coluna `is_base` em `movements` (botão "Novo jogo").
7. `20261114120000_conferencia_acumulado.sql`: o banco recusa acumulado menor que o último lançamento da ficha (`acumulado_menor`), exceto em "Novo jogo" ou lançamento com data anterior ao último (correção do administrador); e salva uma pessoa de cada vez por ficha (`pg_advisory_xact_lock`).
8. `20261115120000_ultimo_acesso.sql`: função `admin_list_users` (perfis + último login de `auth.users`), só para administradores.
9. `20261116120000_apagar_apos_30_dias.sql`: tabela `operation_baselines`, função `purge_old_data` e agendamento diário no pg_cron (se o pg_cron não ligar sozinho: Database → Extensions → pg_cron e rodar de novo).

Depois: `select public.create_first_admin('admin', 'senha', 'Nome');` e desligar os cadastros públicos em Authentication.

Na criação do projeto: Data API ligada, **"Automatically expose new tables" desligada** (a migração 5 libera cada tabela explicitamente) e "Enable automatic RLS" ligada. O `npm run test:db` testa os dois jeitos.

**Guia completo para o dono:** `docs/SUPABASE_SEGURO.md` (conta com MFA, plano Pro, cadastro fechado, migrações, primeiro administrador com senha temporária, chaves, rotina). Depois de instalar, `supabase/conferencia_seguranca.sql` (só lê) tem que mostrar ✅ em todas as 17 linhas; o `npm run test:db` também roda essa conferência.

Se a migração 5 mostrar um "Aviso" (dados antigos fora da regra ou números de operação repetidos), nada foi perdido: corrigir os dados e rodar a 5 de novo.

**Testes:** `npm run test:telas` (22 cenários do dia a dia no navegador, com banco simulado). `npm run check` (tipos, verificador e 95 testes; `src/lib/calc.milhoes.test.ts` compara milhares de lançamentos aleatórios em milhões com a conta exata em centavos). `npm run test:db` roda as migrações, as verificações de acesso e os testes da limpeza de 30 dias (`supabase/tests/30_apagar_30_dias.sql`) num PostgreSQL local (com pg_cron: `shared_preload_libraries = 'pg_cron'`, `cron.database_name = 'teste_novo'`), com uma imitação do Supabase (`supabase/tests/`), num banco novo e num banco antigo do Bolt com dados.

**Situação (novembro de 2026):**
- Supabase **novo** criado (projeto `acumula`, região São Paulo, **plano gratuito por enquanto**), com conta protegida por autenticação em dois fatores. Criado com "Automatically expose new tables" desligado e "Enable automatic RLS" ligado; GitHub **não** conectado ao Supabase.
- As migrações 1 a 7 rodaram no Supabase real e a conferência deu **✅ nas 14 linhas** (confirmado pelo dono em novembro de 2026); a **8 (último acesso) ainda precisa ser rodada pelo dono** (depois, a conferência tem 15 linhas). O primeiro administrador foi criado. O Security Advisor mostra 0 erros e 9 avisos esperados (funções de administrador chamáveis por usuários logados, que conferem `is_admin()` por dentro; `rls_auto_enable` do próprio Supabase; proteção de senhas vazadas, que só existe no Pro).
- **Endereços:** app oficial https://firma-6l0.pages.dev (branch `main`); site de teste https://teste.firma-6l0.pages.dev (branch `teste`, atualiza sozinho a cada envio; o dono só dá F5). Projeto no Cloudflare: `firma-6l0`. Os endereços com código (`xxxxxxxx.firma-6l0.pages.dev`) são de uma publicação específica e não mudam.
- App publicado no **Cloudflare Pages** a partir da `main`, com `VITE_SUPABASE_URL` (só o endereço base, sem `/rest/v1/`), `VITE_SUPABASE_ANON_KEY` (chave `sb_publishable_...`) e `NODE_VERSION=22`. O login funcionou de verdade.
- Ainda **sem dados reais**: os dados atuais são de **treino** (a equipe está aprendendo a usar, com usuários operadores). Antes dos dados reais: preparar o arquivo de limpeza (apaga projetos, fichas, lançamentos e o registro do treino; mantém o administrador; testar no PostgreSQL local antes), mudar para o plano Pro e ligar "Prevent use of leaked passwords".

## Próximos passos combinados

**Para começar o uso real: seguir `docs/COMECAR_USO_REAL.md`** (Pro + senhas vazadas, cadastro fechado, Site URL, migração 8 e conferência com 15 ✅, limpeza do treino com `supabase/limpeza_dados_de_treino.sql`, trocar a senha temporária, usuários, projetos e fichas).

- `supabase/limpeza_dados_de_treino.sql` (fora das migrações, de propósito): apaga projetos, fichas, lançamentos e o Registro; mantém usuários. Só roda com a frase `APAGAR DADOS DE TREINO`; testado no `npm run test:db` (sem a frase não apaga nada; depois dela a conferência fica toda ✅ e o app volta a lançar normalmente).
- Pendência de funcionalidade: o administrador **corrigir lançamentos de dias anteriores** pela tela (o banco já permite e registra).
- Melhorias de segurança oferecidas e ainda não escolhidas pelo dono: código no celular (MFA) para administradores, sair sozinho quando parado, bloquear senhas fracas.

## Forma de trabalho

- O dono não é programador: explique em linguagem simples, sem jargão.
- **Envio automático (autorizado pelo dono):** depois de testar (`npm run check`, e `npm run test:db` se mexer no banco), faça commit e `git push` sem pedir permissão, **sempre na versão fixa `teste`**, nunca direto na `main` e sem criar outras versões (o dono não quer várias versões de teste).
- **Uma versão de teste só:** a branch `teste` tem endereço fixo no Cloudflare (https://teste.firma-6l0.pages.dev). Existe **um único pedido de junção** `teste` → `main`; se não houver um aberto, abra. Passe ao dono o link do pedido e lembre do endereço de teste.
- **Juntar na `main` (o app oficial) é decisão do dono:** ele clica em Merge no GitHub. O Cloudflare publica sozinho em uns 2 minutos. Depois de juntar, a `teste` continua existindo: antes da próxima mudança, atualize a `teste` com a `main` (`git merge origin/main`) e siga trabalhando nela.
- **Mudanças no banco não são automáticas:** quando houver arquivo novo em `supabase/migrations/`, avise o dono e passe o link "raw" para ele rodar no SQL Editor, conferindo com `supabase/conferencia_seguranca.sql`.
- O endereço de teste usa o **mesmo banco** do app oficial: avise para testar com dados de teste e apagar depois.
- Commits pequenos, com mensagem em português.
