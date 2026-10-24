# Contracts — ping (`board/ping.dto.ts`)

Índice: [`contracts.md`](../contracts.md). Fluxo em [`pings.md`](../pings.md).

- `pingCommandDto` — `board:ping` (`BOARD_EVENTS.ping`): `{ …boardCommandShape, sceneId (obrigatório), x, y }`, estrito (`userId` no comando é recusado: quem pinga vem da conexão, §7.3). `x`/`y` em casas **fracionárias** de 0 a `SCENE_CELLS_MAX` (100); qualquer número chega ao `superRefine`, NaN e Infinity inclusos, e a recusa cita o eixo e o valor ("ping x -0.01 is invalid; expected a finite number from 0 to 100 cells").
- `pingAckDto` — o ack: `{ ok: true }` (sem `version`: nada foi gravado) | falha. É o `sessionLeaveAckDto`. No `BoardClientEvents`, `'board:ping'` usa este ack, não o `boardCommandAckDto`.
- `boardPingedDto` — `board:pinged` (`BOARD_EVENTS.pinged`): `{ campaignId, sceneId, userId, x, y, at }`, estrito e **sem `version`** (como o `token:draggedMany`: efêmero, não é mudança confirmada). Linha no `BoardServerEvents`.
- Spec: `packages/contracts/test/board/ping.dto.spec.ts`.
