# Arquitetura do ambiente — Bar da Cácia

Visão ponta a ponta do portal de karaokê: o que roda onde, como as peças se conectam e o que cada migração / variável controla. Detalhes de configuração de serviços externos ficam em [Integrações](./INTEGRACOES.md).

## Stack

| Camada | Tecnologia | Papel |
| --- | --- | --- |
| Frontend | Vite multi-page (HTML + JS ES modules) | Catálogo, login, painel do garçom, cartaz |
| Hospedagem | GitHub Pages | `dist/` publicado por `.github/workflows/static.yml` |
| Domínios | `https://cacia.inspira.dev.br/` e `https://coletivo-inspira.github.io/bardacassia/` | Produção e espelho Pages |
| Catálogo | `public/data/songs.json` + `song-covers.json` (gerados de `data/musicas.csv`) | Fonte de verdade de músicas/códigos; capas em sidecar |
| Backend opcional | Supabase (Auth + Postgres + Storage + Edge Functions) | Conta, ranking, favoritas sync, pedidos, avatar |
| CI | `.github/workflows/ci.yml` | Testes Node + `deno check` nas Edge Functions |
| Deploy DB | `.github/workflows/supabase.yml` | `db push` via session pooler IPv4 + Edge Functions |

Sem as variáveis `VITE_SUPABASE_*`, o site continua útil: busca, descoberta, favoritas locais e código ao DJ funcionam só no navegador.

```text
                    ┌─────────────────────────────────────┐
                    │  Navegador (cliente / garçom)       │
                    │  index · login · garcom · cartaz    │
                    └───────────────┬─────────────────────┘
                                    │
          ┌─────────────────────────┼─────────────────────────┐
          ▼                         ▼                         ▼
   songs.json (Pages)        Supabase Auth              APIs opcionais
   capas Deezer (proxy)      JWT PKCE                   Spotify PKCE
          │                         │                   Analytics
          │                         ▼
          │              PostgREST / RPC + RLS
          │              Storage bucket avatars
          │              Edge Functions (Deno)
          └─────────►  ranking / favoritas / fila
                       (espelho catalog_codes)
```

## Páginas e módulos

| Página | Entrada | Função |
| --- | --- | --- |
| `index.html` | `src/main.js` | Busca (com o filtro “Somente favoritas”), descoberta, ranking, QR/pedido |
| `favoritos.html` | `src/favorites-page.js` | Meus favoritos: abas, mover entre abas, código ao DJ (`index.html#favoritas` redireciona para cá) |
| `login.html` | `src/login.js` | Entrar, cadastrar, link, redefinir, Minha conta (perfil/LGPD) |
| `garcom.html` | `src/garcom.js` | Fila, pagamento, rodada, código da noite, Resultados (dono ou admin) |
| `admin.html` | `src/admin.js` | Interruptores do site, modo do pedido, provedores e papéis (`profiles.role = admin`) |
| `cartaz.html` | `src/cartaz.js` | QR do catálogo para impressão (A5/A4 + origem) |
| `evento.html` / `o-bar.html` | JS fino | Conteúdo institucional |

Módulos centrais em `src/`:

- `integrations/supabase.js` — cliente compartilhado, sessão PKCE, storage “Manter conectado”
- `integrations/auth.js` — login, OAuth, exclusão via Edge Function `account-delete`
- `integrations/profile.js` — `profiles` + upload no Storage `avatars`
- `integrations/popularity.js` — `record_song_open`, `set_song_favorite`, `get_popular_songs`
- `integrations/favorites-sync.js` — `sync_my_favorites` (lista plana de códigos)
- `integrations/requests.js` — RPCs de pedidos, staff e dono
- `lib/favorites.js` — abas locais (`Rascunho` + nomeadas) e leitura/gravação em `bdc-favorites-v2`; **só os códigos** sobem para a conta
- `lib/song-row.js` — linha de música do catálogo (capa, código, favoritar, trecho, Spotify) e “Mover para…”, usada por `main.js` e `favorites-page.js`
- `qr-request.js` / `song-requests.js` — modos `qr` e `remoto`

## Fluxos principais

### Visitante anônimo → conta

1. Sem login, o ranking e (quando preciso) os pedidos usam **Anonymous Sign-In**.
2. No cadastro, a sessão anônima pode ser convertida (`updateUser`), mantendo o mesmo `user_id`.
3. Trigger `on_auth_user_saved` cria a linha em `public.profiles` para contas permanentes.
4. Consentimento LGPD versionado e foto/aniversário ficam no perfil (`008_profile_extras.sql`).

### Favoritas

1. Códigos e **abas** ficam no `localStorage` deste navegador.
2. Com conta permanente, `sync_my_favorites` une a lista local com a da conta (até 1.000 códigos).
3. Toggle logado também grava via `set_song_favorite` (mesma fila do ranking).
4. Estrutura de abas **não** é persistida no Postgres — só o conjunto de códigos favoritos.

### Ranking

- Espelho de códigos ativos: `catalog_codes`, preenchido por `scripts/sync-catalog.js` (`sync_catalog_codes`, só `service_role`).
- Interações em `song_interactions`; leitura agregada por `get_popular_songs`.
- Limite: 120 gravações/minuto por identidade (`private.consume_write`).

### Pedidos: QR (padrão) vs remoto

| | `VITE_REQUEST_MODE=qr` | `VITE_REQUEST_MODE=remoto` |
| --- | --- | --- |
| Quem grava o pedido | Garçom (`staff_add_request`) | Cliente (`create_song_request`) |
| Pedido de casa | Impossível (cliente só gera QR local) | Barraível com código da noite |
| Status no cliente | `get_ticket_status` (anon + authenticated) | `get_my_requests` + `get_public_queue` |

Painel (`garcom.html`): abas Fila, A pagar (remoto), Rodada, Resultados (`owner_metrics`). A fila aceita a linha em `staff` ou o papel do perfil `garcom` / `dono` / `admin`. Resultados aceita `staff.role = 'dono'` ou perfil `dono` / `admin`. Quem configura o site entra em `admin.html` (só `profiles.role = 'admin'`).

## Modelo de dados (migrações)

Aplicar **sempre** com o workflow (session pooler IPv4 no Actions). A ordem no diretório `supabase/migrations/` é a ordem de aplicação.

| Migração | Objetos principais | RPCs / APIs públicas |
| --- | --- | --- |
| `001_song_popularity.sql` | `catalog_codes`, `song_interactions`, `private.write_limits` | `record_song_open`, `set_song_favorite`, `get_popular_songs`; `sync_catalog_codes` (**service_role**) |
| `002_auth_profiles.sql` | `profiles`, `private.profile_secrets`, trigger de perfil | `set_my_phone`, `get_my_phone` (telefone de Minha conta, E.164) |
| `003_favorites_sync.sql` | — | `sync_my_favorites` |
| `004_song_requests.sql` | `staff`, `bar_settings`, `song_requests` | `create_song_request` (depois redefinida), `get_my_requests`, `get_public_queue`, `staff_*` básicos |
| `005_staff_qr_requests.sql` | papel em `staff`, campos QR em pedidos | `staff_add_request`, `staff_list_played`, `staff_whoami`, `get_ticket_status` |
| `006_owner_metrics.sql` | — | `owner_metrics` |
| `007_request_presence.sql` | código da noite em `bar_settings` | `create_song_request` (4 args), `staff_get_night_code`, `staff_set_night_code` |
| `008_profile_extras.sql` | colunas LGPD/avatar em `profiles`, bucket `avatars` | PostgREST em `profiles` + Storage policies |
| `009_profile_phone_key.sql` | chave Vault `profile_encryption_key` (só se faltar) | grants de `set_my_phone` / `get_my_phone` |
| `010_site_config.sql` | `profiles.role`, singleton `site_features` | `get_site_features` (anon + authenticated), `set_site_features`, `admin_list_profiles`, `admin_set_profile_role` (só admin) |

Quase todas as tabelas usam **RLS com revoke** para `anon`/`authenticated` e acesso via funções `security definer`. Exceções conscientes: `profiles` (select/update próprio) e Storage `avatars` (pasta = `auth.uid()`).

## Edge Functions

| Função | JWT | Uso |
| --- | --- | --- |
| `account-delete` | Obrigatório | Apaga a conta com service role após validar o usuário |
| `deezer-proxy` | Desligado (`--no-verify-jwt`) | Proxy allowlisted para metadados Deezer; secret `ALLOWED_ORIGINS` |

## Variáveis de ambiente

### Frontend (prefixo `VITE_`, embutidas no build)

| Variável | Origem típica no Actions | Efeito |
| --- | --- | --- |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | `SUPABASE_URL` / `SUPABASE_ANON_KEY` | Liga Auth, RPC, perfil |
| `VITE_ENABLE_AUTH` / `POPULARITY` / `REQUESTS` / `DISCOVERY` / `SPOTIFY` | `ENABLE_*` | Feature flags (`false` desliga). Com a migração `010` aplicada, o painel em `admin.html` grava o mesmo conjunto em `site_features` e o site obedece na hora; estas variáveis continuam o padrão quando o Supabase falta ou a leitura falha. Busca e código ao DJ não têm interruptor. |
| `VITE_REQUEST_MODE` | `REQUEST_MODE` | `qr` (padrão) ou `remoto` |
| `VITE_AUTH_PROVIDERS` | `AUTH_PROVIDERS` | Ex.: `google,facebook` |
| `VITE_AUTH_CAPTCHA_SITE_KEY` | `AUTH_CAPTCHA_SITE_KEY` | Turnstile (site key pública) |
| `VITE_DEEZER_PROXY_URL` | `DEEZER_PROXY_URL` | URL da Edge Function |
| `VITE_SPOTIFY_CLIENT_ID` | `SPOTIFY_CLIENT_ID` | OAuth Spotify |
| `VITE_ANALYTICS_ID` | `ANALYTICS_ID` | GA4 (`G-…`) ou Cloudflare |
| `VITE_SITE_URL` | `SITE_URL` | Base do QR do cartaz |

### Secrets / servidor (nunca `VITE_`)

| Nome | Uso |
| --- | --- |
| `SUPABASE_ACCESS_TOKEN` | CLI no workflow de deploy |
| `SUPABASE_DB_PASSWORD` | Monta a URI do session pooler no `db push` |
| `SUPABASE_DB_URL` (opcional) | URI Session pooler do Dashboard → Connect; sobrescreve o host auto `aws-0-<region>` |
| `SUPABASE_SERVICE_ROLE_KEY` | Sync do catálogo e Edge Functions (injetada pela plataforma nas functions) |
| `SUPABASE_PROJECT_REF` (variável) | Ref do projeto (`ajhokdqtpufpfceszyfo` no Cacia) |
| `ALLOWED_ORIGINS` (variável) | CORS do `deezer-proxy` |

Modelo local: copiar [`.env.example`](../.env.example) para `.env.local`.

## Workflows GitHub Actions

| Workflow | Quando | O que faz |
| --- | --- | --- |
| `ci.yml` | PR / push | `npm test`, build; `deno check` nas functions |
| `static.yml` | push `main` | `vite build`, `sync-catalog` (service role), publish Pages |
| `supabase.yml` | push em `supabase/**` / o YAML, ou manual | `db push` no session pooler IPv4, secrets das functions, deploy `account-delete` e `deezer-proxy` |

Se `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD` ou `SUPABASE_PROJECT_REF` faltarem, o deploy Supabase **só avisa e sai** (não falha). Com secrets presentes, o push usa o **shared session pooler** (IPv4): o host direto do Postgres é IPv6 e o Actions não alcança. Sem esse caminho, o schema de produção fica vazio — sintomas: `PGRST205` em `profiles`, RPC **404**, avatar **400**. Detalhes em [Integrações → Troubleshooting](./INTEGRACOES.md#troubleshooting-do-schema).

## Checklist operacional (projeto Cacia)

1. Secrets/variáveis do Actions preenchidos (tabela acima). Se o pooler auto falhar, adicione `SUPABASE_DB_URL` (Session, porta 5432).
2. Painel Auth: Anonymous Sign-Ins, e-mail com confirmação, **Site URL** = `…/login.html` (não `localhost:3000`), Redirect URLs do domínio + Pages + `localhost:5173`, templates de e-mail a partir de `supabase/email-templates/`.
3. **Actions → Deploy Supabase** verde (migrações `001`–`010` + functions; a `009` cria a chave Vault `profile_encryption_key` se faltar; a `010` liga o painel de funcionalidades).
4. Confirmar no SQL Editor que a chave existe: `select name from vault.secrets where name = 'profile_encryption_key';`
5. **Deploy Vite site to Pages** (ou push em `main`) para embutir `VITE_*` e rodar `sync-catalog`.
6. Smoke: login → Minha conta (foto, aniversário, telefone) → favoritar em dois aparelhos → ranking → QR no `garcom.html`.
7. Inserir linhas em `public.staff` (e `role = 'dono'` quando couber).

## Relação com os outros docs

- [Integrações](./INTEGRACOES.md) — passo a passo Deezer, Spotify, Auth, pedidos, privacidade
- [Apresentação](./APRESENTACAO.md) — pitch do piloto e checklist de fim de semana
- [Busca e UX](./PESQUISA-E-UX.md) — critérios de aceitação da pesquisa e favoritas
