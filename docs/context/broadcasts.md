# Broadcasts (comunicados por e-mail)

Avisos do serviço por e-mail a muitas contas de uma vez: mudança de preço ou de condições dos planos (30 dias antes, como os Termos prometem) e fim do serviço. Só aviso do serviço, sem descadastro: novidade e propaganda exigiriam consentimento e opt-out, e não passam por aqui. Módulo `server/src/modules/broadcasts/`; a tela é `/admin/comunicados` ("Comunicados" na lateral do backoffice). Os e-mails usam o molde de [`mail.md`](mail.md).

## Fluxo

1. **Rascunho** (`POST /admin/broadcasts`): segmento, assunto, título, parágrafos e botão opcional. A resposta traz o público do segmento naquele instante.
2. **Prévia** (`POST /admin/broadcasts/preview`, sem gravar): o HTML que o server monta, cumprimentando o próprio admin. O client mostra num `iframe` com `sandbox=""` e `srcDoc`; o molde nunca é montado no client.
3. **Teste** (`POST …/:broadcastId/test`): só para o e-mail do admin da sessão, pelo mailer de verdade (falha = 502 `MAIL_DELIVERY_FAILED`). Grava `tested_at`. Reescrever o rascunho (`PUT …/:broadcastId`) apaga o `tested_at`: o teste vale para o texto exato.
4. **Confirmação** (`POST …/:broadcastId/confirm`, corpo `{ total }`): numa transação, `FOR UPDATE` no comunicado → `MailBroadcastBo.requireConfirmable(2FA)` (já confirmado → `ALREADY_CONFIRMED`; admin sem 2FA → `TWO_FACTOR_REQUIRED`; sem teste → `TEST_REQUIRED`) → o público é **congelado** (um `INSERT … SELECT` com uma linha por conta em `mail_broadcast_deliveries`) → o total digitado tem de ser o congelado (`CONFIRMATION_MISMATCH`, e o rollback desfaz as linhas) → `confirmed_at` e `total`. Conta criada depois não entra.
5. **Envio**: o `BroadcastSenderService` esvazia a fila em lotes (abaixo). Quando nenhuma entrega está aberta, `finished_at`.

Um disparo errado não se desfaz: por isso as quatro travas (2FA, prévia, teste, total digitado).

## Segmentos (`broadcast-audience.dao.ts`)

`all` (toda conta ativa, o admin incluído) · `paid` (plano pago em vigor, por `activePaidPlanSql`) · `{ plan }` (um plano à venda pago em vigor: `apoiador`, `narrador`, `lenda`; o plano dado pelo admin não conta). Ativa = `suspended_at` nulo ou `suspended_until <= now()` (a mesma regra do login: suspensão com prazo vencido já não vale, antes da limpeza zerar as colunas). As contas são globais: um aviso do serviço não é de uma mesa.

## Tabelas (migração `0118_mail_broadcasts`)

- `mail_broadcasts`: `id`, `segment` (jsonb), `subject`, `title`, `paragraphs` (jsonb), `button` (jsonb, nulo), `created_by` (FK `set null`), `created_at`, `tested_at`, `confirmed_at`, `finished_at`, `total`. `CHECK`s: `total` existe exatamente quando `confirmed_at`; `finished_at` só depois de `confirmed_at`.
- `mail_broadcast_deliveries`: `id`, `broadcast_id` (FK `cascade`), `user_id` (FK `set null`: a linha fica como prova e é pulada), `attempts`, `claimed_until`, `sent_at`, `failed_at`, `skipped_at`, `error` (≤ 500). `CHECK`: no máximo um dos três fins. Único `(broadcast_id, user_id)`; índice parcial das abertas.
- `mail_broadcast_deliveries.user_id` e `mail_broadcasts.created_by` ficam sem índice próprio (aceitos no `foreign-key-indexes.spec.ts`): o `set null` só dispara quando o admin exclui uma conta.
- **O e-mail nunca fica na fila**: é aberto do `users.email_cipher` pelo `DataCipherPort` na hora do envio. O erro guardado tira o endereço (`redactedFailure`).

## Envio em lotes (`broadcast-sender.service.ts`)

- Ciclo a cada minuto (`BROADCAST_SEND_INTERVAL_MS`) pela `SchedulerPort` (tarefa `broadcast-sender`, um `TimerScheduler` próprio do `wireBroadcasts`), do `onReady` ao `onClose`; o próximo só é agendado quando o atual termina.
- Lote de 50 (`BROADCAST_BATCH_SIZE`) e 600 ms entre dois e-mails (`BROADCAST_SEND_GAP_MS`, pela `SendPacePort`; adaptador `TimerSendPace` em `infrastructure/send-pace/`): abaixo de 2 por segundo, o limite por conta de provedores como o Resend (429 acima). Dá cerca de 2000 por hora.
- **Reserva**: `MailBroadcastDeliveriesDao.claim(now, until, limite)` é um `UPDATE … WHERE id IN (SELECT … FOR UPDATE SKIP LOCKED LIMIT n)` que grava `claimed_until = agora + 5 min` (`BROADCAST_CLAIM_MS`). Dois ciclos ao mesmo tempo nunca pegam a mesma linha; um ciclo que morre (deploy) libera as dele quando o prazo passa. Sem transação longa: o envio acontece fora dela.
- Por entrega: conta excluída → `skipped_at`; envio certo → `sent_at`; falha → `attempts + 1` e a linha volta à fila no ciclo seguinte; na 3ª falha (`BROADCAST_MAX_ATTEMPTS`) → `failed_at` com o erro. A falha de um e-mail não para o lote. Erro do ciclo vai ao log (`broadcast sending cycle failed; retrying in a minute`) e o ciclo nunca rejeita.
- Entrega **pelo menos uma vez**: o processo que cai entre o `send` e o `markSent` reenvia aquele e-mail depois do prazo da reserva.

## E-mail (`broadcast-mail.mapper.ts`)

`broadcastMail({ person, letter, publicUrl, replyTo })`: tom `gold`, ícone `mailSwap`, o título, "Oi, <apelido>!" abrindo o 1º parágrafo, os outros como escritos, o botão (só `https`, pelo DTO), a nota e o rodapé "Este aviso faz parte do serviço do Lorkarium e não pode ser desligado." Com `MAIL_REPLY_TO` a mensagem leva `replyTo` e a nota é "Dúvidas? É só responder a este e-mail."; sem ela, "Dúvidas? Fale com a gente pelo Contato do site do Lorkarium." e nenhum `replyTo`. Amostra `broadcast` ("Comunicado") no catálogo do `mail-samples.mapper.ts`.

## Guarda

5 anos, a prova do aviso (CDC art. 27): a limpeza de hora em hora apaga `mail_broadcasts` com `created_at` mais velho que `BROADCAST_RETENTION_MS` (5 × 365 + 2 dias, para os anos bissextos), e as entregas vão junto por cascade ([`housekeeping.md`](housekeeping.md)).

## Contrato (prefixo `/api`, sessão **e** papel `admin`: 401 `UNAUTHENTICATED` · 403 `FORBIDDEN_ROLE`)

| Rota                                       | Saída                                                   | Erros                                                                                                     |
| ------------------------------------------ | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `GET /admin/broadcasts`                    | 200 `{ broadcasts }` (o mais novo primeiro, com contas) | —                                                                                                         |
| `POST /admin/broadcasts/audience`          | 200 `{ audience }` (corpo `{ segment }`)                | 400                                                                                                       |
| `POST /admin/broadcasts/preview`           | 200 `{ subject, html, audience }`                       | 400                                                                                                       |
| `POST /admin/broadcasts`                   | 201 `{ broadcast, audience }`                           | 400                                                                                                       |
| `PUT /admin/broadcasts/:broadcastId`       | 200 `{ broadcast, audience }`                           | 400 · 404 `BROADCAST_NOT_FOUND` · 409 `ALREADY_CONFIRMED`                                                 |
| `POST /admin/broadcasts/:broadcastId/test` | 200 `{ broadcast, to }`                                 | 404 · 409 `ALREADY_CONFIRMED` · 502 `MAIL_DELIVERY_FAILED` · 429 (10/10 min por admin)                    |
| `POST …/:broadcastId/confirm`              | 200 `{ broadcast }` (corpo `{ total }`, inteiro ≥ 1)    | 400 · 404 · 403 `TWO_FACTOR_REQUIRED` · 409 `ALREADY_CONFIRMED`, `TEST_REQUIRED`, `CONFIRMATION_MISMATCH` |

DTOs em `packages/contracts/src/broadcasts/mail-broadcast.dto.ts`: `mailBroadcastSegmentDto`, `mailBroadcastContentDto` (assunto 1–120, título 1–80, 1 a 20 parágrafos de até 2000, botão `{ label ≤ 40, href https ≤ 2000 }` opcional, textos aparados), `mailBroadcastPreviewDto`, `mailBroadcastAudienceRequestDto`/`mailBroadcastAudienceDto`, `mailBroadcastDto` (`total` nulo no rascunho; `sent`, `failed`, `skipped`), `mailBroadcastsResponseDto`, `mailBroadcastDraftResponseDto`, `mailBroadcastTestResponseDto`, `mailBroadcastParamsDto`, `confirmMailBroadcastRequestDto`, `mailBroadcastResponseDto`. O PO guarda o segmento e o botão em tipos próprios (`StoredSegment`, `StoredButton`) e o mapper relê o segmento pelo DTO. Cada teste e cada confirmação vão ao log pino com `{ adminId, broadcastId }`.

## Client (`/admin/comunicados`)

- `services/broadcasts-api.ts` — `BroadcastsApi`/`HttpBroadcastsApi` (`list`, `audience`, `preview`, `create`, `rewrite`, `sendTest`, `confirm`), cada corpo pelo DTO antes de sair e cada resposta depois; falhas `BroadcastsFailure` pelo código (`two_factor_required`, `confirmation_mismatch`, `test_required`, `already_confirmed`, `mail_delivery_failed`, `not_found`, `rate_limited`…). Dependência `broadcastsApi` do `AppDependencies`.
- `broadcastsRoute(deps)` em `admin-routes.tsx` (lazy): o `loader` lê a lista e o 2FA do admin (`accountSecurityApi.security`; sem ler, o botão fica ligado e o server recusa); recusas pelo mesmo `refusedLoad` dos outros. Os comandos vão direto ao serviço, sem `action`.
- `broadcasts-page.tsx` (editor em cima, "Enviados" embaixo com "Atualizar"), `broadcast-editor-panel.tsx` ("Para quem" num `select`, "Vai para N contas." que segue o segmento, Assunto, Título, Texto — parágrafos separados por linha em branco —, botão opcional, "Ver prévia", "Enviar teste para mim"), `broadcast-send-panel.tsx` ("Enviar para N" só com o teste do texto exato na tela; ao clicar, "Digite N para confirmar" e "Confirmar envio" só com o número igual; sem 2FA, o `TwoFactorRequiredNote` "…para enviar um comunicado." no lugar), `use-broadcast-editor.ts` (o teste salva o rascunho antes: cria uma vez, reescreve depois; `CONFIRMATION_MISMATCH` reconta o público), `broadcast-messages.ts` (`contentCheckOf`: a frase do 1º campo a corrigir; `broadcastFailureMessage`) e `broadcast-view.ts` (`segmentLabel`, `audienceLabel`, `progressLabel` "1.240 de 1.300 enviados · 3 falhas · 1 conta excluída", `stateLabel` Rascunho/Enviando/"Concluído em 19/11/2026").

## Testes

- Contracts: `packages/contracts/test/broadcasts/mail-broadcast.dto.spec.ts`.
- Unit: `server/test/modules/broadcasts/{mail-broadcast.bo,broadcast-delivery.bo,broadcast-mail.mapper,broadcasts.mapper,broadcasts.service,broadcast-sender.service}.spec.ts`; fakes em `test/support/broadcasts-fakes.ts` (`BroadcastDeliveriesFake`, `SendPaceFake`, `BroadcastSenderLogFake`, `MailBroadcastsDaoFake`, `BroadcastAudienceFake`, `ConfirmationRunnerFake` com rollback, `TwoFactorStateFake`, `AccountRowsFake`, `claimedDelivery`).
- Integração: `broadcast-audience.spec.ts` (cada segmento, suspensão vigente × vencida, pago vencido, plano dado pelo admin), `broadcasts.spec.ts` (as rotas, o congelamento na confirmação, 401/403/404/409/502), `broadcast-deliveries.spec.ts` (a reserva com uma transação segurando linhas: o outro ciclo pula em vez de esperar; **dois ciclos ao mesmo tempo não mandam o mesmo e-mail duas vezes**; prazo da reserva; fim do comunicado; a limpeza de 5 anos com as entregas).
- Client: `client/test/services/broadcasts-api.spec.ts`, `test/features/admin/{broadcasts-page,broadcast-view,broadcast-messages}.spec.tsx`; fake `test/support/broadcasts-api-fake.ts` (`BroadcastsApiFake`, `mailBroadcast`).
