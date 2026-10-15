# Busca e descoberta — guia de UX

## Objetivo

Encontrar uma música **que realmente está no karaokê**, identificar seu código e mostrá-lo ao DJ, com poucos toques no celular.

## Fluxos

**Busca livre:** a pesquisa aceita nome da música, artista, código e trecho inicial da letra. Não diferencia acentos ou caixa e prioriza resultados exatos, depois prefixos e correspondências parciais. A contagem informa quantas músicas foram encontradas.

**Artistas:** o nome do artista em cada resultado é um botão. Ao tocar, o usuário vê somente as músicas daquele artista. A área de relacionados tenta o Deezer e restringe os nomes aos artistas existentes no catálogo. Se não houver dados externos, pode mostrar sugestões de grupos editoriais. Não rotular fallback editorial como recomendação algorítmica.

**Favoritas:** o botão `Favoritar` salva um código no navegador; `Salva` remove. `Minhas favoritas` filtra o catálogo e permite continuar pesquisando dentro da seleção. O estado vazio explica como começar.

**Spotify (quando configurado):** o usuário autoriza suas mais ouvidas; a aplicação cruza os dados com o catálogo e adiciona apenas músicas disponíveis à lista local. A interface informa quantas foram conciliadas.

**Código ao DJ:** o botão exibe o código e a música em um diálogo. Isso **não envia a música a uma fila**; o usuário ainda precisa mostrar o código ao DJ.

## Critérios de aceitação

- A pesquisa funciona sem depender de APIs externas.
- O catálogo é a fonte de verdade; artistas relacionados e Spotify não criam códigos falsos.
- Os resultados são navegáveis por teclado e os botões têm nomes compreensíveis para leitores de tela.
- A interface informa estados de carregamento, erro e ausência de resultados.
- As favoritas permanecem após recarregar a página no mesmo navegador.
- Se Deezer ou Spotify estiverem indisponíveis, o usuário ainda consegue buscar e mostrar o código ao DJ.
- A experiência respeita `prefers-reduced-motion`.

## Identidade visual

Preservar a atmosfera noturna existente e aplicar detalhes do brandbook: Preto Vinil `#141414`, Amarelo Asa `#DEC949`, Azul Microfone `#ACC8D0` e Off-White `#EFF2F1`. A logo animada existente é usada no cabeçalho e no README; não recriar nem deformar o símbolo. A animação não deve impedir a leitura ou o uso do catálogo.
