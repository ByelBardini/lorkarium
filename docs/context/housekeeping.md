# Housekeeping

Limpeza de hora em hora das tabelas que só crescem: recibos de comando com mais de 24 h, sessões de login, desafios 2FA e links do cadastro público vencidos, e comunicados com mais de 5 anos. Módulo `server/src/modules/housekeeping/`, sem rota nem evento.

## Arquivos

- `housekeeping.dao.ts` — `HousekeepingDao(db).deleteBefore(swept, cut, limit)` → quantas linhas saíram. `SweptTable` = `document_receipts` (`library_document_actions.created_at`) · `sheet_receipts` (`sheet_actions.created_at`) · `sessions` (`auth_sessions.expires_at`) · `challenges` (`two_factor_challenges.expires_at`) · `signups` (`invitations.expires_at`, só `origin = 'self'`: o filtro `only` do `DATED_BY`; o convite do admin vencido **fica**, para o admin reenviar pela lista). Um `DELETE … WHERE ctid IN (SELECT ctid … WHERE <coluna> < $cut LIMIT $limit)` por chamada: um atraso longo nunca vira uma trava grande. As tabelas são globais (não de uma mesa): recibo, sessão e desafio vencidos não servem a ninguém.
- `housekeeping.service.ts` — `HousekeepingService({ dao, clock, scheduler, log })`: `start()` agenda a varredura em `HOUSEKEEPING_INTERVAL_MS` (1 h) pela `SchedulerPort` (tarefa `housekeeping-sweep`), `sweep()` limpa as tabelas na ordem acima e reagenda, `close()` cancela. Corte: `agora − RECEIPT_TTL_MS` (24 h) nos recibos, `agora` nas sessões, nos desafios e nos links de cadastro. Lote de `HOUSEKEEPING_BATCH_MAX` (1000): lote cheio pede outro na hora, até a tabela ficar limpa. Falha no DAO é logada (`housekeeping sweep failed; retrying in an hour`, com `err`) e a próxima rodada fica no horário; o `sweep` nunca rejeita.
- Comunicados: `SweptTable` também tem `broadcasts` (`mail_broadcasts.created_at`), por último, com o corte `agora − BROADCAST_RETENTION_MS` (5 × 365 + 2 dias: 5 anos de prova do aviso, os bissextos inclusos); as entregas saem junto por cascade ([`broadcasts.md`](broadcasts.md)).
- `housekeeping.plugin.ts` — `wireHousekeeping(app, { db, clock, scheduler })`: `start` no `onReady`, `close` no `onClose`. O `buildApp` liga logo depois do `wireAccessLog`, com o relógio do app e um `TimerScheduler` próprio.

## Tabelas (migração `0103_receipt_created_at`)

- `library_document_actions.created_at` e `sheet_actions.created_at` (`timestamptz`, padrão `now()`, não nulos), com `library_document_actions_created_idx` e `sheet_actions_created_idx`. Os tipos `DocumentActionPo` e `SheetActionPo` omitem a coluna: quem grava e lê o recibo não olha a idade. Recibo que existia na migração nasce com a hora dela.
- `auth_sessions_expires_at_idx` e `two_factor_challenges_expires_at_idx`: o `DELETE` em lote acha os vencidos sem varrer a tabela.

## Regra

- **Recibo vale 24 h.** Depois disso o mesmo `actionId` é um comando novo (o retry de um ack perdido chega em segundos, não num dia). Ver [`documents/server.md`](documents/server.md) e [`sheets/server.md`](sheets/server.md).
- Sessão vencida já era recusada no login por cookie; a limpeza só tira a linha (ver [`auth.md`](auth.md)).
- **Suspensão com prazo vencida** (depois das tabelas): `HousekeepingDao.liftExpiredSuspensions(agora, 1000)` zera `suspended_at` e `suspended_until` das contas com `suspended_until <= agora` (um `UPDATE … WHERE id IN (SELECT … LIMIT)` com `RETURNING`) e devolve as linhas; cada uma vai à `SuspensionEndedPort` (`suspension-ended.port.ts`; no app o `SuspensionEndedNoticeService` do módulo `sanctions`, que manda o "Seu acesso ao Lorkarium voltou"). O e-mail que falha não desfaz nada: vai ao log (`could not tell an account its suspension ended`, com `userId`) e as outras contas seguem. O login já libera no instante do fim; a limpeza é o que avisa a pessoa e limpa as colunas ([`sanctions.md`](sanctions.md)). Deps novas do serviço: `expired` (o mesmo DAO) e `suspensionEnded`; o `wireHousekeeping` recebe a porta.
- **E-mail banido** (`SweptTable` `banned_emails` = `banned_email_indexes.banned_at`): sai depois de `BANNED_EMAIL_KEPT_MS` (5 anos + 2 dias, do `account-sanction.bo.ts`), o mesmo corte com que o convite deixa de recusar o e-mail ([`sanctions.md`](sanctions.md)).
- **Guarda das denúncias** (por último): `reportRetention.purge()`, o `ReportRetentionService` do módulo `reports` (o `wireHousekeeping` monta pelo `createReportRetention(db, clock)`). Denúncia fechada há mais de 6 meses e print solto há mais de 24 h saem em lotes de 500, cada um numa transação que põe as chaves dos prints na `storage_deletions`; aberta nunca sai ([`reports.md`](reports.md), Guarda). Falha vai ao mesmo log da varredura.
- **Guarda dos relatos** (depois das denúncias): `feedbackRetention.purge()`, o `FeedbackRetentionService` do módulo `feedback` (`createFeedbackRetention(db, clock)`): print de relato solto há mais de 24 h sai em lotes de 500, com a chave na `storage_deletions` ([`feedback.md`](feedback.md)). O relato não envelhece: publicar ou arquivar o apaga.

## Testes

- Unit `server/test/modules/housekeeping/housekeeping.service.spec.ts` (`HousekeepingDaoFake` e `HousekeepingFailureLogFake` de `test/support/housekeeping-fakes.ts`, `SchedulerFake`, `ClockFake`): a 1ª rodada só depois de 1 h, com o corte de cada tabela; reagenda depois de cada rodada; lote cheio repete a tabela; falha logada sem rejeitar e com a próxima agendada; `close` cancela.
- Integração `server/test/integration/housekeeping.spec.ts`: recibo de 25 h some e o de 1 h fica (nas duas tabelas); sessão e desafio vencidos somem e os válidos ficam; link de cadastro (`self`) vencido some, o vivo e o convite do admin vencido ficam; 2500 recibos velhos saem na mesma varredura; o `actionId` de um recibo apagado volta a gravar.
- Relatos: unit com `FeedbackRetentionFake` (`test/support/feedback-fakes.ts`), a falha logada depois de a guarda das denúncias rodar.
- Denúncias: unit com `ReportRetentionFake` (`test/support/reports-fakes.ts`: uma purga por varredura, a falha logada sem rejeitar); a regra e o Postgres em `reports.md` (Testes).
- Suspensões: unit com `ExpiredSuspensionsDaoFake` e `SuspensionEndedFake` (as vencidas avisadas, o aviso que falha logado sem parar as outras, lote cheio repete); integração: fim há 1 h e fim igual a agora saem, fim amanhã e suspensão sem prazo ficam.
