# Dados: física e sorteio no server

Detalhe do hub [`dice.md`](../dice.md). A física decide o valor dos dados com modelo e grava o trajeto que todo client reproduz; o sorteio crypto cobre os dados sem modelo e alimenta as condições iniciais da física.

## Portas (`server/src/modules/dice/`)

```ts
interface DiceRandomPort {
  face(sides: number): number; // inteiro de 1 a sides, uniforme
  unit(): number; // [0, 1), uniforme
}

interface DicePhysicsPort {
  throw(request: { kinds: readonly DieKind[]; aspect: number; startMs: number }): {
    models: readonly {
      kind: DieKind;
      startMs: number; // = request.startMs
      settleMs: number; // instante do último quadro, na mesma linha do tempo (startMs + duração)
      frames: readonly number[]; // encodeDiceFrames(poses): 7 inteiros por pose, 1 pose a cada DICE_FRAME_MS
      value: number; // restingValueOf(kind, última pose).value; o d100tens dá 0 a 90
      rethrows: number; // 0 a 3
    }[];
  };
}
```

- Um modelo por dado, na ordem de `kinds`; `kinds: []` → `models: []` sem sortear nada. Juntar o `d100tens` ao `d10` (`percentileValue(tens, d10 % 10)`) é de quem chama (o `DiceWavesBo`, ver [`../dice.md`](../dice.md)).
- `settleMs` é **absoluto** na linha do tempo da rolagem: a 2ª onda nasce em `settleMs` da 1ª + 300.

## Sorteio (`CryptoDiceRandom`)

- `new CryptoDiceRandom(nextInt = randomInt)`, o molde do `CryptoCampaignCode` (fonte por parâmetro no spec).
- `face(sides)` = `nextInt(sides) + 1`; `sides` fora de 2 a 1000 (`DICE_LIMITS`) ou não inteiro → `RangeError` `Die sides 1 is invalid: expected a whole number from 2 to 1000.`
- `unit()` = `nextInt(2^47) / 2^47` (o `randomInt` aceita faixa abaixo de 2^48); nunca chega a 1.

## Física (`CannonDicePhysics`)

`new CannonDicePhysics(random: DiceRandomPort, { maxTiltDegrees = 10, maxRethrows = 3 } = {})`. O `wire-dice.ts` monta com o `CryptoDiceRandom`; os specs com o `SeededDiceRandomFake` (mesma semente = mesmo trajeto, quadro a quadro).

- **Caixa** (`diceBoxOf(aspect)`, `packages/game-core/src/dice-box.ts`, spec em `packages/game-core/test/dice-box.spec.ts`): unidade = raio circunscrito do dado (1). Chão em `y = 0` (y para cima), `x` na largura da janela de quem rolou e `z` na altura, centrados em 0. O lado **curto** mede sempre `DICE_BOX_SHORT_SIDE` = 16 (o dado tem 1/8 do lado curto em qualquer tela); o longo cresce com o aspecto: `aspect ≥ 1` → `halfWidth = 8 × aspect`, `halfDepth = 8`; `aspect < 1` → `halfWidth = 8`, `halfDepth = 8 / aspect`. O maior meio-lado é 24 (aspecto 3), dentro do ±32 do `encodeDiceFrames`. Aspecto fora de 0,5 a 3 (ou `NaN`) → `RangeError` `Dice box aspect 0 is invalid: expected 0.5 to 3.` O client encaixa essa caixa inteira na própria janela (contain); por isso a conta mora no game-core (`diceBoxOf`, `DICE_BOX_SHORT_SIDE`, `DICE_BOX_ASPECT_MIN`/`MAX`), e o client lê dela (`diceStageScaleOf` em `client/src/dice-renderer/dice-stage.ts`).
- **Paredes:** chão e 4 paredes como `Plane` estáticos (planos infinitos: não há teto, e o dado não escapa por cima de uma parede). Atrito 0,3, restituição 0,35 (o `defaultContactMaterial`).
- **Sem colisão entre dados:** cada dado voa num `World` **só dele** (em vez de um mundo com `collisionFilterMask`, como o plano previa). Com mundo próprio, o trajeto de um dado não depende de nenhum outro nem pelo solver (o `GSSolver` para pela tolerância somada de todas as equações), e o relançar é por dado. O spec prova: o primeiro d20 tem o mesmo trajeto sozinho e no meio de 20 (com mundo compartilhado e colisão ligada, falha).
- **Lançamento** (`dieLaunchOf`, `die-launch.ts`): exatamente `DIE_LAUNCH_DRAWS` = 12 `unit()` por lançamento, sempre na mesma ordem (posição 3, velocidade 3, giro 3, rotação 3). Nasce a 2 unidades de toda parede, de 4 a 6 de altura; velocidade horizontal de 18 a 28 un/s em direção sorteada, caindo de 0 a 4 un/s; giro de ±25 rad/s por eixo; rotação uniforme (Shoemake). Cada dado sorteia **todos** os seus lançamentos (relançar inclusive) antes do dado seguinte: o dado _n_ não depende de quantos vêm depois.
- **Passo e gravação:** gravidade −60 un/s² (com 9,8 o dado de raio 1 cai como pedra de 1 m), amortecimento 0,1 linear e angular. Passo fixo de 1/60 s, 1 pose a cada 2 passos (30 quadros/s, `DICE_FRAME_MS`); a pose 0 é a de lançamento. Para quando o dado dorme por dois quadros gravados seguidos (os dois últimos iguais) ou em 5 s (300 passos). Sono: `sleepSpeedLimit` 0,6 (v² + ω² abaixo de 0,36) por 0,25 s. Abaixo de 0,6 o d12 em repouso tremia nos pentágonos e nunca dormia (chegava aos 5 s e relançava ~2 vezes por dado).
- **Relançar:** se o dado não dormiu em 5 s ou parou com a face lida inclinada mais que `maxTiltDegrees` (encostado na parede ou num canto), ele é lançado de novo do zero, com condições novas, até `maxRethrows` vezes; o último pouso vale de qualquer jeito. **Só o lançamento aceito** vai nos `frames` (quem assiste vê um arremesso limpo), por isso cada onda continua com no máximo 5 s. Taxa medida: ~3 % no d6, ~7 % no d20.
- `value` lê a última pose em ponto flutuante; a quantizada dos `frames` dá a mesma face (inclinação ≤ 10°, longe do empate entre faces).

## Justiça

No `cannon-dice-physics.spec.ts` (o arquivo inteiro roda em ~1,5 s, então ficou no spec e não no `pnpm bench`): 600 d6 com a semente 101 → qui-quadrado 2,94 (< 15,09, gl 5, p 0,01); 1000 d20 com a semente 202 → 19,84 (< 36,19, gl 19). Prova de que morde: relançar todo pouso no 1 dá 120,62 e 72,72.

## Custo

`server/test/bench/dice-physics.bench.ts` (`pnpm bench`, ou `pnpm exec vitest bench --run server/test/bench`): uma onda de **20 dados** custa ~13 ms (20 mistos, os 7 tipos em rodízio) e ~16 ms (20 d20) de CPU na thread do server, máximo ~28 ms (medido em 2026-10-25, Windows, Node 22). Um d6 sozinho custa ~0,6 ms; o d4 e o d12, ~1,2 ms. A rolagem é síncrona: com o balde do `dice:roll` (6 de uma vez, 2/s por conexão) uma conexão ocupa no máximo ~30 ms/s de CPU. O trajeto de 20 dados tem ~7600 inteiros (~55 quadros por dado). O projeto `@lorkarium/server-integration` tem `benchmark.include: []` para o bench do server não rodar duas vezes.

## Armadilhas

- `encodeDiceFrames` lança `RangeError` com o centro fora de ±32: um teste "quadro dentro da caixa" sem paredes falha por esse erro, não pela asserção. A prova de que as paredes seguram afasta as paredes 3 unidades (os quadros saem da caixa declarada e a asserção acusa).
- Com dois dados apenas, o mundo compartilhado com colisão raramente muda o primeiro (os dois não se encostam); a prova de independência usa 20 dados.
