<p align="center">
  <img src="./public/logo_bar_da_cacia_animada.svg" width="220" alt="Logo animada do Bar da Cácia: microfone vintage com asas" />
</p>

<h1 align="center">Bar da Cácia · Catálogo de Karaokê</h1>

<p align="center">
  Encontre a música, descubra artistas e mostre o código ao DJ.
</p>

<p align="center">
  <a href="https://coletivo-inspira.github.io/bardacassia/">Abrir o catálogo</a> ·
  <a href="./docs/ARQUITETURA.md">Arquitetura</a> ·
  <a href="./docs/INTEGRACOES.md">Integrações</a> ·
  <a href="./docs/APRESENTACAO.md">Apresentação</a> ·
  <a href="./docs/PESQUISA-E-UX.md">Busca e UX</a>
</p>

## O que o portal faz

- **Pesquisa local:** música, artista, código ou começo da letra, sem diferenciar acentos; correspondências mais relevantes aparecem primeiro.
- **Descoberta:** clique no nome do artista para filtrar suas músicas e explorar artistas relacionados disponíveis no próprio catálogo.
- **Favoritas:** página `favoritos.html` com abas locais no navegador, sem criar conta; no catálogo, o filtro “Somente favoritas”. Com login, a **lista de códigos** sincroniza entre aparelhos (as abas continuam só neste aparelho).
- **Spotify opcional:** com autorização do usuário, usa suas **50 mais ouvidas** como sugestões e só as adiciona à lista da noite quando a pessoa escolhe “Quero cantar”.
- **Descoberta por cartões:** escolha artistas, passe ou selecione músicas e mantenha uma lista da noite salva neste navegador.
- **Mais populares:** ranking agregado, quando o Supabase está configurado e as migrações estão aplicadas.
- **Deezer:** capas e trechos de áudio quando disponíveis; o site continua funcional sem a API.
- **Conta (opcional):** login por e-mail e senha, link por e-mail ou Google/Facebook. Na Conta, o topo expande para editar foto (Storage `avatars`), aniversário, telefone e consentimento LGPD. Senhas ficam só no Supabase Auth (hash bcrypt) e cada pessoa só acessa o próprio perfil.
- **Código ao DJ:** exibe o código para o usuário mostrar ao DJ.
- **Pedidos pelo QR (opcional, Supabase):** o cliente toca em “Mostrar ao garçom” e um QR aparece na tela. O garçom lê com o celular, cobra e a música entra na fila em `garcom.html`, que também mostra as tocadas da noite. Como o aparelho do cliente não grava nada, ninguém consegue pedir de casa. O modo antigo, em que o cliente pede sozinho, continua disponível com `VITE_REQUEST_MODE=remoto` e um código da noite.
- **Resultados para o dono:** pedidos por noite, clientes, espera média, mais pedidas e pedidos por garçom, na aba “Resultados” do painel. Acessos ao site via Google Analytics 4 ou Cloudflare Web Analytics (`VITE_ANALYTICS_ID`).
- **Cartaz para imprimir:** `cartaz.html` gera o QR do catálogo em A5 ou A4, marcado com a origem (mesa, balcão…).

O catálogo tem aproximadamente 12,7 mil músicas e é gerado a partir de `data/musicas.csv` ou `data/lista-musica.pdf`.

## Executar localmente

Requer **Node.js 22** e npm.

```bash
npm ci
npm run dev
```

Abra a URL mostrada pelo Vite. Para verificar alterações:

```bash
npm test
npm run build
npm run preview
```

O site é publicado pelo GitHub Pages a partir de `dist/` via `.github/workflows/static.yml`. Pull requests executam testes e build no workflow `.github/workflows/ci.yml`.

## Atualizar o catálogo

A fonte editável é `data/musicas.csv`, com campos `code,artist,title,lyricStart,lang` (e enriquecimento Deezer). O JSON publicado é o catálogo enxuto `public/data/songs.json` mais o mapa de capas `public/data/song-covers.json`.

```bash
# Reimportar o CSV
npm run import-songs -- --csv data/musicas.csv

# Reimportar o PDF (requer pdftotext / poppler-utils)
npm run import-songs -- --pdf data/lista-musica.pdf
```

Revise os dados gerados antes de fazer commit de `public/data/songs.json`, `public/data/song-covers.json` e, quando aplicável, `data/musicas.csv`.

## Integração Spotify (opcional)

O botão só aparece quando o Client ID estiver configurado. A autorização usa **OAuth 2.0 com PKCE** e o escopo `user-top-read`, sem segredo no frontend.

1. Cadastre um app no [Spotify Developer Dashboard](https://developer.spotify.com/dashboard).
2. Cadastre a Redirect URI exata do site, por exemplo `https://coletivo-inspira.github.io/bardacassia/`.
3. Localmente, copie `.env.example` para `.env.local` e preencha `VITE_SPOTIFY_CLIENT_ID`.
4. No GitHub, crie a variável de Actions `SPOTIFY_CLIENT_ID` para habilitar o recurso no deploy.
5. Confira as regras atuais de acesso do Spotify, inclusive usuários autorizados e limites do modo de desenvolvimento.

**Mais ouvidas não são as faixas curtidas.** A integração lê as top tracks de um período recente, cruza título e artista com o catálogo e usa os códigos correspondentes como sugestões. Nenhum token é persistido no armazenamento local. Leia os [detalhes, limites e privacidade](./docs/INTEGRACOES.md).

## Arquitetura e Supabase

Mapa do ambiente (páginas, migrações `001`–`008`, RPCs, Storage, variáveis e workflows): [Arquitetura](./docs/ARQUITETURA.md).

O backend opcional é um único projeto Supabase (ex.: **Cacia**). `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` ligam o cliente; `SUPABASE_SERVICE_ROLE_KEY` fica só no Actions para `sync-catalog`. Com `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD` e `SUPABASE_PROJECT_REF`, o workflow `.github/workflows/supabase.yml` aplica as migrações pelo **session pooler IPv4** (o Actions não alcança o host direto IPv6) e publica as Edge Functions. Se o host auto falhar, use o secret `SUPABASE_DB_URL` (URI Session do Dashboard → Connect). **Sem um Deploy Supabase verde, Auth pode funcionar e mesmo assim perfil (`PGRST205`), ranking e favoritas falham.**

## Ranking compartilhado (opcional)

Veja [Integrações](./docs/INTEGRACOES.md#supabase-ranking-e-interações-anônimas). Depois das migrações, o build sincroniza `catalog_codes`; localmente use `npm run sync-catalog`.

## Login e contas (opcional)

Mesmo projeto Supabase. Configure Redirect URLs, confirmação de e-mail e, se quiser, Turnstile e Google/Facebook. `VITE_ENABLE_AUTH=false` desliga o login. Perfil, avatar, LGPD, Vault e Edge Functions: [Integrações](./docs/INTEGRACOES.md#autenticação-login-e-contas).

## Pedidos de música e painel do garçom (opcional)

Mesmo Supabase. Com as migrações `001`–`008` aplicadas, cadastre os garçons (e o dono com `role = 'dono'`) e abra `garcom.html`. Passo a passo: [Integrações](./docs/INTEGRACOES.md#pedidos-de-música-e-painel-do-garçom). Para desligar só os pedidos: `VITE_ENABLE_REQUESTS=false`.

## Organização do projeto

```text
src/
  main.js                  # interface e estados da pesquisa
  qr-request.js            # QR "Mostrar ao garçom" e status do pedido
  song-requests.js         # pedido remoto, meus pedidos e fila do cliente
  garcom.js                # painel do garçom e do dono (garcom.html)
  cartaz.js                # cartaz para imprimir (cartaz.html)
  lib/qr-ticket.js         # conteúdo do QR, ticket e textos de status
  lib/metrics.js           # formatação da aba Resultados
  integrations/analytics.js # GA4 ou Cloudflare Web Analytics
  login.js                 # página de login/cadastro/conta
  favorites-page.js        # favoritos.html: abas e lista das favoritas
  lib/song-row.js          # linha de música compartilhada (catálogo e favoritos)
  styles.css               # layout e identidade visual
  lib/catalog.js           # ranking, normalização e conciliação
  lib/requests.js          # validação e textos de pedidos, fila e rodada
  integrations/deezer.js   # metadados e artistas relacionados
  integrations/spotify.js  # autorização PKCE e top tracks
  integrations/supabase.js # cliente Supabase compartilhado (sessão)
  integrations/auth.js     # login, cadastro, OAuth, redefinição de senha
  integrations/profile.js  # perfil, avatar Storage e consentimento LGPD
  lib/auth-validation.js   # validação e mensagens de erro do login
  lib/profile.js           # compressão de avatar e versão do consentimento
  integrations/requests.js # chamadas de pedidos e do painel
  integrations/favorites-sync.js # sync_my_favorites
supabase/
  migrations/              # 001–008: ranking, auth, favoritas, pedidos, perfil/Storage
  functions/               # Edge Functions (account-delete, deezer-proxy)
public/
  data/songs.json          # catálogo publicado (sem coverUrl)
  data/song-covers.json    # capas Deezer (code → url)
  data/song-connections.json # grafo offline (lazy no cliente)
  logo_bar_da_cacia_animada.svg
data/
  musicas.csv              # fonte editável
  lista-musica.pdf         # fonte alternativa
scripts/import-songs.js
scripts/sync-catalog.js
tests/
docs/ARQUITETURA.md
docs/INTEGRACOES.md
docs/PESQUISA-E-UX.md
docs/APRESENTACAO.md
```

## Decisões e limites

O catálogo local é a fonte de verdade para **disponibilidade e código**. As APIs externas são auxiliares; falhas não devem bloquear a busca. Favoritas locais (e abas) ficam neste navegador; com conta, só os códigos sincronizam. Prefira o proxy Deezer (`VITE_DEEZER_PROXY_URL`) em produção — detalhes em [Integrações](./docs/INTEGRACOES.md).

A interface respeita navegação por teclado, foco visível, regiões `aria-live` e preferência por movimento reduzido. A logo animada acima já está versionada em `public/`; se o GitHub não reproduzir a animação em um contexto, ela permanece como identidade visual estática.
