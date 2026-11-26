# game-core · ciclos por rodada

Detalhe do hub [`game-core.md`](../game-core.md). A regra pura do ciclo por rodada (spec §3.16): uma sequência de fases que vira no começo de cada rodada do combate, com uma próxima fase que alguém pode escolher. O server grava e decide; o client usa as mesmas funções para mostrar a próxima fase (nunca reescreve a regra).

## `src/round-cycle.ts`

- `CycleState` `{ currentId, chosenId }` — a fase desta rodada e a escolhida para a próxima (`null` = o ciclo segue a ordem). Ids são das fases do ciclo.
- `cycleStart(fases)` → `{ currentId: a 1ª, chosenId: null }`: todo combate começa na 1ª fase. Lista vazia → `currentId: null`.
- `nextPhaseOf(fases, estado)` — a fase da próxima rodada: a escolhida, se ainda está no ciclo; senão a seguinte à atual (a 1ª depois da última). Atual `null` ou fora da lista (fase apagada) → a 1ª. Escolhida fora da lista é ignorada.
- `turnCycle(fases, estado)` → `{ currentId: nextPhaseOf(…), chosenId: null }`: a escolha se gasta na virada e a rodada seguinte continua **a partir** da fase escolhida. Escolher a atual repete a fase.
- `CycleHolder` — de quem é o ciclo: `{ kind: 'table' }` (todo combate), `{ kind: 'character', characterId }` ou `{ kind: 'token', tokenId }` (token solto).
- `activeCyclesOf(ciclos, { characterIds, tokenIds })` — os ciclos que jogam num combate: os da mesa e os de portador presente, na ordem da lista. Um id de personagem nunca ativa o ciclo de token com o mesmo id.

## `src/round-cycle-phases.vo.ts`

- `roundCyclePhases(ids)` — 2 a 12 fases (`ROUND_CYCLE_PHASES_MIN`/`MAX`), cada uma uma vez. Fora disso, `RangeError` citando "got N phases" e "expected 2–12 phases"; id repetido → `RangeError` citando o id.

## Testes

- `test/round-cycle.spec.ts`: segue a ordem, volta à 1ª depois da última, escolhida joga e se gasta, segue a partir da escolhida, repetir a atual, atual apagada ou fora da lista → 1ª, escolhida fora da lista ignorada, `nextPhaseOf`, `cycleStart` (vazio incluso), `activeCyclesOf` (mesa + portadores presentes na ordem, ausente fica de fora, id de personagem não ativa ciclo de token).
- `test/round-cycle-phases.vo.spec.ts`: 2 e 12 aceitos; 0, 1 e 13 recusados citando a contagem; repetida recusada citando o id.
