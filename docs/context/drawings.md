# Drawings

Desenhos do tabuleiro (extensão do spec §3.3): mão livre, quadrado, círculo e triângulo, salvos na cena, com dono, vistos pela mesa toda. Server em `server/src/modules/drawings/`; a borda Socket.IO é o gateway do `board` (ver [`board.md`](board.md)); DTOs em [`contracts.md`](contracts.md) (`drawing.dto.ts`); a caixa em [`game-core.md`](game-core.md) (Desenho). O client fica em [`client/drawings.md`](client/drawings.md). Planos de origem: `docs/plans/2026-10-16-desenho-copiar-desfazer.md` e `docs/plans/2026-10-21-camada-de-desenhos.md`.

## Tabela (`drawings.po.ts`, migrações `0008_drawings` e `0029_drawings_drop_layer`)

- `drawings`: `id`, `scene_id` (cascade, indexado), `author_id` (`users`, **`set null`**: desenho sem autor só o mestre move e apaga), `draw_order` (identidade: a ordem de criação e de desenho; o `created_at` empata dentro de um insert de vários), `kind` (enum `drawing_kind`: `freehand` | `rectangle` | `ellipse` | `triangle`), `x`, `y`, `width`, `height` em `numeric(8,2)` (casas fracionárias; chegam como string `"2.50"`), `points` `jsonb` (`[x, y][]` relativos a `(x, y)`, só mão livre), `stroke` (enum `drawing_color`, 8 cores), `fill` (`drawing_color` nulo, só forma fixa), `stroke_width` (enum `stroke_width`), `created_at`.
- **Sem camada.** O desenho vive numa camada própria, só dele (no client: acima de Fundo e Objetos, abaixo de Tokens). A tabela não tem coluna de camada e o DTO estrito recusa um `layer` enviado (`INVALID_BODY`).
- Os três enums novos estão exportados em `server/src/database/schema.ts` (armadilha do [`tokens.md`](tokens.md)). O `truncateAllTables` dos testes inclui `drawings`.

## DAO (`drawings.dao.ts`)

- `DrawingsDao(db | tx)`: `insertMany(rows)` → as linhas gravadas (um `INSERT`), `listOfScene(sceneId)` (pela `draw_order`), `countOfScene(sceneId)`, `findManyInScene(sceneId, ids)` (id de outra cena fica de fora), `moveMany(sceneId, moves)` (um `UPDATE` por desenho, só `x, y`), `deleteMany(sceneId, ids)`.
- **Isolamento por cena (§2.6):** toda leitura **e toda escrita** filtram por `scene_id`; um id de outra mesa não é achado, movido nem apagado.
- `NewDrawingPo` (sem `id`, `draw_order`, `created_at`) e `DrawingMovePo` `{ drawingId, x, y }` (strings do numeric).

## Regra

- Todo membro desenha: o `createMany` só confere a participação (`memberAccessOf`; fora da mesa → `CAMPAIGN_NOT_FOUND`).
- A autoria mora no `AuthoredAccessBo(campaignAccess, 'drawing')` (`scenes/authored-access.bo.ts`, comum a desenhos e áreas de efeito): `requireEdit(ação, { id, authorId })` (`AuthoredPiece`) — o mestre edita qualquer um (inclusive sem autor); o autor só o seu (`FORBIDDEN` citando `drawing <id>`).
- `DrawingRulesBo({ scene, limit })`: `place(caixa)` pelo `boxFits` do game-core (fora → `OUT_OF_SCENE` citando a caixa e a cena, `DrawingOutOfSceneError`); `admit(guardados, novos)` — passar de `DRAWINGS_PER_SCENE_MAX` (500, passado pelo plugin) → `DRAWING_LIMIT` citando a contagem e o limite; `requireAt(id, esperado?, atual)` — sem `expect` sempre passa; diferente ao centésimo → `STALE_UNDO` citando o desenho, o esperado e o atual.
- `drawings.mapper.ts`: `toDrawingDto` (numeric `"2.50"` → `2.5`; mão livre sem pontos é linha quebrada e lança), `toNewDrawingPo(sceneId, autor, forma)` (arredonda ao centésimo, mão livre sem `fill`), `boxOfShape`, `boxAt(linha, posição)`, `positionOf`, `ownershipOf` (id e autor), `toDrawingMovePo`, `toHundredth`.

## Service (`drawings.service.ts`)

`DrawingsService.createMany | moveMany | deleteMany(userId, campaignId, comando)` → versão nova. Participação → `inLockedScene` (`scenes/locked-scene.ts`: trava a cena → trabalho → `bumpVersion`, numa transação) → **depois do commit** publica à mesa toda. Tudo ou nada, uma versão: o grupo inteiro é conferido (achado na cena, `requireEdit`, `requireAt`, `place`) antes da escrita. O autor é o `userId` da conexão. `DrawingTransactionRunner` entrega `ScenesDao` e `DrawingsDao` presos ao `tx`.

| Comando              | Quem          | Evento                                         |
| -------------------- | ------------- | ---------------------------------------------- |
| `drawing:createMany` | membro        | `drawing:createdMany` `{ drawings }`           |
| `drawing:moveMany`   | autor, mestre | `drawing:movedMany` `{ moves }` (ao centésimo) |
| `drawing:deleteMany` | autor, mestre | `drawing:deletedMany` `{ drawingIds }`         |

## Borda e eventos

- `drawings.plugin.ts` (`createDrawingsModule({ db, publisher, clock })` → `{ service }`, com `DRAWINGS_PER_SCENE_MAX`), montado no `wireRealtime` do `build-app` e entregue ao `board`, que liga os três comandos no `board.gateway.ts` (`mutate`). O `drawing:createMany` (como o `token:createMany`) passa pelo binder `create` do gateway, que responde `{ ok, version, createdIds }` (`CreatedInScene`, `scenes/locked-scene.ts`): os ids dados, na ordem enviada. O gateway conhece `DrawingError` e os textos públicos de `DRAWING_NOT_FOUND`, `DRAWING_LIMIT` e `STALE_UNDO`.
- `BoardPublisherPort.drawingsCreated | drawingsMoved | drawingsDeleted`: o adaptador Socket.IO emite à `campaign:<id>` inteira, **sem redação** (desenho não é segredo).
- Snapshot: o `BoardService.snapshotFor` lê `DrawingsDao.listOfScene(scene)` e o `toBoardStateDto` põe os desenhos em `drawings` (iguais para todo público).

## Erros

- `drawings.error.ts`: `DRAWING_NOT_FOUND` (também para desenho de outra mesa: o primeiro id que falta recusa o grupo), `DRAWING_LIMIT`, `OUT_OF_SCENE` (mesmo código do token). `STALE_UNDO` mora no `board.error.ts` (`StaleUndoError(alvo, esperado, atual)`), porque o token também usa.

## Testes

- Unit: `server/test/modules/drawings/` (regra, mapper, service com o diário `lock → save → bump → commit → publish`), `server/test/modules/scenes/locked-scene.spec.ts` e `authored-access.bo.spec.ts` (a autoria, com o nome da peça); fakes `DrawingsDaoFake` (`fill(n, cena)` para o limite) e `DrawingTransactionRunnerFake` (`test/support/drawings-fakes.ts`), fixtures `squarePo` (de Bia), `caioPathPo`, `newCircle` (`drawings-factories.ts`); o `BoardPublisherFake` guarda `drawingsCreates`, `drawingsMoves`, `drawingsDeletes`.
- Integração da borda: `server/test/integration/drawings.spec.ts` (três clientes do `token-table.ts`: criar ao vivo e no sync, mover o de outro sendo mestre, reinício do app, apagar dois numa versão, `DRAWING_NOT_FOUND` vindo de outra mesa sem evento na Vharn, `authorId` forjado → `INVALID_BODY`, `layer` enviado → `INVALID_BODY`, mesa fora da conexão, `STALE_UNDO` sem evento).
- Integração: `server/test/integration/drawings-dao.spec.ts` (ordem de criação, mover só a posição, apagar, contagem por cena, cascade da cena, `set null` do autor, isolamento na leitura e na escrita).
