# Library

A biblioteca de grids da mesa: vários grids (cenas) por mesa, em pastas aninhadas, públicos ou privados. Na tela é "grid"; no código continua `scene`. A cena em si (grid, fundo, visão, versão) está em [`board.md`](board.md) (Cena).

Aqui: o banco, a regra, o REST de grids e pastas, o duplicar e a **ativação com expulsões**. O **endereço da cena** (`sceneId` nos comandos, `inLockedGrid`) e as **salas por grid** com abas extras (`scene:watch`/`scene:unwatch`) estão em [`board.md`](board.md).

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
- **Só grids:** as consultas da biblioteca filtram `kind = 'grid'`; o elenco da mesa (`kind = 'cast'`, ver [`tokens/character.md`](tokens/character.md)) nunca é listado, editado, copiado, excluído nem ativado (`SCENE_NOT_FOUND`).
- **Isolamento:** toda consulta da biblioteca filtra por `campaign_id`; um id de cena ou pasta de outra mesa não acha, não altera e não apaga nada.

## Regra (sem banco)

- **`SceneAccessBo(campaignAccess, groupSceneId)`** (`server/src/modules/scenes/scene-access.bo.ts`): quem vê e age em cada grid. `groupSceneId` é o `campaigns.active_scene_id` (pode ser `null`). `seesEveryGrid()` = é mestre; `canSee({ id, visibility })` = mestre, ou o grid do grupo (mesmo privado), ou `public`; `requireAct(scene)` recusa o resto com **`SceneNotFoundError`** (`SCENE_NOT_FOUND`, em `scenes/scenes.error.ts`, citando o usuário, o grid e a mesa) — nunca `FORBIDDEN`, para não revelar que o grid existe (critério 14). Quem não é membro continua levando `CAMPAIGN_NOT_FOUND` (do `CampaignAccessBo`; o `userIdOf()` dele dá o id citado no erro).
- **`SceneLibraryBo({ campaignId, activeSceneId, maxFolderDepth, folders, scenes })`** (`library/scene-library.bo.ts`): a árvore de uma mesa. Pasta = `{ id, parentId }`, grid = `{ id, folderId, visibility }`; genérico, então campos a mais (nome, contagem) passam intactos. `maxFolderDepth` é o `SCENE_FOLDER_DEPTH_MAX` passado pelo plugin (o BO não lê o contrato). Pasta da raiz = nível 1.
  - `requireMove(folderId, parentId | null)`: pasta ou pai fora da mesa → `FOLDER_NOT_FOUND`; pai = ela mesma ou descendente → `FOLDER_CYCLE`; nível do pai + altura da subárvore > máximo → `FOLDER_TOO_DEEP`.
  - `requireCreateIn(parentId | null)`: pai desconhecido → `FOLDER_NOT_FOUND`; nível do pai + 1 > máximo → `FOLDER_TOO_DEEP`.
  - `removal(folderId)` → `{ folderId, parentId, childFolderIds, sceneIds }`: o que sobe para o pai (raiz quando não há); o service da A4 grava isso antes de apagar (o `SET NULL` do banco levaria à raiz).
  - `requireDeletable(sceneId)`: o grid do grupo → `SCENE_IS_ACTIVE`.
  - `requireKnown(folderId | null)`: a pasta onde um grid vai ficar; desconhecida → `FOLDER_NOT_FOUND` (profundidade não conta: grid não é nível).
  - `visibleTo(sceneAccess)`: mestre vê tudo (pastas vazias inclusive); jogador vê os grids de `canSee` e só as pastas no caminho até algum deles (pasta só com privados some; pasta sem grid próprio com subpasta visível aparece). Ordem de entrada mantida.
- `sceneCopyName(name, suffix, maxLength)` (mesmo arquivo): o nome da cópia, cortado (e sem espaço no fim) para caber o sufixo.
- **Erros** (`library/library.error.ts`, base `LibraryError`): `FolderNotFoundError` (`FOLDER_NOT_FOUND`), `FolderCycleError` (`FOLDER_CYCLE`, cita as duas pastas), `FolderTooDeepError` (`FOLDER_TOO_DEEP`, "would be N levels deep; expected at most 5"), `SceneIsActiveError` (`SCENE_IS_ACTIVE`). O contracts não tem enum de códigos (`apiErrorDto.code` é `string`): os códigos vivem nos `*.error.ts` e na tabela de status da borda.
- **Limites e textos** em `packages/contracts/src/library/library.dto.ts`: `SCENE_NAME_MAX_LENGTH` 60, `SCENE_FOLDER_NAME_MAX_LENGTH` 40, `SCENE_FOLDER_DEPTH_MAX` 5, `UNNAMED_SCENE_NAME` ("Grid sem nome"), `SCENE_COPY_SUFFIX` (" (cópia)").

## Contrato (REST)

Todas sob `/api`, exigem sessão (401 sem cookie), aninhadas na mesa (§2.6). DTOs em `library.dto.ts` (detalhe em [`contracts.md`](contracts.md), Biblioteca). Id malformado na URL = não achado (404), como id de outra mesa.

| Rota                                                    | Quem   | Entrada                        | Saída                                                   | Erros                                                        |
| ------------------------------------------------------- | ------ | ------------------------------ | ------------------------------------------------------- | ------------------------------------------------------------ |
| `GET /campaigns/:campaignId/scenes`                     | membro | —                              | 200 `libraryDto`                                        | 404 `CAMPAIGN_NOT_FOUND`                                     |
| `POST /campaigns/:campaignId/scenes`                    | mestre | `createLibrarySceneRequestDto` | 201 `librarySceneDto` ("Grid sem nome", privado, 20×12) | 400 · 403 · 404 `FOLDER_NOT_FOUND`                           |
| `PATCH /campaigns/:campaignId/scenes/:sceneId`          | mestre | `updateLibrarySceneRequestDto` | 200 `librarySceneDto`                                   | 400 · 403 · 404 `SCENE_NOT_FOUND` / `FOLDER_NOT_FOUND`       |
| `DELETE /campaigns/:campaignId/scenes/:sceneId`         | mestre | —                              | 204 (tudo do grid na cascata)                           | 403 · 404 · 409 `SCENE_IS_ACTIVE`                            |
| `POST /campaigns/:campaignId/scenes/:sceneId/copies`    | mestre | —                              | 201 `librarySceneDto`                                   | 403 · 404 `SCENE_NOT_FOUND`                                  |
| `POST /campaigns/:campaignId/scene-folders`             | mestre | `createSceneFolderRequestDto`  | 201 `sceneFolderDto`                                    | 400 · 403 · 404 `FOLDER_NOT_FOUND` · 422 `FOLDER_TOO_DEEP`   |
| `PATCH /campaigns/:campaignId/scene-folders/:folderId`  | mestre | `updateSceneFolderRequestDto`  | 200 `sceneFolderDto`                                    | 400 · 403 · 404 · 409 `FOLDER_CYCLE` · 422 `FOLDER_TOO_DEEP` |
| `DELETE /campaigns/:campaignId/scene-folders/:folderId` | mestre | —                              | 204 (filhos e grids sobem para o pai)                   | 403 · 404                                                    |

- Jogador em rota de mestre → 403 `FORBIDDEN`; quem não é membro → 404 `CAMPAIGN_NOT_FOUND` (antes de qualquer trava).
- **`library:changed { campaignId, at }`** (Socket.IO, sala `campaign:<id>`) depois de **cada** mutação confirmada, sem dado nenhum: cada client relê pela rota, que filtra por papel (grid privado nunca passa pelo socket). Recusa não publica.

## Service e publicador

- `LibraryService` (`library.service.ts`), montado por `createLibraryModule({ db, publisher, audience, grids, clock })` (`library.plugin.ts`, registrado no `build-app` **depois** do `wireRealtime`, que agora devolve o `io`): `list`, `createScene`, `updateScene`, `deleteScene`, `duplicate`, `createFolder`, `updateFolder`, `deleteFolder`. O requerente é `LibraryRequester { userId, campaignId }` (sessão + URL, nunca o corpo).
- Toda edição passa por `edit`: `memberAccessOf` → `requireMaster` → transação (`LibraryTransactionRunner` com `LibraryWriteDaos`: campaigns, folders, scenes e os cinco `SceneCopyDaos`) que trava a mesa (`lockById`), lê pastas e grids para a `SceneLibraryBo` e executa → commit → `publisher.libraryChanged`.
- `list` lê sem transação (`LibraryReadDaos`) e aceita o espectador (`viewerAccessOf`: ele lê como jogador; toda edição continua `memberAccessOf`), filtra por `visibleTo(new SceneAccessBo(access, activeSceneId))`, e só o mestre recebe `tokenCount` (`toLibrarySceneDto(row, seesTokenCount)` em `library.mapper.ts`).
- Excluir pasta: `removal` → `moveChildren` → `moveScenes` → `delete`, na mesma transação (o `SET NULL` do banco levaria à raiz; o service leva ao pai).
- **Renomear um grid** (`updateScene` com `name`): na mesma transação `ScenesDao.bumpVersion` (diário `lock → save → bump → commit`) e, depois do `library:changed`, `scene:updated { campaignId, sceneId, version, at, scene }` às salas do grid pela dependência `grids: Pick<BoardPublisherPort, 'sceneUpdated'>` (o `SocketIoBoardPublisher`, que o `wireRealtime` devolve como `boardPublisher` em `RealtimeOutlets`). Sem isso a aba e o rótulo do tabuleiro de quem estava no grid ficavam com o nome velho até o F5 (achado pelo e2e `character.spec.ts`). Mover e publicar/privar não somam versão.
- `LibraryPublisherPort` (`library-publisher.port.ts`) com o adaptador `SocketIoLibraryPublisher` (`server/src/infrastructure/library-publisher/`). O evento entrou em `TableServerEvents` (contracts `LibraryServerEvents`).

## Ativação e expulsão

- **`scene:activate { actionId, campaignId, sceneId }`** (mestre; `activateSceneCommandDto`, na fila da mesa) → `SceneActivationService.activate(userId, campaignId, sceneId)` (`scenes/scene-activation.service.ts`, montado no `createScenesModule` → `activation`): `memberAccessOf` → `requireMaster` (jogador → `FORBIDDEN`, nada travado) → transação com `CampaignsDao.lockById` (`FOR NO KEY UPDATE`: espera um `scene:watch` ou uma edição da biblioteca) → `ScenesDao.findInCampaign` (grid de outra mesa → `SCENE_NOT_FOUND`) → `setActiveScene` → commit → `audience.moveTable` → `publisher.sceneActivated` (`scene:activated { campaignId, sceneId, previousSceneId, at }` à sala da mesa) → `publisher.libraryChanged`. Ativar o grid que já é do grupo não grava nem avisa nada. Persiste no banco (reinício mantém).
- **`SceneAudiencePort`** (`scenes/scene-audience.port.ts`; adaptador `server/src/infrastructure/scene-audience/socket-io-scene-audience.ts`, por `io.in(sala).fetchSockets()`):
  - `moveTable({ campaignId, sceneId, previous: { sceneId, playersKeepTabs } | null, at })`: todo socket da sala da mesa **entra primeiro** nas salas do grid novo (as do grupo levam também a ficha e a lista de condições) e depois sai das do antigo, salvo se o abriu como aba (`watchedSceneIds`) e ainda o alcança (mestre sempre; jogador só se o antigo é público — `playersKeepTabs`). O jogador que tinha o antigo privado como aba perde a aba e recebe `scene:closed { reason: 'private' }`.
  - `evict({ campaignId, sceneId, audience: 'players' | 'everyone', reason, at })`: tira das salas do grid (mestre fica quando `players`; o mestre é quem está em `campaign:<id>:masters`), esquece a aba e manda `scene:closed { campaignId, sceneId, reason, at }` só àquele socket.
- **`LibraryService`**: `updateScene` com `visibility: 'private'` num grid que **não** é o do grupo chama `evict(players, 'private')`; `deleteScene` chama `evict(everyone, 'deleted')`. Os dois **depois do commit e antes** do `library:changed` (`editAndEvict`; o `edit` comum não expulsa). Privar o grid do grupo não expulsa (o grupo continua nele). A dependência nova do plugin é `audience`.
- **Fiação:** o `wireRealtime` do `build-app` cria o `SocketIoSceneAudience` e o `SocketIoLibraryPublisher` (que também publica o `sceneActivated`) e os devolve (`RealtimeOutlets`) para o plugin da biblioteca; o scenes module os recebe (`audience`, `libraryPublisher`) e o board gateway liga o `scene:activate` (`sceneActivation`). O seed de estresse passa portas mudas.
- **Corrida conhecida (risco):** o `session:join` lê o grid do grupo sem trava (`enterGroupGrid`); uma ativação que confirma entre essa leitura e o `join` das salas deixa o socket também nas salas do grid antigo até a próxima mudança. O client relê pelo `scene:activated`, mas um grid antigo privado poderia chegar a esse socket.

## Duplicar

- `duplicate`: `findInCampaign` → `scenes.insert(toSceneCopyPo(source, sceneCopyName(…)))` (mesmo grid, fundo e visão, mesma pasta, **privado**, versão 0) → `tokens` → `walls` → `lights` → `drawings` → `effectAreas` `.copyScene(from, to)`, tudo no `tx`.
- `copyScene` é `INSERT … SELECT` montado por `server/src/database/copy-rows.ts`: `copyRowsSql(table, replaced, source)` copia toda coluna como está, troca as de `replaced` e pula coluna identity/gerada (as `*_order` renumeram na ordem do `ORDER BY`); `sceneRowsCopySql` é o caso "linhas de uma cena com ids novos"; `uuidArray(ids)` passa ids como um `uuid[]` só.
- `TokensDao.copyScene` sorteia os ids novos no banco (`gen_random_uuid()`), copia os tokens por um `unnest(old[], new[]) AS copy_map` (toda coluna, a aura inclusive: a cópia leva a aura de cada token, ver [`tokens/aura.md`](tokens/aura.md)) e, pelo mesmo mapa, barras, controle e condições (`appliedRound` nulo: fora de combate); devolve o mapa velho → novo. Combate (`combats`) e principal (`main_tokens`) não vão.
- Os tokens copiam o `created_at` da origem (a ordem de desenho é por ele); tokens que empatavam no `created_at` podem trocar de ordem entre si na cópia (o desempate é o id novo).

## Testes

- Unit: `server/test/modules/scenes/scene-access.bo.spec.ts` (mestre em privado fora do grupo, jogador no do grupo privado e em público, privado fora do grupo → `SCENE_NOT_FOUND`, mesa sem grid do grupo, não membro) e `server/test/modules/library/scene-library.bo.spec.ts` (mover à raiz, ciclo em si/filha/descendente, 5 níveis passa e 6 não, pasta de outra mesa, criar no 5º e no 6º, `removal` para a raiz e para o pai, `SCENE_IS_ACTIVE`, `visibleTo` de jogador e mestre).
- Unit (A3–A5): `server/test/modules/library/library.service.spec.ts` (diário `lock → save → commit → publish`; recusa sem publicar; jogador sem contagem; exclusão de pasta `moveChildren → moveScenes → delete`; ciclo; duplicar `lock → save → copy ×5 → commit → publish`, nome cortado), `library.mapper.spec.ts`, `server/test/database/copy-rows.spec.ts` (o SQL gerado) e `packages/contracts/test/library/library.dto.spec.ts`.
- Integração: `library.spec.ts` (grids pela borda, `library:changed` a Ana e Bia e não à Quelm, reinício), `library-folders.spec.ts` (criar, renomear, mover à raiz, excluir sobe ao pai/raiz, ciclo, 6º nível, 403, pasta da Quelm) e `library-copy.spec.ts` (cópia inteira com ids novos, porta aberta, luz apagada, autores, Envenenado com `appliedRound` nulo, sem combate nem principal, original intacta, grid vazio, 403, 404, reinício). O harness `useTokenTable` tem `http(user | null, request)` (o `inject` com o cookie da sessão).
- Unit (ativação): `server/test/modules/scenes/scene-activation.service.spec.ts` (diário `lock → setActiveScene → commit → move audience → publish activated → publish`, a Bia → `FORBIDDEN` sem nada, Quelm → `SCENE_NOT_FOUND`, Salão privado → `playersKeepTabs: false`, mesa sem grid do grupo, mesmo grid = nada), `library.service.spec.ts` (privar a Torre → `evict players` entre commit e publish; o do grupo e renomear não expulsam; excluir → `evict everyone`) e `server/test/infrastructure/scene-audience/socket-io-scene-audience.spec.ts` (fakes de socket e de `io.in`).
- Integração (ativação): `scene-activation.spec.ts` (os três recebem `scene:activated` e o `token:moved` da Estrada; o Salão privado some para todos; o Salão público aberto pela Bia continua só para ela; o privado aberto pela Bia → `scene:closed private`; ficha e `condition:define` chegam pela Estrada; `FORBIDDEN`; Quelm; `userId` forjado; reinício; privar a Torre → `scene:closed private` à Bia e nada mais; fechada = esquecida; privar o do grupo não fecha; excluir → `scene:closed deleted` à Ana) e a corrida de 100 rodadas em `scene-rooms.spec.ts`.
- Integração: `server/test/integration/library-dao.spec.ts` — pastas (ordem, `CHECK` de 0 e 41 caracteres, pai de outra mesa recusado, isolamento, cascata da mesa), grids (nasce privado, lista com visibilidade/pasta/pixels do fundo/`tokenCount`, `findInCampaign`, `updateLibrary` parcial, pasta de outra mesa recusada, apagar a pasta → sem pasta, apagar o pai → subpasta na raiz, `delete` com cascata dos tokens, isolamento) e a migração sobre um banco de rascunho até a `0032` (a cena que existia sai `public` e sem pasta).

## Armadilhas

- **Postgres de teste compartilhado.** Dois agentes (ou terminais) rodando a integração ao mesmo tempo no mesmo `DATABASE_URL` se atropelam no `truncateAllTables` (falhas soltas de "no row", `ZodError` no `createTable`). Para rodar em paralelo, crie um banco próprio no mesmo container (`CREATE DATABASE …`) e aponte o `DATABASE_URL` para ele.

- **`SET NULL` de FK composta.** O drizzle-kit gera `ON DELETE set null`, que anularia também o `campaign_id` (`NOT NULL`) e faria a exclusão falhar. A `0033` foi editada à mão para `SET NULL ("parent_id")` / `SET NULL ("folder_id")` (Postgres 15+). Ao gerar a próxima migração, conferir que o drizzle-kit não tenta "corrigir" essas FKs; FK composta nova com `set null` precisa da mesma edição.

- **Nome do grid mora no snapshot.** A sala lê o nome da aba e do tabuleiro do `scene` do board (snapshot + `scene:updated`), não da biblioteca: mudança no `scenes` que a sala mostra precisa somar a versão do grid e publicar `scene:updated`; o `library:changed` só relê a lista do modal.
