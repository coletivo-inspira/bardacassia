# Bar da Cácia — Portal + Karaokê

Portal do Bar da Cácia com busca de karaokê (estilo Spotify), catálogo completo (~12,7 mil músicas), programação e código para mostrar ao DJ.

**Site (GitHub Pages):** https://felipeatene.github.io/bardacassia/

## Stack
- **Vite** (build estático com `base: '/bardacassia/'`)
- JavaScript ES Modules (sem framework)
- Catálogo em `public/data/songs.json` (gerado a partir do PDF/CSV)

## Requisitos
- Node.js 20.19+ ou 22.12+
- npm
- Para reimportar do PDF: [`pdftotext`](https://poppler.freedesktop.org/) (`poppler-utils`)

## Executar localmente
```bash
npm install
npm run dev
```

Em desenvolvimento, pedidos a `/api/deezer/*` são proxied para a API do Deezer (evita CORS). Em produção no Pages, capas/preview usam JSONP do Deezer.

## Build
```bash
npm run build
npm run preview
```
Saída em `dist/`. O workflow de GitHub Actions faz `npm ci` → `npm run build` e publica **apenas** `dist/` (não a raiz do repositório).

## Atualizar o catálogo

Fonte editável: `data/musicas.csv`  
Fonte PDF: `data/lista-musica.pdf`  
Saída do site: `public/data/songs.json` (versionada — o site não precisa parsear o PDF no build)

### A partir do PDF
1. Substitua `data/lista-musica.pdf`
2. Rode:
   ```bash
   npm run import-songs
   # ou: node scripts/import-songs.js --pdf data/lista-musica.pdf
   ```
3. Commit `public/data/songs.json` e `data/musicas.csv`, depois push (o Pages redesploya)

### A partir do CSV
1. Edite `data/musicas.csv` (colunas: `code,artist,title,lyricStart,lang`)
2. Rode:
   ```bash
   npm run import-songs -- --csv data/musicas.csv
   ```
3. Commit o JSON gerado e faça push

Campos: **code**, **artist**, **title**, **lyricStart**, **lang** (`BRA`, `EUA`, `JAP`, …).

## Busca e metadados
- Filtros: título, artista, código e início da letra
- **Spotify:** link profundo de busca (sem API key)  
  `https://open.spotify.com/search/{artista título}`
- **Deezer (sem key):** capa e preview de ~30s  
  - Dev: proxy Vite `/api/deezer`  
  - Produção: JSONP (`output=jsonp`) — a API do Deezer não envia `Access-Control-Allow-Origin` para `fetch` no browser  
  - Cache em memória + `localStorage`  
  - Fallback: iniciais coloridas se não houver match

## Estrutura
```text
.
├── data/
│   ├── lista-musica.pdf      # fonte PDF
│   └── musicas.csv           # fonte editável
├── public/
│   ├── data/songs.json       # catálogo servido no site
│   └── logo.svg
├── scripts/import-songs.js
├── src/main.js
├── src/styles.css
├── vite.config.js            # base: '/bardacassia/'
└── .github/workflows/static.yml
```

## Acessibilidade
HTML semântico, foco visível, diálogo nativo, `aria-live` na contagem de resultados e respeito a `prefers-reduced-motion`.
