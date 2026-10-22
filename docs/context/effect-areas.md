# Effect areas

Áreas de efeito (gabaritos de magia) do tabuleiro: quadrado, círculo, semicírculo, cone horizontal, cone diagonal, linha, emanação e as perfeitas (círculo e semicírculo), com cor da paleta, semitransparentes, salvas na cena e vistas pela mesa toda. São gabarito visual: contar alvos e aplicar efeito é do §12. Server em `server/src/modules/effect-areas/`; DTOs em [`contracts.md`](contracts.md) (`effect-area.dto.ts`); a forma, as casas pintadas e a conta das alças em [`game-core.md`](game-core.md) (Área de efeito). O client fica em [`client/effect-areas.md`](client/effect-areas.md). Plano de origem: `docs/plans/2026-10-18-areas-de-efeito.md`.

## Tabela (`effect-areas.po.ts`, migração `0015_effect_areas`)

- `effect_areas`: `id`, `scene_id` (cascade, indexado), `author_id` (`users`, **`set null`**: área sem autor só o mestre edita), `area_order` (identidade: a ordem de criação e de desenho), `kind` (enum `effect_area_kind`, as 9 formas), `x`, `y`, `width`, `height`, `reach` em `numeric(8,2)` (casas fracionárias; chegam como string `"2.50"`; **0 quando a forma não usa o campo**), `facing` `smallint` (padrão 0), `color` (o enum `drawing_color` dos desenhos), `created_at`.
- `CHECK effect_areas_facing_range` (0–359) e `effect_areas_sizes_range` (tudo ≥ 0). As regras por forma moram no game-core (`effectArea`) e no DTO; o banco só confere as faixas.
- O enum novo está exportado em `server/src/database/schema.ts` (armadilha do [`tokens.md`](tokens.md)). O `truncateAllTables` dos testes inclui `effect_areas`.

## DAO (`effect-areas.dao.ts`)

- `EffectAreasDao(db | tx)`: `insertMany(rows)` → as linhas gravadas na ordem enviada (um `INSERT`), `listOfScene(sceneId)` (pela `area_order`), `countOfScene(sceneId)`, `findManyInScene(sceneId, ids)` (id de outra cena fica de fora), `reshapeMany(sceneId, reshapes)` (um `UPDATE` por área: troca `kind`, geometria e cor, nunca o autor nem a cena), `deleteMany(sceneId, ids)`.
- **Isolamento por cena (§2.6):** toda leitura **e toda escrita** filtram por `scene_id`; um id de outra mesa não é achado, reformado nem apagado.
- `NewEffectAreaPo` (sem `id`, `area_order`, `created_at`) e `EffectAreaReshapePo` `{ effectAreaId, shape: { kind, x, y, width, height, reach, facing, color } }` (strings do numeric).

## Regra

- A autoria é o `AuthoredAccessBo(campaignAccess, 'effect area')` (`scenes/authored-access.bo.ts`, o mesmo dos desenhos): **todo membro cria**; o autor reforma e apaga a sua; o mestre todas (inclusive sem autor). O `AuthoredPiece` é só `{ id, authorId }`: a área vive na camada `tokens` e a regra não olha camada. Recusa: `FORBIDDEN` citando `reshape effect area <id>` / `delete effect area <id>`.
- `EffectAreaRulesBo({ scene, limit })`: `place(área)` pelo `effectAreaOriginFits` do game-core (só a origem precisa estar na cena; fora → `OUT_OF_SCENE` citando a origem e a cena, `EffectAreaOutOfSceneError`); `admit(guardadas, novas)` — passar de `EFFECT_AREAS_PER_SCENE_MAX` (100, passado pelo plugin) → `EFFECT_AREA_LIMIT` citando a contagem e o limite; `requireShape(id, esperada?, atual)` — sem `expect` passa; forma, cor ou qualquer número diferente ao centésimo → `STALE_UNDO` citando a área, a esperada e a atual. O BO fala o VO `EffectArea` do game-core (o DTO é compatível por estrutura), nunca o DTO.
- `effect-areas.mapper.ts`: `toEffectAreaDto(linha)` (numeric → número, **só os campos da forma**; linha que quebra o `effectArea` do game-core lança citando a área e o erro, com `cause`), `shapeOfRow`, `areaOfShape`, `toNewEffectAreaPo(cena, autor, forma)` (zera o que a forma não usa e arredonda ao centésimo), `toEffectAreaReshapePo`, `savedShapeOf` (a forma como foi gravada, o que o evento leva) e `ownershipOf`.

## Service (`effect-areas.service.ts`)

`EffectAreasService.createMany | reshapeMany | deleteMany(userId, campaignId, comando)`. Participação → `inLockedScene` (trava a cena → trabalho → `bumpVersion`, numa transação) → **depois do commit** publica à mesa toda. Tudo ou nada, uma versão: o grupo inteiro é conferido (achado na cena, `requireEdit`, `requireShape`, `place`) antes da escrita; o primeiro id que falta (inclusive de outra mesa) recusa todos com `EFFECT_AREA_NOT_FOUND`. O autor é o `userId` da conexão. `EffectAreaTransactionRunner` entrega `ScenesDao` e `EffectAreasDao` presos ao `tx`.

| Comando                  | Quem          | Ack                           | Evento                                                  |
| ------------------------ | ------------- | ----------------------------- | ------------------------------------------------------- |
| `effectArea:createMany`  | membro        | `{ ok, version, createdIds }` | `effectArea:createdMany` `{ effectAreas }`              |
| `effectArea:reshapeMany` | autor, mestre | `{ ok, version }`             | `effectArea:reshapedMany` `{ reshapes }` (ao centésimo) |
| `effectArea:deleteMany`  | autor, mestre | `{ ok, version }`             | `effectArea:deletedMany` `{ effectAreaIds }`            |

## Borda e eventos

- `effect-areas.plugin.ts` (`createEffectAreasModule({ db, publisher, clock })` → `{ service }`, com `EFFECT_AREAS_PER_SCENE_MAX`), montado no `wireRealtime` do `build-app` e entregue ao `board`, que liga os três comandos no `board.gateway.ts` (`create` para o `createMany`, `mutate` para os outros dois). O gateway conhece `EffectAreaError` e os textos públicos de `EFFECT_AREA_NOT_FOUND` e `EFFECT_AREA_LIMIT` (`OUT_OF_SCENE` e `STALE_UNDO` já existiam).
- `BoardPublisherPort.effectAreasCreated | effectAreasReshaped | effectAreasDeleted`: o adaptador Socket.IO emite à `campaign:<id>` inteira, **sem redação**.
- Snapshot: o `BoardService.snapshotFor` lê `EffectAreasDao.listOfScene(cena)` e o `toBoardStateDto` põe as áreas em `effectAreas` (iguais para todo público).

## Erros

- `effect-areas.error.ts`: `EFFECT_AREA_NOT_FOUND`, `EFFECT_AREA_LIMIT`, `OUT_OF_SCENE` (mesmo código do token e do desenho). `STALE_UNDO` é o `StaleUndoError` do `board.error.ts`.

## Armadilhas

- O autor de uma área recriada (o desfazer de um apagar, a colagem) é sempre quem manda o comando: o `createMany` grava o `userId` da conexão. Por isso o desfazer do mestre devolve a área como dele.

## Testes

- Unit: `server/test/modules/effect-areas/` (regra, mapper, service com o diário `lock → save → bump → commit → publish`); fakes `EffectAreasDaoFake` (`fill(n, cena)` para o limite) e `EffectAreaTransactionRunnerFake` (`test/support/effect-areas-fakes.ts`), fixtures `biaConePo`, `BIA_CONE_SHAPE` e `newCircle` (`effect-areas-factories.ts`); o `BoardPublisherFake` guarda `effectAreasCreates`, `effectAreasReshapes`, `effectAreasDeletes`.
- Integração da borda: `server/test/integration/effect-areas.spec.ts` (três clientes do `token-table.ts`: criar ao vivo com `createdIds`, sync, Caio esticando a de Bia → `FORBIDDEN` sem evento, o mestre apagando para os três, `EFFECT_AREA_NOT_FOUND` vindo da Quelm sem evento nem mudança na Vharn, `authorId` forjado → `INVALID_BODY`, mesa fora da conexão, `STALE_UNDO` sem evento, reinício do app).
- Integração: `server/test/integration/effect-areas-dao.spec.ts` (ordem de criação, numeric como string, contagem por cena, reshape sem mexer no autor, apagar, isolamento na leitura e na escrita com um id da Quelm, cascade da cena, `set null` do autor, os dois `CHECK`).
