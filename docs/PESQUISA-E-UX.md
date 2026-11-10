# Busca e descoberta — guia de UX

## Objetivo

Encontrar uma música **que realmente está no karaokê**, identificar seu código e mostrá-lo ao DJ ou ao garçom, com poucos toques no celular.

## Fluxos

**Busca livre:** a pesquisa aceita nome da música, artista, código e trecho inicial da letra. Não diferencia acentos ou caixa e prioriza resultados exatos, depois prefixos e correspondências parciais. A contagem informa quantas músicas foram encontradas.

**Artistas:** o nome do artista em cada resultado é um botão. Ao tocar, o usuário vê somente as músicas daquele artista. A área de relacionados tenta o Deezer e restringe os nomes aos artistas existentes no catálogo. Se não houver dados externos, pode mostrar sugestões de grupos editoriais. Não rotular fallback editorial como recomendação algorítmica.

**Favoritas:** o botão `Favoritar` salva um código neste navegador (com abas locais). A página `favoritos.html` concentra a lista e as abas; dá para entrar pelo menu da conta, pelo botão Favoritas do catálogo ou pela descoberta. No catálogo fica só o filtro “Somente favoritas”. Sem conta, limpar os dados do navegador apaga a lista. Com login, a **união dos códigos** sobe para a conta (`sync_my_favorites`); a organização em abas permanece só neste aparelho.

**Spotify (quando configurado):** o usuário autoriza suas mais ouvidas; a aplicação cruza os dados com o catálogo e adiciona apenas músicas disponíveis à lista local. A interface informa quantas foram conciliadas.

**Código ao DJ:** o diálogo mostra o código e a música para digitar no controle. Isso **não grava pedido no servidor**.

**Pedido pelo QR (quando `VITE_ENABLE_REQUESTS` e modo `qr`):** **Mostrar ao garçom** gera um QR local com ticket. O aparelho do cliente não cria a fila; o garçom lê o QR em `garcom.html`, cobra e aí o pedido entra. O cliente vê o status via `get_ticket_status`. No modo `remoto`, o cliente envia o pedido e acompanha em “Meus pedidos”.

## Critérios de aceitação

- A pesquisa funciona sem depender de APIs externas.
- O catálogo é a fonte de verdade; artistas relacionados e Spotify não criam códigos falsos.
- Os resultados são navegáveis por teclado e os botões têm nomes compreensíveis para leitores de tela.
- A interface informa estados de carregamento, erro e ausência de resultados.
- As favoritas permanecem após recarregar a página no mesmo navegador; com conta e Supabase configurado, os códigos reaparecem em outro aparelho após o sync.
- Se Deezer ou Spotify estiverem indisponíveis, o usuário ainda consegue buscar e mostrar o código ao DJ.
- Com pedidos ligados, o fluxo QR deixa claro que a confirmação depende do garçom.
- A experiência respeita `prefers-reduced-motion`.

## Identidade visual

Preservar a atmosfera noturna existente e aplicar detalhes do brandbook: Preto Vinil `#141414`, Amarelo Asa `#DEC949`, Azul Microfone `#ACC8D0` e Off-White `#EFF2F1`. A logo animada existente é usada no cabeçalho e no README; não recriar nem deformar o símbolo. A animação não deve impedir a leitura ou o uso do catálogo.
