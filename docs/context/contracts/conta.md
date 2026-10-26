# Contracts · conta (perfil, foto, textura do dado, segurança, 2FA)

Hub: [`../contracts.md`](../contracts.md). DTOs de `packages/contracts/src/account/`, todos estritos. Specs em `packages/contracts/test/account/`.

## @ e cor (`username.dto.ts`)

- `usernameDto` — o @: `trim` + minúsculas antes de validar; `USERNAME_MIN_LENGTH` 3 a `USERNAME_MAX_LENGTH` 20; só `a-z 0-9 . _`. As mensagens citam o valor e o tamanho ("expected 3 to 20 characters") ou o formato ("expected only a-z 0-9 . _"). Tipo `UsernameDto`.
- `MEMBER_COLOR_NAMES` / `memberColorDto` / `MemberColorDto` — `gold`, `steel`, `ember`, `moss`, `violet`, `rose`, `teal`, `bone`. **Repete** o `MEMBER_COLORS` do game-core na mesma ordem (o contracts só depende do `zod`); um spec de cada lado prende a ordem. O hex é só do client.

## Perfil (`profile.dto.ts`)

- `PROFILE_NAME_MAX_LENGTH` (32), `PROFILE_BIO_MAX_LENGTH` (190); `profileNameDto` (aparado, 1–32) e `profileBioDto` (aparada, até 190, `''` → `null`, aceita `null`).
- `profileDto` `{ id, username, name, color (efetiva), colorChoice (null = automática), bio | null, avatarId (uuid | null), diceTextureId (uuid | null = a cor do perfil), diceNumberColor (`#rrggbb` | null = contraste automático), memberSince (ISO) }` e `profileResponseDto` `{ profile }` (GET/PATCH do perfil e as rotas da foto e da textura).
- `updateProfileRequestDto` `{ name?, color? (null volta à automática), bio?, diceNumberColor? (`diceNumberColorDto` ou null) }`: estrito (um `username` é recusado: o @ é imutável) e `{}` recusado com "expected at least one of name, color, bio, diceNumberColor" (`refine`, caminho vazio). Tipos `UpdateProfileRequestDto` / `UpdateProfileRequestInput`.

## Foto (`avatar.dto.ts`)

- `AVATAR_MAX_BYTES` (5 MiB, antes de decodificar), `AVATAR_MIME_TYPES` (`image/png`, `image/jpeg`, `image/webp`, `image/gif`; o GIF animado vira WebP animado) e `avatarMimeTypeDto`, `AVATAR_SIDE` (256: o server corta o centro em 256 × 256).
- `avatarParamsDto` `{ avatarId: uuid }` — params de `GET /api/avatars/:avatarId`.
- `avatarLinkRequestDto` `{ url }` — corpo de `POST /api/account/avatar/link`, sobre o `assetLinkDto` das imagens da mesa (aparado, http/https, até `ASSET_URL_MAX_LENGTH`; agora exportado).

## Textura do dado (`dice-texture.dto.ts`)

- `DICE_TEXTURE_SIDE` (512: o server corta o centro num WebP 512 × 512 **parado**; o GIF fica com o primeiro quadro). Tamanho e tipos de entrada são os da foto (`AVATAR_MAX_BYTES`, `AVATAR_MIME_TYPES`).
- `diceNumberColorDto` — a cor do número: aparada, em minúsculas antes de validar (`'#FFAA00'` → `'#ffaa00'`), só `#rrggbb`; a recusa cita o valor e "expected #rrggbb". Mora aqui (e não em `dice/`) porque o perfil a usa; o `diceAppearanceDto` de `dice/dice.dto.ts` a importa.
- `diceTextureLinkRequestDto` (= `avatarLinkRequestDto`, `{ url }`) — corpo de `POST /api/account/dice-texture/link`; `diceTextureParamsDto` `{ diceTextureId: uuid }` — params de `GET /api/dice-textures/:diceTextureId`.

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
