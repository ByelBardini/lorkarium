# Reports

Denúncia de uma conta por outra, com a fila no backoffice. Vive em `server/src/modules/reports/`. DTOs em `packages/contracts/src/profiles/user-report.dto.ts`.

Quem denuncia escolhe o motivo (`USER_REPORT_REASONS`) e pode escrever até 1000 caracteres. Não recebe nenhum retorno: a rota responde 201 sem corpo, e a denúncia não aparece no card. Cada par tem no máximo **uma aberta**; depois que o admin resolve ou arquiva, o par pode abrir outra. Punição é manual, pela suspensão do [`user-admin`](user-admin.md).

## Tabela `user_reports` (migração `0112_user_reports`)

| Coluna        | Tipo                                        | Regra                                                        |
| ------------- | ------------------------------------------- | ------------------------------------------------------------ |
| `id`          | `uuid`, `defaultRandom()`                   |                                                              |
| `reporter_id` | `uuid`, FK `users.id`, `ON DELETE CASCADE`  | da sessão                                                    |
| `target_id`   | `uuid`, FK `users.id`, `ON DELETE CASCADE`  | índice `user_reports_target_idx`                             |
| `reason`      | enum `user_report_reason`                   | `USER_REPORT_REASONS`                                        |
| `details`     | `text`                                      | `CHECK user_reports_details_length` (≤ 1000)                 |
| `status`      | enum `user_report_status`, `DEFAULT 'open'` | `open` → `resolved` \| `dismissed`                           |
| `resolved_by` | `uuid`, FK `users.id`, `ON DELETE SET NULL` | o admin; vira nulo se a conta dele for apagada               |
| `resolved_at` | `timestamptz`                               | `CHECK user_reports_resolved_at_when_closed` (nulo ⇔ `open`) |
| `created_at`  | `timestamptz`, `DEFAULT now()`              | a ordem da fila                                              |

Índice parcial único `user_reports_open_pair_idx (reporter_id, target_id) WHERE status = 'open'`: é ele que garante "uma aberta por par", sem corrida. Índice `user_reports_status_created_idx (status, created_at)` para a fila. `CHECK user_reports_not_self`.

## Estrutura

- `user-reports.po.ts` — a tabela e os dois enums, lidos das constantes do contracts como o `users.po.ts` faz com `USER_PLANS` (o driver aponta `seta-invertida`, o mesmo falso positivo do `users.po.ts`)
- `reports.dao.ts` — `ReportsDao(db | tx)`: `insertOpen` (`ON CONFLICT DO NOTHING` → `false` se já há aberta), `pageOf({ status, limit, offset })` → `{ rows, total }` (mais antiga primeiro), `closeOpen(id, adminId, status)` (só fecha `open`; devolve a linha com os @)
- `reports.bo.ts` — `UserReportBo.requireNotSelf`, `requireInserted`, `requireResolver(role)`
- `reports.mapper.ts` — `toUserReportDto`
- `reports.service.ts` — `ReportsService({ reports, accounts, pageSize })`: `report`, `list`, `resolve`; `accounts` é o `UsersDao.isActive` (existe e não está suspensa)
- `reports.routes.ts` · `reports.plugin.ts` — `createReportsModule({ db })`, registrado no `buildApp` sob `/api`
- `reports.error.ts` — `ReportsError` com `code` `REPORT_SELF` | `REPORT_TARGET_NOT_FOUND` | `REPORT_ALREADY_OPEN` | `REPORT_NOT_FOUND` | `REPORT_FORBIDDEN` | `RATE_LIMITED`

## Contrato (prefixo `/api`)

| Rota                             | Quem          | Entrada                                    | Sucesso                     | Erros                                                                                              |
| -------------------------------- | ------------- | ------------------------------------------ | --------------------------- | -------------------------------------------------------------------------------------------------- |
| `POST /users/:userId/reports`    | sessão        | `userReportRequestDto`                     | 201 sem corpo               | 400 corpo ou `REPORT_SELF` · 401 · 404 `REPORT_TARGET_NOT_FOUND` · 409 `REPORT_ALREADY_OPEN` · 429 |
| `GET /admin/reports`             | papel `admin` | `listUserReportsQueryDto` (`?status&page`) | 200 `userReportsPageDto`    | 400 query · 401 · 403 `FORBIDDEN_ROLE`                                                             |
| `PATCH /admin/reports/:reportId` | papel `admin` | `resolveUserReportRequestDto` `{ status }` | 200 `userReportResponseDto` | 400 (inclusive `open`) · 401 · 403 · 404 `REPORT_NOT_FOUND` (inexistente ou já fechada)            |

A fila: `status` padrão `open`, `page` a partir de 1, `USER_REPORTS_PAGE_SIZE = 50`, mais antiga primeiro, com o `total` do status. Cada item traz `reporter` e `target` (`{ id, username }`) e `resolvedBy` (o @ do admin). Limite da denúncia: 5 por minuto por conta.

## Tela (client)

`/admin/reports`, filha do `/admin` (mesma guarda `admin`, carregada por `lazy`), "Denúncias" na lateral entre Usuários e E-mails.

- `client/src/services/user-reports-api.ts` — `UserReportsApi` / `HttpUserReportsApi` (`deps.userReportsApi`): `list(query)` e `resolve(reportId, { status })`; a query e o corpo passam pelo `listUserReportsQueryDto` / `resolveUserReportRequestDto` antes de sair, as respostas pelo `userReportsPageDto` / `userReportResponseDto`. As recusas são as do backoffice (`UserAdminFailure`, pelo `userAdminFailureOf` exportado do `user-admin-api.ts`).
- `client/src/features/admin/admin-routes.tsx` — `reportsRoute(deps)`: o loader lê `?status&page` da URL (query inválida cai na primeira página das abertas), a recusa vai pelo mesmo `refusedLoad` das outras telas; o `ProfileCardProvider` envolve a página (o `/admin` fica fora do shell).
- `reports-action.ts` — `reportsAction`: `{ reportId, status }` → `resolve`; a revalidação do loader tira a denúncia fechada da lista. Sessão caída ou papel perdido vão ao ErrorBoundary, como em Usuários.
- `reports-page.tsx` — título, total aberto, "Nenhuma denúncia aberta." e o alerta da recusa (404 vira "Essa denúncia já foi fechada.").
- `reports-table.tsx` — motivo (`REPORT_REASON_LABEL` em `admin-messages.ts`), texto ("Sem texto" se nulo), os dois @, data, "Resolver" e "Arquivar"; o @ do denunciado vem do `targetOf`, que a rota preenche com o `ProfileCardTrigger` (abre o card).

## Testes

- Unit: `server/test/modules/reports/` (BO e service, com `ReportsDaoFake` em `test/support/reports-fakes.ts`)
- Client: `client/test/services/user-reports-api.spec.ts` e `client/test/features/admin/reports-route.spec.tsx` (fake `UserReportsApiFake`, fixtures em `client/test/support/user-reports-fixtures.ts`)
- Integração: `server/test/integration/reports.spec.ts` (409 do par, reabrir depois de fechar, 403 do não admin, paginação, `resolvedBy` nulo depois de apagar o admin, cascata)
