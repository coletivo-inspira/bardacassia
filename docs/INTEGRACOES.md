# Integrações públicas e descoberta musical

## Visão geral

O site é estático (Vite + GitHub Pages). O **catálogo de karaokê** em `public/data/songs.json` é a única fonte de verdade sobre músicas disponíveis e seus códigos. Serviços externos enriquecem a descoberta, mas **não adicionam faixas ao karaokê**.

| Fonte | Finalidade | Autenticação | Comportamento se falhar |
| --- | --- | --- | --- |
| Catálogo local | Títulos, artistas, códigos, início da letra | Nenhuma | Exibir erro de carregamento |
| Deezer | Capas, previews e artistas relacionados | Sem chave; proxy próprio opcional (Edge Function `deezer-proxy`) | Iniciais no lugar da capa, sem preview; sugestões editoriais quando disponíveis |
| Spotify (opcional) | Sugerir músicas a partir das 50 faixas mais ouvidas da conta | OAuth 2.0 Authorization Code + PKCE, `user-top-read` | Seleção manual de artistas continua funcionando |
| Supabase (opcional) | Ranking agregado e identidade anônima por navegador | Auth anônima + RPC com RLS | Descoberta, busca e lista local continuam funcionando |
| Supabase Auth (opcional) | Login, cadastro, perfil e exclusão de conta | E-mail + senha, link por e-mail, OAuth (PKCE) | Catálogo, favoritas e lista da noite continuam sem conta |
| Navegador | Favoritas do usuário (sincronizadas com a conta, se houver login) | Nenhuma | Se armazenamento estiver bloqueado, informar limitação |

## Deezer

O adaptador está em `src/integrations/deezer.js`:

1. Busca metadados sob demanda apenas quando a linha aparece na tela.
2. Limita a **quatro requisições simultâneas**, evitando rajadas de chamadas.
3. Valida **artista e título** antes de associar capa e preview; uma busca externa não prova que a faixa está no catálogo.
4. Mantém cache por até sete dias para acertos e um dia para resultados vazios; o cache local tem limite de 500 entradas.
5. Consulta artistas relacionados via busca do artista e endpoint de relacionados. Só mostra os nomes que também existem no catálogo local.
6. Se o endpoint falhar, tenta sugestões editoriais de artistas dos grupos curados, quando existirem.

**Transporte e segurança:** a ordem de preferência é:

1. **Proxy próprio** (`VITE_DEEZER_PROXY_URL`, Edge Function `deezer-proxy`): `fetch` comum, sem executar JavaScript de terceiros, com allowlist de caminhos e parâmetros, CORS restrito às origens do site, cache de 24h e limite de 120 requisições por minuto por IP. É o recomendado em produção.
2. **Proxy do Vite** (`/api/deezer`), apenas em desenvolvimento.
3. **JSONP**, só quando nenhum proxy está configurado. O JSONP executa JavaScript de terceiros na página; por isso, configure o proxy assim que o Supabase estiver ativo.

Não coloque segredos no frontend.

## Spotify: importar as mais ouvidas

O adaptador está em `src/integrations/spotify.js`. Ele é **opcional** e o botão só aparece quando o Client ID estiver configurado.

### Preparação

1. Crie um aplicativo no [Spotify Developer Dashboard](https://developer.spotify.com/dashboard).
2. Cadastre a **Redirect URI exata** do site, por exemplo `https://coletivo-inspira.github.io/bardacassia/` (com barra final), e a URL de desenvolvimento que efetivamente usar. O Spotify pode restringir URIs HTTP locais conforme suas políticas.
3. Para desenvolvimento, copie `.env.example` para `.env.local` e defina `VITE_SPOTIFY_CLIENT_ID`.
4. No GitHub, configure a **Actions variable** `SPOTIFY_CLIENT_ID` (não um segredo). O workflow de deploy a expõe como `VITE_SPOTIFY_CLIENT_ID` durante o build.
5. Verifique no painel do Spotify os requisitos vigentes para modo de desenvolvimento, usuários permitidos, aprovação do aplicativo e eventual exigência de conta Premium.

### Fluxo de autorização e privacidade

- O usuário escolhe **Importar minhas mais ouvidas do Spotify** e autoriza o escopo `user-top-read`.
- O aplicativo usa **Authorization Code + PKCE**, sem `client_secret` no navegador.
- Após o retorno, consulta `GET /v1/me/top/tracks?limit=50&time_range=medium_term`.
- O token fica somente na memória da operação; o verificador PKCE fica temporariamente no `sessionStorage` e é apagado após o retorno. Os parâmetros de autorização são removidos da URL.
- O navegador compara artista e título com `songs.json`. Apenas **códigos correspondentes do karaokê** entram nas sugestões. Só “Quero cantar” inclui a música na lista da noite.
- O aplicativo **não publica playlist**, não altera a biblioteca do Spotify e não armazena o histórico completo de audição.

**Importante:** “mais ouvidas” (top tracks) **não é** a lista de músicas marcadas como “curtidas” no Spotify. Para importar curtidas, seria necessário outro escopo, outro endpoint e nova avaliação de permissões.

### Limitações conhecidas

- A correspondência usa artista e título normalizados; versões ao vivo, remixes, participações e grafias diferentes podem não coincidir.
- Nem toda música ouvida no Spotify existe no catálogo do bar. O resultado informa quantas foram encontradas.
- O Spotify impõe requisitos de cadastro, permissões, limites de acesso e de requisições, que podem mudar. A disponibilidade para público geral precisa ser confirmada antes do lançamento.
- Se o Spotify negar acesso, a busca e as favoritas locais continuam utilizáveis.

## Supabase: ranking e interações anônimas

O cliente está em `src/integrations/popularity.js`; a migração inicial está em `supabase/migrations/001_song_popularity.sql`.

1. Crie um projeto Supabase e execute a migração no SQL Editor.
2. Ative Anonymous Sign-Ins em Authentication > Sign In / Providers.
3. Configure as variáveis GitHub Actions `SUPABASE_URL` e `SUPABASE_ANON_KEY`, e adicione `SUPABASE_SERVICE_ROLE_KEY` como secret. As duas variáveis Vite são públicas e protegidas por RLS. A service role nunca recebe prefixo `VITE_`.
4. O workflow sincroniza os códigos ativos do catálogo após o build. Para sincronizar localmente, exporte `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` e execute `npm run sync-catalog`.
5. Sem as variáveis Vite, o site mostra sugestões da casa e continua funcionando sem ranking compartilhado. Para desativar temporariamente cada recurso no build, use `VITE_ENABLE_DISCOVERY=false`, `VITE_ENABLE_POPULARITY=false` ou `VITE_ENABLE_SPOTIFY=false`; todos ficam ligados por padrão quando omitidos. No GitHub Actions, configure as variáveis de repositório `ENABLE_DISCOVERY`, `ENABLE_POPULARITY` e `ENABLE_SPOTIFY` com o valor `false` para desligá-los.

As RPCs `record_song_open`, `set_song_favorite` e `get_popular_songs` são as interfaces do navegador. RLS bloqueia acesso direto às interações individuais. Cada identidade anônima pode registrar até 120 gravações por minuto. Abrir detalhes conta uma vez por música; um favorito mantido contribui três pontos; removê-lo retira esses pontos. A fila local guarda até 500 mudanças pendentes, consolidadas por música e ação, e tenta enviá-las quando a conexão voltar. O ranking fica em cache por cinco minutos.

Limpar os dados locais pode criar outra identidade anônima. Isso reduz repetições comuns, mas não comprova uma pessoa única.

O ranking, o login e a sincronização de favoritas compartilham o mesmo cliente (`src/integrations/supabase.js`). Uma pessoa logada registra interações com a própria conta. Um visitante sem conta recebe uma sessão anônima, e a sessão antiga (`bdc-supabase-session-v1`) é migrada automaticamente.

## Autenticação (login e contas)

A página `login.html` (`src/login.js`) segue o layout de um cartão de login clássico: e-mail, senha com botão de mostrar/ocultar e link "Esqueceu?", opção "Manter conectado", link de acesso por e-mail, botões sociais opcionais e o rodapé "Cadastrar". Os modos ficam no hash da URL: `#entrar`, `#cadastrar`, `#link`, `#redefinir`, `#nova-senha` e `#conta`. O cabeçalho de todas as páginas mostra "Entrar" ou o menu da conta.

### Arquitetura

```text
Navegador (GitHub Pages) ──PKCE──> Supabase Auth (hash bcrypt, JWT de 1h + refresh rotativo)
        │ JWT
        ├──> Postgres via RPC/PostgREST, com RLS: cada pessoa só lê/edita o próprio perfil
        └──> Edge Functions (Deno): operações que exigem a service role, como excluir a conta
```

- **Senhas:** só o Supabase Auth as recebe, e armazena apenas o hash bcrypt. Nenhuma tabela do projeto guarda senha.
- **Sessão:** `@supabase/supabase-js` com `flowType: "pkce"`, carregado sob demanda. Com "Manter conectado" marcado, a sessão fica no `localStorage`; desmarcado, no `sessionStorage`, e some ao fechar a aba.
- **Conta a partir do visitante anônimo:** no cadastro, a sessão anônima é convertida (`updateUser`), mantendo o mesmo `user_id`. Se a versão do Auth só aceitar a senha depois da confirmação do e-mail, o link de confirmação leva a `#nova-senha`.
- **Redirecionamento:** `?next=` só aceita caminhos relativos do próprio site (`safeNextPath`), evitando *open redirect*.
- **Erros:** mensagens genéricas ("E-mail ou senha inválidos.", "Se houver uma conta com esse e-mail…") não revelam quais e-mails estão cadastrados.
- **CSP:** `login.html` tem Content-Security-Policy própria. O script inline do tema é liberado por hash, e `tests/login-csp.test.js` falha se o script mudar sem atualizar o hash.

### Banco de dados (`supabase/migrations/002_auth_profiles.sql`)

- `public.profiles`: `id` (FK para `auth.users`, com `on delete cascade`), `display_name`, `created_at`, `updated_at`. RLS permite `select` e `update` apenas do próprio perfil e não permite nada para `anon` ou para sessões anônimas. O perfil é criado por trigger quando surge uma conta permanente, inclusive na conversão de uma conta anônima.
- `private.consume_write()` passa a aceitar contas logadas, além das anônimas, mantendo o limite de 120 gravações por minuto.
- **Criptografia de colunas sensíveis:** dados como telefone ficam em `private.profile_secrets`, cifrados com `pgp_sym_encrypt` (pgcrypto). A chave fica no **Supabase Vault** e só é lida por funções `security definer` (`set_my_phone` / `get_my_phone`), restritas ao dono. Crie a chave uma vez no SQL Editor:

  ```sql
  select vault.create_secret(encode(extensions.gen_random_bytes(32), 'base64'), 'profile_encryption_key');
  ```

- Além disso, o Supabase cifra o disco em repouso (AES-256) e todo o tráfego usa TLS. Guarde apenas o que for necessário.

### Edge Functions (`supabase/functions/`)

| Função | JWT | Finalidade |
| --- | --- | --- |
| `account-delete` | Obrigatório | Valida o token com `auth.getUser` e exclui a conta com a service role. Perfil, segredos e interações são apagados em cascata. |
| `deezer-proxy` | Público | Proxy somente leitura para `/search`, `/search/artist` e `/artist/:id/related`, com allowlist de parâmetros, CORS restrito, cache de 24h e limite por IP. Substitui o JSONP quando `VITE_DEEZER_PROXY_URL` está configurada. |

```bash
supabase functions deploy account-delete
supabase functions deploy deezer-proxy --no-verify-jwt
supabase secrets set ALLOWED_ORIGINS="https://coletivo-inspira.github.io,http://localhost:5173"
```

`SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` já são injetadas pelo Supabase nas funções. Novas rotinas privilegiadas (por exemplo, para o DJ ou a gestão do bar) devem seguir o mesmo padrão: validar o JWT, conferir um papel em `app_metadata.role` (que só a service role altera) e reforçar a regra com RLS.

### Configuração no painel do Supabase

1. Aplique as migrações em ordem (`001`, `002`, `003`), pelo SQL Editor ou pelo workflow descrito abaixo.
2. **Authentication > Providers > Email:** ative a confirmação de e-mail, senha mínima de 8 caracteres com letras e dígitos e a proteção contra senhas vazadas (*leaked password protection*).
3. **Authentication > URL Configuration:** use a URL do site como Site URL e cadastre `https://coletivo-inspira.github.io/bardacassia/login.html` e `http://localhost:5173/login.html` nas Redirect URLs.
4. **Authentication > Attack Protection:** ative o CAPTCHA com Cloudflare Turnstile (secret key no painel) e defina `VITE_AUTH_CAPTCHA_SITE_KEY` com a site key pública.
5. **Sessions:** mantenha o JWT com expiração de 1h e a rotação de refresh token ativada (padrão).
6. **Google / Facebook (opcional):** crie os apps OAuth, cadastre o callback `https://<projeto>.supabase.co/auth/v1/callback`, ative os provedores e defina `VITE_AUTH_PROVIDERS=google,facebook`. Sem isso, os botões ficam ocultos.
7. Mantenha os Anonymous Sign-Ins ativos para o ranking de visitantes.

### Publicação automática (`.github/workflows/supabase.yml`)

A cada push na `main` que altere `supabase/**` (ou manualmente em *Actions > Deploy Supabase*), o workflow aplica as migrações pendentes (`supabase db push`), define `ALLOWED_ORIGINS` e publica as duas Edge Functions. Sem a configuração abaixo, ele é ignorado com um aviso, sem falhar.

| Tipo | Nome | Valor |
| --- | --- | --- |
| Secret | `SUPABASE_ACCESS_TOKEN` | Token pessoal em supabase.com > Account > Access Tokens |
| Secret | `SUPABASE_DB_PASSWORD` | Senha do banco do projeto |
| Variável | `SUPABASE_PROJECT_REF` | ID do projeto (o subdomínio de `https://<ref>.supabase.co`) |
| Variável | `ALLOWED_ORIGINS` | `https://coletivo-inspira.github.io` (separe várias origens com vírgula) |
| Variável | `DEEZER_PROXY_URL` | `https://<ref>.supabase.co/functions/v1/deezer-proxy`, usada pelo build do site |

Se as migrações já foram executadas à mão no SQL Editor, marque-as como aplicadas antes do primeiro deploy, para o CLI não reexecutá-las: `supabase migration repair --status applied 001 002 003`. Os scripts são idempotentes, então reaplicá-los na ordem também chega ao mesmo estado final.

O CI dos pull requests roda `deno check` nas Edge Functions.

Variáveis do GitHub Actions: `ENABLE_AUTH` (`false` desliga o login), `AUTH_PROVIDERS`, `AUTH_CAPTCHA_SITE_KEY` e `DEEZER_PROXY_URL`. Todas são públicas por natureza; nenhum segredo vai para o frontend.

### Login por telefone ou nome de usuário

O login usa e-mail. Para aceitar nome de usuário, seria preciso traduzi-lo para e-mail no servidor, o que facilita enumerar contas. O login por telefone com SMS exige um provedor pago (por exemplo, Twilio) configurado no Supabase Auth. Os dois podem ser adicionados depois, sem mudar a estrutura.

### Alternativa: backend próprio

Se surgirem regras de negócio pesadas, uma opção é Node (Fastify) + Postgres + Argon2id para hash de senha + sessões em cookies `httpOnly`/`Secure`/`SameSite`, hospedado em Render ou Fly. O custo é manter servidor, banco, backups e CORS/cookies entre domínios, já que o site está no GitHub Pages. Para o escopo atual, o Supabase cobre autenticação, RLS e funções de servidor com menos superfície de ataque.

## Privacidade e operação

As favoritas são códigos de música salvos **neste navegador**. Sem conta, limpar os dados do navegador remove essa lista.

**Com conta, as favoritas sincronizam entre aparelhos** (`supabase/migrations/003_favorites_sync.sql`, `src/integrations/favorites-sync.js`):

- Ao abrir o catálogo logado, o navegador envia as favoritas locais e recebe a lista da conta em uma única chamada (`sync_my_favorites`, até 1.000 códigos). O resultado é a união das duas, sem códigos que saíram do catálogo.
- Marcar ou desmarcar uma favorita logado envia a mudança pela mesma fila do ranking (`set_song_favorite`), inclusive com `VITE_ENABLE_POPULARITY=false`. Assim, uma remoção feita em um aparelho não "volta" no outro.
- A RPC só aceita contas permanentes, confere o código no catálogo ativo e respeita o limite de gravações por minuto. As favoritas ficam em `song_interactions`, protegida por RLS. O Deezer recebe consultas por título/artista; o Spotify só é acessado após ação explícita do usuário.

## Testes e verificações

```bash
npm ci
npm test
npm run build
deno check supabase/functions/*/index.ts   # opcional, requer Deno
```

Fluxos no navegador (requer Playwright): `TEST_URL=http://127.0.0.1:4173/ node scripts/verify-flows.cjs` com `npm run preview` rodando. O script também cobre os modos da página de login.

Testar manualmente o login com um projeto Supabase real: cadastro com confirmação de e-mail, login com senha errada e certa, "Manter conectado" desmarcado (fechar a aba encerra a sessão), link por e-mail, redefinição de senha, Google/Facebook (se ativados), excluir conta e favoritas aparecendo em outro aparelho.

Testar manualmente: pesquisa sem acento, busca por código, artista com múltiplas músicas, filtro de favoritas, erro/timeout do Deezer, permissão negada no Spotify, retorno OAuth, catálogo sem correspondências, mobile e navegação por teclado.
