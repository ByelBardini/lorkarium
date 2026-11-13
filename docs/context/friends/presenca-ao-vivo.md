# Presença da conta ao vivo

Detalhe de [`../friends.md`](../friends.md): o serviço, a borda Socket.IO e os eventos da presença da conta. A regra pura (`AccountPresenceBo`) está em [`presenca.md`](presenca.md). Módulo `server/src/modules/account-presence/`.

## Estrutura

- `account-presence.service.ts` — `AccountPresenceService` (abaixo); `ACCOUNT_PRESENCE_GRACE_MS` = 5000
- `account-presence.gateway.ts` — `createAccountPresenceGateway`
- `account-presence.mapper.ts` — `toFriendPresenceDto`, `toPresenceFriendChangedDto`, `toOpenedTable` (campanha → `{ campaignId, name, isPublic }`)
- `account-presence-publisher.port.ts` — `AccountPresencePublisherPort.friendChanged(friendIds, event)`; adaptador `SocketIoAccountPresencePublisher` (`server/src/infrastructure/account-presence-publisher/`)
- `account-presence.plugin.ts` — `createAccountPresenceModule(options)` → `{ gateway, service }`; o `announceFailed` loga pelo `log` do app
- Fiação: `server/src/app/wire-account-realtime.ts` (`wireAccountRealtime(realtime, { db, clock, scheduler, rate, log })`), chamado no `wireRealtime` do `buildApp` logo depois do registro de acesso e **antes** da sessão da mesa (o socket já está na sala dele quando qualquer outro gateway roda). O mesmo arquivo liga as mensagens privadas ([`../direct-messages.md`](../direct-messages.md)) e devolve `{ presence, friendsChanged }`

## Eventos

| Evento                   | Direção         | Payload / ack                                                                                                                                     |
| ------------------------ | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `presence:sync`          | client → server | só o ack: `{ ok: true, friends: [{ userId, status, table }] }` (todo amigo, offline e invisível inclusos) · `RATE_LIMITED`, `UNAUTHENTICATED`     |
| `presence:setVisibility` | client → server | `{ actionId, visibility: 'online' \| 'invisible' }` → `{ ok: true }` · `INVALID_BODY` (`away` nunca é escolha), `RATE_LIMITED`, `UNAUTHENTICATED` |
| `presence:friendChanged` | server → user   | `{ userId, status, table, at }` à sala `user:<id>` de cada amigo, só quando o que eles veem muda                                                  |
| `friends:changed`        | server → user   | `{ at }` à sala de cada conta do `notify` (todas as abas), sem motivo                                                                             |

- A conta é sempre a da conexão (`reauthenticate`), nunca do payload (§7.3). O balde é o mesmo da sessão e do tabuleiro (`BOARD_RATE`); `presence:sync` tira do balde antes de reler a sessão.
- O handler do `presence:sync` pega o **último argumento função** como ack: um client que mande um payload junto não quebra.

## Gateway

- `connection`: `socket.join(userRoom(id))` e `presence.connect(id, socket.id)`.
- `disconnect`: motivo `client namespace disconnect` (logout, fechar o app) ou `server namespace disconnect` (fim da sessão) → `left`, offline na hora; qualquer outro (queda de rede, F5) → `dropped`, com a tolerância.

## `AccountPresenceService`

- `connect`, `drop(userId, socketId, 'left' | 'dropped')` (a tolerância pelo `SchedulerPort`, chave `account:<userId>`; voltar cancela), `setVisibility`, `sync(userId)`, `isVisiblyOnline(userId)` (o que as mensagens privadas leem).
- É também a `TableOpenedPort` da sessão da mesa ([`../sessions.md`](../sessions.md)): `tableOpened` lê nome e visibilidade da mesa (`CampaignsDao.findById`, uma leitura por entrada na mesa) e só então abre; um `tableClosed` que chega durante a leitura cancela a abertura (`opening`). `tableLeftEverywhere` fecha a mesa em toda aba; `activityChanged` → `markAway`/`markActive` (o ausente da conta vem do mesmo `session:setActivity`; uma aba sem mesa não manda o sinal e conta como ativa).
- **Ordem:** grava no registro, depois decide por `seenPresenceChanged(antes, depois)` se publica. O evento é montado na hora (status e relógio daquele instante) e sai depois de ler os amigos, numa **cadeia por conta**: online → ausente rápido nunca chega aos amigos como ausente → online.
- **Amigos em memória:** `friendIdsOf` é lido uma vez por conta conectada e guardado; parar e voltar a mexer não custa consulta (o spec "past the bucket, session:setActivity is refused… without a query" de `sessions.spec.ts` depende disso). `friendsChanged({ userIds })` esquece as contas citadas (o service também é um `FriendsChangedPort`, chamado antes do aviso ao vivo); offline de vez (publicado `offline` sem socket) também esquece. Leitura que falha não fica guardada e vai ao `announceFailed` (log), nunca lança.
- Quem ouve é só **amigo**: bloquear desfaz a amizade, então o bloqueado deixa de ouvir. Ao virar amigo, nenhum `presence:friendChanged` sai: o client relê `GET /friends` no `friends:changed` e pede `presence:sync`.

## `friends:changed` ao vivo

`SocketIoFriendsChanged` (`server/src/infrastructure/friends-changed/`) emite `{ at }` à sala de cada conta; `userIds` vazio não emite. No `wireAccountRealtime` a porta entregue ao `wireFriends` (campo `changed`) é composta, nesta ordem: as mensagens privadas esquecem o par → a presença esquece os amigos → o aviso ao vivo.

**Perfil:** `FriendProfileNoticeService` (`server/src/modules/friends/friend-profile-notice.service.ts`) lê os amigos (`friendIdsOf`) e manda `friends:changed` a eles; o `buildApp` junta-o à sessão da mesa por `profileChangedInOrder(sessions.service, friendNotice)` (`src/app/member-outlets.ts`), a `ProfileChangedPort` do `profiles` e do backoffice.

## Limites conhecidos

- O nome e a visibilidade da mesa ficam como estavam ao abrir: renomear ou tornar privada uma mesa aberta só aparece aos amigos na próxima entrada.
- Instância única (spec §5.7): registro e memória dos amigos em processo.

## Testes

- Unit: `server/test/modules/account-presence/{account-presence.service,account-presence.mapper}.spec.ts` (fakes em `server/test/support/account-presence-fakes.ts`: `AccountPresencePublisherFake`, `FriendIdsFake`, `CampaignInfoFake`; `SchedulerFake` da sessão), `server/test/modules/friends/friend-profile-notice.service.spec.ts`.
- Integração: `server/test/integration/account-presence.spec.ts` (online só para amigo, `presence:sync`, mesa pública × privada, invisível, `away` recusado, bloqueio, `friends:changed` em todas as abas e no perfil); suporte `server/test/support/account-live.ts` (`befriend`, `ackOf`, `eventMatching`, `payloadsOf`). `friendIdsOf` em `friends-dao.spec.ts`.
