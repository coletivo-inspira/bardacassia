# Apresentação para o Bar da Cácia

Roteiro para apresentar o piloto ao dono e, depois, a outros bares de karaokê. A ideia é vender o básico que já funciona: o cliente acha a música e mostra um QR, o garçom lê, cobra e a música entra na fila. Os números vêm depois, do próprio uso.

## 1. O problema (1 minuto)

- O cliente procura a música numa lista impressa ou no site e anota o código num papel.
- O garçom leva o papel até o balcão, confere o código e digita no controle. A ordem da fila fica na cabeça dele ou no papel.
- O dono não sabe quantas músicas foram pedidas na noite, quais são as mais pedidas, nem quanto tempo o cliente esperou.

## 2. Demonstração ao vivo (3 minutos)

Leve dois celulares: um faz o papel do cliente, o outro o do garçom, já logado em `garcom.html`.

1. **Cliente:** lê o QR do cartaz, busca "Evidências" e toca em **Mostrar ao garçom**. O QR aparece na tela, junto com o código grande.
2. **Garçom:** aponta a câmera para o QR. O painel abre com a música e o nome do cliente. Ele toca em **Cobrei, pôr na fila**.
3. **Cliente:** a tela dele muda sozinha para "Confirmado! Faltam 2 músicas antes da sua".
4. **Garçom:** mostra a aba **Fila**, com a próxima música e o código para digitar no controle, e as **Tocadas hoje**.
5. Ler o mesmo QR de novo mostra o aviso "já tinha sido lido, não cobre de novo". Isso evita cobrança em dobro.

Pontos para falar:

- **Não troca nada do bar:** o QR atual continua onde está. Só entra um cartaz impresso (`cartaz.html`) nas mesas.
- **Não dá para pedir de casa:** o pedido só existe quando o garçom lê o QR no bar. Um link no Instagram ou um bot não consegue lotar a fila.
- **Não muda o karaokê:** o garçom continua digitando o código no controle, como já faz hoje.

## 3. O que o dono passa a ver (1 minuto)

A aba **Resultados** do painel, visível só para o dono, mostra para 7, 30 ou 90 dias:

- músicas pedidas e pagas, com a média por noite;
- clientes que pediram e contas cadastradas;
- espera média entre pagar e a música tocar;
- pedidos por noite e por dia da semana (útil para provar o resultado de segunda a quarta);
- as mais pedidas e os pedidos por garçom.

Com o Google Analytics ou o Cloudflare ligado, ele vê também quantas pessoas abriram o site e quantas vieram do cartaz da mesa ou do Instagram.

## 4. Proposta de piloto

- **Duração:** 2 meses.
- **Dias:** de segunda a quarta, quando o movimento é menor e dá para comparar antes e depois.
- **O que o bar faz:** deixa o cartaz nas mesas e usa o painel no celular do garçom.
- **O que a gente faz:** cadastro dos garçons, impressão dos cartazes, suporte nas primeiras noites e um relatório mensal com os números da aba Resultados.
- **Critério de sucesso, combinado antes:** por exemplo, mais músicas pedidas por noite nos dias do piloto e o garçom deixando de anotar no papel.

## 5. Próximos passos depois do piloto

- **Fidelização:** conta do cliente, que já existe, com favoritas salvas, histórico e "a sua música tocou X vezes aqui".
- **Promoções:** aniversariante da noite, rodada em dobro, música grátis a cada N pedidos.
- **Pagamento pelo celular (Pix):** só depois de saber quem recebe o dinheiro no bar e se o sistema de caixa tem integração.
- **Pedido sem garçom:** o modo remoto, com o código da noite mostrado no balcão, já está pronto se o bar quiser.

## 6. Investimento

Custos fixos para manter o produto no ar:

| Item | Custo aproximado |
| --- | --- |
| Domínio `.com.br` (registro.br) | cerca de R$ 40 por ano |
| Hospedagem do site (GitHub Pages) | grátis |
| Banco e login (Supabase, plano grátis) | grátis; o plano Pro custa US$ 25 por mês |
| Estatísticas de acesso (Google Analytics ou Cloudflare) | grátis |
| Impressão dos cartazes | poucos reais por mesa |

O plano grátis do Supabase pausa o projeto depois de 7 dias sem uso. Para um bar que abre toda semana isso não costuma acontecer, mas vale passar para o Pro quando houver mais de um cliente ou se o piloto virar contrato.

Sugestão de preço: o piloto é grátis, e depois entra uma mensalidade baixa que cubra o domínio, o banco e a manutenção, com desconto para quem fechar o ano. Para outros bares, a mesma estrutura serve como pacote, já que cada bar só precisa do seu catálogo, do cartaz e dos garçons cadastrados.

## Checklist para o fim de semana

1. Aplicar as migrações `004` a `007` no Supabase (workflow `supabase.yml` ou SQL Editor).
2. Cadastrar os garçons e o dono (`role = 'dono'`), conforme [Integrações](./INTEGRACOES.md#pedidos-de-música-e-painel-do-garçom).
3. Conferir as variáveis do GitHub Actions: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `ENABLE_REQUESTS` vazia ou `true` e `REQUEST_MODE` vazia ou `qr`. Opcionalmente, definir `ANALYTICS_ID` e `SITE_URL`.
4. Abrir `cartaz.html`, escolher A5 e origem "mesa" e imprimir um cartaz por mesa.
5. Testar com dois celulares, seguindo o roteiro da demonstração.
6. Deixar o painel `garcom.html` salvo na tela inicial do celular do garçom.

## Domínio próprio

1. Registre o domínio (por exemplo `bardacassia.com.br`) no registro.br.
2. No DNS, crie um registro `CNAME` de `www` para `coletivo-inspira.github.io`, e os registros `A` do domínio raiz apontando para os IPs do GitHub Pages (185.199.108.153, 185.199.109.153, 185.199.110.153 e 185.199.111.153).
3. Em Settings > Pages do repositório, informe o domínio e ative "Enforce HTTPS".
4. Crie `public/CNAME` contendo só o domínio, para o deploy manter a configuração. Faça isso só depois do passo 2, porque um CNAME sem DNS tira o site do ar.
5. Defina a variável `SITE_URL` com o novo endereço, atualize a Redirect URI do Spotify e as Redirect URLs do Supabase Auth, e reimprima os cartazes.

O Vite já usa caminhos relativos (`base: "./"`), então o site funciona tanto na raiz do domínio quanto em `/bardacassia/`.
