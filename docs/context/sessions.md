# Sessions

Sessão ao vivo da mesa: a **própria mesa é a sessão** (não há tabela `sessions`). Quem é membro e abre a tela da mesa entra na sala Socket.IO dela e todos os presentes veem, ao vivo, quem está online. É a base por onde passam depois `token:*` e `combat:*`. Vive em `server/src/modules/sessions/`. Spec: §3.8, §5.2, §5.5, §5.6, §7.2, §7.3. Plano de origem: `docs/plans/2026-10-15-sessao-ao-vivo-presenca.md`.

## Estrutura

- `server/src/modules/sessions/table-presence.bo.ts` — regra de presença (abaixo); `connection-tables.bo.ts` — mesas da conexão (abaixo)
- `server/src/modules/sessions/sessions.service.ts` e `sessions.mapper.ts` — abaixo
- `server/src/modules/sessions/sessions.gateway.ts` — borda Socket.IO (`createSessionsGateway`); `sessions.error.ts` — `SessionEndedError` (`UNAUTHENTICATED`) e `TooManyTablesError` (`TOO_MANY_TABLES`, cita o id e o "5 of 5")
- `server/src/modules/sessions/sessions.plugin.ts` — `createSessionsModule({ campaigns, clock, registry, scheduler, publisher, realtime, rate, log })` → `{ gateway, service }` (o `service` é a `ProfileChangedPort` do módulo `profiles`, ver `profiles.md`); o `buildApp` (`wireRealtime`) monta o registro em memória, o `TimerScheduler` (com `cancelAll` no `onClose`) e o publicador sobre o `io`, e registra o gateway em `realtime.onConnection`
- `server/src/modules/sessions/{presence-registry,scheduler,session-publisher}.port.ts` — portas (abaixo); adaptadores em `server/src/infrastructure/{presence-registry,scheduler}/`

## Contrato (Socket.IO em `/api/socket.io`, conexão autenticada pelo cookie — ver `server.md`, Tempo real)

| Nome                     | Direção         | Payload                                                        | Ack                                                                                                                                            |
| ------------------------ | --------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `session:join`           | client → server | `sessionCommandDto` `{ actionId, campaignId }`                 | `{ ok: true, state: SessionStateDto }` · `{ ok: false, error }` com `CAMPAIGN_NOT_FOUND`, `INVALID_BODY`, `UNAUTHENTICATED`, `TOO_MANY_TABLES` |
| `session:leave`          | client → server | `sessionCommandDto`                                            | `{ ok: true }` (idempotente) · `{ ok: false, error }`                                                                                          |
| `session:memberJoined`   | server → sala   | `{ campaignId, version, member: { …, online: true }, at }`     | —                                                                                                                                              |
| `session:memberLeft`     | server → sala   | `{ campaignId, version, userId, at }`                          | —                                                                                                                                              |
| `session:setActivity`    | client → server | `sessionActivityCommandDto` `{ actionId, campaignId, away }`   | `{ ok: true }` (idempotente; mesa fora da conexão → `ok` sem efeito) · `{ ok: false, error }` com `INVALID_BODY`, `UNAUTHENTICATED`            |
| `session:memberActivity` | server → sala   | `{ campaignId, version, userId, awaySince (ISO \| null), at }` | —                                                                                                                                              |
| `session:memberUpdated`  | server → sala   | `{ campaignId, version, member: SessionMemberDto, at }`        | —                                                                                                                                              |

- Cada membro (snapshot, `memberJoined`, `memberUpdated`) leva o perfil que a mesa vê: `userId`, `name` (apelido), `username` (o @), `color` (efetiva: `memberColorOf` do game-core sobre a escolha), `avatarId`, `bio` e `role`, além de `online`/`awaySince`.
- `session:memberUpdated` sai quando a pessoa grava apelido, cor, bio ou foto (`profiles.md`), em **cada mesa viva** dela (com roster no registro), com o membro relido do banco e a versão +1. Mesa sem ninguém conectado não ouve nada nem ganha roster.
- Sala `campaign:<id>` (`campaignRoom`). O evento vai **só** para a sala da mesa: quem está noutra mesa, ou foi recusado, não ouve nada (critério 14).
- O `session:join` também põe o socket em `campaign:<id>:user:<userId>` e, se for mestre, em `campaign:<id>:masters` (salas por público do tabuleiro, ver `board.md`) e, **depois** de estar na sala da mesa, lê o grid do grupo e o elenco (`groupGrid.groupSceneIdOf` / `castSceneIdOf`, o `SceneWatchService` do módulo `scenes`, dep `groupGrid` do plugin) e entra nas salas dos dois (`sceneAudienceRooms`, `enterTableGrids`): uma ativação gravada depois dessa leitura move quem está na sala da mesa, este socket incluso. Um `leave` ou queda durante a leitura não entra no grid. O `session:leave` sai de **toda** sala da mesa (`isRoomOfCampaign`: a mesa, as de público e as de cada grid) e esquece as abas dela (`withoutWatchedTable` em `socket.data.watchedSceneIds`). O ack de join/leave sai pelo `answerAck` de `src/realtime/realtime-ack.ts`, o mesmo do gateway do tabuleiro.
- `session:setActivity` (`setActivity` no gateway): valida o `sessionActivityCommandDto`, revalida a sessão e só age se a mesa está em `socket.data.campaignIds` (senão `ok` e nenhuma sala ouve nada).
- O gateway valida o DTO, **revalida a sessão** a cada comando pelo `reauthenticate` (sem banco até o `recheckAt`; expiração → ack `UNAUTHENTICATED` e a conexão cai; logout derruba a conexão na hora, sem esperar comando — ver `server.md`, Tempo real) e delega. Antes de tudo, o mesmo balde por conexão do tabuleiro (`rate.admit`, ver `board.md`): acima de 40 de uma vez ou 20/s, ack `RATE_LIMITED` com `retryAfterSeconds`, sem parse nem consulta. Mensagens públicas fixas: `Campaign not found`, `A valid session is required`, `Too many open tables`, `Too many commands in a row`; `INVALID_BODY` vem do `invalidBodyError` (cita o campo); o resto é `INTERNAL_ERROR` no log.
- **Até `MAX_OPEN_TABLES` mesas por conexão** (`socket.data.campaignIds`, uma sala por mesa): entrar numa não tira a pessoa da outra. A conexão em duas salas recebe os eventos das duas, uma vez cada, com o `campaignId` de cada.
- O `join` pede a vaga ao service (`admitTable`) e a **reserva** em `socket.data.campaignIds` **antes** do `await` do `join`: dez `join` simultâneos admitem exatamente cinco. Se o `join` falhar (não membro, erro), a vaga reservada é devolvida (`releaseTable`); `already-open` não devolve.
- `session:leave` só age se a mesa estiver no conjunto. Quem sai deixa a sala **antes** do `memberLeft`, então não ouve a própria saída. Um `leave` que chega durante o `join` da mesma mesa devolve a vaga, e o `join` ao terminar tira a pessoa do roster sem entrar na sala.
- `disconnect` do socket → `service.drop` de **cada** mesa do conjunto (cada uma com a sua tolerância de 5 s). Socket que cai durante o `join` (enquanto lê o banco) é retirado do roster na hora.
- Sem `connectionStateRecovery`: reconectar = novo `session:join` = novo snapshot (o `board:sync` lê tudo numa transação `repeatable read` `read only` só, ver `board.md`; mensagens a partir de 4 KB vão comprimidas, ver `server.md`, Tempo real). `actionId` é exigido, mas sem deduplicação persistida (`join`/`leave` são idempotentes).

## Regra de presença (`TablePresenceBo`)

- **Por usuário, não por socket**: o roster (`PresenceRoster`) guarda `version`, `sockets` (`userId → Set<socketId>`), `inGrace` (quem caiu e ainda pode voltar), `away` (os sockets parados; o id do socket é único) e `awaySince` (`userId → Date`: desde quando **todas** as abas do usuário estão paradas). Fechar uma de duas abas não derruba o "online".
- `connect(userId, socketId)` → `came-online` (primeiro socket; versão +1) · `already-online` (outra aba) · `returned-in-grace` (voltou dentro da tolerância).
- `disconnect(userId, socketId, 'left' | 'dropped', at)` → `still-online` (sobrou outra aba) · `went-away` (a aba que fechou era a ativa e as que sobraram estão paradas: ausente desde `at`, versão +1) · `went-offline` (saída explícita do último socket; versão +1) · `grace-started` (queda do último socket: continua online) · `not-connected` (socket que o usuário não tem; idempotente).
- `expireGrace(userId)` → `went-offline` (versão +1) · `already-back` (voltou antes) · `not-connected`.
- `isOnline(userId)`: tem socket **ou** está na tolerância.
- **Ausência** (o instante entra por parâmetro; o BO não tem relógio): `markAway(userId, socketId, at)` → `went-away` (a última aba ativa parou; `awaySince = at`, versão +1) · `still-active` (outra aba segue ativa; sem versão) · `already-away` (já ausente; nada muda) · `not-connected`. `markActive(userId, socketId)` → `came-back` (estava ausente; versão +1) · `still-active` · `not-connected`. Um `connect` de quem está ausente (aba nova, ou volta na tolerância) é `came-back`. Sair de vez (`went-offline`) limpa a ausência; na tolerância ela fica. `awaySinceOf(userId)` → `Date | null`.
- `profileChanged()` → `profile-changed` (versão +1; sockets, tolerância e ausência intactos): alguém da mesa gravou o perfil.
- Só `came-online`, `went-offline`, `went-away`, `came-back` e `profile-changed` mudam a versão: são as únicas mudanças que os outros veem. Toda operação devolve `{ roster, change }` sem mutar o roster recebido.
- `EMPTY_ROSTER` (`version: 0`) é o de mesa sem ninguém.

## Regra da conexão (`ConnectionTablesBo`)

- `new ConnectionTablesBo(abertas, limite)`: o conjunto de mesas de **uma conexão**, com o teto recebido (o service passa `MAX_OPEN_TABLES`, do contracts; o BO não importa DTO).
- `admit(id)` → `admitted` (entra) · `already-open` (já estava; não conta de novo) · lança `TooManyTablesError` quando já há `limite` e a pedida não é uma delas.
- `release(id)` → `released` · `not-open` (idempotente).
- Devolve `{ tables, change }` sem mutar o conjunto recebido.

## Service e mapper

- `TableSessionService` (`TableSessionServiceDeps`: `campaigns: Pick<CampaignsService, 'rosterOf' | 'campaignIdsOf'>`, `registry`, `scheduler`, `publisher`, `clock`):
  - `join(userId, campaignId, socketId)` → `SessionStateDto`: `rosterOf` primeiro (quem não é membro recebe `CAMPAIGN_NOT_FOUND` e nada é salvo nem publicado) → `connect` → **salva** → cancela a expiração se voltou na tolerância → publica `memberJoined` só em `came-online` → devolve o snapshot.
  - `leave(...)` (síncrono): `disconnect('left')`; `went-offline` publica `memberLeft` na hora; repetido não publica de novo.
  - `drop(...)` (síncrono, a queda do socket): `disconnect('dropped')`; `grace-started` agenda `expire` em `PRESENCE_GRACE_MS` (5000) sob a chave `<campaignId>:<userId>`.
  - `expire(campaignId, userId)`: `expireGrace`; `went-offline` publica `memberLeft` com a versão +1.
  - `setActivity(userId, campaignId, socketId, away)` (síncrono): `markAway(…, clock.now())` ou `markActive` → salva → publica `memberActivity` só em `went-away` (com o `awaySince`) e `came-back` (com `null`). `already-away` não salva nem publica; `still-active` **salva** (a aba parada entra no `away`, senão a segunda aba parada não saberia da primeira) e não publica.
  - A ausência também sai do `join` (`came-back` de uma aba nova de quem estava ausente: cancela a tolerância e publica `memberActivity` com `null`) e do `leave`/`drop` (`went-away` quando a aba ativa fecha e as que sobram estão paradas).
  - `profileChanged(userId)` (a `ProfileChangedPort`): `campaignIdsOf(userId)` → só as que têm roster no registro → para cada uma, `rosterOf` (o membro **relido**, nunca montado à mão) → relê o roster depois do `await` (sumiu: nada) → `profileChanged()` → **salva** → publica `memberUpdated`.
  - `admitTable(abertas, id)` / `releaseTable(abertas, id)` → `ConnectionTablesOutcome`: aplicam o `ConnectionTablesBo` com `MAX_OPEN_TABLES`, sem tocar no registro nem no publicador.
  - Ordem: o roster é **salvo antes** de publicar. `not-connected`, `already-back` e `already-away` não salvam nem publicam (`UNCHANGED`).
- `sessions.mapper.ts`: `toSessionStateDto(campaignId, membros, roster, at)` (membros na ordem recebida, cada um por `toSessionMemberDto(membro, presença)`: o perfil com a cor efetiva, `online` por `isOnline`, `awaySince` pelo `awaySinceOf`), `toMemberUpdatedDto(campaignId, membro, roster, at)`, `toMemberActivityDto(campaignId, userId, awaySince, versão, at)`, `toMemberJoinedDto(campaignId, membro, versão, at)`, `toMemberLeftDto(campaignId, userId, versão, at)`.
- Os membros vêm do `CampaignsService.rosterOf` (ver `campaigns.md`): o isolamento por mesa continua no `CampaignAccessBo`.

## Portas e adaptadores

| Porta                  | Adaptador                  | O que faz                                                                                                       |
| ---------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `PresenceRegistryPort` | `InMemoryPresenceRegistry` | `rosterOf(campaignId)` (`undefined` = ninguém na mesa) e `save`; roster vazio apaga a entrada (`tableCount()`)  |
| `SessionPublisherPort` | `SocketIoSessionPublisher` | `memberJoined`, `memberLeft`, `memberActivity` e `memberUpdated`: `io.to(campaignRoom(id)).emit(...)`           |
| `SchedulerPort`        | `TimerScheduler`           | `schedule(chave, ms, tarefa)` substitui a pendente da mesma chave; `cancel(chave)`; `cancelAll()` no fechamento |

- **Por que memória e não Redis:** presença não toca o banco e o MVP roda uma instância (spec §5.5, §5.7). O registro é **síncrono** de propósito: o service lê, decide e salva sem `await` no meio, então dois comandos na mesma mesa nunca se intercalam. Com várias instâncias, a porta vira uma atualização atômica no Redis e entra o redis-adapter do Socket.IO.
- Mesa esvaziada volta à versão 0 no próximo `join`: o client aceita sempre o snapshot (inclusive de versão menor), então isso não regride ninguém.

## Testes

- Integração: `server/test/integration/sessions.spec.ts` (clientes `socket.io-client` reais, usuários e mesas pelo HTTP real): snapshot, `memberJoined`/`memberLeft`, isolamento entre mesas, não membro, payload forjado, queda sem `memberLeft` em 300 ms, várias abas, sessão revogada, o `describe` "activity" (a Bia ausente chega à Ana e ao snapshot de quem entra depois; duas abas, uma parada → nada, as duas → evento; a volta com `null`; `userId` forjado → `INVALID_BODY`; mesa fora da conexão → `ok` sem evento) e o `describe` "several tables on one connection" (duas mesas sem saída da primeira, eventos das duas, isolamento, sair de uma, limite, corrida de dez `join`, recusa que não ocupa vaga, queda das duas). Suporte em `server/test/support/realtime-client.ts` (`connectRealtime`, `recordEventsOf(client).until(n)`, `disconnectionOf`).

- Unit: `server/test/modules/sessions/{table-presence.bo,connection-tables.bo,sessions.mapper,sessions.service}.spec.ts` e `server/test/infrastructure/{presence-registry,scheduler}/` (o agendador com `vi.useFakeTimers()`).
- `server/test/support/sessions-fakes.ts` — `SessionsJournal` (diário comum, para provar salvar → publicar), `PresenceRegistryFake` (escreve `save:<campaignId>`), `SchedulerFake` (`scheduled[chave].delayMs`, `cancelled`, `fire(chave)`), `SessionPublisherFake` (`published`, escreve `publish:<evento>`, inclusive `publish:memberActivity` e `publish:memberUpdated:<campaignId>`), `CampaignRosterFake` (membros por mesa em `tables`, trocáveis no spec para simular um perfil gravado; quem não está na lista recebe `CampaignNotFoundError`; `campaignIdsOf`).
- Integração do perfil ao vivo: o `describe` "profile changes" de `sessions.spec.ts` (snapshot com @, cor, foto e bio; Quelm não lista a Ana; a Bia ouve a cor e a foto novas com a versão +1; quem está só na Quelm não ouve; mesa vazia não guarda roster e o `join` seguinte já traz o perfil).
- `server/test/support/sessions-factories.ts` — `presenceRoster({ version, sockets: { [userId]: ['s1'] }, inGrace, away: ['s1'], awaySince: { [userId]: data } })`: o roster escrito como registros simples.
