# Sessions

Sessão ao vivo da mesa: a **própria mesa é a sessão** (não há tabela `sessions`). Quem é membro e abre a tela da mesa entra na sala Socket.IO dela e todos os presentes veem, ao vivo, quem está online. É a base por onde passam depois `token:*` e `combat:*`. Vive em `server/src/modules/sessions/`. Spec: §3.8, §5.2, §5.5, §5.6, §7.2, §7.3. Plano de origem: `docs/plans/2026-10-15-sessao-ao-vivo-presenca.md`.

## Estrutura

- `server/src/modules/sessions/table-presence.bo.ts` — regra de presença (abaixo)
- `server/src/modules/sessions/sessions.service.ts` e `sessions.mapper.ts` — abaixo
- `server/src/modules/sessions/sessions.gateway.ts` — borda Socket.IO (`createSessionsGateway`); `sessions.error.ts` — `SessionEndedError` (`UNAUTHENTICATED`)
- `server/src/modules/sessions/sessions.plugin.ts` — `createSessionsModule({ campaigns, clock, registry, scheduler, publisher, realtime, log })` → `{ gateway }`; o `buildApp` (`wireRealtime`) monta o registro em memória, o `TimerScheduler` (com `cancelAll` no `onClose`) e o publicador sobre o `io`, e registra o gateway em `realtime.onConnection`
- `server/src/modules/sessions/{presence-registry,scheduler,session-publisher}.port.ts` — portas (abaixo); adaptadores em `server/src/infrastructure/{presence-registry,scheduler}/`

## Contrato (Socket.IO em `/api/socket.io`, conexão autenticada pelo cookie — ver `server.md`, Tempo real)

| Nome                   | Direção         | Payload                                                    | Ack                                                                                                                         |
| ---------------------- | --------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `session:join`         | client → server | `sessionCommandDto` `{ actionId, campaignId }`             | `{ ok: true, state: SessionStateDto }` · `{ ok: false, error }` com `CAMPAIGN_NOT_FOUND`, `INVALID_BODY`, `UNAUTHENTICATED` |
| `session:leave`        | client → server | `sessionCommandDto`                                        | `{ ok: true }` (idempotente) · `{ ok: false, error }`                                                                       |
| `session:memberJoined` | server → sala   | `{ campaignId, version, member: { …, online: true }, at }` | —                                                                                                                           |
| `session:memberLeft`   | server → sala   | `{ campaignId, version, userId, at }`                      | —                                                                                                                           |

- Sala `campaign:<id>` (`campaignRoom`). O evento vai **só** para a sala da mesa: quem está noutra mesa, ou foi recusado, não ouve nada (critério 14).
- O gateway valida o DTO, **revalida a sessão** pelo cookie do handshake a cada comando (logout/expiração → ack `UNAUTHENTICATED` e a conexão cai) e delega. Mensagens públicas fixas: `Campaign not found`, `A valid session is required`; `INVALID_BODY` vem do `invalidBodyError` (cita o campo); o resto é `INTERNAL_ERROR` no log.
- **Uma mesa por conexão** (`socket.data.campaignId`): `session:join` de outra mesa entra na nova e só então sai da anterior (falhar na nova mantém a anterior). Quem sai deixa a sala **antes** do `memberLeft`, então não ouve a própria saída.
- `disconnect` do socket → `service.drop` (tolerância de 5 s). Socket que cai durante o `join` (enquanto lê o banco) é retirado do roster na hora.
- Sem `connectionStateRecovery`: reconectar = novo `session:join` = novo snapshot. `actionId` é exigido, mas sem deduplicação persistida (`join`/`leave` são idempotentes).

## Regra de presença (`TablePresenceBo`)

- **Por usuário, não por socket**: o roster (`PresenceRoster`) guarda `version`, `sockets` (`userId → Set<socketId>`) e `inGrace` (quem caiu e ainda pode voltar). Fechar uma de duas abas não derruba o "online".
- `connect(userId, socketId)` → `came-online` (primeiro socket; versão +1) · `already-online` (outra aba) · `returned-in-grace` (voltou dentro da tolerância).
- `disconnect(userId, socketId, 'left' | 'dropped')` → `still-online` (sobrou outra aba) · `went-offline` (saída explícita do último socket; versão +1) · `grace-started` (queda do último socket: continua online) · `not-connected` (socket que o usuário não tem; idempotente).
- `expireGrace(userId)` → `went-offline` (versão +1) · `already-back` (voltou antes) · `not-connected`.
- `isOnline(userId)`: tem socket **ou** está na tolerância.
- Só `came-online` e `went-offline` mudam a versão: são as únicas mudanças que os outros veem. Toda operação devolve `{ roster, change }` sem mutar o roster recebido.
- `EMPTY_ROSTER` (`version: 0`) é o de mesa sem ninguém.

## Service e mapper

- `TableSessionService` (`TableSessionServiceDeps`: `campaigns: Pick<CampaignsService, 'rosterOf'>`, `registry`, `scheduler`, `publisher`, `clock`):
  - `join(userId, campaignId, socketId)` → `SessionStateDto`: `rosterOf` primeiro (quem não é membro recebe `CAMPAIGN_NOT_FOUND` e nada é salvo nem publicado) → `connect` → **salva** → cancela a expiração se voltou na tolerância → publica `memberJoined` só em `came-online` → devolve o snapshot.
  - `leave(...)` (síncrono): `disconnect('left')`; `went-offline` publica `memberLeft` na hora; repetido não publica de novo.
  - `drop(...)` (síncrono, a queda do socket): `disconnect('dropped')`; `grace-started` agenda `expire` em `PRESENCE_GRACE_MS` (5000) sob a chave `<campaignId>:<userId>`.
  - `expire(campaignId, userId)`: `expireGrace`; `went-offline` publica `memberLeft` com a versão +1.
  - Ordem: o roster é **salvo antes** de publicar. `not-connected` e `already-back` não salvam nem publicam.
- `sessions.mapper.ts`: `toSessionStateDto(campaignId, membros, roster, at)` (membros na ordem recebida, `online` por `isOnline`), `toMemberJoinedDto(campaignId, membro, versão, at)`, `toMemberLeftDto(campaignId, userId, versão, at)`.
- Os membros vêm do `CampaignsService.rosterOf` (ver `campaigns.md`): o isolamento por mesa continua no `CampaignAccessBo`.

## Portas e adaptadores

| Porta                  | Adaptador                  | O que faz                                                                                                       |
| ---------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `PresenceRegistryPort` | `InMemoryPresenceRegistry` | `rosterOf(campaignId)` (`undefined` = ninguém na mesa) e `save`; roster vazio apaga a entrada (`tableCount()`)  |
| `SessionPublisherPort` | `SocketIoSessionPublisher` | `memberJoined(dto)` e `memberLeft(dto)`: `io.to(campaignRoom(id)).emit(...)`                                    |
| `SchedulerPort`        | `TimerScheduler`           | `schedule(chave, ms, tarefa)` substitui a pendente da mesma chave; `cancel(chave)`; `cancelAll()` no fechamento |

- **Por que memória e não Redis:** presença não toca o banco e o MVP roda uma instância (spec §5.5, §5.7). O registro é **síncrono** de propósito: o service lê, decide e salva sem `await` no meio, então dois comandos na mesma mesa nunca se intercalam. Com várias instâncias, a porta vira uma atualização atômica no Redis e entra o redis-adapter do Socket.IO.
- Mesa esvaziada volta à versão 0 no próximo `join`: o client aceita sempre o snapshot (inclusive de versão menor), então isso não regride ninguém.

## Testes

- Integração: `server/test/integration/sessions.spec.ts` (clientes `socket.io-client` reais, usuários e mesas pelo HTTP real): snapshot, `memberJoined`/`memberLeft`, isolamento entre mesas, não membro, payload forjado, queda sem `memberLeft` em 300 ms, várias abas, sessão revogada, uma mesa por conexão. Suporte em `server/test/support/realtime-client.ts` (`connectRealtime`, `recordEventsOf(client).until(n)`, `disconnectionOf`).

- Unit: `server/test/modules/sessions/{table-presence.bo,sessions.mapper,sessions.service}.spec.ts` e `server/test/infrastructure/{presence-registry,scheduler}/` (o agendador com `vi.useFakeTimers()`).
- `server/test/support/sessions-fakes.ts` — `SessionsJournal` (diário comum, para provar salvar → publicar), `PresenceRegistryFake` (escreve `save:<campaignId>`), `SchedulerFake` (`scheduled[chave].delayMs`, `cancelled`, `fire(chave)`), `SessionPublisherFake` (`published`, escreve `publish:<evento>`), `CampaignRosterFake` (membros por mesa; quem não está na lista recebe `CampaignNotFoundError`).
- `server/test/support/sessions-factories.ts` — `presenceRoster({ version, sockets: { [userId]: ['s1'] }, inGrace })`: o roster escrito como registros simples.
