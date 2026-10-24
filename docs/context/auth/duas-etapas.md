# Auth · 2FA e login em duas etapas

Detalhe do hub [`auth.md`](../auth.md): as tabelas do 2FA, a porta TOTP, a checagem do segundo fator e a 2ª etapa do login. Ligar, desligar e regenerar códigos pela conta está em [`../account-security.md`](../account-security.md).

## Tabelas (`0042_two_factor`, `0043_two_factor_challenges`)

- `user_two_factor`: `user_id` PK → `users.id` cascade, `secret_cipher` (`seal('totp-secret', base32, userId)`; o segredo em claro nunca fica no banco), `enabled_at` (nulo = setup pendente), `last_step` (o último passo TOTP aceito), `created_at`.
- `recovery_codes`: `id` uuid, `user_id` → cascade (índice), `code_index` **único** (`index('recovery-code', código)`), `used_at` nulo, `created_at`.
- `two_factor_challenges`: `id` = SHA-256 do token do cookie `lk_2fa`, `user_id` → cascade, `persistent` (o "Manter conectado" da 1ª etapa), `failures` (padrão 0), `expires_at`, `created_at`.
- DAOs: `TwoFactorDao` (`findOf`, `savePending` — upsert que zera `enabled_at`/`last_step` —, `enable`, `recordStep` — `UPDATE … WHERE last_step IS NULL OR last_step < passo`, `false` = outro pedido usou antes —, `delete`), `RecoveryCodesDao` (`findOf`, `use` — só se `used_at IS NULL` —, `replace`, `countUnused`), `TwoFactorChallengesDao` (`insert`, `findById`, `recordFailure` — `failures + 1` no SQL, devolve o total —, `delete`, `deleteAllOf(userId)` — a recuperação da conta derruba um login no meio; aceita `tx`).

## TOTP

- `TotpPort` (`totp.port.ts`): `generateSecret()`, `uri(segredo, @)`, `currentStep(at)`, `stepOf(segredo, código, at)` → o passo que casou (±1) ou `null`. Adaptador `OtpauthTotp` (`infrastructure/totp/otpauth-totp.ts`, lib `otpauth`): SHA-1, 6 dígitos, 30 s, janela 1, segredo de 20 bytes, `issuer` `Lorkarium` e o @ no rótulo. Provado com os vetores do RFC 6238 (`12345678901234567890`, T = 59 s → `287082`).
- `TwoFactorBo` (`two-factor.bo.ts`): `acceptTotp(passoCasado, passoAtual)` aceita a ±`TOTP_WINDOW_STEPS` (1) e só passo **maior** que `last_step` (RFC 6238 §5.2, sem replay); `acceptRecovery(linha)` recusa código desconhecido ou usado; `requireEnabled()`. Recusa = `TwoFactorCodeInvalidError` (`TWO_FACTOR_CODE_INVALID`, cita o usuário e o motivo, nunca o código).
- `TwoFactorCheckService` (`two-factor-check.service.ts`): `isEnabled(userId)`, `verify(userId, { kind: 'totp' | 'recovery', code })` (grava o passo por `recordStep` ou marca o código por `use`; a corrida perdida também é "já usado") e `acceptTotp(linha, código)` (o passo sem gravar: o `enable` grava junto com `enabled_at`). É o mesmo objeto no login e na conta (`AuthModule.twoFactorCheck`).
- `auth.mapper.ts`: `toSecondFactor(código)` (6 dígitos = TOTP, senão recuperação), `toTwoFactorBo(userId, linha?)`, `toTwoFactorChallengeBo`, `recoveryCodeIndexOf(cipher, código)`.

## Login em duas etapas

- `AuthService.login(dto, userAgent?)` → `LoginOutcome`: senha certa sem 2FA ligado → `{ status: 'signed-in', user, token, expiresAt, persistent }` (como antes); com 2FA → grava o desafio (`hash(token)`, `TwoFactorChallengeBo.expiresAfter` = 5 min, `persistent` do dto) e devolve `{ status: 'two-factor-required', challenge: { token, expiresAt } }`, **sem** `auth_session`. Setup pendente não pede a 2ª etapa.
- `AuthService.startSession(linha, persistent, userAgent?)`: o único ponto que emite sessão (1ª etapa sem 2FA e 2ª etapa).
- `TwoFactorLoginService.complete(tokenDoCookie, fator, userAgent?)`: sem cookie, desafio desconhecido ou vencido (apagado) → `TwoFactorChallengeExpiredError`; `TwoFactorCheckService.verify`; código errado → `recordFailure`, e o 5º (`TWO_FACTOR_CHALLENGE_MAX_FAILURES`) apaga o desafio (a resposta desse ainda é `TWO_FACTOR_CODE_INVALID`; a próxima é `EXPIRED`); certo → apaga o desafio e `startSession` com o `persistent` guardado.
- Borda: `POST /api/auth/login` responde `{ status: 'two-factor-required' }` + `Set-Cookie: lk_2fa` (`HttpOnly`, `SameSite=Lax`, `Path=/api/auth`, `Max-Age=300`, `Secure` em produção). `POST /api/auth/login/two-factor` (`twoFactorLoginRequestDto`: `{ code }` ou `{ recoveryCode }`) lê o `lk_2fa`, responde `{ status: 'signed-in', user }` + `lk_session` e expira o `lk_2fa`. Erros: 400 · 401 `TWO_FACTOR_CODE_INVALID` · 401 `TWO_FACTOR_CHALLENGE_EXPIRED` · 429 (5/min por IP).

## Testes

- Unit: `test/modules/auth/two-factor.bo.spec.ts`, `two-factor-challenge.bo.spec.ts`, `two-factor-check.service.spec.ts`, `two-factor-login.service.spec.ts`, `auth.service.spec.ts` (`login with 2FA on`), `auth.mapper.spec.ts`; `test/infrastructure/totp/otpauth-totp.spec.ts`.
- Integração: `test/integration/auth-two-factor.spec.ts` (cookie, `/me` anônimo na 1ª etapa, replay, recuperação, 5 erros, 429) e `account-security-dao.spec.ts`.
