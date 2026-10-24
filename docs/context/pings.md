# Pings

Um membro da mesa (mestre ou jogador) aponta um ponto do grid para quem está nele: um anel na cor da pessoa, com o nome dela, que cresce e some em ~3 s. É **efêmero**: não grava, não soma versão, não entra no snapshot — como a prévia do arraste ([`tokens/arraste.md`](tokens/arraste.md)). O lado do client (gesto, desenho, rede, sala) está em [`client/pings.md`](client/pings.md).

## Regras de negócio

- Qualquer membro pinga (mestre ou jogador), em qualquer grid que a conexão alcança; quem ouve é a sala do grid, menos a conexão que pingou (ela desenha o seu na hora). Outro grid e outra mesa não ouvem nada (critério 14).
- O ping **não respeita a névoa**: todos do grid o veem.
- Frequência: o balde por conexão de todo comando do tabuleiro (`COMMAND_BURST` 40, `COMMANDS_PER_SECOND` 20, `command-rate.bo.ts`); no client, no máximo 30 na tela.
- Gesto: Alt + clique em qualquer ferramenta, ou segurar parado 500 ms no Selecionar. Cor por pessoa (hash do `userId`), nome pelo roster da mesa.

## Estrutura (server)

- `server/src/modules/pings/` — módulo próprio, sem PO, DAO nem BO (a única regra é o alcance, abaixo):
  - `pings.service.ts` — `PingsService.ping(userId, campaignId, command, connectionId)`: `memberAccessOf` (fora da mesa → `CAMPAIGN_NOT_FOUND`, antes de olhar a sala) → `audience.reaches(connectionId, campaignId, sceneId)` (fora → `SceneNotFoundError`, `SCENE_NOT_FOUND`, nunca `FORBIDDEN`) → `publisher.pinged(event, connectionId)`. Devolve `void`. O `userId` do evento é o da sessão (§7.3); o `at` vem do `ClockPort`.
  - `grid-audience.port.ts` — `GridAudiencePort.reaches(connectionId, campaignId, sceneId): boolean`.
  - `ping-publisher.port.ts` — `PingPublisherPort.pinged(event: BoardPingedDto, exceptConnectionId)`.
  - `pings.plugin.ts` — `createPingsModule({ members, audience, publisher, clock })` → `{ service }`.

## Borda e adaptadores

- `board.gateway.ts` — `socket.on('board:ping', bind(pingCommandDto, …))`, **fora** da fila da mesa (`CampaignCommandQueue`): valida o DTO estrito (`userId` forjado, `x` fora do teto → `INVALID_BODY`), relê a sessão, exige a mesa na conexão (`CAMPAIGN_NOT_FOUND`), conta no balde de frequência (`RATE_LIMITED`, 40 de uma vez, 20/s) e chama `pings.ping(userId, campaignId, command, socket.id)`; ack `{ ok: true }`. O `PingsService` chega ao gateway pelo `createBoardModule({ …, pings })`, montado no `wireRealtime` do `build-app.ts`.
- `server/src/infrastructure/grid-audience/socket-io-grid-audience.ts` — `SocketIoGridAudience.reaches`: `io.sockets.sockets.get(connectionId)?.rooms.has(sceneRoom(campaignId, sceneId))` (o socket é sempre local: o ping é respondido na conexão que o mandou).
- `server/src/infrastructure/ping-publisher/socket-io-ping-publisher.ts` — `SocketIoPingPublisher.pinged`: `io.to(sceneRoom(…)).except(connectionId).emit('board:pinged', event)`. A exclusão é **por conexão**, não por pessoa: outra aba da mesma pessoa com o grid aberto ouve.

## Regra do alcance: pela sala, sem banco

O socket só está na sala `campaign:<id>:scene:<sceneId>` (`server/src/realtime/rooms.ts`) se o server o pôs lá (`session:join` no grid do grupo, `scene:watch` numa aba) e o tira quando o acesso muda (grid que ficou privado, apagado, troca do grupo — `docs/context/board.md`). Então estar na sala **é** a prova de alcançar o grid: zero consulta por ping. O comando exige `sceneId`.

## Contrato

DTOs em [`contracts/ping.md`](contracts/ping.md): `board:ping` (`pingCommandDto`, ack `{ ok: true }`) e `board:pinged` (`boardPingedDto`, sem `version`).

## Testes

- E2E: `e2e/test/pings.spec.ts` (grupo `scene`, ver [`ci/e2e.md`](ci/e2e.md)).
- Integração: `server/test/integration/pings.spec.ts` (`useTokenTable`, `socket.io-client` real): a Bia e o Caio ouvem o ping da Ana no grid do grupo e a Ana só recebe o ack; Torre privada aberta → a outra conexão da Ana ouve, a Bia não; a Bia na Torre privada → `SCENE_NOT_FOUND`; mesa fora da conexão → `CAMPAIGN_NOT_FOUND`; `userId` forjado e `x` acima do teto → `INVALID_BODY`; a Quelm não ouve nada (critério 14); 5 pings não mudam a versão do `board:sync`; o 39º de uma rajada (depois do join e de um sync) → `RATE_LIMITED`.
- Unit: `server/test/modules/pings/pings.service.spec.ts`, com `GridAudienceFake` e `PingPublisherFake` (`server/test/support/pings-fakes.ts`), `MembershipReadsFake` e `ClockFake`.
