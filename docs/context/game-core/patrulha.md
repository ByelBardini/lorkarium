# Game-core — patrulha

Índice: [`game-core.md`](../game-core.md).

A rota que um token repete sozinho (guarda de vigia, carroça, animal). Server e client fazem a mesma conta a partir do início gravado: sem evento por passo.

## VO (`token-patrol.vo.ts`)

- `TokenPatrol` `{ path, repeat, speed, turns }`: `path` são **origens** do token (canto de cima à esquerda, em passos de 1/64 de casa, como `col`/`row`); `PatrolRepeat` = `loop` (circuito, último → primeiro) | `bounce` (ida e volta); `speed` em casas por segundo; `turns` = "Virar para onde anda"; `gait` (`PatrolGait`) = `glide` (desliza o passo inteiro) | `step` (passo curto e para na casa), só desenho: nenhuma conta do game-core o lê, e o `patrolCycle` pede só `path` e `repeat`.
- `tokenPatrol(valor)` confere e devolve congelado (o `path` também), nesta ordem: 2 a `PATROL_POINTS_MAX` (32) pontos ("Patrol path has 1 points; expected 2 to 32."); cada ponto pelo `cell` (1,01 → o `RangeError` do `cell`); velocidade de `PATROL_SPEED_MIN` (0,25) a `PATROL_SPEED_MAX` (4) em passos de `PATROL_SPEED_STEP` (0,25) ("Patrol speed 0.3 is invalid: expected 0.25 to 4 in steps of 0.25.", NaN também); rota que não sai da primeira casa ("Patrol path (1, 1) → (1, 1) does not move: expected at least 2 cells in the cycle.").
- Não confere se a rota cabe na cena (depende do tamanho do token): é o `patrolFits`.

## Ciclo (`token-patrol.ts`)

- `patrolCycle(patrulha)` → `Cell[]`, uma casa por passo, sobre o `pathCells` (diagonal vale 1, meia casa anda de meia em meia):
  - circuito: o caminho mais o trecho de volta ao primeiro ponto, sem repetir o primeiro. Quadrado `(0,0) (2,0) (2,2) (0,2)` → `(0,0) (1,0) (2,0) (2,1) (2,2) (1,2) (0,2) (0,1)`;
  - ida e volta: o caminho e depois **as mesmas casas** ao contrário, sem repetir as pontas. `(0,0) (3,0)` → `(0,0) (1,0) (2,0) (3,0) (2,0) (1,0)`; `(0,0) (1,5,0)` → `(0,0) (1,0) (1,5,0) (1,0)` (não o `pathCells` da volta, que daria `(0,5,0)`).

## Pose no instante

- `patrolPoseAt({ patrol, step, origin, elapsedMs })` → `PatrolPose { cell, facing, step, nextStepInMs }`. `PatrolInstant`: `step` é a casa do ciclo de onde partiu; `origin` o `col`/`row` gravado ao ligar (a **origem da volta**); `elapsedMs` o tempo desde o `started_at`, no relógio do server.
- **Linha do tempo:** o passo é `floor(t × velocidade)`. Primeiro a **volta** (a reta pelo `pathCells` de `origin` até `ciclo[step]`, vazia quando já está nela), com `step: null`; depois o ciclo a partir de `step`, em loop, com `step` = o índice no ciclo. Origem `(5,5)` até `(0,0)` a 1 casa/s: 3000 ms → `(2,2)`, `step: null`; 6000 ms → `(1,0)`, `step: 1`.
- `cell` é a **casa de destino do passo em andamento**: é o que o server grava ao pausar (o token termina o passo que estava dando); o renderer desliza da anterior até ela no `1000 / velocidade` ms. `nextStepInMs` é quanto falta para a próxima troca (o timer do client).
- **Direção:** com `turns`, o `facingToward` do trecho que termina no passo de agora (no passo 0, o do primeiro trecho); sem, `null` (o token mantém o `facing` gravado). A conta é entre casas: igual à entre os centros (`tokenCenter`), porque o deslocamento é o mesmo nas duas pontas.
- Tempo negativo (relógio adiantado) vale 0: a pose do instante 0 (inclusive `nextStepInMs` de um passo inteiro). `step` fora do ciclo (ou não inteiro) → `RangeError` "Patrol step 8 is out of range: the cycle has 8 cells."
- Custo: refaz o ciclo a cada chamada (até 32 pontos, sem cache); o client só chama na troca de passo.

## Rota na cena

- `patrolFits(cena, rota, tamanho)` → o primeiro ponto onde o token sairia da cena (`footprintFits`), ou `null` quando tudo cabe. Como os passos ficam entre os pontos, conferir os pontos basta. Encostar na borda cabe (`18 + 2 = 20`).
