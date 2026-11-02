# Contracts — dados (`dice/`)

Índice: [`contracts.md`](../contracts.md). A regra (notação, ondas, formas, trajeto) mora no game-core: [`game-core/dados.md`](../game-core/dados.md). O contracts só depende de `zod`, então os limites e os nomes que vêm do game-core são **repetidos** aqui (mudou lá, muda aqui).

| Aqui (`dice.dto.ts`)                                                       | No game-core                                                                               | Spec que prende                                               |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| `DICE_ASPECT_MIN`/`MAX`                                                    | `DICE_BOX_ASPECT_MIN`/`MAX` (`dice-box.ts`)                                                | nenhum                                                        |
| `POSE_STRIDE`, `POSITION_INTEGER_MAX`, `QUATERNION_INTEGER_MAX` (privadas) | `DICE_POSE_STRIDE`, `DICE_POSITION_LIMIT` × `DICE_POSITION_SCALE`, `DICE_QUATERNION_SCALE` | literais dos dois lados (`dice-frames.spec`, `dice.dto.spec`) |
| `rolledDieDto.sides` 2..1000 (literal)                                     | `DICE_LIMITS.minSides`/`maxSides`                                                          | nenhum                                                        |
| `dieKindDto`                                                               | `DIE_KINDS`                                                                                | nenhum                                                        |

## Limites

- `DICE_ROLL_PARTS_MAX` (10) — peças por rolagem (o teto do `parseDiceParts`).
- `DICE_EXPRESSION_MAX_LENGTH` (200) — o `DICE_LIMITS.maxLength` do game-core.
- `DICE_ROLL_LABEL_MAX_LENGTH` (40) — o mesmo teto do nome de uma rolagem salva.
- `DICE_ASPECT_MIN` / `DICE_ASPECT_MAX` (0,5 / 3) — largura ÷ altura da caixa da física (a janela de quem rolou).
- `DICE_THROW_MODELS_MAX` (20) — modelos 3D por rolagem (o d100 conta 2).

## Comando e ack

- `DICE_EVENTS` = `{ roll: 'dice:roll', rolled: 'dice:rolled', rolledSecretly: 'dice:rolledSecretly' }`.
- `diceVisibilityDto` — `'public' | 'masters'`.
- `diceRollLabelDto` — texto aparado até 40; vazio/só espaço → `null`; aceita `null`.
- `diceRollPartDto` `{ label, expression }` — `expression` aparada, 1 a 200. A notação **não** é lida aqui: o server lê pelo game-core e recusa com `INVALID_DICE_EXPRESSION`.
- `diceRollCommandDto` `{ actionId, campaignId, label, parts (1..10), visibility, aspect (0,5..3) }`, estrito (`userId` forjado é recusado: quem rola vem da conexão, §7.3). Sem `sceneId`: a rolagem é da mesa, não do grid. Tipos `DiceRollCommandDto` (saída) e `DiceRollCommandInput` (entrada).
- `diceRollAckDto` — `{ ok: true, rollId }` | `realtimeAckFailureDto`, união por `ok`.

## Eventos

- `dieKindDto` — `'d4' | 'd6' | 'd8' | 'd10' | 'd100tens' | 'd12' | 'd20'` (o `DIE_KINDS` do game-core; o d100 é um `d100tens` + um `d10`).
- `diceThrowModelDto` `{ kind, startMs, settleMs, frames }` — tempos (≥ 0, não inteiros) contados do início da rolagem; `settleMs ≥ startMs`. `frames`: inteiros, 7 por pose (`x, y, z` em milésimos até ±32000; `qx, qy, qz, qw` × 32767 até ±32767), ao menos uma pose — o formato do `encodeDiceFrames`. Recusa: "dice frames have 13 integers; expected a multiple of 7, at least 7" ou "dice frame integer 6 is 32768; expected −32767 to 32767".
- `diceThrowDto` `{ aspect, frameMs (> 0; 1000/30), models (1..20) }` — o trajeto gravado. No evento é `null` quando nenhum dado tem modelo (só d7, d2…).
- `diceAppearanceDto` `{ color (memberColorDto), textureId (uuid | null), numberColor (diceNumberColorDto | null) }` — `numberColor` normalizado para `#rrggbb` minúsculo (o `diceNumberColorDto` de `account/dice-texture.dto.ts`).
- `dieStatusDto` — `'kept' | 'dropped' | 'exploded' | 'rerolled'` (o `DieStatus` do `dice-roll.ts`).
- `rolledDieDto` `{ sides (2..1000), value (1..sides), status, success?, model? }` — `model` é `number[]` de 1 ou 2 índices em `throw.models` (o d100 aponta para os dois: dezenas, depois unidades); ausente no dado sem modelo. Recusa "die value 7 is invalid; expected 1 to 6".
- `rolledPartDto` `{ label, expression, total, dice }`.
- `diceRolledDto` `{ campaignId, rollId, rollerId, visibility, label, parts (1..10), total, appearance, throw | null, settlesInMs, at }` — `dice:rolled`, sem `version` (nada é gravado). Todo índice de `model` precisa existir em `throw.models` ("die model 1 is invalid; expected an index below 1 throw models"); com `throw: null`, nenhum dado tem `model`.
- `diceRolledSecretlyDto` `{ campaignId, rollId, rollerId, settlesInMs, at }` — `dice:rolledSecretly`, o aviso a quem não vê a rolagem "Só o mestre" (`visibility: 'masters'`): sem total, rótulo, peças nem trajeto (a pose final revelaria a face).
- `DiceClientEvents` (`'dice:roll'` com ack `DiceRollAckDto`) e `DiceServerEvents` (`'dice:rolled'`, `'dice:rolledSecretly'`) — entram no `TableClientEvents` / `TableServerEvents` de `board/board.dto.ts`.

## Rolagens salvas (`saved-roll.dto.ts`)

Rotas e erros em [`dice/salvas.md`](../dice/salvas.md).

- `SAVED_ROLL_NAME_MAX_LENGTH` (40, o `DICE_ROLL_LABEL_MAX_LENGTH`) e `SAVED_ROLLS_MAX` (50 por membro da mesa).
- `savedRollNameKey(nome)` — apara, tira acento (NFD) e caixa: a identidade do nome (o índice único do server e a checagem do client usam a mesma).
- `savedRollNameDto` (aparado, 1 a 40) e `savedRollPartsDto` (1 a 10 `diceRollPartDto`).
- `savedRollFolderDto` `{ id, name }`, `savedRollFoldersResponseDto` `{ folders }`, `savedRollFolderRequestDto` `{ name }` (criar e renomear), `savedRollFolderParamsDto`, `SAVED_ROLL_FOLDERS_MAX` (50). `folderId` (uuid ou `null`) entra opcional no `create` e no `update`; `null` tira a rolagem da pasta.
- `savedRollDto` `{ id, name, folderId, parts }` e `savedRollsResponseDto` `{ savedRolls }` (resposta do `GET`). A resposta é **frouxa**: `name` e as peças são strings soltas (sem 1..10 peças, sem 40/200, sem aparar); os limites só valem na entrada.
- `createSavedRollRequestDto` `{ name, parts }` e `updateSavedRollRequestDto` `{ name?, parts? }` (ao menos uma chave: "changes is empty; expected at least one of name, parts"), estritos (`campaignId` no corpo é recusado: a mesa vem da URL).
- `savedRollParamsDto` `{ campaignId, savedRollId }`.

Specs: `packages/contracts/test/dice/dice.dto.spec.ts` e `saved-roll.dto.spec.ts`.
