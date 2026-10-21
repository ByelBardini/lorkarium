# Walls

Paredes e portas da cena (antecipa o §12: visão individual, fog of war): bloqueiam a visão e a passagem do token do jogador; o mestre vê tudo e passa por qualquer parede. Server em `server/src/modules/walls/`; a borda Socket.IO é o gateway do `board` (ver [`board.md`](board.md)); DTOs em [`contracts.md`](contracts.md) (`wall.dto.ts`); a geometria, a passagem e a visão em [`game-core.md`](game-core.md) (Parede, Passagem, Visão). O client fica em [`client/walls.md`](client/walls.md) e [`client/vision.md`](client/vision.md). Plano de origem: `docs/plans/2026-10-18-visao-e-paredes.md`.

## Tabela (`walls.po.ts`, migração `0016_walls`)

- `walls`: `id`, `scene_id` (cascade, indexado), `wall_order` (identidade: a ordem de criação), `kind` (enum `wall_kind`: `wall` | `grate` | `curtain` | `door`), `shape` (enum `wall_shape`: `line` | `freehand` | `rectangle` | `ellipse`), `x`, `y`, `width`, `height` em `numeric(8,2)` (casas fracionárias; chegam como string `"2.50"`), `points` `jsonb` (`[x, y][]` relativos a `(x, y)`, só reta e mão livre), `door_state` (enum `door_state`: `closed` | `open` | `locked`, nulo), `created_at`. **Sem autor**: só o mestre cria e edita.
- `CHECK walls_door_state`: `door_state` não nulo **se e só se** `kind = 'door'`. `CHECK walls_door_line`: porta só com `shape = 'line'`.
- Os três enums e a tabela estão exportados em `server/src/database/schema.ts` (armadilha do [`tokens.md`](tokens.md)). O `truncateAllTables` dos testes inclui `walls`.

## DAO (`walls.dao.ts`)

- `WallsDao(db | tx)`: `insertMany(rows)` → as linhas gravadas na ordem enviada (um `INSERT`, ordenado pela `wall_order`), `listOfScene(sceneId)` (pela `wall_order`), `findManyInScene(sceneId, ids)` (id de outra cena fica de fora), `moveMany(sceneId, moves)` (um `UPDATE` por parede, só `x, y`), `setKinds(sceneId, tipos)` (`kind` e `door_state` juntos, para o `CHECK` valer depois de cada `UPDATE`), `setDoor(sceneId, wallId, estado)` (só `door_state`), `deleteMany(sceneId, ids)`.
- **Isolamento por cena (§2.6):** toda leitura **e toda escrita** filtram por `scene_id`; um id de outra mesa não é achado, movido, trocado, aberto nem apagado.
- `NewWallPo` (sem `id`, `wall_order`, `created_at`), `WallMovePo` `{ wallId, x, y }` (strings do numeric) e `WallKindPo` `{ wallId, kind, doorState }`.

## Regra

- `WallRulesBo({ scene, limits: { walls, segments } })` (fala o VO `Wall` do game-core, nunca o DTO): `place(parede)` pelo `boxFits` (fora → `OUT_OF_SCENE` citando a caixa e a cena, `WallOutOfSceneError`); `admit(guardadas, novas)` — passar de `WALLS_PER_SCENE_MAX` (500) ou de `WALL_SEGMENTS_PER_SCENE_MAX` (4000 segmentos pelo `wallSegments`; o círculo conta 32) → `WALL_LIMIT` citando o total e o limite; `requireAt(id, esperado?, atual)` e `requireKind(id, esperado?, atual)` — sem `expect` passam, diferente → `STALE_UNDO`; `kindChange(id, parede, tipo)` → `{ kind, doorState }`: virar porta dá `closed` (a porta que já era mantém o estado), sair de porta dá `null`, forma que não é reta → `INVALID_DOOR` ("wall X is a ellipse; a door must be a line"); `eraseArea(paredes { id, wall }[], caixa)` → `{ wallIds, rest }` (cada parede que a caixa cobre, cortada nas bordas pelo `wallOutsideBox`; as intocadas não entram); `restAfterErase(id, parede, trecho)` → o que sobra pelo `wallWithoutSegment` do game-core (trecho que a parede não tem → `WALL_SEGMENT_NOT_FOUND`, "wall X has no segment N; expected 0 to C-1").
- `DoorAccessBo(campaignAccess).requireSet(porta, próximo, vista)`: parede que não é porta → `INVALID_DOOR` (até para o mestre); o mestre põe qualquer estado, vista ou não; o jogador pedindo `locked` → `FORBIDDEN` ("lock door X"); porta trancada → `DOOR_LOCKED` (`DoorLockedError`); porta não vista → `FORBIDDEN` ("set door X out of sight").
- `walls.mapper.ts`: `toWallDto` (numeric → número; passa pelo `wallOfRow`), `wallOfRow` (PO → VO; linha que o game-core recusa lança "wall X was saved broken" com o `cause`), `placedWallOf` (`PlacedWall` `{ id, wall }`, o que os tokens usam na passagem), `wallOfShape` (a forma do comando → VO, porta `closed`), `wallAt`, `toNewWallPo` (ao centésimo; porta nasce `closed`), `toNewWallPoOf(cena, Wall)` (o VO que sobrou de um apagar → linha nova), `positionOfWall`, `toWallMovePo`, `wallHundredth`.

## Service (`walls.service.ts`)

`WallsService.createMany | moveMany | deleteMany | setKindMany | setDoor | eraseSegment | eraseArea(userId, campaignId, comando)`. Participação → `requireMaster` (menos `setDoor`) → `inLockedScene` (trava, trabalho, `bumpVersion`) → **depois do commit** publica à mesa toda. Tudo ou nada, uma versão: o primeiro id que falta na cena (de outra mesa também) → `WALL_NOT_FOUND` antes de gravar qualquer um. O `createMany` confere `place` de cada uma e o `admit` contra as paredes da cena (`listOfScene`). `WallTransactionRunner` entrega `ScenesDao`, `WallsDao` e `TokensDao` presos ao `tx`.

- **Apagar um trecho (`eraseSegment`)**: mestre; na cena travada acha a parede (`WALL_NOT_FOUND`), confere o `expect` (o canto, `STALE_UNDO`), corta pelo `restAfterErase`, passa o `admit` com as outras paredes da cena e, numa versão só, apaga a parede e insere o que sobrou (reta ou mão livre do mesmo tipo; porta cortada não sobra). O ack traz em `createdIds` os ids do que sobrou, na ordem; o evento é **um** `wall:segmentErased`.
- **Apagar uma área (`eraseArea`)**: mestre; na cena travada lê as paredes (`listOfScene`, na ordem), corta pelo `eraseArea` da regra, passa o `admit` (o corte pode aumentar os segmentos) e, numa versão só, apaga as tocadas e insere o que sobrou. O ack traz os ids do que sobrou na ordem; o evento é **um** `wall:areaErased`. Caixa que não toca nada ainda gasta uma versão (o client não manda).
- **Porta (`setDoor`)**: para o jogador, os olhos são os tokens da cena que ele controla (`tokenEyeOf` do `tokens.mapper`: **todo** token que ele controla é olho; no Escuro, sem `sight` vê só o que está iluminado), as luzes são as do mapa **acesas** (`lightSourceOfRow`, `LightsDao` no `WallTransactionRunner`) mais as acesas de **todos** os tokens da cena (`tokenLightOf`, de qualquer dono: a lanterna do Bram, do Caio, mostra a porta à Bia), e a porta é vista pelo `doorSeenBy` do game-core com as paredes da cena (a porta passada é a **mesma instância** da lista). **Cone:** o olho chega com o campo (`eyeFieldOf`: o cone do `sight_angle` na direção do token + o anel de 1 casa) e a luz com o cone (a lanterna do token pelo `light_angle`, o holofote do mapa pelo `facing`/`angle`), só pelos mappers: a porta às costas da Lyra em 90° é `FORBIDDEN`, girada para ela abre, a colada nas costas abre (o anel), e a lanterna ou o holofote só mostram a porta para onde apontam. É a **única regra de visão que o server calcula**; com a cena `off`, toda porta é vista. Abrir porta não entra na pilha de desfazer (é ação de jogo).

| Comando             | Quem                                             | Evento                                                           |
| ------------------- | ------------------------------------------------ | ---------------------------------------------------------------- |
| `wall:createMany`   | mestre                                           | `wall:createdMany` `{ walls }` (ack com `createdIds`)            |
| `wall:moveMany`     | mestre (o client não usa mais: mover saiu)       | `wall:movedMany` `{ moves }` (ao centésimo)                      |
| `wall:eraseArea`    | mestre                                           | `wall:areaErased` `{ wallIds, walls }` (ack com `createdIds`)    |
| `wall:eraseSegment` | mestre                                           | `wall:segmentErased` `{ wallId, walls }` (ack com `createdIds`)  |
| `wall:deleteMany`   | mestre                                           | `wall:deletedMany` `{ wallIds }`                                 |
| `wall:setKindMany`  | mestre (o client não usa mais)                   | `wall:kindsChanged` `{ changes: { wallId, kind, doorState }[] }` |
| `wall:setDoor`      | mestre (qualquer); jogador (abre/fecha se vista) | `wall:doorChanged` `{ wallId, doorState }`                       |

## O que barra

- A passagem do token do **jogador** (`token:move`, `token:moveMany`; ver [`tokens.md`](tokens.md)): `wall`, `grate` e porta `closed`/`locked` barram; `curtain` e porta `open` não. O mestre passa por tudo. A parede vale **mesmo com a visão `off`** (só a névoa depende do modo).

## Borda, eventos e snapshot

- `walls.plugin.ts` (`createWallsModule({ db, publisher, clock })` → `{ service }`, com os dois limites do contracts), montado no `wireRealtime` do `build-app` e entregue ao `board`. O gateway liga os sete comandos (`create` para o `wall:createMany`, o `wall:eraseSegment` e o `wall:eraseArea`, `mutate` para os outros) e conhece `WallError` com os textos públicos de `WALL_NOT_FOUND`, `WALL_SEGMENT_NOT_FOUND` ("That piece of wall is not there"), `WALL_LIMIT`, `INVALID_DOOR` e `DOOR_LOCKED`.
- `BoardPublisherPort.wallsCreated | wallsMoved | wallsDeleted | wallSegmentErased | wallAreaErased | wallKindsChanged | doorChanged`: o adaptador emite à `campaign:<id>` inteira, **sem redação** — o client do jogador precisa da geometria para a névoa e para dobrar a rota; quem não desenha as linhas para o jogador é o renderer (ver Fora do escopo do plano: o DevTools mostra tudo).
- Snapshot: o `BoardService.snapshotFor` lê `WallsDao.listOfScene(scene)` e o `toBoardStateDto` põe as paredes em `walls` (iguais para todo público).

## Erros

- `walls.error.ts`: `WALL_NOT_FOUND`, `WALL_SEGMENT_NOT_FOUND` (`WallSegmentNotFoundError(wallId, trecho, total)`), `WALL_LIMIT`, `INVALID_DOOR`, `DOOR_LOCKED` e `OUT_OF_SCENE` (mesmo código do token e do desenho). `STALE_UNDO` mora no `board.error.ts`. `WALL_BLOCKED` é do token (`tokens.error.ts`).

## Testes

- Porta vista com cone: integração `doors.spec.ts` ("doors and the cone of sight": a porta às costas → `FORBIDDEN`; a Bia gira a Lyra e abre, `wall:doorChanged` aos outros; a colada nas costas abre; a lanterna do Bram e o holofote do mapa apontados para longe → `FORBIDDEN`, mirados → abre).
- Porta vista com luz: unit `walls.service.spec.ts` (a Lyra sem visão no escuro abre a porta que a tocha acesa mostra; tocha apagada → `FORBIDDEN`; a lanterna do Bram, do Caio, mostra a porta à Bia) e integração `doors.spec.ts` ("doors lit by a torch": abre com a tocha, `FORBIDDEN` depois que a Ana a apaga, a tocha da Quelm no mesmo ponto não ilumina a porta da Vharn). O `WallTransactionRunnerFake` aceita um `LightsDaoFake` como 4º parâmetro.

- Unit: `server/test/modules/walls/` (`wall-rules.bo.spec.ts`, `door-access.bo.spec.ts`, `walls.mapper.spec.ts`, `walls.service.spec.ts` com o diário `lock → save → bump → commit → publish`); fakes `WallsDaoFake` (`fill(n, cena)` para o limite) e `WallTransactionRunnerFake(scenes, walls, tokens?)` (`test/support/walls-fakes.ts`); fixtures `northWallPo` (reta (2, 2)–(6, 2)), `cellDoorPo` (porta fechada x = 7, y 5–6) e `newGrate` (`walls-factories.ts`); o `BoardPublisherFake` guarda `wallsCreates`, `wallsMoves`, `wallsDeletes`, `wallSegmentErasures`, `wallAreaErasures`, `wallKindChanges`, `doorChanges`.
- Integração: `walls-dao.spec.ts` (ordem, numeric e pontos, isolamento na leitura e na escrita, mover só a posição, trocar o tipo com o estado, abrir só o estado, apagar, cascade da cena, os dois `CHECK`), `walls.spec.ts` (três clientes: criar ao vivo com `createdIds`, sync, `FORBIDDEN` do jogador, mover/trocar/apagar em três versões, parede da Quelm → `WALL_NOT_FOUND`, sync isolado, `doorState` forjado → `INVALID_BODY`, mesa fora da conexão, `STALE_UNDO`, reinício; e "erasing a piece of a wall": o lado da grade sai numa versão com os ids do que sobrou; e "erasing an area of walls": o meio da reta sai e ficam as duas pontas, `FORBIDDEN` do jogador), `doors.spec.ts` (a Bia abre a porta que a Lyra vê, o Caio sem token perto → `FORBIDDEN`, trancada → `DOOR_LOCKED`, aberta deixa passar, porta da Quelm, `userId` forjado, reinício) e `token-walls.spec.ts` (ver [`tokens.md`](tokens.md)).
