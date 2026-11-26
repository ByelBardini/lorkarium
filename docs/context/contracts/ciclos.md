# Contracts · ciclos por rodada

Detalhe do hub [`contracts.md`](../contracts.md). `packages/contracts/src/board/round-cycle.dto.ts` (spec §3.16); a regra pura em [`game-core/ciclos.md`](../game-core/ciclos.md).

## Tetos

`ROUND_CYCLE_MAX_PER_TABLE` (20), `ROUND_CYCLE_PHASES_MIN`/`MAX` (2/12, os do game-core), `ROUND_CYCLE_NAME_MAX_LENGTH` (40), `ROUND_CYCLE_PHASE_NAME_MAX_LENGTH` (32), `ROUND_CYCLE_MEMBERS_MAX` (64, em `seerIds` e `chooserIds`).

## Comandos (`BOARD_EVENTS`)

- `cycle:define` (`defineRoundCycleCommandDto`, mestre) e `cycle:update` (`updateRoundCycleCommandDto`, mestre, com `cycleId`; o ciclo inteiro substitui o gravado): `name`, `holder` (`roundCycleHolderDto`: `{ kind: 'table' }` | `{ kind: 'character', characterId }` | `{ kind: 'token', tokenId }`), `visibility` (`everyone` | `some` | `masters`), `seerIds`, `chooserIds`, `announce`, `phases` (2 a 12 `roundCyclePhaseInputDto` `{ id?, name, imageAssetId | null }`: com `id` a fase gravada fica, sem `id` é nova). O `superRefine` recusa `seerIds` fora de `some` (citando a visibilidade e quantos), `some` sem ninguém e id repetido em `seerIds`, `chooserIds` ou nas fases (citando o id). Quem escolhe fora de `seerIds` passa: o server junta.
- `cycle:delete` (`deleteRoundCycleCommandDto`, `cycleId`).
- `cycle:chooseNext` (`chooseNextPhaseCommandDto`: `cycleId`, `phaseId` uuid | `null` = seguir o ciclo; obrigatório, ausente ≠ `null`; o `sceneId` do `boardCommandShape` é o grid do combate).
- Ack: `BoardCommandAckDto` (a versão do fluxo da mesa). Mapas `RoundCycleClientEvents`/`RoundCycleServerEvents`, somados aos do `board.dto.ts`.

## Eventos e leitura

- `cycle:listChanged` (`roundCyclesChangedDto`, `tableEventShape`): **todos** os ciclos que aquele membro vê, depois de qualquer mudança do fluxo da mesa (definição, escolha, virada, combate que começa ou acaba). Quem não vê o ciclo mexido recebe a lista sem ele, na mesma versão.
- `roundCycleDto`: `{ id, name, announce, phases (roundCyclePhaseDto { id, name, imageAssetId }), canChoose (de quem recebe), config (roundCycleConfigDto { holder, visibility, seerIds, chooserIds } só para o mestre; `null` para o resto: o portador pode ser token escondido), combats (roundCycleCombatDto { sceneId, round, currentPhaseId, chosenPhaseId }[]: um por grid em combate com o ciclo) }`.
- `cycle:announced` (`roundCyclesAnnouncedDto`): `{ campaignId, sceneId, round, at, announcements: { cycleId, cycleName, phase: { name, imageAssetId } }[] (1 a 20) }`, a todos do grid, sem versão (como o ping).
- `characterSyncDto.roundCycles` (padrão `[]`, para servidor antigo): os ciclos vistos na mesma versão do `character:sync`, a autoridade da lista.

## Testes

`test/board/round-cycle.dto.spec.ts`: ciclo de personagem com um jogador aceito; da mesa com quem escolhe fora de `seerIds` aceito; 1 e 13 fases recusadas; nome longo; `seerIds` com `everyone` cita o campo; `some` sem ninguém; repetido em `chooserIds` cita o id; `update` com fase mantida e nova; id de fase repetido; `chooseNext` com `null` aceito e sem `phaseId` recusado. `character-entity.dto.spec.ts`: o ack sem `roundCycles` sai com `[]`.
