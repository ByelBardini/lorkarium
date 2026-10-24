# Tokens: arraste ao vivo

Detalhe do hub [`tokens.md`](../tokens.md). A prévia de arraste é o comando mais frequente da mesa (até 10/s por quem arrasta), por isso é o mais enxuto do server (ver `server.md`, Desempenho).

## Como funciona

- Não existe arraste de um token só no contrato: um token arrastado sozinho é um grupo de um. `TokensService.dragMany(userId, campaignId, { drags }, connectionId)`: participação (em memória) → **uma** consulta, sem transação nem trava (`TokensDao.findDragGroup(campaignId, ids)` no pool: cena ativa — tamanho e versão — e os tokens pedidos que estão nela, com camada, tamanho e controladores agregados) → `placeDrags` (id fora da cena → `TOKEN_NOT_FOUND`, `requireMove`, `place` de cada casa não nula). **Não grava nem soma versão**; o ack devolve a versão lida. O gateway passa `socket.id` (uma sala do Socket.IO) como a conexão a excluir. `cell: null` = arraste daquele token encerrado sem mover.
- A ordem é do client: ele só manda a próxima prévia (e o `token:move` / `token:moveMany` final) depois do ack da anterior, e o server publica antes de responder — assim o movimento confirmado é a última palavra.
- Conta no limite de frequência como qualquer comando; o client manda no máximo 10/s, uma prévia por grupo.
