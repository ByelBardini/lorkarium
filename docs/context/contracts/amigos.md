# Contratos — amigos, presença e mensagens diretas

Fora da mesa: relações entre contas (amizade, pedido, bloqueio) por HTTP, e presença e mensagens diretas pela conexão da conta (sala `user:<id>`, todas as abas). Nada das mensagens é gravado.

## Tetos (`realtime-limits.ts`)

`FRIENDS_MAX` (200), `BLOCKS_MAX` (200), `OUTGOING_REQUESTS_MAX` (50 pedidos enviados pendentes), iguais para todo plano; `DIRECT_MESSAGE_MAX_LENGTH` (2000).

## O @ digitado

`typedUsernameDto` (`friends/friend.dto.ts`): apara, tira um "@" da frente e passa pelo `usernameDto` (minúsculas e formato do auth). `' @BiaFlor '` → `'biaflor'`.

## HTTP (`src/friends/`)

- `friendProfileDto` — `{ userId, username, name, color, avatarId, plan, admin, lorkariumOwner }`; nunca o e-mail.
- `friendDto` = perfil + `since` (resposta do aceite); `friendRequestEntryDto` = perfil + `at`; `blockedUserDto` = perfil + `at` (201 do `POST /blocks`).
- `friendsOverviewDto` — `GET /api/friends`: `{ friends (≤ 200), incoming, outgoing (≤ 50), blocked (≤ 200) }`.
- `friendRequestDto` `{ username }` — `POST /api/friends/requests`; `friendRequestResponseDto` `{ outcome: 'sent' | 'accepted' }`. Pedido a quem me bloqueou responde `sent` (não revela).
- `blockRequestDto` — `POST /api/blocks`: `{ userId }` ou `{ username }`, nunca os dois.
- `friendUserParamsDto` `{ userId }` — o `:userId` das rotas de aceite, recusa, remoção e desbloqueio.
- `FRIEND_ERROR_CODES` / `FriendErrorCode` — `USER_NOT_FOUND`, `ALREADY_FRIENDS`, `REQUEST_ALREADY_SENT`, `REQUEST_TO_SELF`, `USER_BLOCKED_BY_YOU`, `FRIEND_LIMIT`, `OUTGOING_REQUEST_LIMIT`, `REQUEST_NOT_FOUND`, `FRIEND_NOT_FOUND`, `ALREADY_BLOCKED`, `BLOCK_LIMIT`, `BLOCK_NOT_FOUND` (vão no `apiErrorDto.code`).

## Presença (`friends/presence.dto.ts`)

- `PRESENCE_EVENTS` — `presence:sync`, `presence:setVisibility`, `presence:friendChanged`, `friends:changed`.
- `presenceVisibilityDto` (`online` | `invisible`; ausente é automático), `presenceStatusDto` (`online` | `away` | `offline`; invisível sai como `offline`), `presenceTableDto` `{ campaignId, name }` (só mesa pública; privada sai `null`).
- `presence:sync` sem payload → `presenceSyncAckDto` `{ ok, friends: friendPresenceDto[] }`.
- `presence:setVisibility` `presenceSetVisibilityCommandDto` `{ actionId, visibility }` → `presenceSetVisibilityAckDto`.
- `presence:friendChanged` `presenceFriendChangedDto` = presença + `at`; `friends:changed` `friendsChangedDto` `{ at }` (sem motivo: o client relê `GET /friends`).
- Tipos dos genéricos: `PresenceClientEvents`, `PresenceServerEvents`.

## Mensagens diretas (`direct-messages/direct-message.dto.ts`)

- `DM_EVENTS` — `dm:send`, `dm:sent`, `dm:typing`, `dm:typingFrom`.
- `directMessageTextDto` — apara, 1 a 2000.
- `dmSendCommandDto` `{ actionId, toUserId, text }` (remetente vem da conexão; `fromUserId` é recusado) → `dmSendAckDto` `{ ok, messageId }` | erro.
- `DM_ERROR_CODES` / `DmErrorCode` — `DM_NOT_FRIENDS`, `DM_RECIPIENT_OFFLINE`, `DM_SENDER_INVISIBLE`, `RATE_LIMITED`.
- `dmSentDto` `{ messageId, fromUserId, toUserId, text, at }` às duas contas, sem versão.
- `dmTypingCommandDto` `{ toUserId }` (sem ack) e `dmTypingFromDto` `{ fromUserId, at }`.
- Tipos dos genéricos: `DmClientEvents`, `DmServerEvents`.

Os dois pares (`Presence*Events`, `Dm*Events`) entram no `TableClientEvents` / `TableServerEvents` de `board/board.dto.ts`: é o mesmo socket da conta, com ou sem mesa.
