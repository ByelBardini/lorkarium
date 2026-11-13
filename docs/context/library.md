# Library

A biblioteca de grids e imagens da mesa: vários grids (cenas) por mesa, em pastas aninhadas, públicos ou privados. Na tela é "grid"; no código continua `scene`. A cena em si (grid, fundo, visão, versão) está em [`board.md`](board.md) (Cena).

Aqui: o banco, a regra, o REST de grids e pastas e o duplicar; a **ativação com expulsões** está em [`library/ativacao.md`](library/ativacao.md). O **endereço da cena** (`sceneId` nos comandos, `inLockedGrid`) e as **salas por grid** com abas extras (`scene:watch`/`scene:unwatch`) estão em [`board.md`](board.md).

> **Detalhe por assunto em [`library/`](library/) — abra só o arquivo da tarefa.** Este hub guarda o banco, a regra, o REST de grids e pastas, o serviço e o duplicar.

| Assunto                                                    | Arquivo                                      |
| ---------------------------------------------------------- | -------------------------------------------- |
| Imagens, autorização dos arquivos, apresentação e agregado | [images.md](library/images.md)               |
| Ativação do grid do grupo e expulsão (`scene:activate`)    | [ativacao.md](library/ativacao.md)           |
| Pasta privada (`hiddenByFolder`, o que segue visível)      | [pasta-privada.md](library/pasta-privada.md) |
| Testes (unit e integração)                                 | [testes.md](library/testes.md)               |
| Armadilhas                                                 | [armadilhas.md](library/armadilhas.md)       |

## Tabelas (migração `0033_scene_library`)

- `scene_folders` (`server/src/modules/library/scene-folders.po.ts`): `id`, `campaign_id` (→ `campaigns`, **cascade**, indexado), `parent_id` (nulo = raiz), `name` (`CHECK` `scene_folders_name_length`: 1 a 40 caracteres), `created_at`. Único `scene_folders_campaign_id_id_unique` (`campaign_id`, `id`), alvo das FKs compostas.
- `scenes` tem `visibility` (enum `scene_visibility`: `private` | `public`, padrão **`private`**) e `folder_id` (nulo = sem pasta). A migração deixa **`public`** toda cena que já existia (era o tabuleiro que todo membro via); cena nova nasce privada.
- Enum e tabela exportados em `server/src/database/schema.ts`; `truncateAllTables` (`server/test/support/test-database.ts`) inclui `scene_folders`.

## FKs compostas (isolamento no banco)

- `scene_folders_parent_fk`: (`campaign_id`, `parent_id`) → `scene_folders` (`campaign_id`, `id`), `ON DELETE SET NULL ("parent_id")`.
- `scenes_folder_fk`: (`campaign_id`, `folder_id`) → `scene_folders` (`campaign_id`, `id`), `ON DELETE SET NULL ("folder_id")`.
- Por serem compostas, uma pasta de outra mesa como pai ou como pasta de uma cena é recusada pelo próprio Postgres (`23503`). Apagar uma pasta deixa as subpastas e os grids dela **na raiz** (não no avô: subir para o pai é regra do service); apagar a mesa leva as pastas na cascata.

## DAO

- `SceneFoldersDao(db | tx)` (`scene-folders.dao.ts`): `insert`, `listOfCampaign(campaignId)` (ordem de criação; a árvore se monta pelo `parentId`), `update(campaignId, folderId, SceneFolderChangesPo)` (`undefined` fora da mesa), `moveChildren(campaignId, folderIds, parentId)`, `delete(campaignId, folderId)` → `boolean`.
- `ScenesDao` (`scenes/scenes.dao.ts`), consultas da biblioteca: `listOfCampaign(campaignId)` → `LibrarySceneRow[]` (`SceneRow` + `tokenCount`, subconsulta em `tokens`; ordem de criação), `findInCampaign(campaignId, sceneId)` → `SceneRow | undefined`, `findLibraryRow(campaignId, sceneId)` (a linha do card), `moveScenes(campaignId, sceneIds, folderId)`, `updateLibrary(campaignId, sceneId, SceneLibraryChangesPo)` (grava só as chaves recebidas de `name`/`folderId`/`visibility` e o `updated_at`; `undefined` se a cena não é da mesa), `delete(campaignId, sceneId)` → `boolean` (tokens, paredes, luzes etc. vão na cascata de `scene_id`).
- `CampaignsDao.lockById(campaignId)` (`FOR NO KEY UPDATE`): trava a mesa durante uma edição da biblioteca; `NO KEY` para não barrar quem só insere linha apontando para a mesa (asset, pasta).
- **Isolamento:** toda consulta da biblioteca filtra por `campaign_id`; um id de cena ou pasta de outra mesa não acha, não altera e não apaga nada.

## Regra (sem banco)

- **`SceneAccessBo(campaignAccess, groupSceneId)`** (`server/src/modules/scenes/scene-access.bo.ts`): quem vê e age em cada grid. `groupSceneId` é o `campaigns.active_scene_id` (pode ser `null`). `seesEveryGrid()` = é mestre; `canSee({ id, visibility })` = mestre, ou o grid do grupo (mesmo privado), ou `public`; `requireAct(scene)` recusa o resto com **`SceneNotFoundError`** (`SCENE_NOT_FOUND`, em `scenes/scenes.error.ts`, citando o usuário, o grid e a mesa) — nunca `FORBIDDEN`, para não revelar que o grid existe (critério 14). Quem não é membro continua levando `CAMPAIGN_NOT_FOUND` (do `CampaignAccessBo`; o `userIdOf()` dele dá o id citado no erro).
- **`SceneLibraryBo({ campaignId, activeSceneId, maxFolderDepth, folders, scenes })`** (`library/scene-library.bo.ts`): a árvore de uma mesa. Pasta = `{ id, parentId }`, grid = `{ id, folderId, visibility }`; genérico, então campos a mais (nome, contagem) passam intactos. `maxFolderDepth` é o `SCENE_FOLDER_DEPTH_MAX` passado pelo plugin (o BO não lê o contrato). Pasta da raiz = nível 1.
  - `requireMove(folderId, parentId | null)`: pasta ou pai fora da mesa → `FOLDER_NOT_FOUND`; pai = ela mesma ou descendente → `FOLDER_CYCLE`; nível do pai + altura da subárvore > máximo → `FOLDER_TOO_DEEP`.
  - `requireCreateIn(parentId | null)`: pai desconhecido → `FOLDER_NOT_FOUND`; nível do pai + 1 > máximo → `FOLDER_TOO_DEEP`.
  - `removal(folderId)` → `{ folderId, parentId, childFolderIds, sceneIds }`: o que sobe para o pai (raiz quando não há); o service grava isso antes de apagar (o `SET NULL` do banco levaria à raiz).
  - `requireDeletable(sceneId)`: o grid do grupo → `SCENE_IS_ACTIVE`.
  - `requireKnown(folderId | null)`: a pasta onde um grid vai ficar; desconhecida → `FOLDER_NOT_FOUND` (profundidade não conta: grid não é nível).
  - `visibleTo(sceneAccess, additionalFolderIds = [])`: mestre vê tudo (pastas vazias inclusive); jogador vê os grids de `canSee` e só as pastas no caminho até algum deles (pasta só com privados some; pasta sem grid próprio com subpasta visível aparece). O agregado inclui os ancestrais das imagens públicas por `additionalFolderIds`; a apresentação privada não participa dessa projeção. Ordem de entrada mantida.
- `sceneCopyName(name, suffix, maxLength)` (mesmo arquivo): o nome da cópia, cortado (e sem espaço no fim) para caber o sufixo.
- **Erros** (`library/library.error.ts`, base `LibraryError`): `FolderNotFoundError` (`FOLDER_NOT_FOUND`), `FolderCycleError` (`FOLDER_CYCLE`, cita as duas pastas), `FolderTooDeepError` (`FOLDER_TOO_DEEP`, "would be N levels deep; expected at most 5"), `SceneIsActiveError` (`SCENE_IS_ACTIVE`). O contracts não tem enum de códigos (`apiErrorDto.code` é `string`): os códigos vivem nos `*.error.ts` e na tabela de status da borda.
- **Limites e textos** em `packages/contracts/src/library/library.dto.ts`: `SCENE_NAME_MAX_LENGTH` 60, `SCENE_FOLDER_NAME_MAX_LENGTH` 40, `SCENE_FOLDER_DEPTH_MAX` 5, `UNNAMED_SCENE_NAME` ("Grid sem nome"), `SCENE_COPY_SUFFIX` (" (cópia)").

## Contrato (REST)

Todas sob `/api`, exigem sessão (401 sem cookie), aninhadas na mesa (§2.6). DTOs em `library.dto.ts` (detalhe em [`contracts.md`](contracts.md), Biblioteca). Id malformado na URL = não achado (404), como id de outra mesa.

| Rota                                                    | Quem   | Entrada                        | Saída                                                   | Erros                                                           |
| ------------------------------------------------------- | ------ | ------------------------------ | ------------------------------------------------------- | --------------------------------------------------------------- |
| `GET /campaigns/:campaignId/scenes`                     | membro | —                              | 200 `libraryDto`                                        | 404 `CAMPAIGN_NOT_FOUND`                                        |
| `POST /campaigns/:campaignId/scenes`                    | mestre | `createLibrarySceneRequestDto` | 201 `librarySceneDto` ("Grid sem nome", privado, 20×12) | 400 · 403 (`PLAN_LIMIT` `scenes`) · 404 `FOLDER_NOT_FOUND`      |
| `PATCH /campaigns/:campaignId/scenes/:sceneId`          | mestre | `updateLibrarySceneRequestDto` | 200 `librarySceneDto`                                   | 400 · 403 · 404 `SCENE_NOT_FOUND` / `FOLDER_NOT_FOUND`          |
| `DELETE /campaigns/:campaignId/scenes/:sceneId`         | mestre | —                              | 204 (tudo do grid na cascata)                           | 403 · 404 · 409 `SCENE_IS_ACTIVE`                               |
| `POST /campaigns/:campaignId/scenes/:sceneId/copies`    | mestre | —                              | 201 `librarySceneDto`                                   | 403 (`PLAN_LIMIT` `sceneCopy`/`scenes`) · 404 `SCENE_NOT_FOUND` |
| `POST /campaigns/:campaignId/scene-folders`             | mestre | `createSceneFolderRequestDto`  | 201 `sceneFolderDto`                                    | 400 · 403 · 404 `FOLDER_NOT_FOUND` · 422 `FOLDER_TOO_DEEP`      |
| `PATCH /campaigns/:campaignId/scene-folders/:folderId`  | mestre | `updateSceneFolderRequestDto`  | 200 `sceneFolderDto`                                    | 400 · 403 · 404 · 409 `FOLDER_CYCLE` · 422 `FOLDER_TOO_DEEP`    |
| `DELETE /campaigns/:campaignId/scene-folders/:folderId` | mestre | —                              | 204 (filhos e grids sobem para o pai)                   | 403 · 404                                                       |

- Jogador em rota de mestre → 403 `FORBIDDEN`; quem não é membro → 404 `CAMPAIGN_NOT_FOUND` (antes de qualquer trava).
- **`library:changed { campaignId, at }`** (Socket.IO, sala `campaign:<id>`) depois de **cada** mutação confirmada, sem dado nenhum: cada client relê pela rota, que filtra por papel (grid privado nunca passa pelo socket). Recusa não publica.

## Service e publicador

- `LibraryService` (`library.service.ts`), montado por `createLibraryModule({ db, publisher, audience, grids, clock })` (`library.plugin.ts`, registrado no `build-app` **depois** do `wireRealtime`, que agora devolve o `io`): `list`, `createScene`, `updateScene`, `deleteScene`, `duplicate`, `createFolder`, `updateFolder`, `deleteFolder`. O requerente é `LibraryRequester { userId, campaignId }` (sessão + URL, nunca o corpo).
- Toda edição passa por `edit`: `memberAccessOf` → `requireMaster` → transação (`LibraryTransactionRunner` com `LibraryWriteDaos`: campaigns, folders, scenes, images e os cinco `SceneCopyDaos`) que trava a mesa com o plano do dono (`lockWithOwner`), lê pastas e grids para a `SceneLibraryBo` e executa com os `limits` (`effectiveLimitsOf(owner)`) → commit → `publisher.libraryChanged`.
- Plano do dono: `createScene` e `duplicate` chamam `PlanLimitsBo.requireRoom('scenes', library.gridCount, 1, limits)` (`gridCount` = grids da mesa já lidos pela `SceneLibraryBo`, sem consulta a mais); o `duplicate`, depois de achar a origem, antes `requireFeature('sceneCopy', limits.sceneCopy, limits)`. Detalhe em [`plans.md`](plans.md).
- `list` lê sem transação (`LibraryReadDaos`) e aceita o espectador (`viewerAccessOf`: ele lê como jogador; toda edição continua `memberAccessOf`), filtra por `visibleTo(new SceneAccessBo(access, activeSceneId))`, e só o mestre recebe `tokenCount` (`toLibrarySceneDto(row, seesTokenCount)` em `library.mapper.ts`).
- Excluir pasta: `removal` → `moveChildren` → `moveScenes` → `images.moveFromFolder` → `maps.moveFromFolder` → `delete`, na mesma transação (o `SET NULL` do banco levaria à raiz; o service leva ao pai).
- **Renomear um grid** (`updateScene` com `name`): na mesma transação `ScenesDao.bumpVersion` (diário `lock → save → bump → commit`) e, depois do `library:changed`, `scene:updated { campaignId, sceneId, version, at, scene }` às salas do grid pela dependência `grids: Pick<BoardPublisherPort, 'sceneUpdated'>` (o `SocketIoBoardPublisher`, que o `wireRealtime` devolve como `boardPublisher` em `RealtimeOutlets`). Sem isso a aba e o rótulo do tabuleiro de quem estava no grid ficavam com o nome velho até o F5 (achado pelo e2e `character.spec.ts`). Mover e publicar/privar não somam versão.
- `LibraryPublisherPort` (`library-publisher.port.ts`) com o adaptador `SocketIoLibraryPublisher` (`server/src/infrastructure/library-publisher/`). Publica `library:changed` e `library:imagePresentationChanged` em `TableServerEvents` (contracts `LibraryServerEvents`).

## Duplicar

- `duplicate`: `findInCampaign` → `scenes.insert(toSceneCopyPo(source, sceneCopyName(…)))` (mesmo grid, fundo e visão, mesma pasta, **privado**, versão 0) → `tokens` → `walls` → `lights` → `drawings` → `effectAreas` `.copyScene(from, to)`, tudo no `tx`.
- `copyScene` é `INSERT … SELECT` montado por `server/src/database/copy-rows.ts`: `copyRowsSql(table, replaced, source)` copia toda coluna como está, troca as de `replaced` e pula coluna identity/gerada (as `*_order` renumeram na ordem do `ORDER BY`); `sceneRowsCopySql` é o caso "linhas de uma cena com ids novos"; `uuidArray(ids)` passa ids como um `uuid[]` só.
- `TokensDao.copyScene` sorteia os ids novos no banco (`gen_random_uuid()`), copia os tokens por um `unnest(old[], new[]) AS copy_map` (toda coluna, a aura inclusive: a cópia leva a aura de cada token, ver [`tokens/aura.md`](tokens/aura.md)) e, pelo mesmo mapa, barras, controle e condições (`appliedRound` nulo: fora de combate); devolve o mapa velho → novo. Combate (`combats`) e principal (`main_tokens`) não vão.
- Os tokens copiam o `created_at` da origem (a ordem de desenho é por ele); tokens que empatavam no `created_at` podem trocar de ordem entre si na cópia (o desempate é o id novo).

## Documentos

O agregado também inclui documentos autorizados (públicos ou ocultos próprios), sem corpo. Ancestrais de documentos visíveis integram a árvore. Excluir pasta move documentos ao pai na mesma transação, conservando texto e donos. GET /scenes conserva o contrato anterior. Ver [documents.md](documents.md).

## Mapas

O agregado `GET …/library` leva `maps` (resumos sem regiões, filtrados por `LibraryMapAccessBo.canSee`: o mestre todos, os outros os públicos e o Principal, mesmo privado) e `mainMapId` (`null` sem Principal). As pastas dos mapas visíveis entram nos ancestrais do `visibleTo`. Excluir pasta sobe os mapas ao pai na mesma transação (`LibraryMapsDao.moveFromFolder`, sem somar a versão). CRUD, Principal e rotas em [library-maps.md](library-maps.md).

## Modelos de ficha e fichas

A pasta também guarda **modelos de ficha** (`sheet_templates`) e **fichas** (`token_sheets.folder_id`, `0074`), as duas com FK composta `SET NULL ("folder_id")`. Excluir pasta sobe modelos e fichas ao pai na mesma transação (`SheetTemplatesDao.moveFromFolder` e `SheetsDao.moveFromFolder`, sem somar a versão). O agregado `GET …/library` leva `sheetTemplates` (sem código) só ao mestre e `sheets` (resumos sem valores: o mestre todas, os outros as que leem; as pastas delas entram nos ancestrais visíveis). Criar, renomear, mover, dar, tirar do dono, mudar visibilidade ou modelo e excluir uma ficha publicam `library:changed`; valores, não. Ver [sheets/server.md](sheets/server.md).

## Pasta privada

`scene_folders.visibility` esconde de quem não é mestre tudo que está na pasta e nas subpastas: [pasta-privada.md](library/pasta-privada.md).
