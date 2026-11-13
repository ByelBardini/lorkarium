# Friends

Amizade entre contas, fora de qualquer mesa: pedido pelo @ exato, aceitar, recusar ou cancelar, remover amigo, bloquear e desbloquear. Vive em `server/src/modules/friends/`. DTOs e códigos de erro em [`contracts/amigos.md`](contracts/amigos.md) (`FRIEND_ERROR_CODES`, tetos `FRIENDS_MAX` = 200, `OUTGOING_REQUESTS_MAX` = 50, `BLOCKS_MAX` = 200, iguais para todo plano).

As relações são persistidas; presença e mensagens privadas (em memória, efêmeras) não moram aqui.

| Detalhe                                                      | O que cobre                                                                    |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| [`friends/presenca.md`](friends/presenca.md)                 | Regra pura da presença da conta (`AccountPresenceBo`), estados, tolerância     |
| [`friends/presenca-ao-vivo.md`](friends/presenca-ao-vivo.md) | Serviço, gateway, `presence:*`, `friends:changed` ao vivo, `user:<id>`, perfil |
| [`direct-messages.md`](direct-messages.md)                   | Mensagens privadas efêmeras (`dm:*`) entre amigos                              |

## Tabelas (migração `0108_friends`)

Todas com as duas FKs para `users.id` **cascade** (apagar a conta leva pedidos, amizades e bloqueios dela) e `created_at timestamptz DEFAULT now()` (o service grava o instante do relógio).

| Tabela            | Colunas                                    | PK                             | `CHECK`                                               | Índice extra                     |
| ----------------- | ------------------------------------------ | ------------------------------ | ----------------------------------------------------- | -------------------------------- |
| `friend_requests` | `from_user_id`, `to_user_id`, `created_at` | (`from_user_id`, `to_user_id`) | `friend_requests_not_to_self` (`from <> to`)          | `friend_requests_to_user_id_idx` |
| `friendships`     | `user_low`, `user_high`, `created_at`      | (`user_low`, `user_high`)      | `friendships_canonical_pair` (`user_low < user_high`) | `friendships_user_high_idx`      |
| `user_blocks`     | `blocker_id`, `blocked_id`, `created_at`   | (`blocker_id`, `blocked_id`)   | `user_blocks_not_self` (`blocker <> blocked`)         | `user_blocks_blocked_id_idx`     |

- **Pedido** é uma linha por sentido; aceitar apaga os dois sentidos e grava a amizade.
- **Amizade** é uma linha por par, em **ordem canônica** (`canonicalPair(a, b)`: o menor id em `user_low`). O mesmo par não pode ser gravado duas vezes em sentidos opostos (a PK pega) e "amigos de X" lê as duas colunas, cada uma com índice (a PK cobre `user_low`). Uma linha com `confirmed` booleano obrigaria `OR` em toda consulta e deixaria o par duplicável.
- **Bloqueio** é gravado num sentido (quem bloqueou) e lido nos dois.

## Estrutura

- `friend-requests.po.ts`, `friendships.po.ts`, `user-blocks.po.ts` — as tabelas (entram no `src/database/schema.ts`)
- `friendships.dao.ts` — `FriendshipsDao(db | tx)`: `lockPair(a, b)` (trava as duas contas em `users`, ordem de id, `FOR NO KEY UPDATE`; devolve os ids que existem), `friendIdsOf(userId)` (só os ids, sem join: presença e perfil), `relationBetween(actor, target)` → `RelationReadingRow` (numa ida: amizade, pedidos e bloqueios nos dois sentidos, amigos do ator e do alvo, pedidos enviados e bloqueios do ator), `insert`, `exists`, `remove` → `boolean`, `friendsOf(userId)` (por nome), `friendOf(userId, friendId)`. Exporta `RELATED_ACCOUNT_COLUMNS` / `RelatedAccountRow` (o perfil público + a data da relação; nunca o e-mail) e `canonicalPair`
- `friend-requests.dao.ts` — `FriendRequestsDao`: `insert` (repetido lança `23505`), `deleteBetween(a, b)` (os dois sentidos), `incomingOf(userId)` (**sem** quem o usuário bloqueou, por `not exists`), `outgoingOf(userId)` (com o pedido a quem o bloqueou), os dois do mais antigo
- `user-blocks.dao.ts` — `UserBlocksDao`: `insert`, `exists(blocker, blocked)` (um sentido; o join de mesa também usa), `remove`, `blockedBy(blocker)` (mais recente primeiro), `blockOf(blocker, blocked)`
- `friend-relation.bo.ts` — `FriendRelationBo(state, limits)` (abaixo)
- `friends.mapper.ts` — `toFriendProfileDto` (cor efetiva por `memberColorOf`, `admin` do papel), `toFriendDto` (`since`), `toFriendRequestEntryDto` / `toBlockedUserDto` (`at`), `toFriendRelationState`
- `friends.service.ts` — `FriendsService`: `overview`, `request`, `accept`, `withdraw`, `unfriend`, `block`, `unblock`
- `friends-changed.port.ts` — `FriendsChangedPort.friendsChanged({ userIds, at })`
- `friends.routes.ts`, `friends.plugin.ts` — `createFriendsModule({ db, clock, changed, removed, memberships })` → `{ plugin, service }`; ligado por `src/app/wire-friends.ts` (`wireFriends`) no `buildApp`, depois do plugin de campanhas (precisa do `memberRemoved` do tempo real e das `memberships`)
- `friends.error.ts` — `FriendsError` (código + mensagem com os ids e a forma esperada) e uma subclasse por código

## Regras (`FriendRelationBo`)

O estado vem de `relationBetween`, lido **com as duas contas travadas**. Cada método devolve `{ action, notify }`: a decisão e as contas a avisar com `friends:changed` depois do commit.

| Ação         | Ordem das conferências                                                                                                                                                                                                                                                                                         | Avisa                             |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| `request()`  | para si `REQUEST_TO_SELF` → eu bloqueei `USER_BLOCKED_BY_YOU` → já amigos `ALREADY_FRIENDS` → já pedi `REQUEST_ALREADY_SENT` → ele me pediu: vira aceite (`FRIEND_LIMIT` dos dois lados) → eu com 200 amigos `FRIEND_LIMIT` → 50 enviados `OUTGOING_REQUEST_LIMIT` → ele me bloqueou: `send-silently` → `send` | os dois; `send-silently` só eu    |
| `accept()`   | pedido dele inexistente (ou dele, mas eu o bloqueei) `REQUEST_NOT_FOUND` → 200 amigos meus ou dele `FRIEND_LIMIT`                                                                                                                                                                                              | os dois                           |
| `withdraw()` | nenhum pedido em sentido algum `REQUEST_NOT_FOUND` (recusar e cancelar são a mesma rota e apagam os dois sentidos)                                                                                                                                                                                             | os dois; só eu se ele me bloqueou |
| `unfriend()` | não amigos `FRIEND_NOT_FOUND`                                                                                                                                                                                                                                                                                  | os dois                           |
| `block()`    | para si `REQUEST_TO_SELF` → já bloqueado `ALREADY_BLOCKED` → 200 bloqueios `BLOCK_LIMIT`; desfaz amizade e pedidos dos dois sentidos                                                                                                                                                                           | o alvo só se via algo que some    |
| `unblock()`  | não bloqueado `BLOCK_NOT_FOUND`; **não** refaz a amizade                                                                                                                                                                                                                                                       | só eu                             |

- **O bloqueio nunca é revelado.** Quem me bloqueou recebe `{ outcome: 'sent' }` ao me pedir, o pedido fica nos enviados dele e nunca aparece no meu `incoming`; o teto de 50 vale igual. O bloqueado só ouve `friends:changed` quando um amigo ou pedido que ele via some, e o evento não diz o motivo.
- Um pedido silencioso continua gravado: se eu desbloquear, ele aparece nos meus recebidos.
- Os tetos chegam por `FriendLimits` (`FRIENDS_MAX`, `OUTGOING_REQUESTS_MAX`, `BLOCKS_MAX`); o BO não lê o contrato. A mensagem interna cita "N of M" e a conta; a pública (`PUBLIC_MESSAGE` da borda) cita só o teto.

## Contrato HTTP (prefixo `/api`, todas exigem sessão)

| Rota                                    | Entrada                                          | Saída                                   | Erros                                                                                                                                                                               |
| --------------------------------------- | ------------------------------------------------ | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /friends`                          | —                                                | 200 `friendsOverviewDto`                | 401                                                                                                                                                                                 |
| `POST /friends/requests`                | `friendRequestDto` `{ username }`                | 200 `{ outcome: 'sent' \| 'accepted' }` | 400 · 401 · 404 `USER_NOT_FOUND` · 409 `ALREADY_FRIENDS` / `REQUEST_ALREADY_SENT` / `REQUEST_TO_SELF` / `USER_BLOCKED_BY_YOU` · 403 `FRIEND_LIMIT` / `OUTGOING_REQUEST_LIMIT` · 429 |
| `POST /friends/requests/:userId/accept` | `friendUserParamsDto`                            | 200 `friendDto`                         | 400 · 401 · 404 `REQUEST_NOT_FOUND` · 403 `FRIEND_LIMIT` · 429                                                                                                                      |
| `DELETE /friends/requests/:userId`      | `friendUserParamsDto`                            | 204                                     | 400 · 401 · 404 `REQUEST_NOT_FOUND` · 429                                                                                                                                           |
| `DELETE /friends/:userId`               | `friendUserParamsDto`                            | 204                                     | 400 · 401 · 404 `FRIEND_NOT_FOUND` · 429                                                                                                                                            |
| `POST /blocks`                          | `blockRequestDto` `{ userId }` \| `{ username }` | 201 `blockedUserDto`                    | 400 · 401 · 404 `USER_NOT_FOUND` · 409 `ALREADY_BLOCKED` / `REQUEST_TO_SELF` · 403 `BLOCK_LIMIT` · 429                                                                              |
| `DELETE /blocks/:userId`                | `friendUserParamsDto`                            | 204                                     | 400 · 401 · 404 `BLOCK_NOT_FOUND` · 429                                                                                                                                             |

- A conta é sempre a da sessão (`userOf(request)`); campo a mais no corpo é 400 (DTO estrito). O `userId` do `POST /blocks` é o **alvo**.
- Limite: 30 escritas por minuto por usuário, somando todas as rotas de escrita (`GET` não conta) → 429 `RATE_LIMITED` com `retryAfterSeconds`.
- Erro sempre `ApiErrorDto` com mensagem pública fixa por código; o resto cai no 500 `INTERNAL_ERROR` com log.

## A trava e a ordem de uma escrita

1. `request` acha o alvo por `UsersDao.findByUsername` (fora da transação; ausente → `USER_NOT_FOUND`); `block` por `{ username }` idem.
2. Transação: `lockPair(ator, alvo)` em ordem de id — dois pedidos cruzados ao mesmo tempo esperam um pelo outro, e o segundo já vê o primeiro e vira aceite (uma amizade só, nenhum pedido sobrando). Alvo que não existe (id) → `USER_NOT_FOUND`.
3. `relationBetween` → `FriendRelationBo` decide → grava (pedido, amizade, remoção, bloqueio).
4. Depois do commit: os assentos que o bloqueio tirou (abaixo) e `FriendsChangedPort.friendsChanged({ userIds: notify, at })`.

## Bloqueio × mesas do dono

Ao bloquear, na mesma transação, `CampaignMembersDao.removeFromOwnedBy(blocker, blocked)` apaga os assentos do bloqueado nas mesas de que o bloqueador é **dono** (`campaigns.owner_id`) e devolve os ids; depois do commit, para cada mesa, `CachedMemberships.forget` e a `MemberRemovedPort` (a mesma do juggernaut: as conexões dele ouvem `session:removedFromTable`, a mesa ouve `session:memberLeft`, o personagem dele fica sem dono). Mesa de outro dono em que os dois estão não muda; o bloqueio de um co-mestre não tira ninguém. A recusa da entrada e o sumiço do Explorar estão em [`campaigns.md`](campaigns.md).

## `friends:changed` (porta)

`FriendsChangedPort` é a saída de "releia `GET /api/friends`" para cada conta de `notify`. O `buildApp` passa ao `wireFriends` (campo `changed`) a porta composta do `wireAccountRealtime`: o adaptador `SocketIoFriendsChanged` emite `friends:changed` `{ at }` à sala `user:<id>` de cada conta, todas as abas. O `SILENT_FRIENDS_CHANGED` (no-op) continua como padrão do `wireFriends` para quem o chama sem tempo real. Um perfil gravado também avisa os amigos (`FriendProfileNoticeService`). Detalhe em [`friends/presenca-ao-vivo.md`](friends/presenca-ao-vivo.md).

## Testes

- Unit: `server/test/modules/friends/friend-relation.bo.spec.ts` (cada regra e teto), `friends.service.spec.ts` (trava, avisos, pedido silencioso, assentos), `friends.mapper.spec.ts`; fakes nomeados em `server/test/support/friends-fakes.ts` (`FriendsStoreFake`, `FriendsChangedFake`, `MemberRemovedFake`, `ForgottenMembershipsFake`, `UserBlocksDaoFake`).
- Integração: `server/test/integration/friends-dao.spec.ts` (PK, `CHECK`, cascata, `incomingOf` sem bloqueado), `friends.spec.ts` (as rotas, corrida cruzada, teto de 50, identidade da sessão), `friends-blocks-campaigns.spec.ts` (código, Explorar, saída ao vivo, co-mestre, desbloqueio).
