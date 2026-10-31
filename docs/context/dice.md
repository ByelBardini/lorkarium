# Dados

A rolagem de dados da sala. O server rola: para os dados com modelo (d4, d6, d8, d10, d12, d20 e o d100 = `d100tens` + `d10`) ele **simula a física** e o valor é a face em que o dado parou; os dados sem modelo (d2, d7, d1000) saem do sorteio crypto. A regra pura (notação, ondas, vantagem, formas, face em repouso, caixa, trajeto quantizado) está no game-core: [`game-core/dados.md`](game-core/dados.md); os DTOs em [`contracts/dados.md`](contracts/dados.md); o client em [`client/dice.md`](client/dice.md) (rede, stores, dados 3D, preferência) e [`client/dice-tab.md`](client/dice-tab.md) (aba "Dados", salvas, histórico, aviso sobre o tabuleiro).

## Índice

| Arquivo                            | O que cobre                                                                                            |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------ |
| [`dice/fisica.md`](dice/fisica.md) | Portas de física e sorteio, adaptador cannon-es, caixa, gravação, relançar, rolagens gravadas, justiça |
| [`dice/salvas.md`](dice/salvas.md) | Rolagens salvas: tabela `saved_rolls`, DAO, regra, REST, erros, limites (50, 30 escritas/min)          |

## Estrutura (server)

- `server/src/modules/dice/` — módulo efêmero (sem PO nem DAO), no molde do `pings`:
  - `dice-physics.port.ts` — `DicePhysicsPort.throw({ kinds, aspect, startMs })` → `{ models: [{ kind, startMs, settleMs, frames, value, rethrows }] }`
  - `dice-random.port.ts` — `DiceRandomPort.face(sides)` (1 a `sides`) e `unit()` ([0, 1))
  - `dice-publisher.port.ts` — `DicePublisherPort.rolled(evento, público)` e `rolledSecretly(aviso, público)`
  - `dice-roll.bo.ts` — `requireReadableDice` (também usado pelas salvas), `modeledOf(pedidos, usados, máximo)`, `audienceOf`, `revealDelayOf`, `DiceWavesBo(máximo)`, `DICE_WAVE_GAP_MS` (300), `DICE_REVEAL_WITHOUT_MODEL_MS` (800). O BO não importa DTO: o service passa o `DICE_THROW_MODELS_MAX` do contracts.
  - `dice.mapper.ts` — `toDiceAppearanceDto`, `toDiceRolledDto`, `toDiceRolledSecretlyDto`
  - `dice.service.ts` — `DiceService.roll(userId, command)` → `{ rollId }`
  - `dice.gateway.ts` — `createDiceGateway` (`dice:roll`); `dice.plugin.ts` — `createDiceModule({ members, profiles, physics, random, publisher, clock, newId, realtime, rate, log })` → `{ gateway }`
  - `dice.error.ts` — `DiceError`, `InvalidDiceExpressionError(part, expression, reason)` (`INVALID_DICE_EXPRESSION`; `part` a partir de 1, `null` = a composição). É a **única** classe desse erro: as salvas importam daqui.
- `server/src/app/wire-dice.ts` — `wireDice(realtime, { db, members, clock, log })`, chamado no `wireRealtime` do `build-app.ts` depois do board: um `CryptoDiceRandom` alimenta a `CannonDicePhysics` e sorteia os dados sem modelo; `ProfilesDao(db)`, `SocketIoDicePublisher`, `randomUUID` e um `CommandRateGuard` com `DICE_RATE`.
- `server/src/infrastructure/dice-physics/` — `CannonDicePhysics` (o único lugar com `cannon-es`) e `die-launch.ts` (`dieLaunchOf`). A caixa (`diceBoxOf`, `DICE_BOX_SHORT_SIDE`) mora no game-core (`packages/game-core/src/dice-box.ts`), porque o client encaixa a mesma caixa na tela.
- `server/src/infrastructure/dice-random/crypto-dice-random.ts` — `CryptoDiceRandom` sobre `randomInt`
- `server/src/infrastructure/dice-publisher/socket-io-dice-publisher.ts` — `SocketIoDicePublisher` (salas abaixo)
- Fakes em `server/test/support/dice-fakes.ts`: `SeededDiceRandomFake`, `FixedIntSourceFake`, `DicePhysicsFake` (valores em fila, assenta 1500 ms depois do início da onda, guarda `throws`), `DiceRandomFake` (faces em fila, `asked`), `DicePublisherFake` (`journal`: `publish:full:table`, `publish:full:masters+<ids>`, `publish:secret`) e `RESTING_FRAMES`.

## Contrato

DTOs em [`contracts/dados.md`](contracts/dados.md). `dice:roll` (`diceRollCommandDto`, estrito: `userId` forjado → `INVALID_BODY`) com ack `{ ok: true, rollId }`. O resultado não vem no ack: chega a todos (quem rolou incluso) por `dice:rolled` (`diceRolledDto`) ou, a quem não vê a secreta, por `dice:rolledSecretly` (`diceRolledSecretlyDto`). Erros no ack: `FORBIDDEN` (espectador), `CAMPAIGN_NOT_FOUND` (mesa fora da conexão ou da pessoa), `INVALID_DICE_EXPRESSION` com a **mensagem do domínio** (`part 1 ("2d") cannot be read: Expected the number of sides …`, como nas salvas: o texto é da própria pessoa), `RATE_LIMITED` com `retryAfterSeconds` e `INVALID_BODY`.

## Caminho do comando

`dice.gateway` → `onCommand` do `board-command-edge.ts` (balde → DTO → sessão relida → mesa aberta na conexão → ack), **fora** da `CampaignCommandQueue`, porque nada é gravado → `DiceService.roll`: `memberAccessOf` sobre o `MembershipReader` em memória (o `CachedMemberships`; espectador `FORBIDDEN`, fora `CAMPAIGN_NOT_FOUND`) → `requireReadableDice` → `startDiceRoll` → ondas → `ProfilesDao.findById` (aparência pelo `memberColorOf`; a **única** consulta ao banco da rolagem) → mapper → publicador. `rollId` vem do `newId` e `at` do `ClockPort`.

O `toAckError` do `board-command-edge.ts` responde por conta própria só ao `InvalidDiceExpressionError` (a mensagem do domínio) e ao `CommandRateLimitedError` (`RATE_LIMITED` + `retryAfterSeconds`). O `DiceError` não está no `isKnown`: uma subclasse nova de erro do dado cai em `INTERNAL_ERROR` ("unexpected error in the board gateway") até ganhar o seu ramo lá.

## Regra dos modelos e ondas

- Têm modelo os dados de 4, 6, 8, 10, 12 e 20 faces (um modelo cada) e o d100 (`d100tens` + `d10`, **dois**). São até `DICE_THROW_MODELS_MAX` (20) modelos por rolagem, somando as ondas, na ordem dos pedidos: o dado que não cabe é sorteado pelo crypto (um d100 com uma vaga sobrando fica sem modelo; um d6 depois dele ainda pega a vaga). O resto (d7, d2, o 21º d6) sai do `random.face(sides)`.
- Cada onda do game-core (`pending` → `continueDiceRoll`) vira **uma** chamada à física com os modelos dela; onda sem modelo não chama a física. A 1ª onda nasce em 0; a seguinte (explosão, rerrolagem) em `max(settleMs)` + 300.
- O d100 junta as duas faces por `percentileValue(dezenas, unidades % 10)` (a face 10 do d10 vale 0; 00 + 0 = 100). O `model` do dado no evento são os índices em `throw.models` (`[dezenas, unidades]` no d100), guardados por peça, termo e dado do termo (`DiceWavesBo.indicesOf`), na ordem em que pousaram.
- `settlesInMs` = o maior `settleMs` (o último dado parado), ou 800 sem nenhum modelo; sem modelo, `throw: null`.

## Público e salas

| Rolagem                    | `dice:rolled` (completo)                               | `dice:rolledSecretly` (aviso)            |
| -------------------------- | ------------------------------------------------------ | ---------------------------------------- |
| pública                    | `campaignRoom` (a mesa toda, quem rolou incluso)       | —                                        |
| só o mestre, por jogador   | `campaignMastersRoom` + `campaignUserRoom(quem rolou)` | `campaignRoom` `except` essas duas salas |
| só o mestre, por um mestre | `campaignMastersRoom`                                  | `campaignRoom` `except` a dos mestres    |

O aviso não leva total, rótulo, peças nem trajeto: a pose final revelaria a face. Outra mesa não ouve nada (critério 14).

## Balde

`DICE_RATE` `{ burst: 6, perSecond: 2 }` em `server/src/realtime/command-rate.bo.ts`, que aceita `CommandRateLimits` por parâmetro (o padrão, `BOARD_RATE`, segue 40 de uma vez e 20/s). O dado tem um `CommandRateGuard` **só dele**: a 7ª rolagem de uma rajada é `RATE_LIMITED`, e um `token:move` logo depois passa. A recusa desse guarda é o `CommandRateLimitedError` do `board.error` (`wire-dice.ts`): outro erro não sairia com o `retryAfterSeconds`. Com a física em ~13–16 ms por onda de 20 dados ([`dice/fisica.md`](dice/fisica.md)), uma conexão ocupa no máximo ~30 ms/s de CPU.

## Por que não grava

A rolagem é efêmera, como o ping: não há tabela, versão nem snapshot (o `board:sync` antes e depois tem a mesma versão). O histórico vive só no client, durante a visita à mesa. "Persistir antes de confirmar" (§5.5) não se aplica: depois do evento nada fica como estado compartilhado.

## Testes

- Unit: `server/test/modules/dice/dice-roll.bo.spec.ts`, `dice.service.spec.ts` e `dice.mapper.spec.ts`; `server/test/realtime/command-rate.bo.spec.ts` (limites do dado); `server/test/infrastructure/dice-physics/cannon-dice-physics.spec.ts`, `die-launch.spec.ts` e `dice-throw-recording.spec.ts`, `dice-random/crypto-dice-random.spec.ts` (ver [`dice/fisica.md`](dice/fisica.md)).
- Integração: `server/test/integration/dice.spec.ts` (`useTokenTable` + Duda espectadora): a pública é ouvida igual por Ana, Bia, Caio e Duda; secreta da Bia (completo a Ana e Bia, aviso a Caio e Duda) e da Ana (só ela); Duda `FORBIDDEN`, sem evento; Quelm `CAMPAIGN_NOT_FOUND`, e quem está nela não ouve (critério 14); `userId` forjado `INVALID_BODY`; `1001d6` e `2d` `INVALID_DICE_EXPRESSION`; a 7ª da rajada `RATE_LIMITED`, a versão do board igual e o `token:move` passa.
- O gateway não tem unit: a integração o prova.
