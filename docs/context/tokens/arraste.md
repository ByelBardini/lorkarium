# Tokens: arraste ao vivo

Detalhe do hub [`tokens.md`](../tokens.md). A prévia de arraste é o comando mais frequente da mesa (até 10/s por quem arrasta), por isso é o mais enxuto do server (ver `server.md`, Desempenho).

## Como funciona

- Não existe arraste de um token só no contrato: um token arrastado sozinho é um grupo de um. `TokensService.dragMany(userId, campaignId, { drags }, connectionId)`: participação (em memória) → **uma** consulta, sem transação nem trava (`TokensDao.findDragGroup(campaignId, ids)` no pool: cena ativa — tamanho e versão — e os tokens pedidos que estão nela, com camada, tamanho e controladores agregados) → `placeDrags` (id fora da cena → `TOKEN_NOT_FOUND`, `requireMove`, `place` de cada casa não nula). **Não grava nem soma versão**; o ack devolve a versão lida. O gateway passa `socket.id` (uma sala do Socket.IO) como a conexão a excluir. `cell: null` = arraste daquele token encerrado sem mover.
- A ordem é do client: ele só manda a próxima prévia (e o `token:move` / `token:moveMany` final) depois do ack da anterior, e o server publica antes de responder — assim o movimento confirmado é a última palavra.
- Conta no limite de frequência como qualquer comando; o client manda no máximo 10/s, uma prévia por grupo.

## Movimento livre (`scene.freeMovement`)

- O gesto é o único que muda: `dropCellOf(cena, tamanho, mundo, livre)` (`client/src/renderer/token-drag.ts`) arredonda a origem ao `POSITION_STEP` (1/64 de casa) e **depois** limita a `0..cena − lado`; os dois limites são passos também, então a borda nunca sai do passo. Com o centro do token fora da cena não há soltura (`null`). Encostar na borda cabe, mesmo com o ponteiro um pouco além dela, enquanto o centro estiver dentro.
- Sem o modo, o encaixe é o de sempre (casa, ou meia casa no eixo de lado fracionário). Token deixado fora da casa ao desligar fica onde está e volta a encaixar no próximo arraste.
- **Frequência**: num grid livre a prévia dispara por movimento, não por casa. O `PrimaryPress.reportDragCell` só relata posição nova (a mesma fração de 1/64 não repete), e cada relato refaz a vista do arraste; o `TokenDragRelay` continua com o teto de 10/s, uma de cada vez, e o último vence. Quem assiste recebe o mesmo `token:draggedMany` e o `PixiTokenLayer` desliza 150 ms entre posições.
- Paredes valem igual: `stepRoute` e `blockedPassage` trabalham com fração. Solto além da parede, o token do jogador para na última posição livre e a sala diz o motivo; o mestre ignora paredes.
- Continuam encaixados: criar token, adicionar jogadores e os pontos de patrulha clicados. O primeiro ponto da patrulha é onde o token está, mesmo fora da casa (ele é a origem da rota, não um ponto criado no gesto).
- As setas e o arraste de seleção junto com desenhos andam casas inteiras a partir da posição fina, sem encaixar. A emanação sobre token fora da casa nasce com a origem arredondada a 0,01 (`emanationOf`).
- Na tela e no anúncio, a posição sai com até 2 decimais (`positionText`).
- O `BoardView` traz `grid.freeMovement`, lido pelo `dropCellAt` do `PrimaryPress` (a soltura e a prévia). A régua lê uma casa decimal só nesse grid (`rulerLabel(casas, cena, 1)`, "3 casas · 4,6 m"); a área de efeito segue com duas.
