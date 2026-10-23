# Integrações públicas e descoberta musical

## Visão geral

O site é estático (Vite + GitHub Pages). O **catálogo de karaokê** em `public/data/songs.json` é a única fonte de verdade sobre músicas disponíveis e seus códigos. Serviços externos enriquecem a descoberta, mas **não adicionam faixas ao karaokê**.

| Fonte | Finalidade | Autenticação | Comportamento se falhar |
| --- | --- | --- | --- |
| Catálogo local | Títulos, artistas, códigos, início da letra | Nenhuma | Exibir erro de carregamento |
| Deezer | Capas, previews e artistas relacionados | Sem chave no fluxo atual | Iniciais no lugar da capa, sem preview; sugestões editoriais quando disponíveis |
| Spotify (opcional) | Sugerir músicas a partir das 50 faixas mais ouvidas da conta | OAuth 2.0 Authorization Code + PKCE, `user-top-read` | Seleção manual de artistas continua funcionando |
| Supabase (opcional) | Ranking agregado e identidade anônima por navegador | Auth anônima + RPC com RLS | Descoberta, busca e lista local continuam funcionando |
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

## Privacidade e operação

As favoritas são códigos de música salvos **neste navegador**, sem conta própria ou sincronização entre aparelhos. Limpar os dados do navegador remove essa lista. O Deezer recebe consultas por título/artista; o Spotify só é acessado após ação explícita do usuário.

## Testes e verificações

```bash
npm ci
npm test
npm run build
```

Testar manualmente: pesquisa sem acento, busca por código, artista com múltiplas músicas, filtro de favoritas, erro/timeout do Deezer, permissão negada no Spotify, retorno OAuth, catálogo sem correspondências, mobile e navegação por teclado.
