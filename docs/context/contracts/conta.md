# Contracts · conta (perfil, foto, textura do dado, segurança, 2FA)

Hub: [`../contracts.md`](../contracts.md). DTOs de `packages/contracts/src/account/`, todos estritos. Specs em `packages/contracts/test/account/`.

## @ e cor (`username.dto.ts`)

- `usernameDto` — o @: `trim` + minúsculas antes de validar; `USERNAME_MIN_LENGTH` 3 a `USERNAME_MAX_LENGTH` 20; só `a-z 0-9 . _`. As mensagens citam o valor e o tamanho ("expected 3 to 20 characters") ou o formato ("expected only a-z 0-9 . _"). Tipo `UsernameDto`.
- `MEMBER_COLOR_NAMES` / `memberPaletteDto` / `MemberPaletteDto` (só os nomes, para os leitores exaustivos) e `memberColorDto` / `MemberColorDto` (a união `paletteOrHexDto`: nome ou `#rrggbb`, em minúsculas) — `gold`, `steel`, `ember`, `moss`, `violet`, `rose`, `teal`, `bone`. O `memberColorDto` é o tipo de todo campo que atravessa a rede (perfil, `/me`, roster, detalhe da mesa, aparência do dado, backoffice). **Repete** o `MEMBER_COLORS` do game-core na mesma ordem (o contracts só depende do `zod`); um spec de cada lado prende a ordem. O hex é só do client.

## Perfil (`profile.dto.ts`)

- `PROFILE_NAME_MAX_LENGTH` (32), `PROFILE_BIO_MAX_LENGTH` (190); `profileNameDto` (aparado, 1–32) e `profileBioDto` (aparada, até 190, `''` → `null`, aceita `null`).
- Preferências de jogo, texto livre com a mesma regra da bio (aparado, só espaços → `null`, aceita `null`): `profileGameSystemsDto` (`PROFILE_GAME_SYSTEMS_MAX_LENGTH` 300), `profilePlayScheduleDto` (`PROFILE_PLAY_SCHEDULE_MAX_LENGTH` 200), `profileContactDto` (`PROFILE_CONTACT_MAX_LENGTH` 200).
- `profileDto` `{ id, username, name, color (efetiva), colorChoice (null = automática), bio | null, avatarId (uuid | null), bannerId (uuid | null = a cor do perfil), gameSystems | null, playSchedule | null, contact | null, diceTextureId (uuid | null = a cor do perfil), diceNumberColor (`#rrggbb` | null = contraste automático), memberSince (ISO) }` e `profileResponseDto` `{ profile }` (GET/PATCH do perfil e as rotas da foto e da textura).
- `updateProfileRequestDto` `{ name?, color? (nome da paleta, `#rrggbb` ou null, que volta à automática), bio?, diceNumberColor? (`diceNumberColorDto` ou null), gameSystems?, playSchedule?, contact? }`: estrito (um `username` é recusado: o @ é imutável; um `bannerId` também, o banner tem rotas próprias) e `{}` recusado com "expected at least one of name, color, bio, diceNumberColor, gameSystems, playSchedule, contact" (`refine`, caminho vazio). Tipos `UpdateProfileRequestDto` / `UpdateProfileRequestInput`.

## Card de perfil (`src/profiles/`)

Specs em `packages/contracts/test/profiles/`.

- `profile-card.dto.ts` — `profileCardDto` (estrito, nunca o e-mail) `{ id, username, name, color (só o fundo do banner), avatarId | null, bannerId | null (null sem plano pago), bio | null, memberSince (ISO), plan, admin, lorkariumOwner (o selo), presence, relation, rollsCount, natural20Count, campaignsAsMaster, campaignsAsPlayer, reputation, gameSystems | null, playSchedule | null, contact | null, mutualCampaigns: { id, name }[], mutualFriends }` (contagens inteiras ≥ 0). `profileCardPresenceDto` `'online' | 'offline' | null` (null = não é amigo; invisível sai `offline`). `PROFILE_CARD_RELATIONS` / `profileCardRelationDto` `self | friend | outgoing | incoming | blocked | none` (`blocked` = eu bloqueei; ser bloqueado sai `none`). `mutualCampaignDto`, `profileCardResponseDto` `{ card }` (`GET /api/users/:userId/card`) e `profileCardParamsDto` `{ userId: uuid }` (card, reputação e denúncia).
- `reputation.dto.ts` — `REPUTATION_MIN_VOTES` (5); `reputationVoteValueDto` `1 | -1` (mensagem com o valor e "expected 1 or -1"); `reputationVoteDto` `{ value }` (corpo do `PUT /api/users/:userId/reputation`, estrito); `reputationSummaryDto` `{ up, down, myVote (1 | -1 | null), percent (0–100 | null abaixo do mínimo) }`.
- `user-report.dto.ts` — `USER_REPORT_REASONS` (`harassment`, `hate_speech`, `spam`, `cheating`, `inappropriate_content`, `impersonation`, `other`) / `userReportReasonDto` (mensagem com o valor e a lista); `USER_REPORT_DETAILS_MAX_LENGTH` (1000); `userReportRequestDto` `{ reason, details? (aparado, só espaços → null) }` (corpo do `POST /api/users/:userId/reports`, estrito); `USER_REPORT_STATUSES` / `userReportStatusDto` (`open`, `resolved`, `dismissed`); `resolveUserReportRequestDto` `{ status: 'resolved' | 'dismissed' }` (`PATCH /api/admin/reports/:reportId`). A fila do admin: `userReportPartyDto` `{ id, username }`; `userReportDto` `{ id, reason, details, status, reporter, target, createdAt, resolvedAt, resolvedBy (@ do admin ou null) }`; `USER_REPORTS_PAGE_SIZE` (50); `listUserReportsQueryDto` `{ status = 'open', page = 1 (coerce) }` (`GET /api/admin/reports`); `userReportsPageDto` `{ reports, page, pageSize, total }`; `userReportParamsDto` `{ reportId }`; `userReportResponseDto` `{ report }`.

## Foto (`avatar.dto.ts`)

- `AVATAR_MAX_BYTES` (5 MiB, antes de decodificar), `AVATAR_MIME_TYPES` (`image/png`, `image/jpeg`, `image/webp`, `image/gif`; o GIF animado vira WebP animado) e `avatarMimeTypeDto`, `AVATAR_SIDE` (256: o server corta o centro em 256 × 256).
- `avatarParamsDto` `{ avatarId: uuid }` — params de `GET /api/avatars/:avatarId`.
- `avatarLinkRequestDto` `{ url }` — corpo de `POST /api/account/avatar/link`, sobre o `assetLinkDto` das imagens da mesa (aparado, http/https, até `ASSET_URL_MAX_LENGTH`; agora exportado).

## Banner do perfil (`banner.dto.ts`)

- `BANNER_WIDTH` (1800) e `BANNER_HEIGHT` (600): o WebP 3:1 que o server grava (animado quando chega GIF); entrada, tipos e teto são os da foto. `bannerUploadQueryDto` (= `imageCropQueryDto` de `asset.dto.ts`): a query do `PUT /account/banner`, o retângulo em % (`cropX`, `cropY`, `cropW`, `cropH`, os 4 ou nenhum, sem passar de 100), estrito.
- `bannerLinkRequestDto` (= `avatarLinkRequestDto`, `{ url }`) — corpo de `POST /api/account/banner/link`; `bannerParamsDto` `{ bannerId: uuid }` — params de `GET /api/banners/:bannerId`.

## Textura do dado (`dice-texture.dto.ts`)

- `DICE_TEXTURE_SIDE` (512: o server corta o centro num WebP 512 × 512 **parado**; o GIF fica com o primeiro quadro). Tamanho e tipos de entrada são os da foto (`AVATAR_MAX_BYTES`, `AVATAR_MIME_TYPES`).
- `diceNumberColorDto` — a cor do número: é o `hexColorDto` (`color/hex-color.dto.ts`). Mora aqui (e não em `dice/`) porque o perfil a usa; o `diceAppearanceDto` de `dice/dice.dto.ts` a importa.
- `diceTextureLinkRequestDto` (= `avatarLinkRequestDto`, `{ url }`) — corpo de `POST /api/account/dice-texture/link`; `diceTextureParamsDto` `{ diceTextureId: uuid }` — params de `GET /api/dice-textures/:diceTextureId`.

## Cores salvas (`saved-colors.dto.ts`)

- `SAVED_COLORS_MAX` (24 por conta) e `SAVED_COLORS_LIMIT_CODE` (`'SAVED_COLORS_LIMIT'`, o 409 de salvar no limite).
- `saveColorRequestDto` `{ color: hexColorDto }` — corpo de `POST /api/account/saved-colors`, estrito (um `userId` é recusado).
- `savedColorParamsDto` `{ color }` — params de `DELETE /api/account/saved-colors/:color`: o hex **sem `#`** (na URL, `#` é fragmento), em qualquer caixa; sai como `#rrggbb` (`'aabbcc'` → `'#aabbcc'`). `'#aabbcc'` e `'xyz123'` são recusados citando o valor e "expected rrggbb".
- `savedColorsResponseDto` `{ colors: HexColorDto[] }` (até 24) — resposta das três rotas, mais recente primeiro. Módulo em [`../saved-colors.md`](../saved-colors.md).

## Segurança (`account-security.dto.ts`)

- `NEW_PASSWORD_MIN_LENGTH` (8) e `NEW_PASSWORD_MAX_LENGTH` (= `PASSWORD_MAX_LENGTH`, 256), sem regra de composição (NIST 800-63B-4). `currentPasswordDto` (1–256, conferida pelo server) e `newPasswordDto` (mensagem com o tamanho recebido e o limite). Igual à atual **não** é regra do DTO.
- `changePasswordRequestDto` `{ currentPassword, newPassword }`.
- `accountSecurityDto` `{ email, passwordChangedAt (ISO | null), pendingEmail (mascarado, `b*****@x.com`, | null), twoFactor: { enabled, recoveryCodesLeft } }` e `accountSecurityResponseDto` `{ security }`.
- Sessões: `accountSessionBrowserDto` (`lorkarium`, `chrome`, `edge`, `firefox`, `safari`, `opera`, `other`: Edge e Opera são próprios, mesmo levando "Chrome" no agente; `lorkarium` é o app desktop, mesmo levando "Edg/"), `accountSessionOsDto` (`windows`, `macos`, `linux`, `ios`, `android`, `other`), `accountSessionFormFactorDto` (`desktop`, `mobile` — celular e tablet —, `other`). `accountSessionDto` `{ id (public_id uuid, nunca o hash do token), browser, os, formFactor, createdAt, lastSeenAt, current }`, `accountSessionsResponseDto` `{ sessions }`, `sessionParamsDto` `{ sessionId: uuid }`, `revokeOthersResponseDto` `{ revoked (inteiro ≥ 0) }`.
- `deviceLabel({ browser, os })` (`device-label.ts`) → "Chrome no Windows", "Lorkarium para Windows" (o app é app, não navegador: "para"; sem sistema, só "Lorkarium"), "Firefox", "Navegador no Android" ou "Navegador desconhecido". Mora aqui, ao lado dos enums, porque a tela de sessões do client e o "De onde" dos avisos por e-mail do server dizem o aparelho com o mesmo texto.
- E-mail: `changeEmailRequestDto` `{ newEmail (trim + minúsculas antes do `z.email()`), currentPassword }`, `changeEmailResponseDto` `{ pendingEmail }` (mascarado), `confirmEmailRequestDto` `{ token }` (aparado, 1 a `EMAIL_TOKEN_MAX_LENGTH` 256).

## Recuperação por link (`account-recovery.dto.ts`)

- `linkTokenDto` — o token de qualquer link de uso único (recuperação, convite, nova senha): aparado, 1 a `EMAIL_TOKEN_MAX_LENGTH` (256).
- `accountRecoveryKindDto` (`cancel-email-change` | `revert-email-change` | `revert-password-change`); `accountRecoveryTokenDto` `{ token }` (corpo do `check`); `accountRecoveryRequestDto` `{ token, newPassword (newPasswordDto) }`; `accountRecoveryCheckResponseDto` `{ recovery: { kind, email (mascarado) | null } }`.

## 2FA (`two-factor-code.dto.ts`, `two-factor.dto.ts`)

- `TOTP_CODE_LENGTH` (6) e `totpCodeDto` (tira espaços; `'123 456'` → `'123456'`; recusa citando o valor e "6 digits").
- `RECOVERY_CODE_ALPHABET` (`23456789abcdefghjklmnpqrstuvwxyz`, base32 sem 0/O/1/I) e `recoveryCodeDto` (`xxxxx-xxxxx`; aparado, minúsculas, o hífen é recolocado se vier sem: `'K7M2P9QRST'` → `'k7m2p-9qrst'`). Ficam num arquivo só deles para o `login.dto.ts` importar sem ciclo.
- `RECOVERY_CODE_COUNT` (10); `twoFactorSetupRequestDto` `{ currentPassword }`; `twoFactorSetupResponseDto` `{ secret, otpauthUri (otpauth://…), qrImage (data:image/png;base64,…) }`; `twoFactorEnableRequestDto` `{ code }` (TOTP); `recoveryCodesResponseDto` `{ recoveryCodes }` (exatamente 10); `twoFactorConfirmRequestDto` `{ currentPassword, code (TOTP ou recuperação) }` (desligar e regenerar).
- Login em duas etapas mora no `auth/login.dto.ts` (ver o hub).

Os códigos de erro (`CURRENT_PASSWORD_INVALID`, `EMAIL_TAKEN`, `TWO_FACTOR_CODE_INVALID`, `RECOVERY_TOKEN_INVALID`…) não são enumerados no contracts: o `apiErrorDto.code` é `z.string()`.
