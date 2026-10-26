# Rolagens salvas

Detalhe de [`../dice.md`](../dice.md). A combinação de peças da bandeja que a pessoa guarda com um nome ("Acerto", "Bênção") para rolar de novo. É **do membro e da mesa**: só o dono vê, edita e apaga; outra mesa, outra lista. Concatenar copia as peças (nunca referencia outra salva). Vive em `server/src/modules/saved-rolls/` (fases 11 e 12 do plano `docs/plans/2026-10-25-sistema-de-dados.md`).

## Tabela (`saved-rolls.po.ts`, migração `0060_saved_rolls`)

- `saved_rolls`: `id` (uuid, `gen_random_uuid()`), `campaign_id`, `user_id`, `name` (`text`, `CHECK saved_rolls_name_length` `char_length BETWEEN 1 AND 40`), `name_key` (`text`), `parts` (`jsonb`, `SavedRollPartPo[]` = `{ label: string | null, expression }`), `created_at`, `updated_at`.
- **FK composta** `saved_rolls_member_fk` → `campaign_members(campaign_id, user_id)` `on delete cascade` (o molde de `member_cards`): só membro guarda, e sair da mesa (ou apagar a mesa) apaga as salvas dela ali — as de outra mesa ficam.
- **Único** `saved_rolls_member_name_unique` em `(campaign_id, user_id, name_key)`. `name_key` é o nome sem caixa, sem acento e sem espaço nas pontas, calculado no app por `savedRollNameKey` (contracts), porque o `unaccent` do Postgres exige extensão. "Acerto" e " ACÉRTO" repetem para a Bia; o Caio pode usar o mesmo nome. O índice também serve à lista (prefixo `campaign_id, user_id`).
- `truncateAllTables` (`server/test/support/test-database.ts`) inclui `saved_rolls`.

## DAO (`saved-rolls.dao.ts`)

`SavedRollsDao(db | tx)` — toda consulta filtra pelo par `(campaign_id, user_id)` do dono (§2.6): rolagem de outro membro ou de outra mesa nunca é lida, mudada nem apagada.

- `listOf(campaignId, userId)` → `SavedRollPo[]` na ordem de criação (`created_at`, `id`)
- `countOf(campaignId, userId)` → número
- `lockOwner(campaignId, userId)` → `boolean`: `SELECT … FROM campaign_members … FOR NO KEY UPDATE` na linha do membro (no `tx`); `false` se ele saiu. Por quê: duas criações simultâneas do mesmo membro contam uma depois da outra e nunca passam de 50 juntas. `NO KEY UPDATE` não bloqueia o `KEY SHARE` das FKs que apontam para o membro (ficha, salvas).
- `insert(row)` → a linha; `update(campaignId, userId, id, changes)` → a linha ou `undefined` (não é do dono), soma `updated_at`; `remove(campaignId, userId, id)` → `boolean`

## Regra (`saved-roll.bo.ts`)

`SavedRollRulesBo(maxSaved)` (o `SAVED_ROLLS_MAX` entra pelo plugin):

- `requireReadable(expressions)` delega ao `requireReadableDice` de `server/src/modules/dice/dice-roll.bo.ts` (a mesma leitura da rolagem; o erro é o `InvalidDiceExpressionError` de `dice/dice.error.ts`, e as rotas o traduzem em 400 antes do `SavedRollsError`): cada peça pelo `parseDiceExpression` do game-core (o motivo é o do game-core, sem o prefixo 0-based dele) e a composição pelo `parseDiceParts` (1 a 10 peças, até 1000 dados somados). Peça ilegível → `INVALID_DICE_EXPRESSION` com `part` contado **a partir de 1** e a expressão: `part 2 ("2d") cannot be read: Expected the number of sides at position 2; got the end of the expression.`; composição recusada → `part: null`, `the roll cannot be read: Dice roll has 11 parts: …`.
- `requireRoomFor(guardadas)`: a 51ª → `SAVED_ROLLS_LIMIT` "saving would keep 51 of 50 saved rolls …".

## Service (`saved-rolls.service.ts`)

`SavedRollsService({ members, rolls, transaction, maxSaved })`; o dono (`SavedRollOwner { campaignId, userId }`) vem sempre da sessão + rota.

- Todo método começa por `memberAccessOf` (espectador → `FORBIDDEN` antes de qualquer leitura das salvas; fora da mesa → `CAMPAIGN_NOT_FOUND`). O espectador assiste e não rola, então nem lista (a lista fechada de leituras de espectador em [`../campaigns/papeis.md`](../campaigns/papeis.md) não ganhou linha).
- `create`: BO das peças **antes** da transação → `transaction(lockOwner → countOf → requireRoomFor → insert)` → commit. Membro que saiu entre a checagem e a trava → `CAMPAIGN_NOT_FOUND`.
- `update`: BO das peças (se vierem) → `rolls.update` (sem transação: um comando só); `undefined` → `SAVED_ROLL_NOT_FOUND`.
- `remove`: `false` → `SAVED_ROLL_NOT_FOUND`.
- Nome repetido: o `23505` do `saved_rolls_member_name_unique` (inclusive duas criações ao mesmo tempo) vira `SAVED_ROLL_NAME_TAKEN` citando o nome recebido.
- `saved-rolls.mapper.ts`: `toSavedRollDto` (sem mesa, dono, chave nem datas), `toNewSavedRollPo` e `toSavedRollChangesPo` (o nome viaja sempre com o `nameKey`).

## Contrato (`packages/contracts/src/dice/saved-roll.dto.ts`)

- `SAVED_ROLL_NAME_MAX_LENGTH` (= `DICE_ROLL_LABEL_MAX_LENGTH`, 40: o nome vira o rótulo da rolagem), `SAVED_ROLLS_MAX` (50), `savedRollNameKey(nome)`.
- `savedRollNameDto` (aparado, 1 a 40), `savedRollPartsDto` (1 a 10 `diceRollPartDto` do `dice.dto.ts`: rótulo aparado ou `null`, expressão aparada de 1 a 200).
- `savedRollDto { id, name, parts }`, `savedRollsResponseDto { savedRolls }`, `createSavedRollRequestDto { name, parts }`, `updateSavedRollRequestDto { name?, parts? }` (estrito; `{}` → "changes is empty; expected at least one of name, parts"), `savedRollParamsDto { campaignId, savedRollId }`.

## Rotas (`saved-rolls.routes.ts`, sob `/api`, todas com sessão)

| Rota                                                     | Resposta                                    |
| -------------------------------------------------------- | ------------------------------------------- |
| `GET /campaigns/:campaignId/saved-rolls`                 | 200 `savedRollsResponseDto` (só as do dono) |
| `POST /campaigns/:campaignId/saved-rolls`                | 201 `savedRollDto`                          |
| `PATCH /campaigns/:campaignId/saved-rolls/:savedRollId`  | 200 `savedRollDto`                          |
| `DELETE /campaigns/:campaignId/saved-rolls/:savedRollId` | 204                                         |

| Código                    | Status | Mensagem pública                                        |
| ------------------------- | ------ | ------------------------------------------------------- |
| `INVALID_BODY`            | 400    | caminho e regra do Zod                                  |
| `INVALID_DICE_EXPRESSION` | 400    | **a do domínio** (a peça e o motivo do game-core)       |
| sem sessão                | 401    | a do `requireAuth`                                      |
| `FORBIDDEN`               | 403    | Your role at this table does not allow it               |
| `CAMPAIGN_NOT_FOUND`      | 404    | Campaign not found (id malformado também)               |
| `SAVED_ROLL_NOT_FOUND`    | 404    | Saved roll not found (de outro, outra mesa, malformado) |
| `SAVED_ROLL_NAME_TAKEN`   | 409    | You already have a saved roll with this name            |
| `SAVED_ROLLS_LIMIT`       | 422    | You already keep 50 saved rolls at this table           |
| `RATE_LIMITED`            | 429    | Too many changes in a row + `retryAfterSeconds`         |

- O "50" do `SAVED_ROLLS_LIMIT` está **escrito** no texto (`saved-rolls.routes.ts`), não lido do `SAVED_ROLLS_MAX`: mudar o máximo é mudar a mensagem junto.
- `INVALID_DICE_EXPRESSION` é a exceção à regra "texto público fixo": a mensagem só tem a expressão da própria pessoa e diz qual peça corrigir.
- **30 escritas por minuto por usuário, somando `POST`, `PATCH` e `DELETE`**: um limitador só, `app.rateLimit(perUserRateLimit(30, '1 minute', userOf))`, posto no `preHandler` das três depois do `requireAuth`. Por quê: o `config.rateLimit` por rota dá a cada rota um store próprio (e o `groupId` não junta stores do `LocalStore`), então seriam 30 por rota. O `GET` não conta.
- `saved-rolls.plugin.ts`: `createSavedRollsModule({ db })` → `{ plugin }`, registrado no `buildApp` logo depois da biblioteca.

## Testes

- Contracts `packages/contracts/test/dice/saved-roll.dto.spec.ts`: chave sem caixa/acento, aparar, 40/41 caracteres, 10/11 peças, `campaignId` no corpo recusado, `{}` no `PATCH`.
- Unit `server/test/modules/saved-rolls/{saved-roll.bo,saved-rolls.mapper,saved-rolls.service}.spec.ts` (diário `lock → count → insert:<nome> → commit`; nome repetido, 51ª e espectador param antes do insert; peça ilegível antes da transação).
- Fakes `server/test/support/saved-rolls-fakes.ts`: `savedRollPo()` ("Acerto" da Bia na Vharn, `ACERTO_ID`), `SavedRollsDaoFake(journal, rows)` (o índice único por `nameKey` do dono; `owners` responde o `lockOwner`), `SavedRollsTransactionRunnerFake`, `SavedRollNameViolationFake`.
- Integração `server/test/integration/saved-rolls-dao.spec.ts` (ordem, update/remove, isolamento por dono e por mesa, `countOf`, índice único, `CHECK`, FK, cascata ao sair e ao apagar a mesa, `lockOwner` serializa) e `saved-rolls.spec.ts` (`useTokenTable()`: cada linha das tabelas acima; a 51ª semeada pelo DAO porque 50 `POST` passariam do limite; a 31ª escrita misturando as três rotas).
