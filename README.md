# Bar da Cácia — Portal

Portal responsivo para divulgar o Bar da Cácia, apresentar a programação e permitir que visitantes pesquisem músicas de karaokê.

## Stack
- **Vite** para desenvolvimento local e build de produção.
- **JavaScript ES Modules** sem dependência de framework, mantendo o bundle simples.
- **CSS** separado, com layout responsivo e suporte a preferência por movimento reduzido.
- **SVG** vetorial para a marca, compartilhado entre favicon, cabeçalho e hero.

## Requisitos
- Node.js 20.19+ ou 22.12+
- npm

## Executar localmente
```bash
npm install
npm run dev
```

## Build e prévia
```bash
npm run build
npm run preview
```
Os arquivos finais são gerados em `dist/`.

## Estrutura
```text
.
├── index.html
├── public/
│   └── logo.svg
├── src/
│   ├── main.js
│   └── styles.css
├── .gitignore
├── package.json
└── README.md
```

## Acessibilidade
- HTML semântico, regiões identificadas e link para pular ao conteúdo.
- Navegação por teclado, foco visível e diálogo nativo com suporte a Escape.
- Rótulo explícito na busca e anúncio de resultados com `aria-live`.
- Estados vazios e controles com nomes compreensíveis.
- Respeito à preferência `prefers-reduced-motion`.
- Layout responsivo e alvos de interação adequados a dispositivos móveis.

## Manutenção
O catálogo de exemplo está no início de `src/main.js`, no array `songs`. Substitua os registros pelos dados reais antes de publicar. A programação é demonstrativa e deve ser confirmada antes de ser tratada como agenda oficial.

## Publicação
`npm run build` cria o site estático em `dist/`, compatível com GitHub Pages, Netlify, Vercel ou qualquer hospedagem estática. Para GitHub Pages em um repositório de projeto, configure a opção `base` do Vite conforme o caminho publicado.
