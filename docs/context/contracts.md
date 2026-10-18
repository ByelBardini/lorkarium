# Contracts

DTOs em Zod 4 do que atravessa client ↔ server (corpo HTTP, resposta, payload Socket.IO). Vive em `packages/contracts/src/`, exportado por `@lorkarium/contracts` (`src/index.ts` reexporta tudo). Única dependência: `zod`.

## Estrutura

- `src/auth/` — login e usuário autenticado
- `src/http/` — formas transversais da API HTTP (erro)
- `src/campaigns/` — mesa (campanha): resumo, detalhe, criação e entrada por código
- `src/sessions/` — sessão ao vivo da mesa (Socket.IO): comandos, eventos e acks
- `src/assets/` — imagem enviada à mesa (arquivo ou link) e a leitura dela
- `test/<área>/` — specs só de DTO com regra própria (`transform`, `pipe`, `refine`)

## DTOs

- `loginRequestDto` (`auth/login.dto.ts`) — corpo de `POST /api/auth/login`: `{ email, password, rememberMe }`. E-mail com `trim` + minúsculas antes de validar; senha de 1 a `PASSWORD_MAX_LENGTH` (256); `rememberMe` padrão `false`. Tipos: `LoginRequestDto` (saída) e `LoginRequestInput` (entrada, `rememberMe` opcional).
- `userRoleDto` / `UserRoleDto` (`auth/auth-user.dto.ts`) — papel **global** da conta: `'user' | 'admin'`. Mestre/jogador/espectador não são papel de conta (são por campanha).
- `authUserDto` / `AuthUserDto` — `{ id (uuid), name, email, role }`; nunca leva hash de senha.
- `loginResponseDto` — `{ user: AuthUserDto }`.
- `meResponseDto` — `{ user: AuthUserDto | null }` (`null` = visitante anônimo).
- `apiErrorDto` / `ApiErrorDto` (`http/api-error.dto.ts`) — corpo de todo erro da API: `{ code, message, retryAfterSeconds? }`.
- `healthResponseDto` / `HealthResponseDto` (`http/health.dto.ts`) — corpo do 200 de `GET /api/health`: `{ status: 'ok' }`.

### Mesas (`campaigns/`)

- `campaignRoleDto` (`'master' | 'player'`, papel **por mesa**) e `campaignVisibilityDto` (`'public' | 'private'`) em `campaign.dto.ts`.
- `campaignSummaryDto` — linha da lista: `{ id, name, system | null, status | null, description | null, visibility, myRole, masterName, memberCount, lastEnteredAt (ISO | null) }`.
- `campaignDetailDto` — resumo + `members: { name, role }[]` + `joinCode | null` (só o mestre recebe) + `hasPassword`. Nunca leva senha nem hash.
- `listCampaignsResponseDto` `{ campaigns }`, `campaignResponseDto` `{ campaign: detalhe }`, `campaignIdParamsDto` `{ campaignId: uuid }`.
- `createCampaignRequestDto` (`create-campaign.dto.ts`) — corpo de `POST /api/campaigns`: `name` aparado, 1 a `CAMPAIGN_NAME_MAX_LENGTH` (80); `system`/`status` até `CAMPAIGN_LABEL_MAX_LENGTH` (40) e `description` até `CAMPAIGN_DESCRIPTION_MAX_LENGTH` (500), aparados, vazio/só espaço/ausente → `null`; `visibility` padrão `private`; `password` opcional de `CAMPAIGN_PASSWORD_MIN_LENGTH` (4) a `CAMPAIGN_PASSWORD_MAX_LENGTH` (128), `''` vale como ausente. Tipos `CreateCampaignRequestDto` (saída) e `CreateCampaignRequestInput` (entrada).
- `join-campaign.dto.ts` — `CAMPAIGN_CODE_ALPHABET` (`23456789ABCDEFGHJKLMNPQRSTUVWXYZ`, sem 0/O/1/I) e `CAMPAIGN_CODE_LENGTH` (8); `campaignCodeDto` tira espaços e hífens e põe em caixa alta antes de validar (`' vhrn-7k2q '` → `'VHRN7K2Q'`); `joinCampaignRequestDto` `{ code, password? }` (senha de 1 a 128: a regra de tamanho mínimo é da criação); `joinCampaignResponseDto` `{ campaign: resumo }`.

### Assets (`assets/`)

`asset.dto.ts` — a imagem da mesa (detalhe em [`assets.md`](assets.md)).

- `ASSET_MAX_BYTES` (20 MiB, antes de decodificar), `ASSET_MIME_TYPES` (`image/png`, `image/jpeg`, `image/webp`; GIF e SVG fora) e `assetMimeTypeDto`; `ASSET_URL_MAX_LENGTH` (2048).
- `assetPurposeDto` (`background` | `token`) e `ASSET_MAX_SIDE` (`{ background: 4096, token: 1024 }`, o maior lado em px que o server guarda). O `purpose` só decide o tamanho: um asset de token pode virar fundo.
- `assetDto` `{ id, mimeType, width, height }` (o tamanho **depois** de normalizado) e `assetResponseDto` `{ asset }` — resposta dos dois `POST`.
- `uploadAssetQueryDto` `{ purpose }` — query de `POST /api/campaigns/:campaignId/assets` (o corpo é o próprio arquivo).
- `importAssetRequestDto` `{ url, purpose }` — corpo do `POST …/assets/import`: `url` aparada, até 2048 caracteres, só `http:`/`https:` (`ftp:`, `data:`, `javascript:` recusados citando o esquema e "http or https"; texto que não é link, citando o texto). Sem o global `URL` (o `lib` do contracts é só ES2023): o esquema sai por regex.
- `assetIdParamsDto` `{ assetId: uuid }` — params de `GET /api/assets/:assetId`.

### Sessão ao vivo (`sessions/`)

`session.dto.ts` — a mesa é a sessão (detalhe em [`sessions.md`](sessions.md)).

- `REALTIME_PATH` = `'/api/socket.io'` (o `path` do Socket.IO nas duas pontas) e `SESSION_EVENTS` (`session:join`, `session:leave`, `session:memberJoined`, `session:memberLeft`).
- `sessionCommandDto` — payload de `session:join` e `session:leave`: `{ actionId (uuid), campaignId (uuid) }`, estrito (um `userId` ou `role` forjado é recusado: a identidade vem da conexão, §7.3).
- `sessionMemberDto` `{ userId, name, role (campaignRoleDto), online }`.
- `sessionStateDto` `{ campaignId, version (inteiro ≥ 0), members, at (ISO) }` — o `session:state` do §7.2 **não** é um evento: chega como ack do `session:join`.
- `sessionMemberJoinedDto` `{ campaignId, version, member (com online: true), at }` e `sessionMemberLeftDto` `{ campaignId, version, userId, at }`.
- `sessionJoinAckDto` (`{ ok: true, state }` | `{ ok: false, error: ApiErrorDto }`) e `sessionLeaveAckDto` (`{ ok: true }` | a mesma falha), uniões discriminadas por `ok`.
- `MAX_OPEN_TABLES` = `5` — mesas abertas ao mesmo tempo por conexão: o server recusa a 6ª (`TOO_MANY_TABLES`) e o client avisa antes de pedir.
- `SessionClientEvents` / `SessionServerEvents` — mapas de tipo para os genéricos do Socket.IO no server e no client.

### Tempo real comum (`http/realtime-ack.dto.ts`)

- `stateVersionDto` (inteiro ≥ 0) e `realtimeAckFailureDto` (`{ ok: false, error: ApiErrorDto }`): a versão e a falha de ack que sessão e tabuleiro compartilham.

### Tabuleiro (`board/`)

Detalhe do fluxo em [`board.md`](board.md).

- `scene.dto.ts` — `sceneGridDto` (só os campos do grid, o que o formulário do client valida); `sceneBackgroundDto` `{ assetId, width, height }` (os px da imagem: o client tira a proporção deles); `sceneDto` `{ id, name, widthCells, heightCells, cellDistance, cellUnit, gridVisible, gridOpacity, background | null }`; `configureSceneCommandDto` `{ actionId, campaignId, …grid, backgroundAssetId? }` (estrito; `backgroundAssetId`: um asset da mesa põe o fundo, `null` tira, ausente mantém). Limites: casas de `SCENE_CELLS_MIN` (1) a `SCENE_CELLS_MAX` (100), inteiras; `cellDistance` > 0 e ≤ `CELL_DISTANCE_MAX` (9999); `cellUnit` aparado, 1 a `CELL_UNIT_MAX_LENGTH` (8); `gridOpacity` inteiro de 0 a `GRID_OPACITY_MAX` (100). `SceneGridDto` = só os campos do grid.
- `board-event.dto.ts` — `boardCommandShape` (`actionId`, `campaignId`) e `boardEventShape` (`campaignId`, `version`, `at`): os campos de todo comando e todo evento do tabuleiro.
- `token.dto.ts` — `MAX_BARS_PER_TOKEN` (8), `BAR_VALUE_LIMIT` (99 999), `TOKEN_NAME_MAX_LENGTH` (60), `TOKEN_INITIALS_MAX_LENGTH` (3), `BAR_LABEL_MAX_LENGTH` (24), `TOKEN_SIZE_MAX` (4); `tokenSideDto` (`ally` | `enemy` | `neutral`), `barColorDto` (`gold` | `steel` | `ember` | `moss` | `ash`, nunca hex), `barVisibilityDto` (`everyone` | `controllers`); `barInputDto` `{ label (aparado, 1–24), current (±99 999), max (1–99 999), color, visibility }` e `tokenBarDto` (+ `id`, `position` 0–7: a 0 é a que aparece no token); `tokenDto` `{ id, name (aparado), initials (1–3), side, size (1–4), col, row, layer, controllerIds, canControl, bars }` — redigido: a barra `controllers` simplesmente não vem, e as outras guardam a `position`; comandos `createTokenCommandDto` (+ `col`, `row`, `bars`, `layer` com padrão `tokens`: no client o `NewToken` é o tipo de entrada, com `layer` opcional), `updateTokenCommandDto` (`tokenId` + campos + `bars`, sem posição), `moveTokenCommandDto` `{ tokenId, col, row }`, `adjustBarCommandDto` `{ tokenId, barId, change }` com `barChangeDto` (`{ op: 'add', amount }` | `{ op: 'set', value }`, inteiros) e `deleteTokenCommandDto`; eventos `tokenCreatedDto`/`tokenUpdatedDto` `{ …, token }`, `tokenMovedDto` `{ …, tokenId, col, row }` e `tokenDeletedDto` `{ …, tokenId }`. A prévia do arraste (de um token também) é o `dragTokensCommandDto` / `tokensDraggedDto` do `token-group.dto.ts`. `canControl` num comando é recusado (estrito).
- `token.dto.ts`, aparência e direção — `tokenFrameDto` (`square` | `round`), `FACING_MAX` (359) e `facingDto` (inteiro de 0 a 359; recusa citando o valor e "0 to 359"; a regra é a do `facing` do game-core, reescrita aqui porque o contracts só depende do `zod`). O `tokenDto` leva `imageAssetId | null`, `frame`, `flipX`, `flipY` e `facing`, iguais para todo público (não é segredo). O `createTokenCommandDto` (e o `newTokenDto`) os aceita com padrão `null`, `square`, `false`, `false`, `0` (a colagem manda os copiados); o `updateTokenCommandDto` aceita os quatro de aparência **opcionais** (ausente mantém) e nunca o `facing` (a direção só muda pelo `token:faceMany`).
- `token-appearance.dto.ts` — `faceTokensCommandDto` `{ faces: { tokenId, facing, expect?: { facing } }[] }` (`token:faceMany`, sobre o `tokenGroupOf`; o `expect` é a precondição do desfazer) e o evento `tokensFacedDto` `{ …boardEventShape, faces: { tokenId, facing }[] }` (`token:facedMany`); `tokenStyleDto` `{ imageAssetId?: uuid | null, frame?, flipX?, flipY? }` (parcial; vazio é recusado com "style is empty"; `imageAssetId: null` tira a imagem), `restyleTokensCommandDto` `{ tokenIds, style }` (`token:restyleMany`) e o evento `tokensRestyledDto` `{ …boardEventShape, tokenIds, style }` (`token:restyledMany`). Os dois eventos vão iguais à mesa toda.
- `token.dto.ts` também exporta `tokenLayerDto` (`tokens` | `objects` | `background`; a ordem do enum é a ordem de desenho, de cima para baixo) e as peças `cellIndexDto` / `draggedCellDto` que os DTOs de grupo reaproveitam.
- `token-id-group.dto.ts` — `TOKEN_GROUP_MAX` (64), `idGroupOf(item, idOf, noun)` (lista de 1 a 64 itens com **ids distintos**: o `superRefine` recusa citando o `noun` e o id repetido; vale para token e desenho), `tokenGroupOf(item, idOf)` (o mesmo com `noun = 'token'`), `strayExpectation(alvos, esperados)` (o id de uma precondição que não está entre os alvos) e `tokenIdGroupDto` (1 a 64 ids distintos). Arquivo próprio para o `condition.dto.ts` usar sem ciclo (`token.dto` → `condition.dto`).
- `condition.dto.ts` (ícone) — `CONDITION_ICONS` (28 chaves, os nomes do lucide: `skull`, `eye-off`, `flask-conical`…) e `conditionIconDto` (`z.enum` fechado, nenhum texto livre vira SVG); `icon` é obrigatório em `conditionDefinitionDto`, `activeConditionDto` e `defineConditionCommandDto`.
- `condition.dto.ts` (grupo) — `applyConditionsCommandDto` `{ tokenIds: tokenIdGroupDto, conditionId, rounds (0–99) }` (`condition:applyMany`) e o evento `conditionsAppliedDto` `{ …boardEventShape, applied: { tokenId, condition }[] }` (`condition:appliedMany`, `TokenConditionDto` cada).
- `token-group.dto.ts` — comandos de vários tokens, todos sobre o `tokenGroupOf`. `moveTokensCommandDto` `{ moves: { tokenId, col, row }[] }` (`token:moveMany`, tudo ou nada, uma versão), `dragTokensCommandDto` `{ drags: { tokenId, cell | null }[] }` (`token:dragMany`, prévia do grupo), `setTokenLayerCommandDto` `{ tokenIds, layer }` (`token:setLayer`, mestre); eventos `tokensMovedDto` `{ …boardEventShape, moves }` (`token:movedMany`), `tokenLayerChangedDto` `{ …boardEventShape, tokenIds, layer }` (`token:layerChanged`, igual para a mesa toda) e `tokensDraggedDto` `{ campaignId, at, drags }` (`token:draggedMany`, **sem `version`**: é prévia, não mudança confirmada).
- `token-group.dto.ts`, lote e precondição do desfazer — `newTokenDto` (o corpo do `token:create` sem `actionId`/`campaignId`; `NewTokenInput` com `layer` opcional), `createTokensCommandDto` `{ tokens: 1–64 }` (`token:createMany`, mestre, colar), `deleteTokensCommandDto` `{ tokenIds, expect?: { tokenId, col, row }[] }` (`token:deleteMany`; `expect` de um id fora do `tokenIds` é recusado citando o id), e `expect?: { col, row }` em cada item do `moveTokensCommandDto` (`TokenMoveDto`). Eventos `tokensCreatedDto` `{ …boardEventShape, tokens }` (`token:createdMany`, por público) e `tokensDeletedDto` `{ …boardEventShape, tokenIds, combat | null }` (`token:deletedMany`). O `tokensMovedDto` não leva `expect`.
- **Precondição (`expect`).** Opcional nos comandos de mover e apagar (token e desenho). O comando normal não manda; o inverso do desfazer manda sempre. O server confere dentro da transação que trava a cena: diferente do gravado → `STALE_UNDO` ("o estado mudou desde a ação desfeita"). O `code` do `apiErrorDto` é string livre: os códigos não são enum no contrato.
- `drawing.dto.ts` — o desenho (detalhe em [`drawings.md`](drawings.md)). Limites: `DRAWING_POINTS_MAX` (2000 pontos por mão livre), `DRAWINGS_PER_SCENE_MAX` (500, conferido no server), até `TOKEN_GROUP_MAX` desenhos por comando. `drawingColorDto` (8: `gold`, `steel`, `ember`, `moss`, `ash`, `ink`, `bone`, `violet`; nunca hex), `strokeWidthDto` (`thin` | `medium` | `thick`), `fixedShapeKindDto` (`rectangle` | `ellipse` | `triangle`). `drawingShapeDto` é união por `kind`: `freehand` `{ x, y, width ≥ 0, height ≥ 0, points: [x, y][] }` (pontos relativos a `(x, y)`, de 2 a 2000, cada um dentro da caixa com 0,01 de folga; recusa citando a contagem ou o ponto) ou forma fixa `{ kind, x, y, width > 0, height > 0, fill: cor | null (padrão null) }`; as duas com `layer`, `stroke`, `strokeWidth`. **Preenchimento só em forma fixa**: `fill` na mão livre é recusado (estrito). Coordenadas em casas fracionárias de 0 a `SCENE_CELLS_MAX`. `drawingDto` = forma + `id` + `authorId | null`. Comandos `createDrawingsCommandDto` `{ drawings }` (`drawing:createMany`), `moveDrawingsCommandDto` `{ moves: { drawingId, x, y, expect?: { x, y } }[] }` (`drawing:moveMany`, ids distintos), `deleteDrawingsCommandDto` `{ drawingIds, expect?: { drawingId, x, y }[] }` (`drawing:deleteMany`); eventos `drawingsCreatedDto` `{ drawings }`, `drawingsMovedDto` `{ moves: { drawingId, x, y }[] }`, `drawingsDeletedDto` `{ drawingIds }`. `authorId` num comando é recusado (estrito, §7.3).
- `board.dto.ts` — `BOARD_EVENTS` (`board:sync`, `scene:configure`, `scene:updated`, `token:create|createMany|update|move|moveMany|dragMany|setLayer|faceMany|restyleMany|adjustBar|delete|deleteMany`, `token:created|createdMany|updated|moved|movedMany|draggedMany|layerChanged|facedMany|restyledMany|deleted|deletedMany`, `drawing:createMany|moveMany|deleteMany`, `drawing:createdMany|movedMany|deletedMany`); `boardCommandDto` `{ actionId, campaignId }` (base de todo comando e payload do `board:sync`); `boardStateDto` `{ campaignId, version, at, viewer: { userId, role }, scene, tokens: TokenDto[], drawings: DrawingDto[], combat, conditionDefinitions }` (snapshot já redigido para quem pede); `boardSyncAckDto` (`{ ok: true, state }` | falha); `boardCommandAckDto` (`{ ok: true, version, createdIds? }` | falha; `createdIds` só no ack de `token:createMany` e `drawing:createMany`: os ids que o server deu, na ordem enviada — o desfazer de quem criou precisa deles); `sceneUpdatedDto` `{ campaignId, version, at, scene }`; `BoardClientEvents` / `BoardServerEvents` e `TableClientEvents` / `TableServerEvents` (sessão + tabuleiro, os genéricos do Socket.IO).

## Regras de arquitetura

- Todo objeto é `z.strictObject`: campo extra é recusado (um `role` ou `userId` forjado no corpo não passa).
- O mesmo DTO valida nas duas pontas: o server na borda, o client antes de enviar e ao ler a resposta. Regra de formulário não é reescrita no client.
- Só ganha spec o DTO com regra própria (`transform`, `pipe`, `refine`, limite que é decisão do projeto); `z.string()` puro não se testa.

## Armadilhas

- `.extend()` num `z.strictObject` com `superRefine` lança no Zod 4: o `drawingDto` monta o objeto inteiro de novo a partir das mesmas peças (`freehandShape`, `fixedShape`) em vez de estender o `drawingShapeDto`. Builder genérico `<Extra extends z.ZodRawShape>` perde a inferência no `superRefine` (`unknown`); use as peças concretas.

- `z.string().trim().toLowerCase().pipe(z.email())`: a normalização vem **antes** do `pipe`; com `z.email()` direto, `' Ana@x.com'` é recusado em vez de normalizado.
