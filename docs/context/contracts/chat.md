# Contracts — chat (`chat/chat.dto.ts`)

O chat da mesa por Socket.IO: comando `chat:send`, ack com `messageId` e o evento `chat:sent`. Nada é gravado (sem versão, como `dice:rolled`). Fluxo e público em [`../chat.md`](../chat.md).

## Limites

- `CHAT_EVENTS` `{ send: 'chat:send', sent: 'chat:sent' }`.
- `CHAT_TEXT_MAX` (2000), `CHAT_GROUP_NAME_MAX` (40), `CHAT_GROUP_MEMBERS_MIN` (2, quem manda incluso), `CHAT_GROUP_MEMBERS_MAX` (30).
- `chatTextDto` — aparado, de 1 a 2000 caracteres (a mensagem de erro cita o limite).

## Canal

- `chatChannelDto` (comando), união por `kind`:
  - `{ kind: 'table', whisperTo: uuid | null }` — a Mesa; `whisperTo` = sussurro inline a um membro.
  - `{ kind: 'direct', userId }` — privado com uma pessoa.
  - `{ kind: 'group', groupId, name, memberIds }` (`chatGroupChannelDto`) — grupo fixo: `groupId` sorteado por quem cria, nome aparado 1–40, 2–30 membros sem repetição (o id repetido aparece no erro). Que quem manda esteja no grupo é regra do server.
- `chatSentChannelDto` (evento): igual, mas o privado vira `{ kind: 'direct', userIds: [a, b] }` com os dois ids **em ordem crescente e distintos** — a mesma chave da conversa nas duas pontas.

## Quem fala

- `chatSpeakerDto` (comando): `{ kind: 'self' }` | `{ kind: 'token', sceneId, tokenId }` (estrito: um `name` mandado pelo client é recusado).
- `chatSentSpeakerDto` (evento): o token volta com `name` (1–`TOKEN_NAME_MAX_LENGTH`) lido do banco pelo server.

## Comando, ack e evento

- `chatSendCommandDto` `{ actionId, campaignId, channel, speaker, text }`, estrito (`userId` forjado é recusado, §7.3). Tipos `ChatSendCommandDto`/`ChatSendCommandInput`.
- `chatSendAckDto` — `{ ok: true, messageId }` | `realtimeAckFailureDto`. Códigos próprios do chat (string livre no `ApiErrorDto`): `CHAT_RECIPIENT_NOT_MEMBER`, `CHAT_SPEAKER_NOT_ALLOWED` (token fora da Mesa sem sussurro), `CHAT_RECIPIENT_IS_SENDER`, `CHAT_SENDER_NOT_IN_GROUP`; detalhe em [`../chat.md`](../chat.md).
- `chatSentDto` `{ campaignId, messageId, at, fromUserId, channel, speaker, text }`. Nome, cor e foto do autor saem do roster no client.
- `ChatClientEvents` / `ChatServerEvents` entram no `TableClientEvents` / `TableServerEvents` de `board/board.dto.ts`.

## Testes

`packages/contracts/test/chat/chat.dto.spec.ts`: aparo e vazio do texto, 2000/2001, `userId` forjado, grupo de 1, 30/31 e repetido, nome vazio/41, `speaker` token sem `tokenId` ou com `name`, par do privado fora de ordem ou consigo mesmo, evento de cada canal.
