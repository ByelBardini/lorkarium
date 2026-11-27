# Rolagens salvas

Detalhe de [`../dice.md`](../dice.md). A combinação de peças da bandeja que a pessoa guarda com um nome ("Acerto", "Bênção") para rolar de novo. É **do membro e da mesa**: só o dono vê, edita e apaga; outra mesa, outra lista. Concatenar copia as peças (nunca referencia outra salva). Vive em `server/src/modules/saved-rolls/`.

## Tabela (`saved-rolls.po.ts`, migração `0060_saved_rolls`)

- `saved_rolls`: `id` (uuid, `gen_random_uuid()`), `campaign_id`, `user_id`, `name` (`text`, `CHECK saved_rolls_name_length` `char_length BETWEEN 1 AND 40`), `name_key` (`text`), `parts` (`jsonb`, `SavedRollPartPo[]` = `{ label: string | null, expression }`), `created_at`, `updated_at`.
- **FK composta** `saved_rolls_member_fk` → `campaign_members(campaign_id, user_id)` `on delete cascade` (o molde de `member_cards`): só membro guarda, e sair da mesa (ou apagar a mesa) apaga as salvas dela ali — as de outra mesa ficam.
- **Único** `saved_rolls_member_name_unique` em `(campaign_id, user_id, name_key)`. `name_key` é o nome sem caixa, sem acento e sem espaço nas pontas, calculado no app por `savedRollNameKey` (contracts), porque o `unaccent` do Postgres exige extensão. "Acerto" e " ACÉRTO" repetem para a Bia; o Caio pode usar o mesmo nome. O índice também serve à lista (prefixo `campaign_id, user_id`). `saved_rolls_folder_idx` (`folder_id` parcial, `0102_saved_roll_folder_index`): apagar uma pasta zera o `folder_id` sem varrer as salvas de todas as mesas.
- `truncateAllTables` (`server/test/support/test-database.ts`) inclui `saved_rolls`.

## Pastas (`saved_roll_folders`, migração `0077_saved_roll_folders`)

- Um nível só, do membro e da mesa, como as rolagens: `id`, `campaign_id`, `user_id`, `name`, `name_key`, `created_at`, a mesma FK composta `on delete cascade`, único `saved_roll_folders_member_name_unique` e `CHECK` de 1 a 40. Até `SAVED_ROLL_FOLDERS_MAX` (50) por membro.
- `saved_rolls.folder_id` → pasta, **set null**: apagar a pasta deixa as rolagens fora de pastas. O FK só diz que a pasta existe; a posse é conferida no service (`requireOwnFolder`, `findOf` pelo dono), e pasta de outro → `SAVED_ROLL_FOLDER_NOT_FOUND`.
- **O nome da rolagem continua único por membro entre todas as pastas**, de propósito: os comandos do chat acham a salva pelo nome (`savedRollSlugOf`) e não sabem de pasta. A pasta é só organização.
- `SavedRollFoldersDao` e `SavedRollFoldersService` (`list`, `create` sob o `lockOwner`, `rename`, `remove`). O mesmo limitador de 30 escritas por minuto soma as rotas de pasta.

| Rota                                                   | Resposta                             |
| ------------------------------------------------------ | ------------------------------------ |
| `GET /campaigns/:campaignId/saved-roll-folders`        | 200 `savedRollFoldersResponseDto`    |
| `POST /campaigns/:campaignId/saved-roll-folders`       | 201 `savedRollFolderDto` · 409 · 422 |
| `PATCH /campaigns/:campaignId/saved-roll-folders/:id`  | 200 `savedRollFolderDto` · 404 · 409 |
| `DELETE /campaigns/:campaignId/saved-roll-folders/:id` | 204 · 404                            |

Códigos: `SAVED_ROLL_FOLDER_NOT_FOUND` (404), `SAVED_ROLL_FOLDER_NAME_TAKEN` (409), `PLAN_LIMIT` (403, `savedRollFolders`), `SAVED_ROLL_FOLDERS_LIMIT` (422, "You already keep <`limit`> folders at this table"). Testes: `saved-roll-folders.service.spec.ts`, o `describe` de pastas em `saved-rolls.service.spec.ts` e na integração `saved-rolls.spec.ts`; fake `SavedRollFoldersDaoFake`.

## DAO (`saved-rolls.dao.ts`)

`SavedRollsDao(db | tx)` — toda consulta filtra pelo par `(campaign_id, user_id)` do dono (§2.6): rolagem de outro membro ou de outra mesa nunca é lida, mudada nem apagada.

- `listOf(campaignId, userId)` → `SavedRollPo[]` na ordem de criação (`created_at`, `id`)
- `countOf(campaignId, userId)` → número
- `rankOf(campaignId, userId, id)` → quantas salvas do mesmo membro na mesma mesa nasceram antes, por `(created_at, id)` (a ordem do `listOf`), num `LEFT JOIN` com o alias `older`; `undefined` se a salva não é do dono. Chamado na transação, depois do `lockPlans`.
- `lockPlans(campaignId, userId)` / `findPlans` → `SavedRollPlansPo | undefined` (`{ tableOwner, member }`): delegam ao `MemberPlansDao` (`plans/member-plans.dao.ts`, o mesmo dos tokens salvos): os dois planos lidos com a linha do membro em `FOR NO KEY UPDATE OF campaign_members` (sem trava no `find`); `undefined` se ele saiu. Duas criações do mesmo membro contam uma depois da outra; a mesa, o dono e a conta ficam livres.
- `insert(row)` → a linha; `update(campaignId, userId, id, changes)` → a linha ou `undefined` (não é do dono), soma `updated_at`; `remove(campaignId, userId, id)` → `boolean`

## Regra (`saved-roll.bo.ts`)

`SavedRollRulesBo(maxSaved)` (o `SAVED_ROLLS_MAX`, teto técnico, entra pelo plugin):

- `requireReadable(expressions)` delega ao `requireReadableDice` de `server/src/modules/dice/dice-roll.bo.ts` (a mesma leitura da rolagem; o erro é o `InvalidDiceExpressionError` de `dice/dice.error.ts`, e as rotas o traduzem em 400 antes do `SavedRollsError`): cada peça pelo `parseDiceExpression` do game-core (o motivo é o do game-core, sem o prefixo 0-based dele) e a composição pelo `parseDiceParts` (1 a 10 peças, até 1000 dados somados). Peça ilegível → `INVALID_DICE_EXPRESSION` com `part` contado **a partir de 1** e a expressão: `part 2 ("2d") cannot be read: Expected the number of sides at position 2; got the end of the expression.`; composição recusada → `part: null`, `the roll cannot be read: Dice roll has 11 parts: …`.
- O teto é o **maior entre a grade do dono da mesa e a grade pessoal do membro** (`memberSavedRollLimitsOf` de `plans/plan-limits.bo.ts`, sobre o `savedRollLimitsOf` do contracts): o Apoiador guarda 15 rolagens e 5 pastas em qualquer mesa, o Narrador 15/5, a Lenda 50/50; quem é Grátis na mesa de um Apoiador fica com 3/0 (a grade da mesa do Apoiador é a do Grátis). Todo método do BO recebe esse `SavedRollLimits` (`{ limits, holder }`), e a recusa leva o `holder` (`account` quando o teto veio do plano da pessoa, `table` quando veio da mesa).
- `requireRoomFor(guardadas, teto)`: primeiro o plano (`PlanLimitsBo.requireRoom('savedRolls', guardadas, 1, teto.limits, teto.holder)`: Grátis 3, Narrador e Apoiador 15 → `PLAN_LIMIT` 403 com `planLimit`), depois o técnico: a 51ª → `SAVED_ROLLS_LIMIT` "saving would keep 51 of 50 saved rolls …" (Lenda, Amigo do Dono e admin). `requireFolderRoom(guardadas, maxFolders, teto)` faz o mesmo com `savedRollFolders` (Grátis 0: nenhuma pasta; Narrador 5; Lenda 50 = técnico). A criação conta pelo `requireRoomFor`; o que passou do teto fica **só leitura** ([regra](../plans/excedente-so-leitura.md)):
- `requireConfigurable(rank, teto)` → `PlanLimitsBo.requireEditable('savedRolls', …, holder)`: a salva com `rank` ≥ teto (Grátis 3, Narrador e Apoiador 15) não muda nome nem peças → 403 `PLAN_LIMIT` `reason: 'readOnly'` ("saved roll 4 of plan free is read only (plan allows 3)"). Mover para pasta e apagar passam; apagar uma mais antiga destrava a seguinte. O grupo é o **membro** na mesa.
- `isPlanLocked(rank, limits)`: o mesmo sem lançar, o `planLocked` do DTO.

## Service (`saved-rolls.service.ts`)

`SavedRollsService({ members, rolls, transaction, maxSaved })` (a lista lê os dois planos pelo `rolls.findPlans`, sem trava); o dono (`SavedRollOwner { campaignId, userId }`) vem sempre da sessão + rota.

- Todo método começa por `memberAccessOf` (espectador → `FORBIDDEN` antes de qualquer leitura das salvas; fora da mesa → `CAMPAIGN_NOT_FOUND`). O espectador assiste e não rola, então nem lista (a lista fechada de leituras de espectador em [`../campaigns/papeis.md`](../campaigns/papeis.md) não ganhou linha).
- `create`: BO das peças **antes** da transação → `transaction(lockPlans → countOf → requireRoomFor → insert)` → commit. Membro que saiu entre a checagem e a trava → `CAMPAIGN_NOT_FOUND`.
- `list`: os dois planos sem trava (`findPlans`) → `listOf` (em ordem de criação, então o índice é o rank) → `planLocked` de cada uma.
- `update`: BO das peças (se vierem) → `transaction(lockPlans → rankOf (undefined → SAVED_ROLL_NOT_FOUND) → requireConfigurable se vier nome ou peças → pasta do dono → update)` → commit. A resposta leva o `planLocked` pelo rank (mover uma travada responde `planLocked: true`).
- `remove`: `false` → `SAVED_ROLL_NOT_FOUND`.
- Nome repetido: o `23505` do `saved_rolls_member_name_unique` (inclusive duas criações ao mesmo tempo) vira `SAVED_ROLL_NAME_TAKEN` citando o nome recebido.
- `saved-rolls.mapper.ts`: `toSavedRollDto(row, planLocked)` (sem mesa, dono, chave nem datas), `toNewSavedRollPo` e `toSavedRollChangesPo` (o nome viaja sempre com o `nameKey`).

## Contrato (`packages/contracts/src/dice/saved-roll.dto.ts`)

- `SAVED_ROLL_NAME_MAX_LENGTH` (= `DICE_ROLL_LABEL_MAX_LENGTH`, 40: o nome vira o rótulo da rolagem), `SAVED_ROLLS_MAX` (50), `savedRollNameKey(nome)`.
- `savedRollNameDto` (aparado, 1 a 40), `savedRollPartsDto` (1 a 10 `diceRollPartDto` do `dice.dto.ts`: rótulo aparado ou `null`, expressão aparada de 1 a 200).
- `savedRollDto { id, name, folderId, parts, planLocked }`, `savedRollsResponseDto { savedRolls }`, `createSavedRollRequestDto { name, parts }`, `updateSavedRollRequestDto { name?, parts? }` (estrito; `{}` → "changes is empty; expected at least one of name, parts"), `savedRollParamsDto { campaignId, savedRollId }`.

## Rotas (`saved-rolls.routes.ts`, sob `/api`, todas com sessão)

| Rota                                                     | Resposta                                    |
| -------------------------------------------------------- | ------------------------------------------- |
| `GET /campaigns/:campaignId/saved-rolls`                 | 200 `savedRollsResponseDto` (só as do dono) |
| `POST /campaigns/:campaignId/saved-rolls`                | 201 `savedRollDto`                          |
| `PATCH /campaigns/:campaignId/saved-rolls/:savedRollId`  | 200 `savedRollDto`                          |
| `DELETE /campaigns/:campaignId/saved-rolls/:savedRollId` | 204                                         |

| Código                    | Status | Mensagem pública                                             |
| ------------------------- | ------ | ------------------------------------------------------------ |
| `INVALID_BODY`            | 400    | caminho e regra do Zod                                       |
| `INVALID_DICE_EXPRESSION` | 400    | **a do domínio** (a peça e o motivo do game-core)            |
| sem sessão                | 401    | a do `requireAuth`                                           |
| `FORBIDDEN`               | 403    | Your role at this table does not allow it                    |
| `CAMPAIGN_NOT_FOUND`      | 404    | Campaign not found (id malformado também)                    |
| `SAVED_ROLL_NOT_FOUND`    | 404    | Saved roll not found (de outro, outra mesa, malformado)      |
| `SAVED_ROLL_NAME_TAKEN`   | 409    | You already have a saved roll with this name                 |
| `PLAN_LIMIT`              | 403    | a do `PlanLimitError` + `planLimit` (`withPlanLimitReply`)   |
| `SAVED_ROLLS_LIMIT`       | 422    | You already keep <`limit` do erro> saved rolls at this table |
| `RATE_LIMITED`            | 429    | Too many changes in a row + `retryAfterSeconds`              |

- O "50" do `SAVED_ROLLS_LIMIT` está **escrito** no texto (`saved-rolls.routes.ts`), não lido do `SAVED_ROLLS_MAX`: mudar o máximo é mudar a mensagem junto.
- `INVALID_DICE_EXPRESSION` é a exceção à regra "texto público fixo": a mensagem só tem a expressão da própria pessoa e diz qual peça corrigir.
- **30 escritas por minuto por usuário, somando `POST`, `PATCH` e `DELETE`**: um limitador só, `app.rateLimit(perUserRateLimit(30, '1 minute', userOf))`, posto no `preHandler` das três depois do `requireAuth`. Por quê: o `config.rateLimit` por rota dá a cada rota um store próprio (e o `groupId` não junta stores do `LocalStore`), então seriam 30 por rota. O `GET` não conta.
- `saved-rolls.plugin.ts`: `createSavedRollsModule({ db })` → `{ plugin }`, registrado no `buildApp` logo depois da biblioteca.

## Testes

- Contracts `packages/contracts/test/dice/saved-roll.dto.spec.ts`: chave sem caixa/acento, aparar, 40/41 caracteres, 10/11 peças, `campaignId` no corpo recusado, `{}` no `PATCH`.
- Unit `server/test/modules/saved-rolls/{saved-roll.bo,saved-rolls.mapper,saved-rolls.service}.spec.ts` (diário `lock → count → insert:<nome> → commit` e `lock → rank → update:<id> → commit`; nome repetido, 51ª e espectador param antes do insert; peça ilegível antes da transação; no Grátis a 4ª não renomeia, a 5ª não troca peças mas muda de pasta, a lista marca `planLocked` da 4ª em diante).
- Excedente só leitura na integração: `saved-rolls-plan-limit.spec.ts` (5 salvas da Bia nascidas no `amigo_do_dono`, a Ana descida ao Grátis: a 3ª renomeia, a 4ª 403 `readOnly` sem gravar; peças novas na 5ª recusadas e mover para pasta passa; lista `[f, f, f, t, t]`; apagar a 2ª → 204 e a antiga 4ª renomeia; rank por membro (o Caio); Ermo, outra mesa da Ana, não conta a Vharn; a grade pessoal: a Bia Apoiador na Vharn Grátis guarda 15 e a 16ª dá 403 `holder: 'account'`, 5 pastas e a 6ª 403; a Bia Grátis na mesa da Ana Apoiador fica com 3 e nenhuma pasta (`holder: 'table'`); a Bia Lenda passa da 15ª; a Bia que sai do Apoiador trava da 4ª em diante; o plano da Bia não chega à Ana) e o `rankOf` em `saved-rolls-dao.spec.ts`. Mutações desfeitas: rank sem `user_id`, sem `requireEditable` e `<` trocado por `>` deixaram cada cenário certo vermelho.
- Fakes `server/test/support/saved-rolls-fakes.ts`: `savedRollPo()` ("Acerto" da Bia na Vharn, `ACERTO_ID`), `SavedRollsDaoFake(journal, rows)` (o índice único por `nameKey` do dono; `owners` responde o `lockPlans`/`findPlans`, `tablePlans` o plano do dono e `memberPlans` o do membro, Grátis se não posto), `SavedRollsTransactionRunnerFake`, `SavedRollNameViolationFake`.
- Integração `server/test/integration/saved-rolls-dao.spec.ts` (ordem, update/remove, isolamento por dono e por mesa, `countOf`, índice único, `CHECK`, FK, cascata ao sair e ao apagar a mesa, `lockPlans` lê os dois planos e serializa, `findPlans` sem trava) e `saved-rolls.spec.ts` (`useTokenTable()`: cada linha das tabelas acima; a 51ª semeada pelo DAO porque 50 `POST` passariam do limite; a 31ª escrita misturando as três rotas).
