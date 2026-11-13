# Começar o uso real (passo a passo)

Lista para sair do treino e começar a lançar os dados de verdade. Faça na ordem.

## 1. Proteger o Supabase (antes de qualquer dado real)

1. **Plano Pro**: Supabase → **Organization → Billing** → Pro. É o que faz **backup diário** automático.
2. **Senhas vazadas**: **Authentication → Attack Protection** (ou **Policies**) → ligar **Prevent use of leaked passwords**.
3. **Cadastro fechado**: **Authentication → Sign In / Providers** → **Allow new users to sign up** desligado.
4. **Endereço do app**: **Authentication → URL Configuration → Site URL** = `https://firma-6l0.pages.dev` → **Save**.
5. Opcional (Pro): **Authentication → Sessions → Inactivity timeout** = `12 hours`.

## 2. Conferir o banco

1. Rode `supabase/conferencia_seguranca.sql` no **SQL Editor**: **as 17 linhas com ✅** (a 17 confirma a limpeza automática de 30 dias agendada).
2. **Advisors → Security Advisor**: **0 erros** (os avisos amarelos já conhecidos são esperados).

## 3. Apagar os dados de treino

1. Antes, se quiser guardar o treino: **Configurações → Baixar planilha de lançamentos**.
2. **SQL Editor → New query**, cole `supabase/limpeza_dados_de_treino.sql`.
3. Na linha `set local acumula.confirmar = 'DIGITE AQUI';` troque **DIGITE AQUI** por **APAGAR DADOS DE TREINO** (mantenha as aspas).
4. **Run**. No fim aparece: projetos 0, fichas 0, lançamentos 0, usuários mantidos, registro 1.
5. Apague essa consulta do histórico do SQL Editor (três pontinhos → **Delete query**).

## 4. Acertar os usuários

1. **Usuários → Trocar senha** no seu usuário: troque a senha temporária por uma definitiva (frase longa).
2. Exclua ou desative os usuários de treino que não vão continuar.
3. Cada pessoa com o **próprio usuário**, do tipo **Operador**. Administrador só quem precisa.
4. Ninguém compartilha senha. Quando alguém sair da empresa: **Desativar** na hora.

## 5. Cadastrar e começar

1. **Configurações → Adicionar projeto**, e em cada projeto **Operações → Nova operação** (as fichas).
2. **Primeiro lançamento de cada ficha**: o app já liga o **Novo jogo** sozinho (marca "1º lançamento"). Lance o valor que o contador mostra hoje: ele vira o ponto de partida e **não** entra no resultado do dia. As contas começam certas a partir do segundo lançamento.
3. Confira o primeiro dia em **Relatórios → Ver histórico**.

## Rotina

- **Toda semana**: Configurações → **Baixar planilha de lançamentos** e guardar fora do computador (ex.: Google Drive).
- **De vez em quando**: olhar **Registro** e o **último acesso** em Usuários; rodar a conferência de segurança.
- Contador recomeçou? Ligar **Novo jogo** antes de salvar.

- **Lembrete:** lançamentos e Registro com mais de 30 dias são **apagados sozinhos** toda madrugada (03:15). Se precisar guardar algo, baixe a planilha antes.
