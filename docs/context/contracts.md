# Contracts

DTOs em Zod 4 do que atravessa client ↔ server (corpo HTTP, resposta, payload Socket.IO). Vive em `packages/contracts/src/`, exportado por `@lorkarium/contracts` (`src/index.ts` reexporta tudo). Única dependência: `zod`.

## Estrutura

- `src/auth/` — login e usuário autenticado
- `src/account/` — perfil (@, apelido, cor, bio), foto, senha, e-mail, sessões, 2FA e cores salvas
- `src/color/` — `hex-color.dto.ts`: `hexColorDto` (`#rrggbb` opaco e minúsculo, tipo `` `#${string}` ``), `paletteOrHexDto(paleta)` e `isHexColor`. Cor personalizada só entra por aqui: a regex é o que impede injeção em `style` inline e SVG
- `src/http/` — formas transversais da API HTTP (erro)
- `src/campaigns/` — mesa (campanha): resumo, detalhe, criação e entrada por código
- `src/sessions/` — sessão ao vivo da mesa (Socket.IO): comandos, eventos e acks
- `src/assets/` — imagem enviada à mesa (arquivo ou link) e a leitura dela
- `src/library/` — biblioteca de grids: grids e pastas da mesa por REST, `library:changed`
- `src/documents/` — documentos da biblioteca: conteúdo rico fechado, comandos versionados, resumos e imagens; [contratos](documents/contratos.md).
- `src/dice/` — rolagem de dados (Socket.IO): comando, ack e eventos com o trajeto 3D; rolagens salvas (REST)
- `src/chat/` — chat da mesa (Socket.IO): `chat:send`, ack e `chat:sent`, sem versão
- `src/plans/` — planos da conta: `USER_PLANS`, recursos do `PLAN_LIMIT`, a grade `PLAN_LIMITS` e `planLimitsDto`; [contratos](contracts/planos.md)
- `src/sheets/` — fichas personalizadas: modelo (código do mestre), ficha na biblioteca (nome, pasta, dono opcional: token ou jogador), valores com orçamento, `sheet:changed`, `sheet:adjustBar` e a ponte frame ↔ host; [contratos](sheets/contratos.md). `src/utf8-length.ts` conta bytes UTF-8 sem `TextEncoder`
- `test/<área>/` — specs só de DTO com regra própria (`transform`, `pipe`, `refine`)

## DTOs

- `loginRequestDto` (`auth/login.dto.ts`) — corpo de `POST /api/auth/login`: `{ identifier, password, rememberMe }` (estrito: o antigo `email` é recusado). `identifier` = `loginIdentifierDto`: `trim` + minúsculas, depois e-mail (`z.email()`) **ou** o @ pelo `usernameDto`, com o "@" da frente tirado (`@Bia` → `bia`); na saída, "@" só sobra dentro de e-mail — é por ele que o server escolhe a busca. Idempotente (o client manda o que parseou). Senha de 1 a `PASSWORD_MAX_LENGTH` (256); `rememberMe` padrão `false`. Tipos: `LoginRequestDto` (saída) e `LoginRequestInput` (entrada, `rememberMe` opcional).
- `userRoleDto` / `UserRoleDto` (`auth/auth-user.dto.ts`) — papel **global** da conta: `'user' | 'admin'`. Mestre/jogador/espectador não são papel de conta (são por campanha).
- `authUserDto` / `AuthUserDto` — `{ id (uuid), username (o @), name (o apelido), email, role, color (`memberColorDto`, a efetiva), avatarId (uuid | null), plan, lorkariumOwner (o Dono do Lorkarium, `OWNER_USERNAME`), limits (`planLimitsDto`, efetivos), customization }`; nunca leva hash de senha. `accountPlanDto` em [`contracts/planos.md`](contracts/planos.md).
- `loginResponseDto` (`login.dto.ts`) — união discriminada por `status`, estrita: `{ status: 'signed-in', user }` | `{ status: 'two-factor-required' }` (sem `user`: a sessão só nasce depois do código). Responde também `POST /api/auth/login/two-factor`.
- `twoFactorLoginRequestDto` — corpo da 2ª etapa: exatamente um entre `{ code }` (`totpCodeDto`) e `{ recoveryCode }` (`recoveryCodeDto`); os dois juntos ou nenhum são recusados.
- `meResponseDto` — `{ user: AuthUserDto | null }` (`null` = visitante anônimo).
- `apiErrorDto` / `ApiErrorDto` (`http/api-error.dto.ts`) — corpo de todo erro da API: `{ code, message, retryAfterSeconds?, invitationId? (ALREADY_INVITED), blockingCampaigns? (OWNS_SHARED_CAMPAIGNS), planLimit? (PLAN_LIMIT, ver [planos](contracts/planos.md)) }`.
- `healthResponseDto` / `HealthResponseDto` (`http/health.dto.ts`) — corpo do 200 de `GET /api/health`: `{ status: 'ok' }`.

### Mesas (`campaigns/`)

- `campaignRoleDto` (`'master' | 'player' | 'spectator'`, papel **por mesa**; o espectador só assiste — ver `docs/context/campaigns/papeis.md`), `campaignVisibilityDto` (`'public' | 'private'`), `campaignStatusDto` (`building` · `recruiting` · `ongoing` · `finished`; rótulo pt-BR e cor no client) e `contentWarningDto` (`adult` · `violence` · `horror` · `gore` · `strong-language` · `sensitive-themes`) com `contentWarningsDto` (sem repetir, na ordem) em `campaign.dto.ts`.
- `campaign-cover.dto.ts` — `campaignCoverDto`, união por `kind`: `{ kind: 'drawn', drawing: 0..2, tone: 1..4 | #rrggbb }` (`drawnCampaignCoverDto`; `campaignCoverToneDto` é o tom) | `{ kind: 'image', assetId }`. Os limites repetem `COVER_DRAWINGS`/`COVER_TONES` do game-core, onde mora `defaultCoverOf(id)` (a capa de quem nunca escolheu).
- `campaign-tags.dto.ts` — `CAMPAIGN_TAGS_MAX` (8), `CAMPAIGN_TAG_MAX_LENGTH` (24), `campaignTagKey(tag)` (sem acento, caixa nem espaço nas pontas: a identidade da tag, também usada pelo client), `uniqueCampaignTags` e `campaignTagsDto` (apara, tira repetidas mantendo a 1ª grafia, **depois** limita a 8).
- `campaignInfoDto` — a mesa sem o que depende de quem lê: `{ id, name, system | null, status, description | null, visibility, ownerId, masterName, memberCount, cover, contentWarnings, tags, playersCreateTokens, playersDeleteTokens, limits (`planLimitsDto`, os efetivos do dono) }` (`ownerId` é o criador, o dono fixo, e `masterName` é o dele; payload do `session:campaignUpdated`; as duas chaves abrem criar/editar e excluir os próprios tokens aos jogadores, regra no `token-rights` do game-core).
- `member-role.dto.ts`: `campaignMemberParamsDto { campaignId, userId }` e `updateMemberRoleRequestDto { role: 'master' | 'player' | 'spectator' }` (estritos; `master` só com poder de dono, regra no `assignableRolesOf` do game-core), de `PATCH /api/campaigns/:campaignId/members/:userId` (só mestre; a resposta é o `campaignMemberDto` puro, sem envelope; ver [`campaigns/papeis.md`](campaigns/papeis.md)).
- `campaignSummaryDto` — linha da lista: `campaignInfoDto` + `myRole` + `juggernaut` (quem lê é admin no modo juggernaut ali; então `myRole` é `master`) + `lastEnteredAt (ISO | null)`.
- `juggernaut.dto.ts`: `endJuggernautResponseDto { myRole: campaignRoleDto | null }`, resposta do `DELETE /api/campaigns/:campaignId/juggernaut` (`null` = não era membro e saiu da mesa); o `POST` responde o `campaignResponseDto`.
- `campaignDetailDto` — resumo + `members: { userId, name, role, color, avatarId | null, plan (gravado), admin, lorkariumOwner, online }[]` (`campaignMemberDto`) + `joinCode | null` (só o mestre recebe) + `hasPassword` + `createdAt` + `lastAccessAt` (a maior entrada de qualquer membro, `null` = ninguém entrou ainda; o client mostra "Último acesso"). Nunca leva senha nem hash.
- `listCampaignsResponseDto` `{ campaigns }`, `campaignResponseDto` `{ campaign: detalhe }` (também do `PATCH` e do `POST …/join-code`), `campaignIdParamsDto` `{ campaignId: uuid }`.
- `createCampaignRequestDto` (`create-campaign.dto.ts`) — corpo de `POST /api/campaigns`: `name` aparado, 1 a `CAMPAIGN_NAME_MAX_LENGTH` (80) (`campaignNameDto`); `system` até `CAMPAIGN_LABEL_MAX_LENGTH` (40) e `description` até `CAMPAIGN_DESCRIPTION_MAX_LENGTH` (500), aparados, vazio/só espaço/ausente → `null` (`optionalCampaignText`); `status` padrão `building`; `visibility` padrão `private`; `cover` opcional, **só `drawn`** (a imagem exige a mesa criada); `password` opcional de `CAMPAIGN_PASSWORD_MIN_LENGTH` (4) a `CAMPAIGN_PASSWORD_MAX_LENGTH` (128) (`campaignPasswordDto`), `''` vale como ausente. Tipos `CreateCampaignRequestDto` (saída) e `CreateCampaignRequestInput` (entrada).
- `updateCampaignRequestDto` (`update-campaign.dto.ts`) — corpo de `PATCH /api/campaigns/:campaignId` (só mestre): `name`, `system`, `status`, `description`, `visibility`, `contentWarnings`, `tags`, `cover`, `playersCreateTokens`, `playersDeleteTokens` (booleanos; `false` conta como campo) todos opcionais (`system`/`description`: ausente mantém, `null` ou só espaço limpa); `password`: ausente mantém, `null` tira, texto (4..128) troca. Corpo vazio é recusado; estrito.
- `join-campaign.dto.ts` — `CAMPAIGN_CODE_ALPHABET` (`23456789ABCDEFGHJKLMNPQRSTUVWXYZ`, sem 0/O/1/I) e `CAMPAIGN_CODE_LENGTH` (8); `campaignCodeDto` tira espaços e hífens e põe em caixa alta antes de validar (`' vhrn-7k2q '` → `'VHRN7K2Q'`); `joinCampaignRequestDto` `{ code, password? }` (senha de 1 a 128: a regra de tamanho mínimo é da criação); `joinCampaignResponseDto` `{ campaign: resumo }`.
- `public-campaign.dto.ts` — "Explorar mesas": `publicCampaignDto` (o `campaignInfoDto` sem `limits` + `myRole` nulo = não é membro + `hasPassword` + `masterUsername` (o @ que a busca casa inteiro) + `masterOnline` + `playersOnline` inteiro ≥ 0), `listPublicCampaignsResponseDto` `{ campaigns }` e `joinPublicCampaignRequestDto` `{ password? }` (entrar sem código; a resposta é o `joinCampaignResponseDto`).

### Assets (`assets/`)

`asset.dto.ts` — a imagem da mesa (detalhe em [`assets.md`](assets.md)).

- `ASSET_MAX_BYTES` (20 MiB, antes de decodificar), `ASSET_MIME_TYPES` (`image/png`, `image/jpeg`, `image/webp`, `image/gif`; o GIF só é guardado na finalidade `aura`, SVG fora) e `assetMimeTypeDto`; `ASSET_URL_MAX_LENGTH` (2048).
- `assetPurposeDto` (`background` | `token` | `cover` | `condition` | `aura` | `library_image` | `library_map` | `document_image` | `sheet_image`) e `ASSET_MAX_SIDE` (`{ background: 4096, token: 1024, cover: 1600, condition: 256, aura: 512, library_image: 4096, library_map: 8192, document_image: 4096, sheet_image: 4096 }`, o maior lado em px que o server guarda; o badge da condição chega a ~120 px na tela, 240 em tela 2x; o mapa é feito para dar zoom e é desenhado como imagem, não textura). O `purpose` decide o tamanho (na `condition`, que o server recorta em quadrado; na `aura`, que o GIF fica animado): um asset de token pode virar fundo; `library_image` e `library_map` são reservados à biblioteca e sua autorização de leitura depende do item/apresentação; `document_image` e `sheet_image` só entram pela rota do documento e da ficha.
- `AURA_ANIMATION_LIMITS` `{ maxFrames: 120, maxDecodedPixels: 16_000_000 }` — o orçamento do GIF da aura (o server reduz o lado para caber, ver `assets.md`).
- `assetDto` `{ id, mimeType, width, height }` (o tamanho **depois** de normalizado) e `assetResponseDto` `{ asset }` — resposta dos dois `POST`.
- `uploadAssetQueryDto` `{ purpose }` — query de `POST /api/campaigns/:campaignId/assets` (o corpo é o próprio arquivo).
- `importAssetRequestDto` `{ url, purpose }` — corpo do `POST …/assets/import`: `url` aparada, até 2048 caracteres, só `http:`/`https:` (`ftp:`, `data:`, `javascript:` recusados citando o esquema e "http or https"; texto que não é link, citando o texto). Sem o global `URL` (o `lib` do contracts é só ES2023): o esquema sai por regex.
- `assetIdParamsDto` `{ assetId: uuid }` — params de `GET /api/assets/:assetId` e de `GET /api/assets/:assetId/outline`.
- `sightOutlineDto` / `SightOutlineDto` — a silhueta de uma imagem de token: até 4 polígonos, cada um com ao menos 3 pontos `[x, y]` de 0 a 1, 48 vértices no total (acima disso, a mensagem cita a conta e o limite). Repete os limites de `sight-outline.vo.ts` do game-core, porque o contracts só depende do `zod`; `[]` = toda transparente. Tudo `readonly`, também na saída do `parse` (congelada), para casar com o tipo do PO e do VO.
- `assetOutlineResponseDto` / `AssetOutlineResponseDto` `{ outline: SightOutlineDto | null }` — resposta do `GET …/outline` (`null` = sem contorno; ver [`assets/contorno.md`](assets/contorno.md)).

### Sessão ao vivo (`sessions/`)

`session.dto.ts` — a mesa é a sessão (detalhe em [`sessions.md`](sessions.md)).

- `realtime-limits.ts` — `REALTIME_MESSAGE_MAX_BYTES` (5 MiB: o `maxHttpBufferSize` do server, medido pelo maior comando válido, o `drawing:createMany` de 64 traços de 2000 pontos em precisão total, ≈ 4,8 MB — `test/realtime-limits.spec.ts`; o padrão de 1 MB do Socket.IO derrubava a conexão) e `REALTIME_COMPRESSION_THRESHOLD_BYTES` (4096: daí para cima a mensagem vai comprimida).
- `REALTIME_PATH` = `'/api/socket.io'` (o `path` do Socket.IO nas duas pontas) e `SESSION_EVENTS` (`session:join`, `session:leave`, `session:memberJoined`, `session:memberLeft`, `session:setActivity`, `session:memberActivity`, `session:memberUpdated`, `session:campaignUpdated`, `session:campaignDeleted`, `session:removedFromTable`). `sessionRemovedFromTableDto` `{ campaignId, at }`: só às conexões de quem saiu da mesa sem ela ser excluída (juggernaut que não era membro desligou o modo); sem versão, como o `campaignDeleted`.
- `sessionCommandDto` — payload de `session:join` e `session:leave`: `{ actionId (uuid), campaignId (uuid) }`, estrito (um `userId` ou `role` forjado é recusado: a identidade vem da conexão, §7.3).
- `sessionMemberDto` `{ userId, name (apelido), username, color (efetiva), avatarId | null, bio | null, role (campaignRoleDto), juggernaut (admin no modo; listado só online), plan (gravado), admin (papel global), lorkariumOwner (o Dono do Lorkarium), online, awaySince (ISO | null: desde quando todas as abas dele estão paradas) }`.
- `sessionStateDto` `{ campaignId, version (inteiro ≥ 0), members, at (ISO) }` — o `session:state` do §7.2 **não** é um evento: chega como ack do `session:join`.
- `sessionMemberJoinedDto` `{ campaignId, version, member (com online: true e awaySince: null), at }` e `sessionMemberLeftDto` `{ campaignId, version, userId, at }`.
- `sessionJoinAckDto` (`{ ok: true, state }` | `{ ok: false, error: ApiErrorDto }`) e `sessionLeaveAckDto` (`{ ok: true }` | a mesma falha), uniões discriminadas por `ok`.
- `sessionMemberUpdatedDto` `{ campaignId, version, member (o `sessionMemberDto` inteiro, relido), at }` — `session:memberUpdated`, quando a pessoa salva apelido, cor, bio ou foto, ou o backoffice troca o plano ou o papel global.
- `sessionCampaignUpdatedDto` `{ campaignId, version, campaign (campaignInfoDto), at }` — o mestre salvou as configurações ou gerou outro código, ou o backoffice trocou o plano do dono; `sessionCampaignDeletedDto` `{ campaignId, at }` — a mesa foi excluída (sem versão: a sala acaba).
- Ausência: `sessionActivityCommandDto` `{ actionId, campaignId, away }` (`session:setActivity`, estrito: `userId` forjado é recusado), `sessionActivityAckDto` (= o do `leave`: `{ ok: true }` | falha) e o evento `sessionMemberActivityDto` `{ campaignId, version, userId, awaySince (ISO | null), at }` (`session:memberActivity`).
- `MAX_OPEN_TABLES` = `5` — mesas abertas ao mesmo tempo por conexão: o server recusa a 6ª (`TOO_MANY_TABLES`) e o client avisa antes de pedir.
- `SessionClientEvents` / `SessionServerEvents` — mapas de tipo para os genéricos do Socket.IO no server e no client.

### Biblioteca (`library/`)

Imagem, agregado e apresentação versionada: [contracts/biblioteca.md](contracts/biblioteca.md). Mapas (geometria normalizada, regiões, link projetado por leitor, limites, `library:mapChanged` e `library:mapRegionShown`): [contracts/mapas.md](contracts/mapas.md).

`library.dto.ts` — os grids e as pastas da mesa por REST (detalhe e rotas em [`library.md`](library.md)).

- Limites e textos: `SCENE_NAME_MAX_LENGTH` (60), `SCENE_FOLDER_NAME_MAX_LENGTH` (40), `SCENE_FOLDER_DEPTH_MAX` (5), `UNNAMED_SCENE_NAME` (`'Grid sem nome'`), `SCENE_COPY_SUFFIX` (`' (cópia)'`).
- `sceneVisibilityDto` (`private` | `public`), `sceneFolderDto` `{ id, name, parentId | null, visibility }`, `librarySceneDto` `{ id, name, folderId | null, visibility, widthCells, heightCells, background | null, tokenCount (null para o jogador), updatedAt (ISO) }` e `libraryDto` `{ activeSceneId | null, folders, scenes }` (resposta do `GET …/scenes`).
- Corpos: `createLibrarySceneRequestDto` `{ name?, folderId? }`, `updateLibrarySceneRequestDto` `{ name?, folderId? (null = raiz), visibility? }` (ao menos uma chave), `createSceneFolderRequestDto` `{ name, parentId?, visibility? }` e `updateSceneFolderRequestDto` `{ name?, parentId? (null = raiz) }` (ao menos uma chave). Nomes aparados, de 1 ao limite; estritos (um `campaignId` no corpo é recusado: a mesa vem da URL).
- Params: `librarySceneParamsDto` `{ campaignId, sceneId }` e `sceneFolderParamsDto` `{ campaignId, folderId }` (a borda usa o `shape` de cada campo).
- Evento `libraryChangedDto` `{ campaignId, at }` (`library:changed`, sem dado de grid) e o mapa `LibraryServerEvents`, que entra no `TableServerEvents`.
- Ativação e expulsão: `sceneActivatedDto` `{ campaignId, sceneId, previousSceneId | null, at }` (`scene:activated`, à mesa), `sceneClosedReasonDto` (`private` | `deleted`) e `sceneClosedDto` `{ campaignId, sceneId, reason, at }` (`scene:closed`, a cada socket tirado do grid); os dois entram no `LibraryServerEvents`.

### Conta (`account/`)

`usernameDto`, `memberColorDto`, perfil, foto, textura do dado (`diceNumberColorDto`), senha, e-mail, sessões ativas, 2FA e cores salvas: detalhe em [`contracts/conta.md`](contracts/conta.md).

### Backoffice (`admin/`) e links de conta (`account-links/`)

- `admin-users.dto.ts` — `adminUserDto` (`{ id, username, name, email, role, plan (o gravado), lorkariumOwner, status: active | suspended, color, avatarId, campaignCount, lastSeenAt | null, createdAt }`), `adminInvitationDto` (`{ id, email, role, invitedBy (@ | null), sentAt, expiresAt }`; "vencido" é do client), `adminDirectoryResponseDto` `{ users, invitations }`, `adminUserResponseDto` `{ user }`, `adminUserParamsDto` `{ userId: uuid }`, `updateUserRoleRequestDto` `{ role }` e `updateUserPlanRequestDto` `{ plan }` estritos, `blockingCampaignDto` `{ id, name, otherMembers ≥ 1 }`, `userDeletionCheckDto` `{ blockingCampaigns, soloCampaigns }`.
- `admin-invitations.dto.ts` — `createInvitationRequestDto` `{ email (trim + minúsculas), role }` estrito, `invitationParamsDto`, `invitationLinkResponseDto` `{ invitation, link }`, `passwordResetLinkResponseDto` `{ link, expiresAt }`.
- `account-links/account-links.dto.ts` — `accountLinkTokenDto` `{ token }` (sobre `linkTokenDto` de `account/account-recovery.dto.ts`), `invitationInspectResponseDto` `{ email, suggestedUsername }`, `acceptInvitationRequestDto` `{ token, username (usernameDto), password (newPasswordDto), persistent, acceptedTerms: true }` (literal: a caixa dos Termos e da Privacidade desmarcada é 400), `acceptInvitationResponseDto` `{ status: 'signed-in', user }`, `passwordResetInspectResponseDto` `{ username }`, `completePasswordResetRequestDto` `{ token, newPassword }`.
- `admin-mail-samples.dto.ts` — `mailSampleDto` `{ id, name, subject }`, `mailSamplesResponseDto` `{ samples }`, `mailSampleParamsDto` `{ sampleId }`, `sendMailSampleRequestDto` `{ to }` (aparado, minúsculas), `sendMailSampleResponseDto` `{ subject, to }`.
- Specs: `packages/contracts/test/admin/*.spec.ts`, `test/account-links/account-links.dto.spec.ts`.

### Textos legais (`legal/`)

- `legal-documents.dto.ts` — `LEGAL_DOCUMENTS_VERSION` (`'2026-10-25'`: a versão do par Termos de uso + Política de privacidade que o aceite grava; muda junto com o `updatedAt` da landing) e `legalDocumentDto` (`terms` | `privacy`, tipo `LegalDocument`: os caminhos `GET /api/legal/<documento>`). Ver [`legal.md`](legal.md).

### Tempo real comum (`http/realtime-ack.dto.ts`)

- `stateVersionDto` (inteiro ≥ 0) e `realtimeAckFailureDto` (`{ ok: false, error: ApiErrorDto }`): a versão e a falha de ack que sessão e tabuleiro compartilham.

### Tabuleiro (`board/`)

**Posição e movimento livre.** `cellIndexDto` (`half-cell.dto.ts`) é a posição do token, em múltiplos de 1/64 de casa ≥ 0, recusada citando o valor e o passo ("cell 0.01 is invalid; expected a multiple of 1/64 from 0 to …"); o passo repete o `POSITION_STEP` do game-core. Vale em todo grid: o modo só muda o gesto do client. Lado do token (`tokenSideLengthDto`, `width`/`height` da caixa e da forma) e centro do `token:addPlayers` seguem em meia casa (`halfCellDto`). `sceneDto.freeMovement` é obrigatório; no `configureSceneCommandDto` é opcional (ausente mantém). A origem da `emanation` aceita centésimos, para o token fora da casa. Detalhe em [`contracts/tabuleiro.md`](contracts/tabuleiro.md).

**Token que bloqueia a visão** (`board/token.dto.ts`): `tokenDto.blocksSight` (booleano, obrigatório na saída, igual a todo público), `createTokenCommandDto`/`newTokenDto`/`updateTokenCommandDto` com `blocksSight` opcional (no `update`, ausente mantém; no `create`, ausente nasce falso), `TOKEN_SIGHT_BLOCKERS_PER_SCENE_MAX` (50) e `TOKEN_BLOCKER_LIMIT_CODE` (`'TOKEN_BLOCKER_LIMIT'`). Regra em [`tokens/bloqueio-de-visao.md`](tokens/bloqueio-de-visao.md).

O detalhe dos DTOs do tabuleiro (cena, token, direção e abertura do cone, aparência, grupo, condição, combate, desenho, área de efeito, parede, luz, `BOARD_EVENTS` e o snapshot) mora em [`contracts/tabuleiro.md`](contracts/tabuleiro.md). As condições (definição, ativa, descrição, cor, stacks, imagem, a lista da mesa e seus comandos) moram em [`contracts/condicoes.md`](contracts/condicoes.md). Fluxo em [`board.md`](board.md). O ping efêmero (`board:ping` / `board:pinged`, sem versão) mora em [`contracts/ping.md`](contracts/ping.md). A aura do token (`tokenAuraDto`, os 8 efeitos, a aura no token, no estilo e nos comandos do mestre) mora em [`contracts/aura.md`](contracts/aura.md). As formas do token (`tokenFormDto`, `token:setForm`, `token:formChanged`) e as peças de posição e lado (`half-cell.dto.ts`) moram em [`contracts/formas.md`](contracts/formas.md). A patrulha do token (`token-patrol.dto.ts`: `tokenDto.patrol`, `token:setPatrol`, `token:setPatrolActiveMany`, `token:patrolsChanged`, o `patrolPauses` em 7 eventos, o `walk` da luz velada e os códigos `TOKEN_PATROL_NOT_FOUND`/`TOKEN_PATROL_LIMIT`) mora em [`contracts/patrulha.md`](contracts/patrulha.md).

### Dados (`dice/`)

`dice.dto.ts` — comando `dice:roll`, ack com `rollId` e o resultado (só a quem rolou), eventos `dice:rolled` (resultado, aparência e trajeto 3D) e `dice:rolledSecretly` (aviso sem valor), `DiceClientEvents`/`DiceServerEvents` no `TableClientEvents`/`TableServerEvents`; `saved-roll.dto.ts` — corpos, params e respostas das rolagens salvas (REST): detalhe em [`contracts/dados.md`](contracts/dados.md).

### Chat (`chat/`)

`chat.dto.ts` — canal (Mesa/sussurro, privado, grupo), quem fala (si ou token), `chat:send` com ack `messageId` e `chat:sent` sem versão; `ChatClientEvents`/`ChatServerEvents` no `TableClientEvents`/`TableServerEvents`: detalhe em [`contracts/chat.md`](contracts/chat.md).

### Fichas (`sheets/`)

`sheet-template.dto.ts` (modelo: resumo sem código, `files` e manifesto), `sheet-template-files.dto.ts` (lista de arquivos: caminhos, `index.html`, 512 KiB somados, 64 arquivos), `sheet-template-asset.dto.ts` (fontes e imagens do modelo, `assets` do manifesto e do `.lksheet`; ver [`sheets/arquivos.md`](sheets/arquivos.md)), `sheet.dto.ts` (ficha e resumo da biblioteca, dono `holder`, lista por token, visibilidade `controllers`/`table`, comandos com `actionId`, recibo, `sheet:changed` sem valores, `sheet:adjustBar` com o `barChangeDto`, criar barra no dono pela `POST …/bars`), `sheet-values.dto.ts` (valores JSON com travessia iterativa: 256 KiB, profundidade 8, 1000 chaves, chave de até 64), `sheet-bridge.dto.ts` (mensagens do `MessagePort`) e `sheet-bridge-documents.dto.ts` (o que o host responde às leituras de documentos; ver [`sheets/documentos.md`](sheets/documentos.md)): detalhe em [`sheets/contratos.md`](sheets/contratos.md).

## Regras de arquitetura

- Todo objeto é `z.strictObject`: campo extra é recusado (um `role` ou `userId` forjado no corpo não passa).
- O mesmo DTO valida nas duas pontas: o server na borda, o client antes de enviar e ao ler a resposta. Regra de formulário não é reescrita no client.
- Só ganha spec o DTO com regra própria (`transform`, `pipe`, `refine`, limite que é decisão do projeto); `z.string()` puro não se testa.

## Armadilhas

- `.extend()` num `z.strictObject` com `superRefine` lança no Zod 4: o `drawingDto` monta o objeto inteiro de novo a partir das mesmas peças (`freehandShape`, `fixedShape`) em vez de estender o `drawingShapeDto`. Builder genérico `<Extra extends z.ZodRawShape>` perde a inferência no `superRefine` (`unknown`); use as peças concretas.

- `z.string().trim().toLowerCase().pipe(z.email())`: a normalização vem **antes** do `pipe`; com `z.email()` direto, `' Ana@x.com'` é recusado em vez de normalizado.
