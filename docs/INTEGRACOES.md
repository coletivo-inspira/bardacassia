# Integrações públicas e descoberta musical

## Visão geral

O site é estático (Vite + GitHub Pages). O **catálogo de karaokê** em `public/data/songs.json` é a única fonte de verdade sobre músicas disponíveis e seus códigos. Serviços externos enriquecem a descoberta, mas **não adicionam faixas ao karaokê**.

| Fonte | Finalidade | Autenticação | Comportamento se falhar |
| --- | --- | --- | --- |
| Catálogo local | Títulos, artistas, códigos, início da letra | Nenhuma | Exibir erro de carregamento |
| Deezer | Capas, previews e artistas relacionados | Sem chave no fluxo atual | Iniciais no lugar da capa, sem preview; sugestões editoriais quando disponíveis |
| Spotify (opcional) | Sugerir músicas a partir das 50 faixas mais ouvidas da conta | OAuth 2.0 Authorization Code + PKCE, `user-top-read` | Seleção manual de artistas continua funcionando |
| Supabase (opcional) | Ranking agregado e identidade anônima por navegador | Auth anônima + RPC com RLS | Descoberta, busca e lista local continuam funcionando |
| Supabase Auth (opcional) | Login, cadastro, perfil e exclusão de conta | E-mail + senha, link por e-mail, OAuth (PKCE) | Catálogo, favoritas e lista da noite continuam sem conta |
| Navegador | Favoritas do usuário | Nenhuma | Se armazenamento estiver bloqueado, informar limitação |

## Deezer

O adaptador está em `src/integrations/deezer.js`:

1. Busca metadados sob demanda apenas quando a linha aparece na tela.
2. Limita a **quatro requisições simultâneas**, evitando rajadas de chamadas.
3. Valida **artista e título** antes de associar capa e preview; uma busca externa não prova que a faixa está no catálogo.
4. Mantém cache por até sete dias para acertos e um dia para resultados vazios; o cache local tem limite de 500 entradas.
5. Consulta artistas relacionados via busca do artista e endpoint de relacionados. Só mostra os nomes que também existem no catálogo local.
6. Se o endpoint falhar, tenta sugestões editoriais de artistas dos grupos curados, quando existirem.

**Observação de segurança:** no desenvolvimento, o Vite faz proxy de `/api/deezer`; no GitHub Pages, o navegador usa JSONP por causa das restrições de CORS do Deezer. JSONP executa JavaScript de terceiros na página. Para endurecer a segurança em produção, recomenda-se futuramente um pequeno proxy serverless próprio com CORS controlado, limites de taxa e cache. Não coloque segredos no frontend.

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

O ranking e o login compartilham o mesmo cliente (`src/integrations/supabase.js`). Uma pessoa logada registra interações com a própria conta. Um visitante sem conta recebe uma sessão anônima, e a sessão antiga (`bdc-supabase-session-v1`) é migrada automaticamente.

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

1. Execute `002_auth_profiles.sql` depois de `001_song_popularity.sql`.
2. **Authentication > Providers > Email:** ative a confirmação de e-mail, senha mínima de 8 caracteres com letras e dígitos e a proteção contra senhas vazadas (*leaked password protection*).
3. **Authentication > URL Configuration:** use a URL do site como Site URL e cadastre `https://coletivo-inspira.github.io/bardacassia/login.html` e `http://localhost:5173/login.html` nas Redirect URLs.
4. **Authentication > Attack Protection:** ative o CAPTCHA com Cloudflare Turnstile (secret key no painel) e defina `VITE_AUTH_CAPTCHA_SITE_KEY` com a site key pública.
5. **Sessions:** mantenha o JWT com expiração de 1h e a rotação de refresh token ativada (padrão).
6. **Google / Facebook (opcional):** crie os apps OAuth, cadastre o callback `https://<projeto>.supabase.co/auth/v1/callback`, ative os provedores e defina `VITE_AUTH_PROVIDERS=google,facebook`. Sem isso, os botões ficam ocultos.
7. Mantenha os Anonymous Sign-Ins ativos para o ranking de visitantes.

Variáveis do GitHub Actions: `ENABLE_AUTH` (`false` desliga o login), `AUTH_PROVIDERS`, `AUTH_CAPTCHA_SITE_KEY` e `DEEZER_PROXY_URL`. Todas são públicas por natureza; nenhum segredo vai para o frontend.

### Login por telefone ou nome de usuário

O login usa e-mail. Para aceitar nome de usuário, seria preciso traduzi-lo para e-mail no servidor, o que facilita enumerar contas. O login por telefone com SMS exige um provedor pago (por exemplo, Twilio) configurado no Supabase Auth. Os dois podem ser adicionados depois, sem mudar a estrutura.

### Alternativa: backend próprio

Se surgirem regras de negócio pesadas, uma opção é Node (Fastify) + Postgres + Argon2id para hash de senha + sessões em cookies `httpOnly`/`Secure`/`SameSite`, hospedado em Render ou Fly. O custo é manter servidor, banco, backups e CORS/cookies entre domínios, já que o site está no GitHub Pages. Para o escopo atual, o Supabase cobre autenticação, RLS e funções de servidor com menos superfície de ataque.

## Privacidade e operação

As favoritas são códigos de música salvos **neste navegador**, ainda sem sincronização entre aparelhos, mesmo para quem tem conta. Limpar os dados do navegador remove essa lista. O Deezer recebe consultas por título/artista; o Spotify só é acessado após ação explícita do usuário.

## Testes e verificações

```bash
npm ci
npm test
npm run build
```

Testar manualmente: pesquisa sem acento, busca por código, artista com múltiplas músicas, filtro de favoritas, erro/timeout do Deezer, permissão negada no Spotify, retorno OAuth, catálogo sem correspondências, mobile e navegação por teclado.
