# Account security

Conta e segurança da própria pessoa no server: troca de senha, "onde você está conectado", troca de e-mail com link, 2FA por TOTP com códigos de recuperação e os avisos "se não foi você" por e-mail. Vive em `server/src/modules/account-security/` sobre as tabelas do `auth` (o módulo lê e grava `users`, `auth_sessions` e as tabelas do 2FA pelos DAOs do auth). A 2ª etapa do login mora no `auth` (ver [`auth.md`](auth.md)). DTOs em [`contracts/conta.md`](contracts/conta.md). O client (tela `/account`) é outro doc.

Detalhe: [`account-security/fluxos.md`](account-security/fluxos.md) — ordem de cada caso de uso, regras dos BOs, e-mails enviados e testes. [`account-security/recuperacao.md`](account-security/recuperacao.md) — o link "Não fui eu" dos avisos: tabela, quem emite qual `kind`, a transação da recuperação. Molde e catálogo dos e-mails: [`mail.md`](mail.md).

## Estrutura

- `account-security.plugin.ts` — `createAccountSecurityModule({ db, appPublicUrl, hasher, tokens, clock, cipher, sessionEnded, mailer, reportMailFailure, totp, qr, codes, twoFactorCheck })` → `{ plugin }`; um contexto só: `accountSecurityRoutes` registra o limitador e o error handler e o plugin acrescenta `registerTwoFactorRoutes` no mesmo contexto. Ligado por `src/app/wire-account-security.ts` (`wireAccountSecurity(app, wiring, '/api')`), chamado no `buildApp` logo depois do auth.
- `account-security.routes.ts` (senha, seção, sessões, e-mail) e `two-factor.routes.ts` (2FA); `src/lib/per-user-rate-limit.ts` (`perUserRateLimit(max, janela, userOf)`, chave = usuário, hook `preHandler` depois da guarda).
- Services: `account-security.service.ts` (`overview`, `changePassword`), `account-recovery.service.ts` (`issue`, `check`, `recover`; ver `account-security/recuperacao.md`), `account-sessions.service.ts` (`list`, `revoke`, `revokeOthers`), `email-change.service.ts` (`request`, `cancel`, `confirm`), `account-two-factor.service.ts` (`setup`, `enable`, `disable`, `regenerateCodes`), `current-password.service.ts` (`require(userId, senha)` → linha ou `CURRENT_PASSWORD_INVALID`), `security-notices.service.ts` (aviso best-effort: falha vira `reportMailFailure`, nunca erro).
- BO `email-change.bo.ts` (`EmailChangeBo.requestAt`, `PendingEmailBo`, `maskEmail`, `EMAIL_CHANGE_MS` 30 min); BO `account-recovery.bo.ts` (`RECOVERY_TTL_MS` 7 dias, `recoveryExpiry`, `AccountRecoveryBo.requireUsable`/`restoresEmail`); mappers `account-security.mapper.ts` (`deviceOf(userAgent)`, `toAccountSessionDto`, `toAccountSecurityDto`, `toAccountRecoveryBo`), `security-mail.mapper.ts` (os 6 e-mails da conta sobre o molde, `recipientOf`, `toMailMessage`) e `admin-mail.mapper.ts` (os 5 do backoffice); ver [`mail.md`](mail.md).
- PO/DAO `email-change-requests.{po,dao}.ts` e `account-recovery-tokens.{po,dao}.ts`; rotas públicas da recuperação em `account-recovery.routes.ts` (mesmo contexto do `accountSecurityRoutes`); erros em `account-security.error.ts`.

## Contrato (prefixo `/api`, sessão obrigatória salvo o confirm)

| Rota                                         | Saída                                                             | Erros                                                                                                     |
| -------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `GET /account/security`                      | 200 `{ security }`                                                | 401                                                                                                       |
| `POST /account/password`                     | 204; as outras sessões caem (e os sockets delas)                  | 400 · 401 · 403 `CURRENT_PASSWORD_INVALID` · 429 (5/min por usuário)                                      |
| `GET /account/sessions`                      | 200 `{ sessions }` (só as vivas, a mais recente primeiro)         | 401                                                                                                       |
| `DELETE /account/sessions/:sessionId`        | 204 (`public_id`)                                                 | 401 · 404 `SESSION_NOT_FOUND` (de outra pessoa ou id malformado) · 409 `CURRENT_SESSION`                  |
| `POST /account/sessions/revoke-others`       | 200 `{ revoked }`                                                 | 401                                                                                                       |
| `POST /account/email`                        | 202 `{ pendingEmail }` (mascarado)                                | 400 `INVALID_BODY`/`EMAIL_UNCHANGED` · 401 · 403 · 409 `EMAIL_TAKEN` · 429 (3 por 10 min por usuário)     |
| `DELETE /account/email`                      | 204, idempotente                                                  | 401                                                                                                       |
| `POST /account/email/confirm` **(pública)**  | 204                                                               | 400 · 404 `EMAIL_TOKEN_INVALID` (inexistente, usado ou vencido) · 409 `EMAIL_TAKEN` · 429 (10/min por IP) |
| `POST /account/two-factor/setup`             | 200 `{ secret, otpauthUri, qrImage }`                             | 401 · 403 `CURRENT_PASSWORD_INVALID` · 409 `TWO_FACTOR_ALREADY_ENABLED` · 429                             |
| `POST /account/two-factor/enable`            | 200 `{ recoveryCodes }` (10, mostrados uma vez)                   | 401 · 403 `TWO_FACTOR_CODE_INVALID` · 409 `TWO_FACTOR_NOT_STARTED`/`TWO_FACTOR_ALREADY_ENABLED` · 429     |
| `POST /account/two-factor/disable`           | 204                                                               | 401 · 403 `CURRENT_PASSWORD_INVALID`/`TWO_FACTOR_CODE_INVALID` · 409 `TWO_FACTOR_NOT_ENABLED` · 429       |
| `POST /account/two-factor/recovery-codes`    | 200 `{ recoveryCodes }` (os anteriores morrem)                    | idem                                                                                                      |
| `POST /account/recovery/check` **(pública)** | 200 `{ recovery: { kind, email } }` (`email` mascarado ou `null`) | 400 · 404 `RECOVERY_TOKEN_INVALID` (inexistente, usado ou vencido) · 429 (10/min por IP)                  |
| `POST /account/recovery` **(pública)**       | 204 + `lk_session` expirado; todas as sessões caem                | 400 · 404 `RECOVERY_TOKEN_INVALID` · 409 `EMAIL_TAKEN` (o e-mail antigo virou de outra conta) · 429       |

- As 4 rotas do 2FA têm 5/min por usuário, cada rota com seu contador (o `@fastify/rate-limit` cria um store por rota).
- O error handler traduz `AccountSecurityError` e também `AuthError` (o código errado vem do `TwoFactorCheckService` do auth): aqui `TWO_FACTOR_CODE_INVALID` é **403** (a sessão vale; no login é 401). Mensagem pública fixa por código; a interna (ids, endereços) só no log.
- Senha atual errada é sempre **403**: o client lê 401 como sessão caída.

## Tabelas (`0041_email_change_requests`, `0044_account_recovery_tokens`)

- `email_change_requests`: `id` = SHA-256 do token do link (PK), `user_id` **único** → `users.id` on delete cascade (um pedido por conta; pedir de novo substitui por upsert), `email_cipher` (`seal('pending-email', novo, userId)`), `email_index` (`index('email-index', novo)`, a mesma finalidade de `users`), `expires_at`, `created_at`.
- `account_recovery_tokens` (`0044`): ver `account-security/recuperacao.md`.
- As tabelas do 2FA (`user_two_factor`, `recovery_codes`, `two_factor_challenges`) e as colunas novas de `auth_sessions` estão no [`auth.md`](auth.md).

## Portas e adaptadores

| Porta              | Adaptador                                 | O que faz                                                                                                  |
| ------------------ | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `MailerPort`       | `SmtpMailer` (`nodemailer`) · `LogMailer` | `send({ to, subject, text, html })`; SMTP pelo `SMTP_URL` com o `MAIL_FROM`; o log (pino) fora de produção |
| `QrCodePort`       | `QrCodeImage` (`qrcode`)                  | `pngDataUrl(texto)`: PNG 240 px, correção M, margem 2                                                      |
| `RecoveryCodePort` | `CryptoRecoveryCode` (`node:crypto`)      | `generate()`: `xxxxx-xxxxx` sobre `RECOVERY_CODE_ALPHABET` com `randomInt` (sem viés)                      |

- `SmtpMailer` embrulha a falha em `MailDeliveryError` citando o **host** (nunca a URL, que leva a senha) e fecha o transporte no `onClose`. `buildApp` escolhe pelo `env.mailer` (`{ kind: 'smtp' | 'log' }`); `AppDependencies.mailer?` vence (os specs de integração passam um `MailerFake`).
- O `TotpPort` (`OtpauthTotp`) é do auth.

## Armadilhas

- O `sessionEnded` da `SessionEndedPort` é síncrono (`void`): `await` nele é ruído (e o lint do `await-thenable` reclama).
- `two-factor.routes.ts` não tem plugin próprio nem error handler: registrado fora do contexto do `accountSecurityRoutes`, um erro de domínio vira 500.
- Spec de integração que conta 429 precisa de app novo por `it`/`describe`: o limitador é em memória por app.
