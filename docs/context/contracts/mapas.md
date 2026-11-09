# Contratos dos mapas da biblioteca

`library/library-map.dto.ts` e `library/library-map-events.ts`, exportados pelo `src/index.ts`. Só formato: geometria degenerada, teto de regiões por mapa e quem recebe o quê são regra do game-core e do server.

## Limites

`MAP_NAME_MAX_LENGTH` (60), `MAP_REGION_NAME_MAX_LENGTH` (60), `MAP_REGION_DESCRIPTION_MAX_LENGTH` (500), `MAP_REGIONS_MAX` (300), `MAP_POLYGON_VERTICES_MIN` (3) e `MAP_POLYGON_VERTICES_MAX` (128). Mesmos nomes e valores no `map-region.vo.ts` do game-core, porque o contracts só depende do `zod`. Nomes aparados, de 1 ao limite; descrição aparada, pode ser vazia.

## Geometria

- `mapPointDto` `{ x, y }`, normalizado de 0 a 1: não varia com zoom nem tamanho de tela.
- `mapRegionGeometryDto`, união por `shape`: `{ shape: 'polygon', points }` (3 a 128) | `{ shape: 'pin', point }`. Polígono de área zero passa aqui e é recusado pelo game-core.

## Link

- `mapRegionLinkKindDto`: `document` · `scene` · `map` · `image`. Ficha fica de fora: depende de dono e sandbox.
- `mapRegionLinkTargetDto` `{ kind, id }`: o link que o mestre escreve; `null` = sem link.
- `mapRegionLinkDto`: o link que cada leitor recebe, `null` | `{ state: 'open', kind, id, name }` | `{ state: 'locked' }` | `{ state: 'removed', kind }`. O `locked` não tem campo nenhum, de propósito: o DTO estrito recusa `id`, `name` ou `kind` e o tipo privado não vaza nem por engano. `removed` só vai ao mestre.

## Leitura

- `mapRegionDto` `{ id, name, description, geometry, color (hexColorDto), icon (mapPinIconDto), hidden, link (mapRegionLinkDto) }`. `MAP_PIN_ICONS` lista os ícones de pino (`pin` é o marcador simples); polígono carrega o campo e o ignora.
- `libraryMapSummaryDto` `{ id, name, folderId | null, visibility, isMain, asset, version, updatedAt }`: a linha da biblioteca, sem regiões. `campaignLibraryDto` leva `maps` (estes resumos) e `mainMapId` (uuid | null), os dois obrigatórios.
- `libraryMapDetailDto`: o resumo + `regions` (até 300), resposta do `GET …/library-maps/:mapId`.
- `mainMapResponseDto` `{ map: resumo | null }`, do `GET …/library-maps/main` (`null` = mesa sem Principal).
- `mapAppearanceDto` `{ mapId, mapName, regionId, regionName }` e `mapAppearancesResponseDto` `{ appearances }`, do "Aparece em" de um documento.

## Corpos e params

- `createLibraryMapRequestDto` `{ name, assetId, folderId?, visibility? }`: `isMain` é recusado, ser Principal tem rota própria.
- `updateLibraryMapRequestDto` `{ name?, folderId? (null = raiz), visibility? }`, ao menos uma chave. Sem `assetId`: a imagem de um mapa não troca depois de criado.
- `createMapRegionRequestDto` `{ name, geometry, color, description = '', icon = 'pin', hidden = false, link = null }`. Tipos `CreateMapRegionRequestDto` (saída) e `CreateMapRegionRequestInput` (entrada).
- `updateMapRegionRequestDto`: as mesmas chaves, todas opcionais e sem padrão (ausente mantém), ao menos uma; `link: null` tira o link.
- `libraryMapParamsDto` `{ campaignId, mapId }` e `mapRegionParamsDto` `{ campaignId, mapId, regionId }`. O "Aparece em" usa o `documentParamsDto`.

Todos estritos: `userId`, `campaignId` ou qualquer campo a mais no corpo é recusado.

## Eventos

`LIBRARY_MAP_EVENTS` traz os nomes; `LibraryMapServerEvents` entra no `LibraryServerEvents`.

- `libraryMapChangedDto` `{ campaignId, mapId, version, at }` (`library:mapChanged`): só avisa, e cada cliente relê pela rota. Nome ou geometria no evento são recusados, porque a região oculta nunca passa pelo socket.
- `libraryMapRegionShownDto` `{ eventId, campaignId, mapId, regionId, at }` (`library:mapRegionShown`): o mestre mostrou uma região a quem está na sala. Efêmero, sem versão.

Specs: `packages/contracts/test/library/library-map.dto.spec.ts` e `library-map-events.spec.ts`.
