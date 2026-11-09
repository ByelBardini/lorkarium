# Regiões do mapa: escrita, projeção, mostrar e "Aparece em"

Detalhe de [`../library-maps.md`](../library-maps.md). As colunas e o `link_kind` sobrevivente estão no hub; a geometria, em [`../game-core.md`](../game-core.md).

## Rotas

Todas sob `/api`, exigem sessão (401 sem cookie). Id malformado na URL = não achado (404). `:mapId` aponta para `/campaigns/:campaignId/library-maps/:mapId`.

| Rota                                                               | Quem   | Entrada                     | Saída                                      | Erros                                                                                                                                                           |
| ------------------------------------------------------------------ | ------ | --------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST …/:mapId/regions`                                            | mestre | `createMapRegionRequestDto` | 201 `mapRegionDto` (projetada p/ o mestre) | 400 `INVALID_BODY` / `MAP_REGION_GEOMETRY_INVALID` · 403 · 404 `LIBRARY_MAP_NOT_FOUND` / `MAP_LINK_TARGET_NOT_FOUND` · 422 `MAP_REGIONS_FULL` / `MAP_LINK_SELF` |
| `PATCH …/:mapId/regions/:regionId`                                 | mestre | `updateMapRegionRequestDto` | 200 `mapRegionDto` (projetada p/ o mestre) | 400 · 403 · 404 `LIBRARY_MAP_NOT_FOUND` / `MAP_REGION_NOT_FOUND` / `MAP_LINK_TARGET_NOT_FOUND` · 422 `MAP_LINK_SELF`                                            |
| `DELETE …/:mapId/regions/:regionId`                                | mestre | —                           | 204                                        | 403 · 404 `LIBRARY_MAP_NOT_FOUND` / `MAP_REGION_NOT_FOUND`                                                                                                      |
| `POST …/:mapId/regions/:regionId/shows`                            | mestre | —                           | 204                                        | 403 · 404 `LIBRARY_MAP_NOT_FOUND` / `MAP_REGION_NOT_FOUND` · 409 `MAP_REGION_NOT_SHOWABLE`                                                                      |
| `GET /campaigns/:campaignId/documents/:documentId/map-appearances` | membro | —                           | 200 `mapAppearancesResponseDto`            | 404 `DOCUMENT_NOT_FOUND` / `CAMPAIGN_NOT_FOUND`                                                                                                                 |

- `POST` exige `color`; `description` (`''`), `icon` (`'pin'`), `hidden` (`false`) e `link` (`null`) têm padrão no DTO. `icon` é `text` (migração `0092`), não `pgEnum`: a lista vive no contrato e ícone novo não pede migração.
- O DTO barra coordenada fora de 0–1 e contagem de vértices, mas não conhece área: polígono degenerado passa nele e é recusado por `validRegionGeometry` (`mapRegionGeometry` do game-core), com 400 `MAP_REGION_GEOMETRY_INVALID`, antes de gravar.
- `GET …/map-appearances` responde `cache-control: private, no-store`, como as leituras do mapa.

## Escrita

`MapRegionsService` (`map-regions.service.ts`): `create`, `update`, `delete`. Passa por `editAsMaster` (`requireMaster` antes da trava → transação com `lockById`) e sempre na ordem: mapa existe → regra → grava → soma a versão → commit → `library:mapChanged`.

`map-regions.bo.ts` tem a regra sem I/O: `requireRegionRoom` (a 300ª passa, a 301ª é `MAP_REGIONS_FULL`), `requireLinkNotSelf` (ciclo entre mapas vale), `validRegionGeometry`, `linkColumnsOf` e `requireRegionShowable`.

- **Trocar o link grava sempre o tipo e os quatro alvos** (`linkColumnsOf`): um alvo antigo que ficasse para trás cairia no `CHECK`. `link: null` tira o link; chave ausente deixa como está.
- O alvo é conferido dentro da transação com a mesa travada, e toda exclusão de item da biblioteca também trava a mesa: o alvo que passou na conferência não some antes do `INSERT` (nada de `23503` em 500). Alvo de outra mesa não acha, como o inexistente (`MAP_LINK_TARGET_NOT_FOUND`).
- A resposta é a mesma projeção do `GET`, lida no próprio `tx`.

## Projeção: quem recebe o quê

`MapRegionProjectionBo` (`map-region-projection.bo.ts`) decide; `readMapRegions` (`map-region-links.service.ts`) carrega os alvos e chama o BO. O `GET /:mapId` roda tudo em snapshot, depois de `requireSee` no mapa.

| Situação da região                         | Mestre                              | Jogador e espectador                 |
| ------------------------------------------ | ----------------------------------- | ------------------------------------ |
| Oculta                                     | vem, com `hidden: true`             | **não vem**                          |
| Sem link                                   | `link: null`                        | `link: null`                         |
| Alvo que o leitor pode abrir               | `{ state: 'open', kind, id, name }` | `{ state: 'open', kind, id, name }`  |
| Alvo que o leitor não pode abrir           | (o mestre sempre pode)              | `{ state: 'locked' }`, sem mais nada |
| Alvo apagado (`link_kind` com alvos nulos) | `{ state: 'removed', kind }`        | `link: null`                         |

"Pode abrir" é a regra que já guarda cada item, nunca uma cópia dela:

| Alvo      | Regra                                                  | Jogador abre                               |
| --------- | ------------------------------------------------------ | ------------------------------------------ |
| documento | `DocumentAccessBo.canRead`                             | público ou dono (o espectador, só público) |
| grid      | `SceneAccessBo.canSee` (com o `activeSceneId` da mesa) | público ou o grid do grupo, mesmo privado  |
| mapa      | `LibraryMapAccessBo.canSee`                            | público ou o Principal, mesmo privado      |
| imagem    | `canReadLibraryImage`                                  | pública ou a que está sendo apresentada    |

- **`locked` não leva id, nome nem tipo**, e `mapRegionDto` recusa campo a mais: a região visível não pode revelar o que há atrás dela.
- **`toMapRegionDto` copia campo a campo**, para nada da linha (as colunas `target_*`, `link_kind`) sair por acidente.
- **Uma consulta por tipo, não uma por região** (até 300): `mapLinkTargetIdsOf` junta os ids sem repetir e `MapLinkTargetsDao` (`map-link-targets.dao.ts`) responde `documentsIn` (com os donos, `array_agg` num `LEFT JOIN`), `scenesIn`, `mapsIn`, `imagesIn` (com a marca de apresentada, `LEFT JOIN`), todas filtradas por `campaign_id`. Tipo sem id não consulta nada; o `activeSceneId` só é lido se há link para grid.

## Eventos

| Evento                   | Quando                                     | Campos                                             | Sala         |
| ------------------------ | ------------------------------------------ | -------------------------------------------------- | ------------ |
| `library:mapChanged`     | depois do commit de cada escrita de região | `campaignId`, `mapId`, `version`, `at`             | só a da mesa |
| `library:mapRegionShown` | quando o mestre mostra uma região          | `eventId`, `campaignId`, `mapId`, `regionId`, `at` | só a da mesa |

Nenhum dos dois leva nome, geometria ou link: quem recebe relê pela rota, que projeta para o leitor. Assim uma região oculta nunca passa pelo socket. Recusa não publica nada. A versão só sobe em escrita de região e em `PATCH` do mapa: o `shows` não grava.

## Mostrar a todos

`MapRegionShowService` (`map-region-show.service.ts`): `requireMaster`, mapa e região em snapshot, depois publica. Efêmero: sem linha, sem versão e sem trava.

Só é mostrável o que um jogador pode ver, senão o evento nomearia um lugar escondido: região oculta, ou mapa privado que não é o Principal → 409 `MAP_REGION_NOT_SHOWABLE`, sem evento (`requireRegionShowable`, sobre `isMapOpenToTable`, a mesma regra do `canSee`). O Principal privado pode ser mostrado.

## "Aparece em"

`MapAppearancesService` (`map-appearances.service.ts`): em snapshot, exige ler o documento (`DocumentAccessBo.requireRead`; quem não lê leva `DOCUMENT_NOT_FOUND`, nunca 403, mesmo com o documento em mapa público) e filtra `listAppearances` por `LibraryMapAccessBo.canSeeRegion`: o mestre vê tudo; os outros, só região visível em mapa público ou no Principal. A resposta traz só `mapId`, `mapName`, `regionId`, `regionName`.

## Testes

Unit em `server/test/modules/library-maps/`: `map-region-projection.bo.spec.ts`, `map-regions.bo.spec.ts`, `map-regions.service.spec.ts` (diário `lock → gravar → bump → commit → publish`), `map-region-show.service.spec.ts`, `map-appearances.service.spec.ts`; `library-maps.service.spec.ts` cobre a projeção no `detail`.

Integração (Postgres descartável): `library-map-regions.spec.ts` (escrita, recusas, endereços, `library:mapChanged`), `library-map-region-spoilers.spec.ts` (**corpo JSON cru** sem id, nome ou `kind` em `locked`, região oculta ausente; o que abre para o jogador; o número de consultas não cresce com as regiões), `library-map-show.spec.ts` (Socket.IO real, aparições) e `map-link-targets-dao.spec.ts`. `MapRegionsOverHttp` (`server/test/support/library-map-regions-http.ts`) cria mapa, região e alvos pela borda ou direto na tabela, sobre o `useTokenTable()`.
