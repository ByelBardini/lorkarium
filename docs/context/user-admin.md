# User admin (backoffice das contas)

O backoffice sobre as contas: listar, trocar o papel, suspender e reativar, conferir e excluir. Vive em `server/src/modules/user-admin/` (lê e grava `users` do auth e as mesas que a conta é dona). Convites e links de nova senha são outro módulo: [`account-links.md`](account-links.md). A tela é [`client/backoffice.md`](client/backoffice.md). Plano de origem: `docs/plans/2026-10-24-tela-backoffice-usuarios.md` (fases 1–4).

## Estrutura

- `user-admin.dao.ts` — `UserAdminDao` (`DatabaseExecutor`): `listAccounts()` (todas as contas com `campaignCount` de `campaign_members`, numa consulta agrupada, a mais nova primeiro), `findAccount`, `setRole`, `setSuspendedAt`, `lockOwnedCampaigns(userId)` (`FOR UPDATE` nas mesas de que é dona, depois a contagem dos **outros** membros) e `delete` (sessões, participações, mesas e o que pende delas vão por cascade).
- `user-admin.bo.ts` — `requireOtherAccount(ator, alvo, ação)` → `SelfActionError`; `deletionVerdict(mesasPróprias)` → `blocked` (com as mesas de `otherMembers > 0`) ou `allowed` (com `soloCampaigns`).
- `user-admin.mapper.ts` — `toAdminUserDto(linha, cifra)` (e-mail aberto com o id, `status` de `suspended_at`, cor efetiva, `lastSeenAt`/`createdAt` em ISO; nunca hash nem colunas seladas) e `toDeletionCheckDto`.
- `user-admin.service.ts` — `UserAdminService`: `directory`, `changeRole`, `suspend`, `reactivate`, `deletionCheck`, `delete`. Escritas pelo `UserAdminTransactionRunner` (DAOs sobre o `tx`: contas, sessões, links de nova senha).
- `user-admin.routes.ts` (+ error handler próprio), `user-admin.error.ts` (`SELF_ACTION` 409, `USER_NOT_FOUND` 404, `OWNS_SHARED_CAMPAIGNS` 409 com `blockingCampaigns`), `user-admin.plugin.ts` (`createUserAdminModule`), ligado por `src/app/wire-backoffice.ts` depois do `account-links` (a lista lê os convites dele).

## Contrato (prefixo `/api`, sessão **e** papel `admin`: 401 `UNAUTHENTICATED` · 403 `FORBIDDEN_ROLE`)

| Rota                                      | Saída                                                                    | Erros                                                                                      |
| ----------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| `GET /admin/users`                        | 200 `{ users: AdminUserDto[], invitations: AdminInvitationDto[] }`       | —                                                                                          |
| `PATCH /admin/users/:userId`              | 200 `{ user }` (corpo `{ role }` estrito)                                | 400 · 404 `USER_NOT_FOUND` · 409 `SELF_ACTION`                                             |
| `POST /admin/users/:userId/suspend`       | 200 `{ user }` (idempotente); sessões e sockets caem                     | 400 · 404 · 409 `SELF_ACTION`                                                              |
| `POST /admin/users/:userId/reactivate`    | 200 `{ user }` (idempotente)                                             | 400 · 404 · 409 `SELF_ACTION`                                                              |
| `GET /admin/users/:userId/deletion-check` | 200 `{ blockingCampaigns: [{ id, name, otherMembers }], soloCampaigns }` | 400 · 404 · 409 `SELF_ACTION`                                                              |
| `DELETE /admin/users/:userId`             | 204                                                                      | 400 · 404 · 409 `SELF_ACTION` · 409 `OWNS_SHARED_CAMPAIGNS` (+ `blockingCampaigns`)        |
| `GET /admin/mail-samples`                 | 200 `{ samples: [{ id, name, subject }] }` (os 11, na ordem do catálogo) | —                                                                                          |
| `POST /admin/mail-samples/:sampleId/send` | 200 `{ subject, to }`; corpo `{ to }` (aparado, minúsculas)              | 400 · 404 `MAIL_SAMPLE_NOT_FOUND` · 502 `MAIL_DELIVERY_FAILED` · 429 (30/10 min por admin) |

Id malformado é 400 (o `adminUserParamsDto`). Cada ação vai ao log pino como `{ adminId, targetUserId, action }` "backoffice action" (nunca e-mail nem token): é o rastro do futuro "Registro de atividade".

## Regras e ordem

- O `otherMembers` conta todo papel da mesa, espectador incluído: mesa só com espectadores também bloqueia excluir a conta do dono.
- **Ninguém age sobre si** (`SELF_ACTION`): quem pede é um admin ativo, então tirar o admin de outro nunca zera os admins. Não há regra de "último admin".
- `changeRole`: grava; virar admin (de `user`) manda "Você agora é admin do Lorkarium", sem dizer quem deu (o e-mail é neutro). Tirar não avisa.
- `suspend`: na transação `suspended_at = agora` → `AuthSessionsDao.deleteAllOf` → `PasswordResetsDao.deleteOfUser`; depois do commit `sessionEnded` de cada sessão e o aviso "Seu acesso ao Lorkarium foi suspenso". Já suspensa: nada muda, ninguém é avisado. Os lugares nas mesas ficam (a pessoa aparece offline). O login com a senha certa dá 403 `ACCOUNT_SUSPENDED` e o `resolveSession` recusa (ver [`auth.md`](auth.md)).
- `reactivate`: `suspended_at = null` e "Seu acesso ao Lorkarium voltou"; ativa: nada.
- `deletionCheck`: `lockOwnedCampaigns` fora de transação (só leitura) → `deletionVerdict`.
- `delete`: na transação `lockOwnedCampaigns` → veredito (bloqueada lança e nada muda) → `deleteAllOf` das sessões (guarda os ids) → `delete`. Depois do commit: `sessionEnded` de cada, `CachedMemberships.forgetUser(userId)` e a foto (`avatars/<id>`) e a textura do dado (`dice-textures/<id>`) apagadas do S3. As imagens das mesas apagadas ficam como os órfãos de hoje.
- O `FOR UPDATE` faz um "entrar pelo código" concorrente esperar e falhar pela FK (`23503`) quando a mesa some; o `CampaignJoinService` traduz em `CAMPAIGN_NOT_FOUND` (ver [`campaigns.md`](campaigns.md)).
- Os avisos usam o `SecurityNoticesService` do `account-security` (best-effort) e os templates do `admin-mail.mapper.ts` ([`mail.md`](mail.md)).

## Teste de e-mail

- `mail-samples.service.ts` — `MailSamplesService({ mailer, appPublicUrl, clock })`: `list()` (id, nome e assunto de cada amostra) e `send(sampleId, to)` pelo **mailer de verdade** (SMTP em produção), não pelo `SecurityNoticesService`: a falha volta como `MAIL_DELIVERY_FAILED` (502, com o assunto e o motivo no log), para o admin ver que o SMTP não está funcionando. As amostras são as do `account-security/mail-samples.mapper.ts` (`mailSamples(to, publicUrl, clock.now())`, o mesmo catálogo do `pnpm mail:preview`): dados do mock e tokens inventados, links sobre o `APP_PUBLIC_URL`, o "Quando" dos avisos = a hora do envio (em Brasília).
- Vale em produção também (é o jeito de conferir o SMTP de lá); o `pnpm mail:preview` continua recusando produção.
- O módulo registra o `@fastify/rate-limit` no seu contexto (`UserAdminRateLimitedError`, `RATE_LIMITED` 429). O plugin recebe o `mailer` e o `clock` do `buildApp` (o mesmo `mailerOf` do app, ou o `MailerFake` dos specs).

## Testes

- Unit: `server/test/modules/user-admin/{user-admin.bo,user-admin.mapper,user-admin.service,mail-samples.service}.spec.ts` (fakes em `test/support/user-admin-fakes.ts`: `UserAdminDaoFake` com `owned` e `deleted`, `MembershipsForgetFake`, `StorageRemoveFake`; a transação é um runner que escreve `commit` no diário).
- Integração: `server/test/integration/user-admin.spec.ts` (lista e o que não sai no corpo, 401/403, suspensão com o socket caindo e o login 403, reativação, papel, `SELF_ACTION`, 400/404, exclusão livre e bloqueada, a mesa de outra campanha intacta, o `23503` do entrar concorrente com uma transação segurada).

## Armadilhas

- Apagar a conta do `ADMIN_EMAIL` faz o seed do boot recriá-la (com a senha do env) no próximo start: para tirar um admin do seed, mude o env antes.
