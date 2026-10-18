# Board

O tabuleiro da mesa: a cena (só o grid por enquanto), e depois os tokens e o combate. O server é a autoridade; o client manda comando e desenha o estado confirmado. Plano de origem: `docs/plans/2026-10-15-tela-sala-de-jogo.md`. DTOs em [`contracts.md`](contracts.md) (Tabuleiro).

## Cena (`server/src/modules/scenes/`)

- **Uma cena por mesa** (spec §3.2): tabela `scenes` + `campaigns.active_scene_id` (`set null`). A migração `0002_scenes` criou a cena de cada mesa que já existia e apontou o `active_scene_id` para ela; mesa nova nasce com a cena (ver `campaigns.md`).
- `scenes` (`scenes.po.ts`): `id`, `campaign_id` (cascade, indexado), `name` ('Cena 1'), `width_cells` (20), `height_cells` (12), `cell_distance` numeric(6,2) ('1.5', chega como string), `cell_unit` ('m'), `grid_visible` (true), `grid_opacity` (30, de 0 a 100), `background_asset_id` (→ `assets`, **set null**; migração `0011_scene_background`), `vision_mode` (enum `scene_vision`: `off` | `dark` | `daylight`, padrão `off`; migração `0017_scene_vision` — as cenas que existiam ficam `off`), `version` (0), `created_at`, `updated_at`. `SceneGridPo` = só os campos do grid; `SceneConfigPo` = grid + `backgroundAssetId` + `visionMode` (o que o `scene:configure` grava).
- `ScenesDao` (`scenes.dao.ts`): `insert`, `findById`, `findActiveOf(campaignId)` e `lockActiveOf(campaignId)` → `SceneRow` (o PO + `backgroundWidth`/`backgroundHeight`, por `LEFT JOIN assets` que exige o asset **da mesma mesa**; sem fundo ou com o asset de outra mesa, os dois vêm `null`), `lockActiveOf` (`SELECT … FOR UPDATE OF scenes`; chamar no DAO montado com o `tx`), `bumpVersion(sceneId)` → versão nova, `update(sceneId, grid)`. A cena ativa só é devolvida se **também** pertencer à mesa (`scenes.campaign_id = campaignId`): um `active_scene_id` errado nunca vaza a cena de outra mesa.
- `CampaignsDao.setActiveScene(campaignId, sceneId)` grava o ponteiro.
- `SceneConfigBo` (`scene-config.bo.ts`): só o mestre configura o grid (`access.requireMaster('configure the grid')`); `SceneGrid` é o grid em números.
- `scenes.mapper.ts`: `toSceneDto(SceneRow)` (numeric `"1.50"` → `1.5`; `background` `{ assetId, width, height }` ou `null` por `backgroundOfScene`; `vision` = o `vision_mode`), `toSceneGridPo` (número → string do numeric), `toSceneGrid(command)` (o comando sem `actionId`/`campaignId`).
- `ScenesService.configure(userId, campaignId, grid, backgroundAssetId?, vision?)` → versão nova (o `vision` ausente mantém o modo da cena): participação → BO → transação (`lockActiveOf` → fundo → `update` → `bumpVersion`) → **depois do commit** `publisher.sceneUpdated`. O fundo: ausente mantém o atual, `null` tira (as casas ficam), um id é conferido pelo `AssetsDao.findInCampaign` preso ao `tx` — de outra mesa ou inexistente → `ASSET_NOT_FOUND` (`AssetNotFoundError`) sem gravar, somar versão nem publicar. `SceneTransactionRunner` entrega `{ scenes, assets }` presos ao `tx`. O gateway conhece o `AssetError` (`ASSET_NOT_FOUND` → "Image not found").
- `board-publisher.port.ts` (`BoardPublisherPort`): o que sai para a mesa depois do commit; adaptador `server/src/infrastructure/board-publisher/socket-io-board-publisher.ts`.
- `scenes.plugin.ts` (`createScenesModule({ db, publisher, clock })` → `{ service }`): montado no `wireRealtime` do `build-app`, que passa o service ao `board`.

## Permissão

- `CampaignAccessBo.requireMember()` devolve o papel; `requireMaster(action)` lança `ForbiddenActionError` (`FORBIDDEN`, em `campaigns.error.ts`, cita usuário, ação, mesa e o papel exigido). Não membro continua recebendo `CAMPAIGN_NOT_FOUND`, nunca `FORBIDDEN` (critério 14). Na borda HTTP, `FORBIDDEN` = 403.

## Módulo `board` (`server/src/modules/board/`) e contrato

- `BoardService.snapshotFor(userId, campaignId)`: participação → cena ativa → tokens da cena, cada um redigido para quem pede (`TokenAccessBo.audience()`) com as condições ativas → os desenhos da cena (inteiros, ver [`drawings.md`](drawings.md)) → as áreas de efeito (inteiras, ver [`effect-areas.md`](effect-areas.md)) → as paredes (inteiras, ver [`walls.md`](walls.md)) → o combate da cena (`toCombatDto`) e a lista de condições da mesa → `toBoardStateDto` (`board.mapper.ts`; versão = a da cena).
- `board.gateway.ts` (`createBoardGateway`): cada comando passa por `onCommand(schema, handler)` — valida o DTO (estrito: `userId` forjado → `INVALID_BODY`), relê a sessão (`reauthenticate`; encerrada → `UNAUTHENTICATED` e a conexão cai), exige a mesa em `socket.data.campaignIds` (senão `CAMPAIGN_NOT_FOUND`) e responde no ack pelo `answerAck` de `src/realtime/realtime-ack.ts`.
- `board.plugin.ts` (`createBoardModule({ db, scenes, tokens, tokenBatch, tokenAppearance, conditions, combat, drawings, effectAreas, walls, clock, realtime, log })` → `{ gateway }`; o `tokenAppearance` liga `token:faceMany` e `token:restyleMany`, ver [`tokens.md`](tokens.md)), ligado no `wireRealtime`. **Um gateway para o tabuleiro todo** (cena, tokens, desenhos, áreas de efeito, condições e combate): cada módulo entrega o seu service e o gateway liga o comando (`bind(schema, handler)` / `mutate(schema, service.método)`), em vez de um gateway por módulo que repetiria a borda.

| Comando            | Quem                                 | Ack                                                      | Evento                                                                                            |
| ------------------ | ------------------------------------ | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `board:sync`       | membro                               | `{ ok: true, state }` (redigido para quem pede)          | —                                                                                                 |
| `scene:configure`  | mestre                               | `{ ok: true, version }` · `ASSET_NOT_FOUND`              | `scene:updated` `{ campaignId, version, at, scene }` à mesa (com o `background`)                  |
| `drawing:*Many`    | membro                               | `{ ok: true, version }`                                  | `drawing:createdMany/movedMany/deletedMany` à mesa ([`drawings.md`](drawings.md))                 |
| `effectArea:*Many` | membro                               | `{ ok: true, version }` (+ `createdIds` no `createMany`) | `effectArea:createdMany/reshapedMany/deletedMany` à mesa ([`effect-areas.md`](effect-areas.md))   |
| `wall:*`           | mestre (o jogador só `wall:setDoor`) | `{ ok: true, version }` (+ `createdIds` no `createMany`) | `wall:createdMany/movedMany/deletedMany/kindsChanged/doorChanged` à mesa ([`walls.md`](walls.md)) |

## Limite de frequência (§8.4)

- `CommandRateBo` (`command-rate.bo.ts`): balde por conexão, `COMMAND_BURST` = 40 de uma vez e `COMMANDS_PER_SECOND` = 20 sustentados; o tempo entra por parâmetro (sem relógio no BO). O gateway guarda o balde num `WeakMap` por socket (`CommandRateGuard`, sem tocar no `socket.data`) e consulta **antes** de validar o payload e reler a sessão. Acima do limite: ack `RATE_LIMITED` com `retryAfterSeconds` (`CommandRateLimitedError`, `board.error.ts`). Vale para todo comando do tabuleiro, inclusive `board:sync`; uma conexão não gasta o balde da outra.

## Salas por público

- No `session:join`, o socket entra em `campaign:<id>` (todos), `campaign:<id>:user:<userId>` (`campaignUserRoom`) e, se for mestre, `campaign:<id>:masters` (`campaignMastersRoom`), de `src/realtime/rooms.ts`; sai das três no `session:leave`. Os tokens usam essas salas para a redação (ver [`tokens.md`](tokens.md)); a cena vai inteira a `campaign:<id>`.

## Versão

- Um contador por cena (`scenes.version`), persistido: sobrevive ao reinício do server (critério 13). Toda mutação do tabuleiro roda numa transação que trava a cena (`lockActiveOf`), aplica, soma 1 (`bumpVersion`) e só publica depois do commit (§5.5). O molde comum é o `inLockedScene(transaction, campaignId, work)` de `scenes/locked-scene.ts` (com `activeSceneOf`), usado por desenhos e tokens.
- **Precondição do desfazer.** Mover e apagar (token e desenho) aceitam `expect`; o service confere dentro da transação que trava a cena e recusa com `STALE_UNDO` (`StaleUndoError`, `board.error.ts`) se o elemento não está mais onde o desfazer espera.

## Testes

- Unit: `server/test/modules/scenes/` (BO, mapper, service com o diário `lock → save → bump → commit → publish` dos fakes em `test/support/scenes-fakes.ts`).
- Integração: `server/test/integration/scene-vision.spec.ts` (a cena que existia vem `off`, Escuro ao vivo, sync, configure sem `vision` mantém, reinício) e `server/test/integration/board.spec.ts` (sync, configure ao vivo, fundo da mesa ao vivo e depois do reinício, fundo de outra mesa → `ASSET_NOT_FOUND` sem evento, FORBIDDEN, mesa fora da conexão, `userId` forjado, sessão encerrada, reinício do app no mesmo banco), `server/test/integration/scenes-dao.spec.ts` (DAO, isolamento, cascade, trava + versão, pixels do fundo no `findActiveOf` e no `lockActiveOf`, fundo de outra mesa sem pixels, asset apagado → sem fundo) e `scenes-migration.spec.ts` (sobe um banco de rascunho até a `0001`, cria uma mesa, aplica o resto e confere a cena criada pela `0002`).

## Armadilhas

- `campaigns.active_scene_id` e `scenes.campaign_id` se referenciam: no PO de `campaigns`, a referência é `(): AnyPgColumn => scenes.id`, senão o TypeScript acusa o tipo circular.
- Inserir em `campaigns` por SQL cru num banco migrado só até a `0001`: o Drizzle gera o `INSERT` com todas as colunas do PO atual, inclusive as que a migração ainda não criou.
