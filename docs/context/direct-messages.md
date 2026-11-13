# Direct messages

Mensagens privadas entre amigos, fora de qualquer mesa, e o "digitando…". Vivem em `server/src/modules/direct-messages/`, sem PO: **nada é gravado no server**, como o chat da mesa ([`chat.md`](chat.md)). DTOs em `packages/contracts/src/direct-messages/direct-message.dto.ts` (ver [`contracts/amigos.md`](contracts/amigos.md)); amizade em [`friends.md`](friends.md); quem está visível em [`friends/presenca-ao-vivo.md`](friends/presenca-ao-vivo.md).

## Por que não grava

A entrega é só a quem está conectado agora (todas as abas das duas contas, pela sala `user:<id>`); o histórico vive no client. Sem tabela não há o que vazar, apagar na exclusão da conta nem migrar, e o server não guarda conversa de ninguém. Consequência: não existe entrega posterior — por isso o destinatário precisa estar visivelmente online e o remetente não pode estar invisível.

## Estrutura

- `direct-message.bo.ts` — `DirectMessageBo(context)`: `requireDeliverable()` (lança) e `isDeliverable()` (o "digitando…")
- `direct-messages.error.ts` — `DirectMessageError` (código + mensagem com os ids e a forma esperada) e as subclasses abaixo
- `direct-messages.mapper.ts` — `toDmSentDto`, `toDmTypingFromDto`
- `direct-messages.service.ts` — `DirectMessagesService`: `send`, `typing`, `friendsChanged`
- `direct-message-publisher.port.ts` — `sent(event)` e `typing(recipientId, event)`; adaptador `SocketIoDirectMessagePublisher` (`server/src/infrastructure/direct-message-publisher/`)
- `direct-messages.gateway.ts`, `direct-messages.plugin.ts` — `createDirectMessagesModule(options)` → `{ gateway, service }`; ligado pelo `src/app/wire-account-realtime.ts`

## Regra (`DirectMessageBo`)

Contexto lido pelo service: `friends` (`FriendshipsDao.exists`), `senderVisible` e `recipientVisible` (`AccountPresenceService.isVisiblyOnline`: online ou ausente; invisível conta como offline). Ordem das conferências:

| Ordem | Condição                                                | Código                 |
| ----- | ------------------------------------------------------- | ---------------------- |
| 1     | não amigos (nunca foram, removido, bloqueio) ou para si | `DM_NOT_FRIENDS`       |
| 2     | remetente invisível                                     | `DM_SENDER_INVISIBLE`  |
| 3     | destinatário offline **ou** invisível                   | `DM_RECIPIENT_OFFLINE` |

- Não amigo vem primeiro: um estranho nunca descobre se o outro está online. Offline e invisível dão o **mesmo** código: o invisível não é distinguido.
- Bloqueio desfaz a amizade, então cai em `DM_NOT_FRIENDS` sem revelar o bloqueio.

## Eventos

| Evento          | Direção         | Payload / ack                                                                                                                                        |
| --------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dm:send`       | client → server | `{ actionId, toUserId, text }` (1–2000 após `trim`, estrito) → `{ ok: true, messageId }` · `DM_*`, `RATE_LIMITED`, `INVALID_BODY`, `UNAUTHENTICATED` |
| `dm:sent`       | server → user   | `{ messageId, fromUserId, toUserId, text, at }` às salas das duas contas (as outras abas do remetente também)                                        |
| `dm:typing`     | client → server | `{ toUserId }`, sem ack                                                                                                                              |
| `dm:typingFrom` | server → user   | `{ fromUserId, at }` só à sala do destinatário                                                                                                       |

- O remetente é sempre o da sessão (`reauthenticate`); `fromUserId` no payload é `INVALID_BODY` (DTO estrito, §7.3). `messageId` do `randomUUID`, `at` do relógio.
- Fora da fila por mesa (nada é gravado) e sem versão.
- `dm:typing` que não poderia virar mensagem, passa do balde, tem payload inválido ou sessão encerrada **cai calado** (sessão encerrada também derruba o socket); só erro inesperado vai ao log.

## Baldes

Dois `CommandRateGuard` próprios por conexão, à parte do tabuleiro, dos dados e do chat: `DM_RATE` (`burst` 8, 2/s, o mesmo ritmo do `CHAT_RATE`) para `dm:send` e `DM_TYPING_RATE` (`burst` 4, 1/s) para `dm:typing`, em `server/src/realtime/command-rate.bo.ts`. O balde é cobrado antes do parse e da sessão. Esgotar o das mensagens não afeta `presence:sync` nem os comandos da mesa.

## Memória da amizade

O service guarda `exists` por par canônico por `FRIENDSHIP_MEMORY_MS` (30 s): uma conversa lê a amizade uma vez. Toda gravação que muda as listas passa pelo `friendsChanged({ userIds })` do service (primeiro da porta composta do `wireAccountRealtime`), que esquece os pares dessas contas: remover ou bloquear vale já na mensagem seguinte. Acima de 1000 pares, os vencidos são varridos. Uma leitura em voo durante o esquecimento pode guardar o valor antigo até vencer (instância única, janela curta).

## Testes

- Unit: `server/test/modules/direct-messages/{direct-message.bo,direct-messages.service,direct-messages.mapper}.spec.ts`; fakes em `server/test/support/direct-messages-fakes.ts` (`DirectMessagePublisherFake`, `FriendshipExistsFake`, `VisiblePresenceFake`).
- Integração: `server/test/integration/direct-messages.spec.ts` (todas as abas das duas contas, 2000 caracteres, nenhum `insert`/`update`/`delete` no banco, a 9.ª da rajada `RATE_LIMITED` com `presence:sync` passando logo depois, cada recusa, bloqueio no meio da conversa, `fromUserId` forjado, `dm:typing`).
