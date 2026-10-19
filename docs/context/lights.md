# Lights

Luzes do mapa (a "Iluminação dinâmica" do §12): a tocha na parede, a fogueira, o braseiro. Só o mestre cria, move, ajusta, acende, apaga e exclui; o jogador nunca vê o ícone, só a área iluminada. Server em `server/src/modules/lights/`; a borda Socket.IO é o gateway do `board` (ver [`board.md`](board.md)); DTOs em [`contracts/tabuleiro.md`](contracts/tabuleiro.md) (`light.dto.ts`); o alcance, o ponto e o nível de luz em [`game-core/visao-e-luz.md`](game-core/visao-e-luz.md). A luz **do token** (`light`, `lightLit`) mora em [`tokens.md`](tokens.md). Plano de origem: [`2026-10-18-iluminacao.md`](../plans/2026-10-18-iluminacao.md).

## Tabela (`lights.po.ts`, migração `0024_lights`)

- `lights`: `id`, `scene_id` (cascade, indexado), `light_order` (identidade: a ordem de criação), `x`, `y` em `numeric(8,2)` (o ponto em casas fracionárias; chegam como string `"5.50"`), `bright`, `dim` em `numeric(6,2)`, `lit` (`boolean`, padrão `true`), `created_at`. Sem autor: só o mestre mexe.
- `CHECK lights_range`: `bright` e `dim` de 0 a 100. `CHECK lights_position`: `x` e `y` ≥ 0. O "dentro da cena" é regra do BO (a cena pode encolher).
- A tabela está exportada em `server/src/database/schema.ts`; o `truncateAllTables` dos testes inclui `lights`.

## DAO (`lights.dao.ts`)

- `LightsDao(db | tx)`: `insertMany(rows)` → as linhas gravadas na ordem enviada (um `INSERT`, ordenado pela `light_order`), `listOfScene(sceneId)` (pela `light_order`), `findManyInScene(sceneId, ids)` (id de outra cena fica de fora), `moveMany(sceneId, moves)` (um `UPDATE` por luz, só `x, y`), `setRanges(sceneId, alcances)` (um `UPDATE` por luz, só `bright, dim`), `setLit(sceneId, ids, aceso)` (um `UPDATE`, só `lit`), `deleteMany(sceneId, ids)`.
- **Isolamento por cena (§2.6):** toda leitura **e toda escrita** filtram por `scene_id`; um id de outra mesa não é achado, movido, ajustado, aceso nem apagado.
- `NewLightPo` (sem `id`, `light_order`, `created_at`; `lit` opcional, nasce `true`), `LightMovePo` `{ lightId, x, y }` e `LightRangePo` `{ lightId, bright, dim }` (strings do numeric).

## Regra (`light-rules.bo.ts`)

- `LightRulesBo({ scene, limit })` (fala o VO `SceneLight` do game-core, nunca o DTO; o `limit` é o `LIGHTS_PER_SCENE_MAX` passado pelo plugin): `place(luz)` pelo `lightFits` (a borda conta; fora → `OUT_OF_SCENE` "a light at (20.5, 3) does not fit the 20×12 scene", `LightOutOfSceneError`); `admit(guardadas, novas)` → `LIGHT_LIMIT` "the scene would have 101 lights; expected at most 100"; `requireAt(id, esperado?, atual)` e `requireRange(id, esperado?, atual)`: sem `expect` passa, diferente (ao centésimo) → `STALE_UNDO` "light X is at (5, 5); the undo expected (2, 2)" / "… at bright 4, dim 4; the undo expected bright 6, dim 6".

## Mapper (`lights.mapper.ts`)

- `toLightDto(linha)` (numeric → número), `sceneLightOf(linha)` (linha que o game-core recusa → `Error` "light X was saved broken: …" com o `cause`), `sceneLightOfPlacement` (a luz nova, acesa), `lightMovedTo`, `lightSourceOfRow(linha)` (a `LightSource` do ponto, ou `null` apagada: a luz do mapa na porta vista), `toNewLightPo` (ao centésimo e `lit: true`), `toLightMovePo`, `toLightRangePo`, `savedMoveOf` / `savedRangeOf` (o evento ao centésimo, em números), `positionOfLight`, `rangeOfLight`. O arredondamento é o `cellsNumeric` / `cellsHundredth` de `server/src/database/cells-numeric.ts` (também do `tokens.mapper`).

## Service (`lights.service.ts`)

`LightsService.createMany | moveMany | setRangeMany | setLitMany | deleteMany(userId, campaignId, comando)`: `requireMaster` (o jogador → `FORBIDDEN`, antes de travar) → `inLockedScene` (`LightTransactionRunner`: `ScenesDao` e `LightsDao` presos ao `tx`) → todos os ids na cena (`lightsIn`: o primeiro que falta, de outra mesa também, → `LIGHT_NOT_FOUND` e nenhum gravado) → regra → grava → `bumpVersion` → **depois do commit** publica. Tudo ou nada, uma versão. O `createMany` devolve `{ version, createdIds }`.

| Comando                                                                 | Quem   | Evento                                                  |
| ----------------------------------------------------------------------- | ------ | ------------------------------------------------------- |
| `light:createMany` `{ lights }`                                         | mestre | `light:createdMany` `{ lights }` (ack com `createdIds`) |
| `light:moveMany` `{ moves: { lightId, x, y, expect? }[] }`              | mestre | `light:movedMany` `{ moves }`                           |
| `light:setRangeMany` `{ changes: { lightId, bright, dim, expect? }[] }` | mestre | `light:rangesChanged` `{ changes }`                     |
| `light:setLitMany` `{ lightIds, lit }`                                  | mestre | `light:litChanged` `{ lightIds, lit }`                  |
| `light:deleteMany` `{ lightIds, expect? }`                              | mestre | `light:deletedMany` `{ lightIds }`                      |

- Acender e apagar não tem precondição (`expect`): é ação de jogo, fora da pilha de desfazer, como a porta.

## Erros (`lights.error.ts`)

- `LIGHT_NOT_FOUND` (`LightNotFoundError`, também para luz de outra mesa: distinguir vazaria quais ids existem), `LIGHT_LIMIT` (`LightLimitError`), `OUT_OF_SCENE` (`LightOutOfSceneError`, o mesmo código do token e da parede). `STALE_UNDO` vem do `board.error.ts`; `FORBIDDEN` do `CampaignAccessBo`.

## Borda, eventos e snapshot

- `lights.plugin.ts`: `createLightsModule({ db, publisher, clock })` → `{ service }` (o limite é o `LIGHTS_PER_SCENE_MAX` do contracts), montado no `wireRealtime` (`build-app.ts`) e entregue ao `board.plugin` como `lights`.
- O gateway do `board` liga `light:createMany` pelo `create` (ack com `createdIds`) e os outros quatro pelo `mutate`. Textos públicos do `LightError`: `LIGHT_NOT_FOUND` "Light not found", `LIGHT_LIMIT` "Too many lights in this scene" (o `OUT_OF_SCENE` é o de sempre).
- `BoardPublisherPort.lightsCreated | lightsMoved | lightRangesChanged | lightsLitChanged | lightsDeleted`; o adaptador Socket.IO emite à sala `campaign:<id>` inteira (sem redação: o client do jogador precisa das luzes para a névoa; só o renderer do mestre desenha o ícone — pelo DevTools o jogador vê tudo, a mesma linha das paredes).
- `BoardService.snapshotFor` lê as luzes da cena (`LightsDao.listOfScene`, `toLightDto`) e o `toBoardStateDto` põe `lights` no `board:sync`.

## Testes

- Unit `server/test/modules/lights/`: `light-rules.bo.spec.ts` (a borda conta, 99 + 1 passa e 100 + 1 não, `STALE_UNDO` do ponto e do alcance), `lights.mapper.spec.ts` e `lights.service.spec.ts` (diário `lock → save → bump → commit → publish`, `FORBIDDEN` sem gravar, `LIGHT_NOT_FOUND` no meio de três, `LIGHT_LIMIT`, `OUT_OF_SCENE`, `STALE_UNDO` no mover, no alcance e no excluir, `setLitMany` publica uma vez). Fakes `LightsDaoFake` (`fill(n, cena)`) e `LightTransactionRunnerFake` (`test/support/lights-fakes.ts`); fixtures `corridorTorchPo` ((5, 5), plena 4, penumbra 4, acesa) e `newTorch` (`lights-factories.ts`). O `BoardPublisherFake` guarda `lightsCreates`, `lightsMoves`, `lightRangeChanges`, `lightLitChanges` e `lightsDeletes`.
- Integração `lights.spec.ts` (três clientes do `token-table`): a Ana cria e Bia e Caio recebem acesas, com `createdIds` no ack; o `board:sync` traz `lights`; mover, ajustar, apagar e excluir em quatro versões seguidas aos três; a Bia → `FORBIDDEN` sem evento; luz da Quelm num comando da Vharn → `LIGHT_NOT_FOUND`; o sync da Quelm sem as luzes da Vharn; `userId` forjado → `INVALID_BODY`; mesa fora da conexão → `CAMPAIGN_NOT_FOUND`; ponto fora → `OUT_OF_SCENE`; `expect` velho → `STALE_UNDO`; reinício mantém as luzes e o `lit`.
- Integração `lights-dao.spec.ts`: ordem do `insertMany` e da `light_order`, numeric como string, `lit` nasce `true`, escrita parcial (`moveMany` só `x, y`; `setRanges` só `bright, dim`; `setLit` só `lit`), `deleteMany`, isolamento da Quelm, cascata da cena, `CHECK` (`bright` 101, `x` −1).
- E2E `e2e/test/lighting.spec.ts` (ver [`ci.md`](ci.md)): a tocha do mapa mostra o Ogro à Lyra sem visão no escuro, apagada o esconde; a luz da Lyra clareia o canvas da Bia e o reinício (F5) mantém o estado.
