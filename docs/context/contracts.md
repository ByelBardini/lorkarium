# Contracts

DTOs em Zod 4 do que atravessa client ↔ server (corpo HTTP, resposta, payload Socket.IO). Vive em `packages/contracts/src/`, exportado por `@lorkarium/contracts` (`src/index.ts` reexporta tudo). Única dependência: `zod`.

## Estrutura

- `src/auth/` — login e usuário autenticado
- `src/account/` — perfil (@, apelido, cor, bio), foto, senha, e-mail, sessões e 2FA
- `src/http/` — formas transversais da API HTTP (erro)
- `src/campaigns/` — mesa (campanha): resumo, detalhe, criação e entrada por código
- `src/sessions/` — sessão ao vivo da mesa (Socket.IO): comandos, eventos e acks
- `src/assets/` — imagem enviada à mesa (arquivo ou link) e a leitura dela
- `src/library/` — biblioteca de grids: grids e pastas da mesa por REST, `library:changed`
- `test/<área>/` — specs só de DTO com regra própria (`transform`, `pipe`, `refine`)

## DTOs

- `loginRequestDto` (`auth/login.dto.ts`) — corpo de `POST /api/auth/login`: `{ email, password, rememberMe }`. E-mail com `trim` + minúsculas antes de validar; senha de 1 a `PASSWORD_MAX_LENGTH` (256); `rememberMe` padrão `false`. Tipos: `LoginRequestDto` (saída) e `LoginRequestInput` (entrada, `rememberMe` opcional).
- `userRoleDto` / `UserRoleDto` (`auth/auth-user.dto.ts`) — papel **global** da conta: `'user' | 'admin'`. Mestre/jogador/espectador não são papel de conta (são por campanha).
- `authUserDto` / `AuthUserDto` — `{ id (uuid), username (o @), name (o apelido), email, role, color (`memberColorDto`, a efetiva), avatarId (uuid | null) }`; nunca leva hash de senha.
- `loginResponseDto` (`login.dto.ts`) — união discriminada por `status`, estrita: `{ status: 'signed-in', user }` | `{ status: 'two-factor-required' }` (sem `user`: a sessão só nasce depois do código). Responde também `POST /api/auth/login/two-factor`.
- `twoFactorLoginRequestDto` — corpo da 2ª etapa: exatamente um entre `{ code }` (`totpCodeDto`) e `{ recoveryCode }` (`recoveryCodeDto`); os dois juntos ou nenhum são recusados.
- `meResponseDto` — `{ user: AuthUserDto | null }` (`null` = visitante anônimo).
- `apiErrorDto` / `ApiErrorDto` (`http/api-error.dto.ts`) — corpo de todo erro da API: `{ code, message, retryAfterSeconds? }`.
- `healthResponseDto` / `HealthResponseDto` (`http/health.dto.ts`) — corpo do 200 de `GET /api/health`: `{ status: 'ok' }`.

### Mesas (`campaigns/`)

- `campaignRoleDto` (`'master' | 'player'`, papel **por mesa**) e `campaignVisibilityDto` (`'public' | 'private'`) em `campaign.dto.ts`.
- `campaignSummaryDto` — linha da lista: `{ id, name, system | null, status | null, description | null, visibility, myRole, masterName, memberCount, lastEnteredAt (ISO | null) }`.
- `campaignDetailDto` — resumo + `members: { userId, name, role, color, avatarId | null }[]` (`campaignMemberDto`) + `joinCode | null` (só o mestre recebe) + `hasPassword`. Nunca leva senha nem hash.
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

- `realtime-limits.ts` — `REALTIME_MESSAGE_MAX_BYTES` (5 MiB: o `maxHttpBufferSize` do server, medido pelo maior comando válido, o `drawing:createMany` de 64 traços de 2000 pontos em precisão total, ≈ 4,8 MB — `test/realtime-limits.spec.ts`; o padrão de 1 MB do Socket.IO derrubava a conexão) e `REALTIME_COMPRESSION_THRESHOLD_BYTES` (4096: daí para cima a mensagem vai comprimida).
- `REALTIME_PATH` = `'/api/socket.io'` (o `path` do Socket.IO nas duas pontas) e `SESSION_EVENTS` (`session:join`, `session:leave`, `session:memberJoined`, `session:memberLeft`, `session:setActivity`, `session:memberActivity`, `session:memberUpdated`).
- `sessionCommandDto` — payload de `session:join` e `session:leave`: `{ actionId (uuid), campaignId (uuid) }`, estrito (um `userId` ou `role` forjado é recusado: a identidade vem da conexão, §7.3).
- `sessionMemberDto` `{ userId, name (apelido), username, color (efetiva), avatarId | null, bio | null, role (campaignRoleDto), online, awaySince (ISO | null: desde quando todas as abas dele estão paradas) }`.
- `sessionStateDto` `{ campaignId, version (inteiro ≥ 0), members, at (ISO) }` — o `session:state` do §7.2 **não** é um evento: chega como ack do `session:join`.
- `sessionMemberJoinedDto` `{ campaignId, version, member (com online: true e awaySince: null), at }` e `sessionMemberLeftDto` `{ campaignId, version, userId, at }`.
- `sessionJoinAckDto` (`{ ok: true, state }` | `{ ok: false, error: ApiErrorDto }`) e `sessionLeaveAckDto` (`{ ok: true }` | a mesma falha), uniões discriminadas por `ok`.
- `sessionMemberUpdatedDto` `{ campaignId, version, member (o `sessionMemberDto` inteiro, relido), at }` — `session:memberUpdated`, quando a pessoa salva apelido, cor, bio ou foto.
- Ausência: `sessionActivityCommandDto` `{ actionId, campaignId, away }` (`session:setActivity`, estrito: `userId` forjado é recusado), `sessionActivityAckDto` (= o do `leave`: `{ ok: true }` | falha) e o evento `sessionMemberActivityDto` `{ campaignId, version, userId, awaySince (ISO | null), at }` (`session:memberActivity`).
- `MAX_OPEN_TABLES` = `5` — mesas abertas ao mesmo tempo por conexão: o server recusa a 6ª (`TOO_MANY_TABLES`) e o client avisa antes de pedir.
- `SessionClientEvents` / `SessionServerEvents` — mapas de tipo para os genéricos do Socket.IO no server e no client.

### Biblioteca (`library/`)

`library.dto.ts` — os grids e as pastas da mesa por REST (detalhe e rotas em [`library.md`](library.md)).

- Limites e textos: `SCENE_NAME_MAX_LENGTH` (60), `SCENE_FOLDER_NAME_MAX_LENGTH` (40), `SCENE_FOLDER_DEPTH_MAX` (5), `UNNAMED_SCENE_NAME` (`'Grid sem nome'`), `SCENE_COPY_SUFFIX` (`' (cópia)'`).
- `sceneVisibilityDto` (`private` | `public`), `sceneFolderDto` `{ id, name, parentId | null }`, `librarySceneDto` `{ id, name, folderId | null, visibility, widthCells, heightCells, background | null, tokenCount (null para o jogador), updatedAt (ISO) }` e `libraryDto` `{ activeSceneId | null, folders, scenes }` (resposta do `GET …/scenes`).
- Corpos: `createLibrarySceneRequestDto` `{ name?, folderId? }`, `updateLibrarySceneRequestDto` `{ name?, folderId? (null = raiz), visibility? }` (ao menos uma chave), `createSceneFolderRequestDto` `{ name, parentId? }` e `updateSceneFolderRequestDto` `{ name?, parentId? (null = raiz) }` (ao menos uma chave). Nomes aparados, de 1 ao limite; estritos (um `campaignId` no corpo é recusado: a mesa vem da URL).
- Params: `librarySceneParamsDto` `{ campaignId, sceneId }` e `sceneFolderParamsDto` `{ campaignId, folderId }` (a borda usa o `shape` de cada campo).
- Evento `libraryChangedDto` `{ campaignId, at }` (`library:changed`, sem dado de grid) e o mapa `LibraryServerEvents`, que entra no `TableServerEvents`.
- Ativação e expulsão: `sceneActivatedDto` `{ campaignId, sceneId, previousSceneId | null, at }` (`scene:activated`, à mesa), `sceneClosedReasonDto` (`private` | `deleted`) e `sceneClosedDto` `{ campaignId, sceneId, reason, at }` (`scene:closed`, a cada socket tirado do grid); os dois entram no `LibraryServerEvents`.

### Conta (`account/`)

`usernameDto`, `memberColorDto`, perfil, foto, senha, e-mail, sessões ativas e 2FA: detalhe em [`contracts/conta.md`](contracts/conta.md).

### Tempo real comum (`http/realtime-ack.dto.ts`)

- `stateVersionDto` (inteiro ≥ 0) e `realtimeAckFailureDto` (`{ ok: false, error: ApiErrorDto }`): a versão e a falha de ack que sessão e tabuleiro compartilham.

### Tabuleiro (`board/`)

O detalhe dos DTOs do tabuleiro (cena, token, direção e abertura do cone, aparência, grupo, condição, combate, desenho, área de efeito, parede, luz, `BOARD_EVENTS` e o snapshot) mora em [`contracts/tabuleiro.md`](contracts/tabuleiro.md). Fluxo em [`board.md`](board.md). O ping efêmero (`board:ping` / `board:pinged`, sem versão) mora em [`contracts/ping.md`](contracts/ping.md).

## Regras de arquitetura

- Todo objeto é `z.strictObject`: campo extra é recusado (um `role` ou `userId` forjado no corpo não passa).
- O mesmo DTO valida nas duas pontas: o server na borda, o client antes de enviar e ao ler a resposta. Regra de formulário não é reescrita no client.
- Só ganha spec o DTO com regra própria (`transform`, `pipe`, `refine`, limite que é decisão do projeto); `z.string()` puro não se testa.

## Armadilhas

- `.extend()` num `z.strictObject` com `superRefine` lança no Zod 4: o `drawingDto` monta o objeto inteiro de novo a partir das mesmas peças (`freehandShape`, `fixedShape`) em vez de estender o `drawingShapeDto`. Builder genérico `<Extra extends z.ZodRawShape>` perde a inferência no `superRefine` (`unknown`); use as peças concretas.

- `z.string().trim().toLowerCase().pipe(z.email())`: a normalização vem **antes** do `pipe`; com `z.email()` direto, `' Ana@x.com'` é recusado em vez de normalizado.
