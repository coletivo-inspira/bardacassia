<p align="center">
  <img src="./public/logo_bar_da_cacia_animada.svg" width="220" alt="Logo animada do Bar da Cácia: microfone vintage com asas" />
</p>

<h1 align="center">Bar da Cácia · Catálogo de Karaokê</h1>

<p align="center">
  Encontre a música, descubra artistas e mostre o código ao DJ.
</p>

<p align="center">
  <a href="https://coletivo-inspira.github.io/bardacassia/">Abrir o catálogo</a> ·
  <a href="./docs/INTEGRACOES.md">Integrações</a> ·
  <a href="./docs/PESQUISA-E-UX.md">Busca e UX</a>
</p>

## O que o portal faz

- **Pesquisa local:** música, artista, código ou começo da letra, sem diferenciar acentos; correspondências mais relevantes aparecem primeiro.
- **Descoberta:** clique no nome do artista para filtrar suas músicas e explorar artistas relacionados disponíveis no próprio catálogo.
- **Favoritas:** salve as músicas para cantar no navegador, sem criar conta. Com login, elas sincronizam entre aparelhos.
- **Spotify opcional:** com autorização do usuário, usa suas **50 mais ouvidas** como sugestões e só as adiciona à lista da noite quando a pessoa escolhe “Quero cantar”.
- **Descoberta por cartões:** escolha artistas, passe ou selecione músicas e mantenha uma lista da noite salva neste navegador.
- **Mais populares:** ranking agregado, quando o Supabase está configurado.
- **Deezer:** capas e trechos de áudio quando disponíveis; o site continua funcional sem a API.
- **Conta (opcional):** login por e-mail e senha, link por e-mail ou Google/Facebook, em uma página inspirada nos cartões de login de marketplaces. Senhas ficam só no Supabase Auth (hash bcrypt) e cada pessoa só acessa o próprio perfil.
- **Código ao DJ:** exibe o código para o usuário mostrar ao DJ.
- **Pedidos de música (opcional, Supabase):** o cliente toca em “Pedir esta música”, informa nome e telefone (lembrados no aparelho), paga no bar e acompanha a posição em “Meus pedidos”. O garçom confirma o pagamento e controla a fila e as rodadas pelo celular em `garcom.html`.

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

A fonte editável é `data/musicas.csv`, com campos `code,artist,title,lyricStart,lang`. O JSON publicado é `public/data/songs.json`.

```bash
# Reimportar o CSV
npm run import-songs -- --csv data/musicas.csv

# Reimportar o PDF (requer pdftotext / poppler-utils)
npm run import-songs -- --pdf data/lista-musica.pdf
```

Revise os dados gerados antes de fazer commit de `public/data/songs.json` e, quando aplicável, `data/musicas.csv`.

## Integração Spotify (opcional)

O botão só aparece quando o Client ID estiver configurado. A autorização usa **OAuth 2.0 com PKCE** e o escopo `user-top-read`, sem segredo no frontend.

1. Cadastre um app no [Spotify Developer Dashboard](https://developer.spotify.com/dashboard).
2. Cadastre a Redirect URI exata do site, por exemplo `https://coletivo-inspira.github.io/bardacassia/`.
3. Localmente, copie `.env.example` para `.env.local` e preencha `VITE_SPOTIFY_CLIENT_ID`.
4. No GitHub, crie a variável de Actions `SPOTIFY_CLIENT_ID` para habilitar o recurso no deploy.
5. Confira as regras atuais de acesso do Spotify, inclusive usuários autorizados e limites do modo de desenvolvimento.

**Mais ouvidas não são as faixas curtidas.** A integração lê as top tracks de um período recente, cruza título e artista com o catálogo e usa os códigos correspondentes como sugestões. Nenhum token é persistido no armazenamento local. Leia os [detalhes, limites e privacidade](./docs/INTEGRACOES.md).

## Ranking compartilhado (opcional)

Veja [Integrações](./docs/INTEGRACOES.md#supabase-ranking-e-interações-anônimas) para configurar o Supabase, executar a migração e sincronizar os códigos. `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` habilitam o ranking; `SUPABASE_SERVICE_ROLE_KEY` é somente um secret do GitHub Actions para sincronizar o catálogo.

## Login e contas (opcional)

Usa o mesmo projeto Supabase. Execute `supabase/migrations/002_auth_profiles.sql`, configure as Redirect URLs e a confirmação de e-mail e, se quiser, o CAPTCHA (Turnstile) e os provedores Google/Facebook. `VITE_ENABLE_AUTH=false` desliga o login. Com os secrets `SUPABASE_ACCESS_TOKEN` e `SUPABASE_DB_PASSWORD` e a variável `SUPABASE_PROJECT_REF`, o workflow `.github/workflows/supabase.yml` aplica as migrações e publica as Edge Functions sozinho. O passo a passo, o modelo de dados, a criptografia com Vault e as Edge Functions (`account-delete`, `deezer-proxy`) estão em [Integrações](./docs/INTEGRACOES.md#autenticação-login-e-contas).

## Pedidos de música e painel do garçom (opcional)

Usa o mesmo Supabase do ranking e do login. Aplique `supabase/migrations/004_song_requests.sql` com as demais migrações (pelo workflow ou pelo SQL Editor), cadastre os garçons e abra `garcom.html` no celular do bar. O passo a passo está em [Integrações](./docs/INTEGRACOES.md#pedidos-de-música-e-painel-do-garçom). Para desligar só os pedidos, use `VITE_ENABLE_REQUESTS=false`.

## Organização do projeto

```text
src/
  main.js                  # interface e estados da pesquisa
  song-requests.js         # pedir música, meus pedidos e fila do cliente
  garcom.js                # painel do garçom (garcom.html)
  login.js                 # página de login/cadastro/conta
  styles.css               # layout e identidade visual
  lib/catalog.js           # ranking, normalização e conciliação
  lib/requests.js          # validação e textos de pedidos, fila e rodada
  integrations/deezer.js   # metadados e artistas relacionados
  integrations/spotify.js  # autorização PKCE e top tracks
  integrations/supabase.js # cliente Supabase compartilhado (sessão)
  integrations/auth.js     # login, cadastro, OAuth, redefinição de senha
  lib/auth-validation.js   # validação e mensagens de erro do login
  integrations/requests.js # chamadas de pedidos e do painel
supabase/
  migrations/              # RLS, perfis, segredos cifrados, pedidos e fila
  functions/               # Edge Functions (account-delete, deezer-proxy)
public/
  data/songs.json          # catálogo publicado
  logo_bar_da_cacia_animada.svg
data/
  musicas.csv              # fonte editável
  lista-musica.pdf         # fonte alternativa
scripts/import-songs.js
tests/catalog.test.js
tests/requests.test.js
docs/INTEGRACOES.md
docs/PESQUISA-E-UX.md
```

## Decisões e limites

O catálogo local é a fonte de verdade para **disponibilidade e código**. As APIs externas são auxiliares; falhas não devem bloquear a busca. Favoritas ficam neste navegador e podem desaparecer quando os dados locais forem limpos. O Deezer em produção ainda usa JSONP, cujo risco e alternativa com proxy estão documentados em [Integrações](./docs/INTEGRACOES.md).

A interface respeita navegação por teclado, foco visível, regiões `aria-live` e preferência por movimento reduzido. A logo animada acima já está versionada em `public/`; se o GitHub não reproduzir a animação em um contexto, ela permanece como identidade visual estática.
