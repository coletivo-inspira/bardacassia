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
- **Favoritas:** salve as músicas para cantar no navegador, sem criar conta.
- **Spotify opcional:** com autorização do usuário, importa suas **50 mais ouvidas** e salva como favoritas apenas as faixas que existem no catálogo de karaokê.
- **Deezer:** capas e trechos de áudio quando disponíveis; o site continua funcional sem a API.
- **Código ao DJ:** exibe o código para o usuário mostrar ao DJ. **Não envia pedidos automaticamente à fila.**

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

**Mais ouvidas não são as faixas curtidas.** A integração lê as top tracks de um período recente, cruza título e artista com o catálogo e salva somente os códigos correspondentes. Nenhum token é persistido no armazenamento local. Leia os [detalhes, limites e privacidade](./docs/INTEGRACOES.md).

## Organização do projeto

```text
src/
  main.js                  # interface e estados da pesquisa
  styles.css               # layout e identidade visual
  lib/catalog.js           # ranking, normalização e conciliação
  integrations/deezer.js   # metadados e artistas relacionados
  integrations/spotify.js  # autorização PKCE e top tracks
public/
  data/songs.json          # catálogo publicado
  logo_bar_da_cacia_animada.svg
data/
  musicas.csv              # fonte editável
  lista-musica.pdf         # fonte alternativa
scripts/import-songs.js
tests/catalog.test.js
docs/INTEGRACOES.md
docs/PESQUISA-E-UX.md
```

## Decisões e limites

O catálogo local é a fonte de verdade para **disponibilidade e código**. As APIs externas são auxiliares; falhas não devem bloquear a busca. Favoritas ficam neste navegador e podem desaparecer quando os dados locais forem limpos. O Deezer em produção ainda usa JSONP, cujo risco e alternativa com proxy estão documentados em [Integrações](./docs/INTEGRACOES.md).

A interface respeita navegação por teclado, foco visível, regiões `aria-live` e preferência por movimento reduzido. A logo animada acima já está versionada em `public/`; se o GitHub não reproduzir a animação em um contexto, ela permanece como identidade visual estática.
