# Mapas da biblioteca

O mapa é um item da biblioteca com imagem própria: o mestre marca nele regiões (polígono) e pinos, cada um podendo levar a um documento, grid, imagem ou outro mapa. Um mapa da mesa pode ser o **Principal**.

Aqui: as tabelas, as FKs, os DAOs, a regra de quem vê, o Principal e as rotas do mapa (`server/src/modules/library-maps/`). A geometria e os limites estão em [`game-core.md`](game-core.md) e os DTOs em [`contracts.md`](contracts.md).

**[Regiões](library-maps/regioes.md)**: rotas de escrita, projeção de spoiler (tabela de quem recebe o quê), `library:mapChanged`, mostrar a todos e "Aparece em".

## Tabelas (migração `0091_library_maps`)

**`library_maps`** (`library-maps.po.ts`): `id`, `campaign_id` (→ `campaigns`, cascade), `folder_id` (nulo = raiz), `asset_id`, `name` (`CHECK` 1 a 60), `visibility` (enum `scene_visibility`, padrão `private`), `is_main` (padrão `false`), `version` (padrão 0, `CHECK` ≥ 0), `created_at`, `updated_at`.

- Únicos: `library_maps_campaign_id_id_unique` (`campaign_id`, `id`), alvo das FKs compostas, e `library_maps_asset_unique` (`asset_id`): uma imagem serve a um mapa só.
- **`library_maps_one_main_unique`**: índice único parcial em `campaign_id` `WHERE is_main`. É o banco que garante um só Principal por mesa, sem coluna em `campaigns`. O índice vale a cada comando (não é adiável): trocar o Principal é `clearMain` e depois `setMain`, nessa ordem e na mesma transação.

**`library_map_regions`** (`library-map-regions.po.ts`): `id`, `campaign_id` (→ `campaigns`, cascade), `map_id`, `name` (`CHECK` 1 a 60), `description` (padrão `''`, `CHECK` até 500), `geometry` (jsonb `MapRegionGeometry`, validado pelo game-core antes de gravar; o banco não confere a forma), `color` (`CHECK` `^#[0-9a-f]{6}$`), `hidden` (padrão `false`), `link_kind` (enum `map_region_link_kind`: `document` | `scene` | `map` | `image`), `target_document_id`, `target_scene_id`, `target_map_id`, `target_image_id`, `created_at`, `updated_at`. Índices em (`campaign_id`, `map_id`) e em (`campaign_id`, alvo) para cada um dos quatro alvos: é por eles que o `SET NULL` e o "Aparece em" acham as regiões.

Também desta migração: `scenes_campaign_id_id_unique` (`scenes.po.ts`), o alvo da FK composta do grid, e `library_map` em `asset_purpose`. Enum e tabelas exportados em `server/src/database/schema.ts`; `truncateAllTables` inclui as duas.

## Link da região

| `link_kind` | alvos                  | significado                                    |
| ----------- | ---------------------- | ---------------------------------------------- |
| nulo        | todos nulos            | região sem link                                |
| preenchido  | só o alvo daquele tipo | link vivo                                      |
| preenchido  | todos nulos            | **"Link removido"**: o item ligado foi apagado |

- **`link_kind` sobrevive ao `SET NULL`.** Apagar o item ligado limpa só a coluna do alvo: a região fica, sem coluna extra e sem trigger, e o tipo continua dizendo o que havia ali. Nada apaga uma região por causa do alvo.
- `CHECK` `library_map_regions_link_target`: no máximo um alvo (`num_nonnulls`), e cada alvo preenchido exige o `link_kind` dele. A comparação é `IS NOT DISTINCT FROM`, não `=`: alvo com `link_kind` nulo daria `NULL` no `=`, e `CHECK` que dá `NULL` passa.
- O banco aceita a região ligada ao próprio mapa: recusar é regra do caso de uso (ciclo entre mapas vale).
- Trocar o link grava o `link_kind` e os quatro alvos juntos (`MapRegionChangesPo`); o alvo antigo que ficasse para trás cairia no `CHECK`.

## FKs compostas (isolamento no banco)

Pasta, imagem, mapa e alvo de outra mesa são recusados pelo próprio Postgres (`23503`), porque toda referência carrega o `campaign_id`.

| FK                                       | Colunas → destino                                           | Ao apagar o destino               |
| ---------------------------------------- | ----------------------------------------------------------- | --------------------------------- |
| `library_maps_asset_fk`                  | (`campaign_id`, `asset_id`) → `assets`                      | bloqueia                          |
| `library_maps_folder_fk`                 | (`campaign_id`, `folder_id`) → `scene_folders`              | `SET NULL ("folder_id")`          |
| `library_map_regions_map_fk`             | (`campaign_id`, `map_id`) → `library_maps`                  | cascade                           |
| `library_map_regions_target_document_fk` | (`campaign_id`, `target_document_id`) → `library_documents` | `SET NULL ("target_document_id")` |
| `library_map_regions_target_scene_fk`    | (`campaign_id`, `target_scene_id`) → `scenes`               | `SET NULL ("target_scene_id")`    |
| `library_map_regions_target_map_fk`      | (`campaign_id`, `target_map_id`) → `library_maps`           | `SET NULL ("target_map_id")`      |
| `library_map_regions_target_image_fk`    | (`campaign_id`, `target_image_id`) → `library_images`       | `SET NULL ("target_image_id")`    |

Apagar a pasta leva os mapas à raiz; subir ao pai é regra de quem apaga (`moveFromFolder` antes). Apagar um mapa leva as regiões dele e deixa "Link removido" nas regiões de outros mapas que apontavam para ele.

## DAOs

Recebem `db` ou `tx` pelo construtor. **Toda consulta filtra por `campaign_id`** (e a de uma região, também pelo `map_id`): id de outra mesa não acha, não altera e não apaga nada.

`LibraryMapsDao` (`library-maps.dao.ts`), com `LibraryMapRow = { map, asset }`:

- `insert(NewLibraryMapPo)` → `LibraryMapPo`
- `listOfCampaign(campaignId)` → `LibraryMapRow[]` (ordem de criação)
- `findInCampaign(campaignId, mapId)` e `findMainOfCampaign(campaignId)` → `LibraryMapRow | undefined`
- `findByAsset(campaignId, assetId)` → `LibraryMapPo | undefined`
- `update(campaignId, mapId, LibraryMapChangesPo)` → `LibraryMapPo | undefined` (só as chaves recebidas de `name`/`folderId`/`visibility`, e o `updated_at`)
- `bumpVersion(campaignId, mapId)` → `number | undefined` (a versão nova)
- `setMain(campaignId, mapId)` → `boolean` · `clearMain(campaignId)` → `void`
- `delete(campaignId, mapId)` → `boolean` · `moveFromFolder(campaignId, folderId, parentId)` → `void`

`LibraryMapRegionsDao` (`library-map-regions.dao.ts`):

- `insert(NewMapRegionPo)` → `MapRegionPo`
- `listOfMap(campaignId, mapId)` → `MapRegionPo[]` (ordem de criação; devolve as ocultas também)
- `findInMap(campaignId, mapId, regionId)` → `MapRegionPo | undefined`
- `countOfMap(campaignId, mapId)` → `number`
- `update(campaignId, mapId, regionId, MapRegionChangesPo)` → `MapRegionPo | undefined`
- `delete(campaignId, mapId, regionId)` → `boolean`
- `listAppearances(campaignId, documentId)` → `MapAppearanceRow[]` (`mapId`, `mapName`, `mapVisibility`, `mapIsMain`, `regionId`, `regionName`, `regionHidden`; mapa a mapa, sem filtrar por leitor: oculta e mapa privado vêm junto)

## Regra (sem banco)

`library-map-access.bo.ts`:

- **`LibraryMapAccessBo(campaignAccess)`**: `canSee({ visibility, isMain })` = mestre, ou o Principal (mesmo privado, enquanto for Principal), ou `public`; `requireSee(map)` recusa o resto com `LibraryMapNotFoundError`, nunca `FORBIDDEN`, para não revelar que o mapa existe (critério 14). Quem não é membro leva `CAMPAIGN_NOT_FOUND`. É a mesma exceção do grid do grupo.
- `requireMapDeletable(map)`: o Principal → `MapIsMainError`.
- `requireFreeMapAsset(assetId, asset, usedByAnotherMap)`: a imagem precisa ser da finalidade `library_map` e não servir a outro mapa; toda recusa é `AssetNotFoundError`, para um id de outra mesa não dizer nada.

## Principal

- **Um por mesa, garantido pelo índice parcial.** Trocar é `lock → clearMain → setMain → commit → publish` numa transação só, com a mesa travada.
- Marcar o que já é Principal, ou desmarcar um mapa que não é o Principal, não grava nem publica (e desmarcar nunca tira a marca de outro mapa).
- **Excluir o Principal é recusado** (`MAP_IS_MAIN`): a mesa precisa de onde cair; o mestre escolhe outro ou desmarca antes.
- Desmarcar devolve o mapa à visibilidade própria: quem só o via por ser o Principal perde o acesso na hora.
- Ser Principal **não soma a `version`**: a marca é lida do agregado (`mainMapId`) e do `GET main`, não do mapa aberto. A `version` mede o que uma aba aberta mostra: `PATCH` soma, porque nome, pasta e visibilidade aparecem nela e uma aba só troca o que tem por uma versão maior.

## Contrato (REST)

Todas sob `/api`, exigem sessão (401 sem cookie), aninhadas na mesa (§2.6). DTOs em `library-map.dto.ts`. Id malformado na URL = não achado (404), como id de outra mesa. Corpo com campo a mais (`userId`, `isMain`) → 400 `INVALID_BODY`.

| Rota                                                     | Quem   | Entrada                      | Saída                      | Erros                                                        |
| -------------------------------------------------------- | ------ | ---------------------------- | -------------------------- | ------------------------------------------------------------ |
| `POST /campaigns/:campaignId/library-maps`               | mestre | `createLibraryMapRequestDto` | 201 `libraryMapSummaryDto` | 400 · 403 · 404 `ASSET_NOT_FOUND` / `FOLDER_NOT_FOUND`       |
| `GET /campaigns/:campaignId/library-maps/main`           | membro | —                            | 200 `mainMapResponseDto`   | 404 `CAMPAIGN_NOT_FOUND`                                     |
| `GET /campaigns/:campaignId/library-maps/:mapId`         | membro | —                            | 200 `libraryMapDetailDto`  | 404 `LIBRARY_MAP_NOT_FOUND`                                  |
| `PATCH /campaigns/:campaignId/library-maps/:mapId`       | mestre | `updateLibraryMapRequestDto` | 200 `libraryMapSummaryDto` | 400 · 403 · 404 `LIBRARY_MAP_NOT_FOUND` / `FOLDER_NOT_FOUND` |
| `DELETE /campaigns/:campaignId/library-maps/:mapId`      | mestre | —                            | 204 (regiões na cascata)   | 403 · 404 · 409 `MAP_IS_MAIN`                                |
| `PUT /campaigns/:campaignId/library-maps/:mapId/main`    | mestre | —                            | 200 `libraryMapSummaryDto` | 403 · 404 `LIBRARY_MAP_NOT_FOUND`                            |
| `DELETE /campaigns/:campaignId/library-maps/:mapId/main` | mestre | —                            | 200 `libraryMapSummaryDto` | 403 · 404 `LIBRARY_MAP_NOT_FOUND`                            |

- Jogador ou espectador em rota de mestre → 403 `FORBIDDEN`; quem não é membro → 404 `CAMPAIGN_NOT_FOUND`, antes de qualquer trava. O espectador lê como jogador.
- Mapa privado que não é o Principal, para quem não é mestre → 404 `LIBRARY_MAP_NOT_FOUND`.
- As leituras respondem `cache-control: private, no-store`: quem vê muda com a visibilidade e com o Principal.
- O `GET /:mapId` devolve as regiões já projetadas para o leitor, em snapshot; ver [Regiões](library-maps/regioes.md). As rotas das regiões, `shows` e `map-appearances` estão lá.
- **`library:changed`** (sem dado nenhum; cada client relê pela rota, que filtra por papel) depois de cada mutação confirmada do mapa. Recusa não publica. Escrita de região avisa por `library:mapChanged`.

## Service e plugin

- `LibraryMapsService` (`library-maps.service.ts`): `create`, `detail`, `main`, `update`, `delete`, `setMain`, `unsetMain`. O requerente é `LibraryRequester { userId, campaignId }` (sessão + URL). Toda edição passa por `editAsMaster` (exportada, também é a das regiões): `requireMaster` → transação que trava a mesa (`lockById`) → trabalho → commit → publicação. O `detail` lê em snapshot. `requireMapRow` acha o mapa pelo endereço ou recusa com `LIBRARY_MAP_NOT_FOUND`.
- `createLibraryMapsModule({ db, publisher, clock })` (`library-maps.plugin.ts`, registrado no `build-app` depois da biblioteca, com o `SocketIoLibraryPublisher`); `libraryMapDaos(executor)` monta os DAOs num executor só. `libraryMapsRoutes` recebe os quatro services (`maps`, `regions`, `shows`, `appearances`).
- **Erros** (`library-maps.error.ts`, base `LibraryMapError` com `LibraryMapErrorCode`): `LIBRARY_MAP_NOT_FOUND` (404), `MAP_IS_MAIN` (409), `MAP_REGION_NOT_FOUND` (404), `MAP_REGION_GEOMETRY_INVALID` (400), `MAP_REGIONS_FULL` (422), `MAP_LINK_SELF` (422), `MAP_LINK_TARGET_NOT_FOUND` (404), `MAP_REGION_NOT_SHOWABLE` (409). Código novo entra em `LibraryMapErrorCode` e nas duas tabelas da borda (`STATUS_BY_CODE`, `PUBLIC_MESSAGE`, em `library-maps.routes.ts`). A borda traduz também `DocumentError` (404) das aparições.
- O agregado `GET …/library` e a exclusão de pasta moram na biblioteca; ver [`library.md`](library.md) (Mapas).

## Testes

Unit (`server/test/modules/library-maps/`): `library-map-access.bo.spec.ts`, `library-maps.mapper.spec.ts` e `library-maps.service.spec.ts` (diários `lock → unset → set → commit → publish`, marcar o que já é Principal, recusas sem publicar), sobre `LibraryMapsHarness` (`server/test/support/library-maps-fakes.ts`).

Integração (Postgres descartável): `server/test/integration/library-maps.spec.ts` (borda, agregado com ancestrais, pasta que sobe ao pai, Principal privado, isolamento, `library:changed`, reinício), `library-maps-dao.spec.ts` e `library-map-regions-dao.spec.ts`. Fábricas: `newLibraryMapPo`, `newMapRegionPo`, `KINGDOM_GEOMETRY`, `CITY_GEOMETRY` em `server/test/support/library-maps-factories.ts`; `useLibraryMapsTable()` (`server/test/support/library-maps-table.ts`) dá duas mesas mobiliadas (`vharn`, `quelm`: pasta, grid, documento, imagem e o mapa "Masmorra") sem subir o app.

## Armadilhas

- **`SET NULL` de FK composta.** O drizzle-kit gera `ON DELETE set null`, que anularia também o `campaign_id` (`NOT NULL`) e faria a exclusão falhar. A `0091` foi editada à mão nas cinco FKs com `SET NULL`; ver a mesma armadilha em [`library.md`](library.md).
- **Índice antes da FK.** O drizzle-kit gera o `scenes_campaign_id_id_unique` depois das FKs, e a FK composta do grid falha sem ele. Na `0091` o `CREATE UNIQUE INDEX` foi movido para antes dos `ADD CONSTRAINT`.
