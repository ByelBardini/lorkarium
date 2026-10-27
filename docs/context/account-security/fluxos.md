# Account security · fluxos

Detalhe do hub [`account-security.md`](../account-security.md): a ordem de cada caso de uso, as regras e os testes. A identidade sempre vem da sessão (`userOf`, `sessionIdOf` das guardas); nada é lido do corpo além do DTO.

## Sessões ("onde você está conectado")

- `list(userId, sessãoAtual)`: `AuthSessionsDao.listOf(userId, agora)` (só as que não venceram, `last_seen_at` desc) → `toAccountSessionDto` com `current` = linha cujo `id` (hash) é o da sessão do pedido. O hash nunca sai: a URL usa o `public_id`.
- `deviceOf(userAgent)`: navegador por ordem (o app desktop primeiro — `LorkariumDesktop/<versão>`, que a casca Tauri acrescenta ao agente do WebView2, vira `lorkarium`, também com a marca ` LorkariumTitleBar/1` que a casca sem moldura põe depois; vem antes do Edge porque o WebView2 também diz `Edg/`, e `LorkariumDesktop` sem `/versão` não conta —, Edge e Opera antes do Chrome, Chrome antes do Safari, Safari só com `Version/…Safari/`), sistema (iOS antes do macOS, Android antes do Linux), formato `mobile` para iOS/Android ou `Mobi`, `desktop` para sistema conhecido, senão `other`. Agente vazio ou `curl/8` → tudo `other`. Sem versão, IP nem cidade.
- `revoke`: `findOfUser(userId, publicId)` (de outra pessoa = não achada) → a atual é `CURRENT_SESSION` → `delete` → `sessionEnded(hash)` (os sockets daquela sessão caem).
- `revokeOthers`: `deleteOthersOf(userId, atual)` devolve os hashes apagados → `sessionEnded` de cada → `{ revoked }`.

## Senha

- `changePassword(userId, sessãoAtual, dto, userAgent)`: `CurrentPasswordService.require` (403 se errada, nada gravado) → `hasher.hash(nova)` → `UsersDao.updatePassword(hash, agora)` (grava `password_changed_at`) → `deleteOthersOf` → `sessionEnded` de cada → `recovery.issue('revert-password-change')` → aviso "Sua senha do Lorkarium foi trocada" com o link.
- `overview(userId)`: e-mail aberto, `passwordChangedAt`, `pendingEmail` (só se o pedido não venceu, mascarado), `twoFactor.enabled` (`enabled_at` não nulo) e `recoveryCodesLeft` (não usados; 0 com o 2FA desligado).

## E-mail

- `request(userId, dto, userAgent)`: senha atual → `EmailChangeBo.requestAt(novo, agora)` (igual ao atual = `EMAIL_UNCHANGED`; prazo 30 min) → índice já em uso = `EMAIL_TAKEN` → token novo (`SessionTokenPort`), grava `hash(token)` + novo cifrado + índice (substitui o pedido anterior) → **link** ao endereço novo (`${APP_PUBLIC_URL}/account/email/confirm#token=…`; falha aqui falha o pedido) → `recovery.issue('cancel-email-change')` → aviso ao antigo com o novo mascarado e o link → devolve o mascarado.
- `confirm(token, userAgent)` (pública): `findById(hash)` ausente = `EMAIL_TOKEN_INVALID` (inexistente ou já usado) → `PendingEmailBo.requireLiveAt` (`agora ≥ expiresAt` = vencido, mesmo código) → abre o novo (`pending-email`) → `UsersDao.updateEmail(toSealedEmail(...))`; o `23505` do índice único (tomado entre o pedido e o clique) vira `EMAIL_TAKEN` → apaga o pedido → `recovery.issue('revert-email-change', antigo)` → aviso ao antigo com o link.
- `cancel`: apaga o pedido da pessoa (o link morre); idempotente.
- `maskEmail('bianca@x.com')` → `b*****@x.com` (primeira letra e um `*` por letra da parte local).

## 2FA

- `setup(userId, senha)`: senha → já ligado = `TWO_FACTOR_ALREADY_ENABLED` → `totp.generateSecret()` (base32, 160 bits) → `savePending(seal('totp-secret', segredo, userId))` (um setup não confirmado recomeça) → `{ secret, otpauthUri: totp.uri(segredo, @), qrImage }`.
- `enable(userId, código)`: sem linha = `TWO_FACTOR_NOT_STARTED`; ligado = `ALREADY_ENABLED` → `TwoFactorCheckService.acceptTotp(pendente, código)` (o passo, sem gravar) → `enable(agora, passo)` → 10 códigos (`RecoveryCodePort`), gravados só pelo índice (`index('recovery-code', código)`) → aviso "ligada" → os 10 em claro, uma vez.
- `disable` / `regenerateCodes`: senha → 2FA ligado (`TWO_FACTOR_NOT_ENABLED` se não) → `TwoFactorCheckService.verify(userId, toSecondFactor(código))` (TOTP ou recuperação; grava o passo ou marca o código usado) → apaga o 2FA e os códigos (aviso "desligada") ou troca os códigos.
- As regras (janela ±1, sem replay, código de recuperação de uso único) são do auth: `TwoFactorBo` e `TwoFactorCheckService` (ver [`../auth.md`](../auth.md)).

## Avisos

| Quando                    | Para            | Assunto                                     | Link                   |
| ------------------------- | --------------- | ------------------------------------------- | ---------------------- |
| troca de senha            | e-mail da conta | Sua senha do Lorkarium foi trocada          | recuperação (senha)    |
| 2FA ligado / desligado    | e-mail da conta | Verificação em duas etapas ligada/desligada | `/account`             |
| pedido de troca de e-mail | endereço atual  | Pediram para trocar o e-mail da sua conta   | recuperação (cancelar) |
| link de confirmação       | endereço novo   | Confirme seu novo e-mail no Lorkarium       | confirmação (30 min)   |
| troca concluída           | endereço antigo | O e-mail da sua conta foi trocado           | recuperação (voltar)   |

Todos no molde ([`../mail.md`](../mail.md)): "Oi, apelido", o @, "Quando" (Brasília) e "De onde" (o aparelho do `user-agent` da requisição, que as rotas passam aos services). Nunca levam senha; o token só vai no fragmento do link. Os avisos passam pelo `SecurityNoticesService`: falha de entrega vai ao log (`app.log.warn`, com o assunto) e a mudança, já gravada, segue. O link de confirmação usa o `mailer` direto (falha falha o pedido).

## Testes

- Unit (`server/test/modules/account-security/`): `account-security.mapper.spec.ts` (UAs reais), `security-mail.mapper.spec.ts`, `email-change.bo.spec.ts`, `account-sessions.service.spec.ts`, `account-security.service.spec.ts` (ordem por diário: `updatePassword → deleteOthersOf → sessionEnded`), `email-change.service.spec.ts`, `account-two-factor.service.spec.ts`, `current-password.service.spec.ts`, `security-notices.service.spec.ts`. Infra: `test/infrastructure/{mailer/log-mailer,qr-code/qrcode-image,recovery-code/crypto-recovery-code,totp/otpauth-totp}.spec.ts`.
- Fakes: `test/support/account-security-fakes.ts` — `MailerFake` (`sent`, `to(endereço)`, `confirmationTokenFor(endereço)`, `recoveryTokenFor(endereço)`, `lastTokenFor(endereço, regex)`, `failWith`), `RecoveryIssuerFake` (`issued`; links `…#token=recovery-N`), `AccountRecoveryTokensDaoFake`, `QrCodeFake`, `RecoveryCodeFake` (códigos distintos e válidos), `EmailChangeRequestsDaoFake`; `test/support/two-factor-fakes.ts` — `TotpFake` (`stepsByCode`, `secretsAsked`), `TwoFactorDaoFake`, `RecoveryCodesDaoFake`, `TwoFactorChallengesDaoFake`. `UsersDaoFake.updateEmail` lança o `23505` num índice tomado.
- Integração (`server/test/integration/`): `account-sessions.spec.ts` (inclui a queda do socket), `account-password.spec.ts`, `account-email.spec.ts` (`ClockFake` para vencer o link), `account-two-factor.spec.ts` (código calculado no spec com o `otpauth` pelo segredo devolvido; `ClockFake` avança 30 s entre usos), `auth-two-factor.spec.ts` (login em duas etapas), `account-security-dao.spec.ts` e `smtp-mailer.spec.ts` (Mailpit real; `MAILPIT_SMTP_URL`/`MAILPIT_API_URL`, padrão 1026/8026 da receita do `/testar`). Helpers em `test/support/account-security-http.ts` (`accountRequest`, `logInAs(app, email, senha, userAgent)`, `cookieOf`, `totpCodeAt`).
