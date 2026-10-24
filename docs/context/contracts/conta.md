# Contracts · conta (perfil, foto, segurança, 2FA)

Hub: [`../contracts.md`](../contracts.md). DTOs de `packages/contracts/src/account/`, todos estritos. Specs em `packages/contracts/test/account/`.

## @ e cor (`username.dto.ts`)

- `usernameDto` — o @: `trim` + minúsculas antes de validar; `USERNAME_MIN_LENGTH` 3 a `USERNAME_MAX_LENGTH` 20; só `a-z 0-9 . _`. As mensagens citam o valor e o tamanho ("expected 3 to 20 characters") ou o formato ("expected only a-z 0-9 . _"). Tipo `UsernameDto`.
- `MEMBER_COLOR_NAMES` / `memberColorDto` / `MemberColorDto` — `gold`, `steel`, `ember`, `moss`, `violet`, `rose`, `teal`, `bone`. **Repete** o `MEMBER_COLORS` do game-core na mesma ordem (o contracts só depende do `zod`); um spec de cada lado prende a ordem. O hex é só do client.

## Perfil (`profile.dto.ts`)

- `PROFILE_NAME_MAX_LENGTH` (32), `PROFILE_BIO_MAX_LENGTH` (190); `profileNameDto` (aparado, 1–32) e `profileBioDto` (aparada, até 190, `''` → `null`, aceita `null`).
- `profileDto` `{ id, username, name, color (efetiva), colorChoice (null = automática), bio | null, avatarId (uuid | null), memberSince (ISO) }` e `profileResponseDto` `{ profile }` (GET/PATCH do perfil e as rotas da foto).
- `updateProfileRequestDto` `{ name?, color? (null volta à automática), bio? }`: estrito (um `username` é recusado: o @ é imutável) e `{}` recusado com "expected at least one of name, color, bio" (`refine`, caminho vazio). Tipos `UpdateProfileRequestDto` / `UpdateProfileRequestInput`.

## Foto (`avatar.dto.ts`)

- `AVATAR_MAX_BYTES` (5 MiB, antes de decodificar), `AVATAR_MIME_TYPES` (`image/png`, `image/jpeg`, `image/webp`, `image/gif`; o GIF animado vira WebP animado) e `avatarMimeTypeDto`, `AVATAR_SIDE` (256: o server corta o centro em 256 × 256).
- `avatarParamsDto` `{ avatarId: uuid }` — params de `GET /api/avatars/:avatarId`.

## Segurança (`account-security.dto.ts`)

- `NEW_PASSWORD_MIN_LENGTH` (8) e `NEW_PASSWORD_MAX_LENGTH` (= `PASSWORD_MAX_LENGTH`, 256), sem regra de composição (NIST 800-63B-4). `currentPasswordDto` (1–256, conferida pelo server) e `newPasswordDto` (mensagem com o tamanho recebido e o limite). Igual à atual **não** é regra do DTO.
- `changePasswordRequestDto` `{ currentPassword, newPassword }`.
- `accountSecurityDto` `{ email, passwordChangedAt (ISO | null), pendingEmail (mascarado, `b*****@x.com`, | null), twoFactor: { enabled, recoveryCodesLeft } }` e `accountSecurityResponseDto` `{ security }`.
- Sessões: `accountSessionBrowserDto` (`chrome`, `edge`, `firefox`, `safari`, `opera`, `other`: Edge e Opera são próprios, mesmo levando "Chrome" no agente), `accountSessionOsDto` (`windows`, `macos`, `linux`, `ios`, `android`, `other`), `accountSessionFormFactorDto` (`desktop`, `mobile` — celular e tablet —, `other`). `accountSessionDto` `{ id (public_id uuid, nunca o hash do token), browser, os, formFactor, createdAt, lastSeenAt, current }`, `accountSessionsResponseDto` `{ sessions }`, `sessionParamsDto` `{ sessionId: uuid }`, `revokeOthersResponseDto` `{ revoked (inteiro ≥ 0) }`.
- E-mail: `changeEmailRequestDto` `{ newEmail (trim + minúsculas antes do `z.email()`), currentPassword }`, `changeEmailResponseDto` `{ pendingEmail }` (mascarado), `confirmEmailRequestDto` `{ token }` (aparado, 1 a `EMAIL_TOKEN_MAX_LENGTH` 256).

## 2FA (`two-factor-code.dto.ts`, `two-factor.dto.ts`)

- `TOTP_CODE_LENGTH` (6) e `totpCodeDto` (tira espaços; `'123 456'` → `'123456'`; recusa citando o valor e "6 digits").
- `RECOVERY_CODE_ALPHABET` (`23456789abcdefghjklmnpqrstuvwxyz`, base32 sem 0/O/1/I) e `recoveryCodeDto` (`xxxxx-xxxxx`; aparado, minúsculas, o hífen é recolocado se vier sem: `'K7M2P9QRST'` → `'k7m2p-9qrst'`). Ficam num arquivo só deles para o `login.dto.ts` importar sem ciclo.
- `RECOVERY_CODE_COUNT` (10); `twoFactorSetupRequestDto` `{ currentPassword }`; `twoFactorSetupResponseDto` `{ secret, otpauthUri (otpauth://…), qrImage (data:image/png;base64,…) }`; `twoFactorEnableRequestDto` `{ code }` (TOTP); `recoveryCodesResponseDto` `{ recoveryCodes }` (exatamente 10); `twoFactorConfirmRequestDto` `{ currentPassword, code (TOTP ou recuperação) }` (desligar e regenerar).
- Login em duas etapas mora no `auth/login.dto.ts` (ver o hub).

Os códigos de erro (`CURRENT_PASSWORD_INVALID`, `EMAIL_TAKEN`, `TWO_FACTOR_CODE_INVALID`…) não são enumerados no contracts: o `apiErrorDto.code` é `z.string()`.
