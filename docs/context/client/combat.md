# Client · combate e condições

O tracker na aba "Combate" do painel da sala, as condições no cartão do token e a vez no tabuleiro. Server e contrato em [`../combat.md`](../combat.md); a sala em [`board.md`](board.md); o cartão e a lista "Na cena" em [`tokens.md`](tokens.md).

## Estado e comandos

- `board-events.ts` valida `condition:defined/applied/removed` e `combat:started/updated/turnChanged/ended`; `board-reducer.ts` aplica: definição entra na lista da mesa; condição aplicada troca a duração no lugar (mesma `conditionId`) ou entra no fim; removida sai; `condition:appliedMany` (`conditionsApplied`) aplica cada item com a mesma regra; `combat:turnChanged` troca o combate **e** as condições dos tokens em `conditionChanges`; `combat:ended` zera o combate e mantém as condições; `token:deleted` traz o combate como ficou.
- `TableBoardCommands` ganhou `defineCondition`, `applyCondition`, `applyConditions(campaignId, tokenIds, conditionId, rounds)` (`condition:applyMany`), `removeCondition`, `startCombat`, `endCombat`, `addCombatants`, `removeCombatant`, `moveInTie`, `setInitiative`, `nextTurn(from)` e `previousTurn(from)` (o `from` é o combatente da vez que a tela mostrava). Falhas novas: `turn_changed` ("A vez já passou."), `combat_active` ("Já há um combate nesta cena."), `combat_inactive` ("Não há combate nesta cena."); `CONDITION_NOT_FOUND`/`COMBATANT_NOT_FOUND` → `token_not_found` ("Isso não está mais na mesa.").
- `board-interaction-store.command(send)`: envia qualquer comando do tabuleiro com a mesa, põe a recusa na linha de status (pelo `describeRefusal`), não envia em só leitura e responde se foi confirmado.
- `use-interaction-follows-table.ts` anuncia "Vez de Lyra." quando um evento (não um snapshot) muda a vez.

## Tracker (`src/features/combat/`)

- `combat-header.tsx` — `CombatHeader`: fora de combate, "Fora de combate" e, para o mestre, "Iniciar combate" (sem tokens, desabilitado com "Ponha tokens na cena primeiro."), que abre o `start-combat-dialog.tsx` com todos os tokens marcados; em combate, a rodada como bloco de texto ("RODADA" sobre o número, sem pílula), "N no combate", "Vez de Kael", e "Turno anterior" / "Próximo turno" / "Encerrar combate" (mestre) ou "Passar a vez" (jogador, só na vez de um token que ele controla). `readOnly` desabilita tudo.
- `end-combat-button.tsx` — "Encerrar combate" em dois passos: "Encerrar o combate? A ordem e a rodada se perdem.".
- `combatant-list.tsx` / `combatant-row.tsx` — `ol` "Ordem de iniciativa" na ordem do `CombatDto`, linhas com fio: a da vez tem `aria-current="true"`, o traço dourado de 2px à esquerda e a caixa da iniciativa dourada. "Iniciativa de Kael" (`initiative-field.tsx`, mestre e quem controla) envia `setInitiative` no Enter ou ao sair do campo (vazio → `null`), volta ao confirmado na recusa e remonta por `key` quando o valor confirmado muda; quem não edita vê "18", "−2" ou "—". ↑/↓ ("Subir Lyra no empate") só entre empatados e só para o mestre; "Tirar Lyra do combate"; "+ Adicionar ao combate" com os tokens de fora. Abrir a linha mostra o `TokenCard`. Em combate, o painel troca a lista "Na cena" pelo tracker.
- `turn-line.tsx` — `TurnLine` "Rodada 3 · Vez de Kael" (texto) no topo da sala e, no modo foco, solta no alto do tabuleiro.
- `combat-view.ts` — `combatSummaryOf(board)`, `turnLine`, `combatCountLabel`, `signedText`, `initiativeText`, `END_COMBAT_QUESTION`.

## Condições

- `conditions-editor.tsx` — no `TokenCard`, "Condições": as ativas em texto com a marca quadrada de 8px (`condition-marks.tsx`: dourada = benéfica, `destructive` = prejudicial) e a duração ("Envenenado · 2 rod.", "Concentrando · sem limite"); "Remover Envenenado"; o `ConditionPicker` com o rótulo "Adicionar condição". Sem `canControl`, só leitura; "Nenhuma" sem condição.
- `condition-picker.tsx` — `ConditionPicker({ board, interaction, isMaster, disabled, label, onApply })`: nome **digitado** (`condition-name-field.tsx`, combobox com a lista da mesa como sugestões: ↑/↓, Enter ou clique escolhe, Esc fecha) + "Rodadas" (só dígitos, 0 = sem limite) + "Aplicar"; o confirmado esvazia o nome. Nome fora da lista (`findConditionByName`, sem caixa nem acento: "caido" = "Caído"): o mestre vê "Natureza" (Benéfica/Prejudicial) e "Criar e aplicar" (define e, achada a definição pelo nome — o evento chega antes do ack —, aplica); o jogador vê "Aplicar" desabilitado e "Só o mestre cria condição nova.". Lib: `src/lib/condition-names.ts` (`conditionKey`, `findConditionByName`, `conditionSuggestions`: começa-com antes de contém) e `src/lib/numeric-text.ts` (`digitsOnly`, `decimalText`).
- Em massa: `selection-conditions.tsx` — `SelectionConditions`, com 2+ selecionados, no topo da lista "Na cena" e do tracker: o picker "Condição em N tokens" manda **um** `applyConditions` só com os selecionados que o viewer controla ("1 selecionado não é seu e fica de fora."); nenhum dele → some. `apply-condition-dialog.tsx` — `ApplyConditionDialog({ tokenIds, … })` "Aplicar condição" ("Em Kael." / "Nos 2 selecionados."), aberto pelo "Aplicar condição…" do menu do botão direito (ver [`board.md`](board.md)); fecha no ok, recusa → linha de status.
- `ConditionSummary` — nas linhas da lista e do tracker, as condições numa linha truncada com o total em `sr-only` ("2 condições: …").

## No tabuleiro

- `BoardView.tokens[].onTurn` (anel dourado de 4px por fora) a partir do `currentTokenId` do combate; `marks` (até 3, pelo tom) e `moreMarks` (um "+"), desenhados no canto do token pelo `pixi-token-layer.ts`.
- `BoardRenderer.centerOn(casa)`: o `BoardCanvas` chama quando a seleção muda; o PixiJS só mexe na câmera se o token estiver fora da vista.

## Testes

- `client/test/stores/board-store.spec.ts` (eventos de combate e condição), `client/test/services/table-board-commands.spec.ts`, `client/test/stores/board-interaction-store.spec.ts` (`command`), `client/test/renderer/board-view.spec.ts` (vez e marcas), `client/test/features/combat/` (cabeçalho, linhas, condições) e os casos de combate do `play-room-page.spec.tsx` (linha da vez, foco, anel, centralizar, anúncio). Fixtures `vharnCombat`, `activeCondition`, `eventAt(versão, { type, payload })`, `KAEL_COMBATANT`, `LYRA_COMBATANT`.
- E2E: `e2e/test/combat.spec.ts`.

## Armadilhas

- Seletor do Zustand que devolve objeto ou lista nova a cada chamada (`combatSummaryOf(state.board)`, `state.board?.tokens ?? []`) entra em laço de render: selecione o pedaço estável e derive com `useMemo`, e use uma lista vazia constante.
- `setState` dentro de `useEffect` para sincronizar um campo com a prop é acusado pelo lint do React Compiler: remonte o campo por `key` com o valor confirmado.
