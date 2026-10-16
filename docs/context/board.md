# Board

O tabuleiro da mesa: a cena (só o grid por enquanto), e depois os tokens e o combate. O server é a autoridade; o client manda comando e desenha o estado confirmado. Plano de origem: `docs/plans/2026-10-15-tela-sala-de-jogo.md`. DTOs em [`contracts.md`](contracts.md) (Tabuleiro).

## Cena (`server/src/modules/scenes/`)

- **Uma cena por mesa** (spec §3.2): tabela `scenes` + `campaigns.active_scene_id` (`set null`). A migração `0002_scenes` criou a cena de cada mesa que já existia e apontou o `active_scene_id` para ela; mesa nova nasce com a cena (ver `campaigns.md`).
- `scenes` (`scenes.po.ts`): `id`, `campaign_id` (cascade, indexado), `name` ('Cena 1'), `width_cells` (20), `height_cells` (12), `cell_distance` numeric(6,2) ('1.5', chega como string), `cell_unit` ('m'), `grid_visible` (true), `grid_opacity` (30, de 0 a 100), `version` (0), `created_at`, `updated_at`. `SceneGridPo` = só os campos do grid.
- `ScenesDao` (`scenes.dao.ts`): `insert`, `findById`, `findActiveOf(campaignId)`, `lockActiveOf(campaignId)` (`SELECT … FOR UPDATE OF scenes`; chamar no DAO montado com o `tx`), `bumpVersion(sceneId)` → versão nova, `update(sceneId, grid)`. A cena ativa só é devolvida se **também** pertencer à mesa (`scenes.campaign_id = campaignId`): um `active_scene_id` errado nunca vaza a cena de outra mesa.
- `CampaignsDao.setActiveScene(campaignId, sceneId)` grava o ponteiro.
- `SceneConfigBo` (`scene-config.bo.ts`): só o mestre configura o grid (`access.requireMaster('configure the grid')`); `SceneGrid` é o grid em números.
- `scenes.mapper.ts`: `toSceneDto` (numeric `"1.50"` → `1.5`), `toSceneGridPo` (número → string do numeric), `toSceneGrid(command)` (o comando sem `actionId`/`campaignId`).
- `ScenesService.configure(userId, campaignId, grid)` → versão nova: participação → BO → transação (`lockActiveOf` → `update` → `bumpVersion`) → **depois do commit** `publisher.sceneUpdated`. `SceneTransactionRunner` entrega o `ScenesDao` preso ao `tx`.
- `board-publisher.port.ts` (`BoardPublisherPort`): o que sai para a mesa depois do commit; adaptador `server/src/infrastructure/board-publisher/socket-io-board-publisher.ts`.
- `scenes.plugin.ts` (`createScenesModule({ db, publisher, clock })` → `{ service }`): montado no `wireRealtime` do `build-app`, que passa o service ao `board`.

## Permissão

- `CampaignAccessBo.requireMember()` devolve o papel; `requireMaster(action)` lança `ForbiddenActionError` (`FORBIDDEN`, em `campaigns.error.ts`, cita usuário, ação, mesa e o papel exigido). Não membro continua recebendo `CAMPAIGN_NOT_FOUND`, nunca `FORBIDDEN` (critério 14). Na borda HTTP, `FORBIDDEN` = 403.

## Módulo `board` (`server/src/modules/board/`) e contrato

- `BoardService.snapshotFor(userId, campaignId)`: participação → cena ativa → tokens da cena, cada um redigido para quem pede (`TokenAccessBo.audience()`) com as condições ativas → o combate da cena (`toCombatDto`) e a lista de condições da mesa → `toBoardStateDto` (`board.mapper.ts`; versão = a da cena).
- `board.gateway.ts` (`createBoardGateway`): cada comando passa por `onCommand(schema, handler)` — valida o DTO (estrito: `userId` forjado → `INVALID_BODY`), relê a sessão (`reauthenticate`; encerrada → `UNAUTHENTICATED` e a conexão cai), exige a mesa em `socket.data.campaignIds` (senão `CAMPAIGN_NOT_FOUND`) e responde no ack pelo `answerAck` de `src/realtime/realtime-ack.ts`.
- `board.plugin.ts` (`createBoardModule({ db, scenes, tokens, conditions, combat, clock, realtime, log })` → `{ gateway }`), ligado no `wireRealtime`. **Um gateway para o tabuleiro todo** (cena, tokens, condições e combate): cada módulo entrega o seu service e o gateway liga o comando (`bind(schema, handler)` / `mutate(schema, service.método)`), em vez de um gateway por módulo que repetiria a borda.

| Comando           | Quem   | Ack                                             | Evento                                                      |
| ----------------- | ------ | ----------------------------------------------- | ----------------------------------------------------------- |
| `board:sync`      | membro | `{ ok: true, state }` (redigido para quem pede) | —                                                           |
| `scene:configure` | mestre | `{ ok: true, version }`                         | `scene:updated` `{ campaignId, version, at, scene }` à mesa |

## Limite de frequência (§8.4)

- `CommandRateBo` (`command-rate.bo.ts`): balde por conexão, `COMMAND_BURST` = 40 de uma vez e `COMMANDS_PER_SECOND` = 20 sustentados; o tempo entra por parâmetro (sem relógio no BO). O gateway guarda o balde num `WeakMap` por socket (`CommandRateGuard`, sem tocar no `socket.data`) e consulta **antes** de validar o payload e reler a sessão. Acima do limite: ack `RATE_LIMITED` com `retryAfterSeconds` (`CommandRateLimitedError`, `board.error.ts`). Vale para todo comando do tabuleiro, inclusive `board:sync`; uma conexão não gasta o balde da outra.

## Salas por público

- No `session:join`, o socket entra em `campaign:<id>` (todos), `campaign:<id>:user:<userId>` (`campaignUserRoom`) e, se for mestre, `campaign:<id>:masters` (`campaignMastersRoom`), de `src/realtime/rooms.ts`; sai das três no `session:leave`. Os tokens usam essas salas para a redação (ver [`tokens.md`](tokens.md)); a cena vai inteira a `campaign:<id>`.

## Versão

- Um contador por cena (`scenes.version`), persistido: sobrevive ao reinício do server (critério 13). Toda mutação do tabuleiro roda numa transação que trava a cena (`lockActiveOf`), aplica, soma 1 (`bumpVersion`) e só publica depois do commit (§5.5).

## Testes

- Unit: `server/test/modules/scenes/` (BO, mapper, service com o diário `lock → save → bump → commit → publish` dos fakes em `test/support/scenes-fakes.ts`).
- Integração: `server/test/integration/board.spec.ts` (sync, configure ao vivo, FORBIDDEN, mesa fora da conexão, `userId` forjado, sessão encerrada, reinício do app no mesmo banco), `server/test/integration/scenes-dao.spec.ts` (DAO, isolamento, cascade, trava + versão) e `scenes-migration.spec.ts` (sobe um banco de rascunho até a `0001`, cria uma mesa, aplica o resto e confere a cena criada pela `0002`).

## Armadilhas

- `campaigns.active_scene_id` e `scenes.campaign_id` se referenciam: no PO de `campaigns`, a referência é `(): AnyPgColumn => scenes.id`, senão o TypeScript acusa o tipo circular.
- Inserir em `campaigns` por SQL cru num banco migrado só até a `0001`: o Drizzle gera o `INSERT` com todas as colunas do PO atual, inclusive as que a migração ainda não criou.
