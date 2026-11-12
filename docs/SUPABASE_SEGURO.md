# Montar o Supabase com segurança (passo a passo)

Guia para colocar o banco do Acumula no ar. Leva cerca de 30 minutos.
Os nomes dos botões estão como aparecem no Supabase (em inglês); se algum mudar um pouco de lugar, procure pelo nome.

## Parte 1 — Proteger a sua conta do Supabase

Quem entra na sua conta do Supabase vê e apaga todos os dados. Por isso, isto vem antes de tudo.

1. Entre em **supabase.com** com a conta que vai ser a dona do projeto.
2. Clique na sua foto (canto) → **Account preferences** → **Security** e ative a **autenticação em dois fatores (MFA)** com um aplicativo como Google Authenticator ou Authy. Guarde os códigos de recuperação num lugar seguro.
3. Se o login do Supabase é pelo GitHub, ative também a autenticação em dois fatores no GitHub.
4. Não compartilhe essa conta. Se outra pessoa precisar entrar, convide-a pela organização (**Organization → Team**) com o menor papel possível (**Read-only** ou **Developer**, nunca **Owner**).

## Parte 2 — Criar o projeto

1. **New project**.
2. **Name**: `acumula`.
3. **Database Password**: clique em **Generate a password** e guarde num gerenciador de senhas. Ela não é usada pelo app, mas dá acesso total ao banco.
4. **Region**: **South America (São Paulo)**.
5. **Plano**: **Pro**. É o que tem **backup diário automático** (guarda os últimos 7 dias). Com dados importantes, não use o plano gratuito: ele não tem backup que você consiga restaurar e o projeto é pausado se ficar uma semana sem uso.

> **Supabase antigo do Bolt:** se for usar o que o Bolt criou, confira antes em **Project Settings → General** se você é o dono (Owner) e se ele está em São Paulo e no plano Pro. Se não tiver certeza de quem mais tem acesso a ele, é mais seguro criar um novo e trazer os dados.

## Parte 3 — Fechar a porta de cadastro

O app não tem cadastro: só o administrador cria usuários. A porta do Supabase precisa ficar fechada.

Em **Authentication → Sign In / Providers**:

1. Desligue **Allow new users to sign up**.
2. Desligue **Allow anonymous sign-ins** (se aparecer).
3. Em **Email**: deixe ligado (o login por usuário e senha usa este provedor por dentro). **Confirm email** pode ficar como está.
4. Deixe desligados todos os outros provedores (Phone, Google, etc.).

Em **Authentication → Attack Protection** (ou **Policies / Passwords**, dependendo da versão):

5. Ligue **Prevent use of leaked passwords**, que bloqueia senhas que já vazaram na internet (recurso do plano Pro).
6. **Minimum password length**: `8`.

Em **Authentication → Sessions** (plano Pro), recomendado:

7. **Inactivity timeout**: `12 hours`, para que quem esquecer o app aberto num computador seja desconectado.

## Parte 4 — Instalar o banco

Em **SQL Editor**, rode **um arquivo por vez, nesta ordem**. Para cada arquivo: abra no GitHub, copie todo o conteúdo, cole no editor e clique em **Run**. Deve aparecer **Success**.

1. `supabase/migrations/20261107170000_base_tables.sql`
2. `supabase/migrations/20261107180000_project_notes.sql`
3. `supabase/migrations/20261107190000_login_and_roles.sql`
4. `supabase/migrations/20261112120000_registro_alteracoes.sql`
5. `supabase/migrations/20261112130000_seguranca.sql`

Se der erro, **pare** e me mande a mensagem. Nada fica pela metade: cada arquivo é seguro de rodar de novo.

## Parte 5 — Criar o primeiro administrador

1. Ainda no SQL Editor, rode (trocando usuário, senha e nome):

   ```sql
   select public.create_first_admin('seu.usuario', 'uma-senha-temporaria', 'Seu Nome');
   ```

2. **Importante:** o SQL Editor guarda o histórico do que foi digitado, com a senha junto. Por isso, use uma senha **temporária**: depois de entrar no app, vá em **Usuários → Trocar senha** no seu próprio usuário e defina a senha definitiva.
3. Apague essa consulta do histórico do SQL Editor (lista à esquerda → **Delete**).

## Parte 6 — Conferir a segurança

No SQL Editor, rode `supabase/conferencia_seguranca.sql`. Ele só lê, não muda nada.
Tem que aparecer **✅ em todas as linhas**. Se aparecer ❌, a última coluna diz o que fazer.

Rode também o verificador do próprio Supabase: **Advisors → Security Advisor**. Não deve aparecer nenhum item vermelho (**ERROR**). Se aparecer, me mande o print.

## Parte 7 — Chaves de acesso do app

Em **Project Settings → API Keys** (ou **API**):

- **Pode usar no app:** a chave **anon** (ou **publishable**, que começa com `sb_publishable_`). Ela é pública por natureza; quem protege os dados são as regras do banco que acabamos de instalar.
- **Nunca coloque no app, no GitHub ou em mensagem:** a chave **service_role** (ou **secret**, que começa com `sb_secret_`). Ela passa por cima de todas as regras. Se ela vazar algum dia, clique em gerar uma nova na mesma tela.

Essas duas informações (o endereço do projeto e a chave anon) vão no Cloudflare Pages, como `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.

## Parte 8 — Depois de publicar o app

1. Em **Authentication → URL Configuration**, coloque em **Site URL** o endereço do app no Cloudflare.
2. Entre no app como administrador, crie um operador de teste e confira:
   - o operador **não** vê Configurações, Usuários nem Registro;
   - o operador **não** consegue excluir lançamento de ontem;
   - a aba **Registro** mostra o que cada um fez.
3. Exclua o operador de teste.

## Rotina de segurança

- **Toda semana:** em Configurações, clique em **Baixar planilha de lançamentos** e guarde o arquivo fora do computador (Google Drive, por exemplo). É a sua cópia independente do Supabase.
- **Quando alguém sair da empresa:** desative ou exclua o usuário na hora. A pessoa é desconectada.
- **De vez em quando:** olhe a aba Registro e rode a conferência de segurança.
- **Senhas:** cada pessoa com o próprio usuário. Nunca compartilhe o usuário de administrador.
