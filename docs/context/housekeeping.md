# Housekeeping

Limpeza de hora em hora das tabelas que só crescem: recibos de comando com mais de 24 h, sessões de login vencidas e desafios 2FA vencidos. Módulo `server/src/modules/housekeeping/`, sem rota nem evento.

## Arquivos

- `housekeeping.dao.ts` — `HousekeepingDao(db).deleteBefore(swept, cut, limit)` → quantas linhas saíram. `SweptTable` = `document_receipts` (`library_document_actions.created_at`) · `sheet_receipts` (`sheet_actions.created_at`) · `sessions` (`auth_sessions.expires_at`) · `challenges` (`two_factor_challenges.expires_at`). Um `DELETE … WHERE ctid IN (SELECT ctid … WHERE <coluna> < $cut LIMIT $limit)` por chamada: um atraso longo nunca vira uma trava grande. As tabelas são globais (não de uma mesa): recibo, sessão e desafio vencidos não servem a ninguém.
- `housekeeping.service.ts` — `HousekeepingService({ dao, clock, scheduler, log })`: `start()` agenda a varredura em `HOUSEKEEPING_INTERVAL_MS` (1 h) pela `SchedulerPort` (tarefa `housekeeping-sweep`), `sweep()` limpa as quatro tabelas na ordem acima e reagenda, `close()` cancela. Corte: `agora − RECEIPT_TTL_MS` (24 h) nos recibos, `agora` nas sessões e desafios. Lote de `HOUSEKEEPING_BATCH_MAX` (1000): lote cheio pede outro na hora, até a tabela ficar limpa. Falha no DAO é logada (`housekeeping sweep failed; retrying in an hour`, com `err`) e a próxima rodada fica no horário; o `sweep` nunca rejeita.
- `housekeeping.plugin.ts` — `wireHousekeeping(app, { db, clock, scheduler })`: `start` no `onReady`, `close` no `onClose`. O `buildApp` liga logo depois do `wireAccessLog`, com o relógio do app e um `TimerScheduler` próprio.

## Tabelas (migração `0103_receipt_created_at`)

- `library_document_actions.created_at` e `sheet_actions.created_at` (`timestamptz`, padrão `now()`, não nulos), com `library_document_actions_created_idx` e `sheet_actions_created_idx`. Os tipos `DocumentActionPo` e `SheetActionPo` omitem a coluna: quem grava e lê o recibo não olha a idade. Recibo que existia na migração nasce com a hora dela.
- `auth_sessions_expires_at_idx` e `two_factor_challenges_expires_at_idx`: o `DELETE` em lote acha os vencidos sem varrer a tabela.

## Regra

- **Recibo vale 24 h.** Depois disso o mesmo `actionId` é um comando novo (o retry de um ack perdido chega em segundos, não num dia). Ver [`documents/server.md`](documents/server.md) e [`sheets/server.md`](sheets/server.md).
- Sessão vencida já era recusada no login por cookie; a limpeza só tira a linha (ver [`auth.md`](auth.md)).

## Testes

- Unit `server/test/modules/housekeeping/housekeeping.service.spec.ts` (`HousekeepingDaoFake` e `HousekeepingFailureLogFake` de `test/support/housekeeping-fakes.ts`, `SchedulerFake`, `ClockFake`): a 1ª rodada só depois de 1 h, com o corte de cada tabela; reagenda depois de cada rodada; lote cheio repete a tabela; falha logada sem rejeitar e com a próxima agendada; `close` cancela.
- Integração `server/test/integration/housekeeping.spec.ts`: recibo de 25 h some e o de 1 h fica (nas duas tabelas); sessão e desafio vencidos somem e os válidos ficam; 2500 recibos velhos saem na mesma varredura; o `actionId` de um recibo apagado volta a gravar.
