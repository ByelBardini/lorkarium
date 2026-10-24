# Account links (convite e nova senha)

Os links de uso único do backoffice: o **convite** (7 dias; a pessoa escolhe o @ e a senha e a conta nasce logada) e o **link de nova senha** (1 h; um por conta). Vive em `server/src/modules/account-links/`. Quem lista e cuida das contas é o [`user-admin.md`](user-admin.md); as telas `/invite` e `/reset-password` estão em [`client/account-links.md`](client/account-links.md). Plano de origem: `docs/plans/2026-10-24-tela-backoffice-usuarios.md` (fases 5–7).

## Estrutura

- PO/DAO `invitations.{po,dao}.ts` (`insert`, `listPending` com o @ de quem convidou, `findListing`, `findByTokenHash`, `findByEmailIndex`, `renew` → `boolean`, `delete` → `boolean`) e `password-resets.{po,dao}.ts` (`replace` — upsert por `user_id` com `id` novo —, `findByTokenHash`, `delete` → `boolean`, `deleteOfUser`). Os dois sobre `DatabaseExecutor`.
- `account-link.bo.ts` — `INVITATION_TTL_MS` (7 dias), `PASSWORD_RESET_TTL_MS` (1 h), `linkExpiry`, `AccountLinkBo.requireUsableAt(agora)` (`agora ≥ expires_at` → `ACCOUNT_LINK_INVALID` citando id e prazo; vale em **todo** caminho: inspect, aceitar, concluir — CVE-2023-48220), `requireOtherAccount`.
- `account-links.mapper.ts` — `invitationEmailOf`, `toAdminInvitationDto`, `toAccountLinkBo`, `linkOf(publicUrl, '/invite' | '/reset-password', token)` (token no fragmento, codificado).
- `invitations.service.ts` (`listPending`, `invite`, `resend`, `cancel`, `inspect`, `accept`) e `password-resets.service.ts` (`issue`, `inspect`, `complete`).
- `account-links.routes.ts` (limitador e error handler próprios; traduz também o `ACCOUNT_SUSPENDED` do auth, aqui **409**), `account-links.error.ts`, `account-links.plugin.ts` (`createAccountLinksModule` → `{ plugin, invitations }`).

## Tabelas (`0046_invitations`, `0047_password_resets`)

- `invitations`: `id` uuid (público, para a URL do admin), `token_hash` **único**, `email_cipher` (`seal('invitation-email', e-mail, id)`), `email_index` **único** (`index('email-index', …)`, a mesma finalidade de `users`: um convite pendente por endereço), `role` `user_role`, `invited_by` → `users.id` **set null**, `sent_at`, `expires_at`. A linha de `users` só nasce no aceite (o @ é `NOT NULL UNIQUE`).
- `password_resets`: `id` uuid, `token_hash` **único**, `user_id` → `users.id` **único** **cascade**, `created_at`, `expires_at`.
- O banco guarda só `hash(token)` (`SessionTokenPort`); o link leva o token no fragmento.

## Contrato (prefixo `/api`)

| Rota                                                   | Saída                                              | Erros                                                                             |
| ------------------------------------------------------ | -------------------------------------------------- | --------------------------------------------------------------------------------- |
| `POST /admin/invitations` (admin)                      | 201 `{ invitation, link }`; e-mail enviado         | 400 · 409 `EMAIL_TAKEN` · 409 `ALREADY_INVITED` (+ `invitationId`) · 429          |
| `POST /admin/invitations/:invitationId/resend` (admin) | 200 `{ invitation, link }` (token e prazo novos)   | 400 · 404 `INVITATION_NOT_FOUND` · 429                                            |
| `DELETE /admin/invitations/:invitationId` (admin)      | 204 (idempotente)                                  | 400                                                                               |
| `POST /admin/users/:userId/password-reset` (admin)     | 200 `{ link, expiresAt }`; e-mail enviado          | 400 · 404 `USER_NOT_FOUND` · 409 `SELF_ACTION` · 409 `ACCOUNT_SUSPENDED` · 429    |
| `POST /invitations/inspect` **(pública)**              | 200 `{ email, suggestedUsername }`                 | 400 · 404 `ACCOUNT_LINK_INVALID` · 429                                            |
| `POST /invitations/accept` **(pública)**               | 200 `{ status: 'signed-in', user }` + `lk_session` | 400 · 404 `ACCOUNT_LINK_INVALID` · 409 `USERNAME_TAKEN` · 409 `EMAIL_TAKEN` · 429 |
| `POST /password-resets/inspect` **(pública)**          | 200 `{ username }`                                 | 400 · 404 `ACCOUNT_LINK_INVALID` · 429                                            |
| `POST /password-resets/complete` **(pública)**         | 204; todas as sessões caem; aviso por e-mail       | 400 · 404 `ACCOUNT_LINK_INVALID` · 429                                            |

Limites: emitir, reenviar e gerar link, 20 por 10 min **por admin** (`perUserRateLimit`); as públicas, 10 por minuto **por IP**. O `link` só sai na resposta de quem gerou (nunca na lista). Cada ação do admin vai ao log como "backoffice action" (`adminId`, `invitationId`/`targetUserId`, `action`).

## Regras e ordem

- `invite(admin, { email, role })`: índice em `users` → `EMAIL_TAKEN`; convite pendente → `ALREADY_INVITED` com o id; grava (dois admins ao mesmo tempo: o `invitations_email_index_unique` responde e vira `ALREADY_INVITED`) → e-mail "Seu convite para o Lorkarium" (sem o nome de quem convidou) pelo `SecurityNoticesService` (best-effort: o admin tem o link para mandar por fora) → `{ invitation, link }`.
- `resend(invitationId)`: token e prazo novos (`renew`; o link velho morre) e outro e-mail; quem reenviou só vai ao log da rota. `cancel`: apaga, idempotente.
- `inspect(token)`: o e-mail e `suggestedUsername` = `usernameFromEmail` contra os @ tomados (`usernamesStartingWith`).
- `accept`: convite vivo → Argon2 **antes** da transação → na transação `delete` do convite (a posse; `false` = já usado → `ACCOUNT_LINK_INVALID`) → `users.insert` com `name = username`, o e-mail selado como `user-email` e o papel do convite (`users_username_unique` → `USERNAME_TAKEN`, o índice do e-mail → `EMAIL_TAKEN`; os dois desfazem tudo e o convite continua valendo) → depois do commit `AuthService.startSession` (exposto pelo `createAuthModule` como `sessions`) e o cookie por `app.authGuards.setSessionCookie`.
- `issue(admin, userId)`: não a si → conta existe → ativa (`requireActive`; suspensa = 409) → `replace` (um por conta) → e-mail "Crie uma senha nova no Lorkarium" → `{ link, expiresAt }`. A senha atual vale até a troca.
- `complete(token, senha)`: link vivo → Argon2 → transação (`delete` do link como posse → `updatePassword(agora)` → `AuthSessionsDao.deleteAllOf`) → `sessionEnded` de cada → aviso "Sua senha do Lorkarium foi trocada" com o link "Não fui eu" (`AccountRecoveryService.issue`). O 2FA continua ligado.
- A suspensão (no `user-admin`) apaga o link de nova senha pendente.

## Testes

- Unit: `server/test/modules/account-links/{account-link.bo,account-links.mapper,invitations.service,password-resets.service}.spec.ts` (fakes em `test/support/account-links-fakes.ts`: `InvitationsDaoFake`, `PasswordResetsDaoFake`).
- Integração: `server/test/integration/account-links.spec.ts` (link no e-mail igual ao da resposta, lista, `EMAIL_TAKEN`/`ALREADY_INVITED`, reenviar mata o link velho, cancelar, 403 de jogador, sugestão do @, aceite com cookie e papel, token repetido e vencido, @ tomado com o convite ainda valendo, e-mail tomado no meio, 429 por IP e por admin) e `password-resets.spec.ts` (link no e-mail, troca com o cookie velho caindo, vencido, `SELF_ACTION`, `ACCOUNT_SUSPENDED`, suspensão apaga o link, 2FA mantido).
