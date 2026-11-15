# Reputation

Voto 👍/👎 de uma conta em outra, mostrado no card de perfil. Vive em `server/src/modules/reputation/`. DTOs em `packages/contracts/src/profiles/reputation.dto.ts` (`reputationVoteDto`, `reputationSummaryDto`, `REPUTATION_MIN_VOTES = 5`).

Só vota quem **divide uma mesa** com a pessoa: os dois sentados na mesma `campaign_members` como `master` ou `player`. Espectador e admin em modo juggernaut (`juggernaut_since` não nulo) não contam. Um voto por par, trocável e removível. Não há evento em tempo real: o card relê o resumo.

## Tabela `reputation_votes` (migração `0110_reputation_votes`)

| Coluna                     | Tipo                                       | Regra                                         |
| -------------------------- | ------------------------------------------ | --------------------------------------------- |
| `voter_id`                 | `uuid`, FK `users.id`, `ON DELETE CASCADE` | quem votou (da sessão)                        |
| `target_id`                | `uuid`, FK `users.id`, `ON DELETE CASCADE` | em quem; índice `reputation_votes_target_idx` |
| `value`                    | `smallint`                                 | `CHECK reputation_votes_value` (`in (-1, 1)`) |
| `created_at`, `updated_at` | `timestamptz`, `DEFAULT now()`             | `updated_at` muda a cada troca                |

PK `(voter_id, target_id)`; `CHECK reputation_votes_not_self`. Apagar qualquer das contas apaga o voto.

## Estrutura

- `reputation-votes.po.ts` — a tabela; `ReputationVotePo`, `ReputationVoteValuePo` (`1 | -1`, sem importar o DTO)
- `reputation.dao.ts` — `ReputationDao(db | tx)`: `shareCampaign(a, b)` (self-join de `campaign_members`, `LIMIT 1`), `upsertVote` (`ON CONFLICT DO UPDATE`), `removeVote` (idempotente), `countsFor(target, viewer)` → `{ up, down, myVote }` numa consulta (`count(*) filter`)
- `reputation.bo.ts` — `ReputationVoteBo.requireAllowed({ voterId, targetId, shareCampaign })` e `summarizeReputation(counts, minVotes)` (o `percent` arredondado, `null` abaixo do mínimo)
- `reputation.mapper.ts` — `toReputationSummaryDto`
- `reputation.service.ts` — `ReputationService({ votes, accounts, minVotes })`: `vote`, `removeVote`, `summaryOf(target, viewer)`, `shareCampaign(a, b)`. `accounts` é o `UsersDao.isActive` (conta existe e não está suspensa)
- `reputation.routes.ts` · `reputation.plugin.ts` — `createReputationModule({ db })` → `{ plugin, service }`, registrado no `buildApp` sob `/api` (`const reputation`)
- `reputation.error.ts` — `ReputationError` com `code` `REPUTATION_SELF` | `REPUTATION_NOT_ALLOWED` | `REPUTATION_TARGET_NOT_FOUND` | `RATE_LIMITED`

**Para o card:** `reputation.service.summaryOf(targetId, viewerId)` dá o `reputationSummaryDto` pronto, e `reputation.service.shareCampaign(a, b)` diz se os botões de voto ficam ativos. Dentro de uma transação ou de outro DAO, `new ReputationDao(tx).countsFor` / `.shareCampaign`.

## Contrato (prefixo `/api`, exigem sessão)

| Rota                               | Corpo                | Sucesso | Erros                                                                                                                                   |
| ---------------------------------- | -------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `PUT /users/:userId/reputation`    | `{ value: 1 \| -1 }` | 204     | 400 corpo ou `REPUTATION_SELF` · 401 · 403 `REPUTATION_NOT_ALLOWED` · 404 `REPUTATION_TARGET_NOT_FOUND` (inexistente ou suspensa) · 429 |
| `DELETE /users/:userId/reputation` | —                    | 204     | 401 · 404 · 429. Não exige mesa em comum: quem saiu da mesa ainda tira o voto                                                           |

Limite: 30 escritas por minuto por conta, somando as duas rotas (`retryAfterSeconds`).

## Testes

- Unit: `server/test/modules/reputation/` (BO e service, com `ReputationDaoFake` e `ActiveAccountsFake` em `test/support/reputation-fakes.ts`)
- Integração: `server/test/integration/reputation.spec.ts` (troca de voto, `myVote` por leitor, espectador, juggernaut, suspensa, 429, cascata)
