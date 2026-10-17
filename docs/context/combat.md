# Combat

Condições e combate da mesa (spec §3.5, §3.7, §5.3, §6): a lista de condições de cada mesa, as condições ativas nos tokens, a ordem de iniciativa, os turnos, as rodadas e a duração que desce no fim do turno de quem tem a condição. Server em `server/src/modules/conditions/` e `server/src/modules/combat/`; a borda Socket.IO é o gateway do `board` (ver [`board.md`](board.md)); a regra pura em [`game-core.md`](game-core.md) (Combate); DTOs em [`contracts.md`](contracts.md) (`condition.dto.ts`, `combat.dto.ts`). O client em [`client/combat.md`](client/combat.md).

## Condições (`server/src/modules/conditions/`)

- Tabelas (`conditions.po.ts`, migração `0004_conditions`): `condition_definitions` (`id`, `campaign_id` cascade, `name`, `tone` enum `condition_tone` = `benefit` | `harm`, `icon` text não nulo (padrão `circle-dot`; texto e não enum do pg: a lista fechada mora no contrato, ícone novo não pede migração; a `0009_condition_icons` preencheu o ícone das 11 iniciais nas mesas antigas, pelo nome), `created_at`; índice único em (`campaign_id`, `lower(name)`)) e `active_conditions` (`id`, `token_id` cascade, `condition_id` cascade, `remaining_rounds` nulo = sem limite, `applied_round` (migração `0007_condition_applied_round`: a rodada do combate em que foi aplicada, nulo fora de combate — e nas linhas de antes da `0007`), `applied_at`; único (`token_id`, `condition_id`)).
- Lista inicial (`DEFAULT_CONDITIONS` em `condition-rules.bo.ts`): Abençoado, Concentrando, Invisível (benéficas); Agarrado, Amedrontado, Atordoado, Caído, Cego, Envenenado, Imobilizado, Paralisado (prejudiciais), cada uma com seu ícone (`NewConditionDefinition` `{ name, tone, icon }`). A `0004` deu a lista às mesas que já existiam; mesa nova nasce com ela na transação da criação (`CampaignWriteDaos.conditions`).
- `ConditionsDao`: `insertDefinitions`, `insertDefinition`, `listDefinitions`, `findDefinitionInCampaign` (só da mesa: de outra → `undefined`), `findDefinitionByName` (sem caixa), `apply(tokenId, conditionId, { remainingRounds, appliedRound })` (`ConditionDuration`; reaplicar troca a duração e a rodada), `remove(tokenId, activeId)` → `boolean`, `listOfTokens(ids)`, `setRemaining`, `deleteActive`. `ActiveConditionRow` traz nome, tom e ícone da definição.
- `ConditionRulesBo`: `durationOf(0)` → `null` (sem limite); `defineOrReuse(existente)` → reaproveita o nome que já existe.
- `ConditionsService`: `define` (mestre; nome que já existe → devolve a versão atual **sem** criar, somar versão nem publicar), `applyMany` (tudo ou nada: `findManyInScene`, um id fora da cena → `TOKEN_NOT_FOUND`, um token sem controle → `FORBIDDEN` antes de gravar qualquer um; grava cada um, soma **uma** versão e publica **um** `condition:appliedMany`), `apply` e `remove` (mestre ou quem controla o token, pelo `TokenAccessBo`; token da cena da mesa; definição da mesa, senão `CONDITION_NOT_FOUND`). `apply` e `applyMany` carimbam a rodada do combate da cena (`CombatDao.findOfScene`, preso ao `tx`) como `appliedRound`. Publica `condition:defined` / `condition:applied` / `condition:removed` à mesa toda (nada a redigir).
- O snapshot leva `conditionDefinitions` e `token.conditions`; os eventos `token:created/updated` também levam as condições do token.

## Combate (`server/src/modules/combat/`)

- Tabelas (`combat.po.ts`, migração `0005_combat`): `combats` (`id`, `scene_id` **único** e cascade, `round` (1), `current_combatant_id` sem FK — o service passa a vez antes de alguém sair —, `started_at`) e `combatants` (`id`, `combat_id` cascade, `token_id` cascade, `initiative` nulo, `tie_order`; único (`combat_id`, `token_id`)).
- `CombatDao`: `start(sceneId, tokenIds)` (`tie_order` na ordem de entrada), `findOfScene`, `addCombatants` (entram depois dos que estão; quem já está é ignorado), `removeCombatant`, `setInitiative`, `setTieOrders`, `setTurn`, `end`.
- `CombatBo` (`combat.bo.ts`) sobre o game-core: `start` (mestre; `COMBAT_ALREADY_ACTIVE`; token fora da cena → `TOKEN_NOT_FOUND`), `end`, `addCombatants`, `removeCombatant` (passa a vez se era a dele), `moveInTie` (só com vizinho empatado), `setInitiative` (mestre ou quem controla o token), `nextTurn(from)` (mestre ou quem controla o combatente **da vez**; `from` ≠ da vez → `TURN_ALREADY_CHANGED`), `previousTurn(from)` (mestre), `turnWithoutToken(tokenId)` (o `token:delete` usa), `order()`. Sem combate → `COMBAT_NOT_ACTIVE`.
- `combat.mapper.ts`: `toCombatState(row, controladores)` e `toCombatDto(row)` (combatentes já na ordem do `orderCombatants`).
- `CombatService`: todo comando trava a cena, lê tokens e combate, decide pelo BO, grava, soma a versão e publica depois do commit. `start` põe o primeiro da ordem na vez. `nextTurn` grava a vez nova e, no fim do turno de quem jogou, desce as condições dele pela rodada do turno que acabou (`tickAtTurnEnd(…, combat.round)`: a aplicada nessa rodada não conta; grava as que ficam, apaga as que expiram) — tudo num `combat:turnChanged` só, com `conditionChanges`, numa versão. `previousTurn` não devolve condição expirada (§12). `end` apaga o combate e mantém as condições nos tokens.
- `TokensService.delete` passa a vez se o token excluído era o da vez (mesma transação) e o `token:deleted` leva o `combat` resultante (ou `null`).
- Duas pessoas avançando o mesmo turno ao mesmo tempo: a trava da cena (`FOR UPDATE`) serializa, e a segunda recebe `TURN_ALREADY_CHANGED` (a vez anda uma vez só).

| Comando                                                                | Quem                           | Evento                                                  |
| ---------------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------- |
| `condition:define`                                                     | mestre                         | `condition:defined` `{ definition }`                    |
| `condition:apply`                                                      | mestre, quem controla          | `condition:applied` `{ tokenId, condition }`            |
| `condition:applyMany`                                                  | mestre, quem controla todos    | `condition:appliedMany` `{ applied }` (uma versão)      |
| `condition:remove`                                                     | mestre, quem controla          | `condition:removed` `{ tokenId, activeConditionId }`    |
| `combat:start`                                                         | mestre                         | `combat:started` `{ combat }`                           |
| `combat:end`                                                           | mestre                         | `combat:ended` `{}`                                     |
| `combat:addCombatants` · `combat:removeCombatant` · `combat:moveInTie` | mestre                         | `combat:updated` `{ combat }`                           |
| `combat:setInitiative`                                                 | mestre, quem controla o token  | `combat:updated` `{ combat }`                           |
| `combat:nextTurn`                                                      | mestre; quem controla o da vez | `combat:turnChanged` `{ combat, conditionChanges }`     |
| `combat:previousTurn`                                                  | mestre                         | `combat:turnChanged` `{ combat, conditionChanges: [] }` |

## Testes

- Unit: `server/test/modules/conditions/` e `server/test/modules/combat/` (BO, mapper, service com o diário `lock → save → bump → commit → publish`); fakes `ConditionsDaoFake`/`ConditionTransactionRunnerFake` (`test/support/conditions-fakes.ts`) e `CombatDaoFake`/`CombatTransactionRunnerFake` (`combat-fakes.ts`).
- Integração: `conditions-dao.spec.ts`, `conditions.spec.ts`, `combat-dao.spec.ts`, `combat.spec.ts` (clientes reais: ordem, rodada, expiração no mesmo evento, passar a vez, corrida, `token:delete` do da vez, encerrar, reinício). Arnês comum em `test/support/live-table.ts` (`atTable`, `envelope`, `send`, `synced`, `eventPayload`, `silence`), também usado pelo `tokens.spec.ts`. A `scenes-migration.spec.ts` prova a lista inicial da `0004` e os ícones da `0009` numa mesa antiga.

## Armadilhas

- O estado do combate fala `currentCombatantId`; o `TurnState` do game-core fala `currentId`. Converta (`turnOf` no `combat.bo.ts`): passar o objeto do combate direto deixa o game-core sem ninguém na vez.
- `addCombatants` numerava os repetidos antes de ignorá-los e deixava buraco na `tie_order`: filtre os que já estão antes de numerar.
