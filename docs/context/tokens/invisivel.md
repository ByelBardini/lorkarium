# Tokens: token invisível

Detalhe do hub [`tokens.md`](../tokens.md). O mestre esconde tokens dos jogadores; o server **nunca envia** o token escondido a quem não pode vê-lo (snapshot e todo evento). Plano: `docs/plans/2026-10-24-token-invisivel.md`. Contrato: [`../contracts/tabuleiro.md`](../contracts/tabuleiro.md) (Token invisível). Client: [`../client/hidden-tokens.md`](../client/hidden-tokens.md).

## Quem vê

- O mestre e os **controladores** do token (o público `privileged` da redação; o do token ligado são os do personagem). O espectador no Controle continua inerte: não está no `sceneUserRoom`, então cai no "resto".
- O `hidden` vai igual aos dois públicos no `TokenDto` (`toTokenDto`): quem recebe o token pode saber que está escondido.

## Tabela e DAO

- `tokens.hidden` (`boolean not null default false`), migração `0053_token_hidden`. O `copyScene` (Duplicar) copia como está; o `insertMany` grava o `hidden` da colagem (`newTokenRowOf`: o "Novo token" não manda e nasce visível; colar e o desfazer de uma exclusão levam o da origem).
- `TokensDao.setHidden(sceneId, ids, hidden)` → os ids gravados (um `UPDATE` com `scene_id` no `WHERE`: id de outra cena não muda).
- `TokensDao.veilOfScene(sceneId)` → `HiddenTokenPo[]` (`{ token: { id, col, row, width, height, facing, light* }, controllerIds }`): os escondidos da cena em **uma** consulta, controladores do ligado pelos do personagem. Roda só quando o comando precisa (abaixo).

## O véu (`token-veil.mapper.ts`, puro)

- `TokenVeil = { tokens: VeiledToken[] }`, `VeiledToken = { tokenId, controllerIds, light: VeiledLightDto | null }` (a luz só acesa, do centro da pegada pelo `tokenCenter`). `veilOf(rows)` (só as linhas `hidden`), `sceneVeilOf(veilOfScene)`, `joinedVeil(a, b)`.
- `veilCutsOf(veil, alsoUserIds?)` → os públicos: `masters` (nada tirado), um `controller` por controlador de algum escondido (tira os que ele não controla) e `rest` (tira todos; a sala do grid sem mestres e sem esses controladores). Véu vazio → **nenhum** corte.
- `cutsOf(evento, véu, seenBy)` → `VeilCuts` (um `VeiledCut { audience, event | null }` por público); `NO_VEIL` (`[]`) = o evento sai inteiro como antes. Os `seenBy`: `tokenSeenBy` (evento de um token), `entriesSeenBy(chave)` (`moves`, `faces`, `resizes`, `drags`, `applied`), `tokenIdsSeenBy` (camada, estilo). Lote que fica vazio → `null`.
- `combat-veil.mapper.ts` (módulo `combat`): `combatSeenBy` (entrada só com invisíveis sai; mista perde os ids; sem token fica; a vez numa entrada que saiu → `currentCombatantId: null`), `combatEventSeenBy`, `turnChangedSeenBy` (tira as `conditionChanges` dos invisíveis), `deletedSeenBy` (`token:deletedMany`: `null` só sem id e sem combate) e `deletedTokenSeenBy`.
- `token-hidden.mapper.ts`: `creationCutsOf` (a mistura do `token:createdMany` por público, sem o que ele não vê), `changeVeilOf` (`token:created`/`updated` de um escondido: inteiro a mestres e controladores, `board:advanced` ao resto, `token:deleted` com o combate cortado a quem perdeu o controle), `hiddenCutsOf` (esconder/revelar, abaixo), `veiledLightsCutsOf(depois, tocados)` (a lista nova de cada público a quem um tocado é invisível; mestres nunca) e `invisibleFor(público, véu)`.
- `token-veil.ts` (peças do service, com I/O): `veiledWriteOf(daos, cena, tocadas)` = véu das linhas + as luzes veladas novas só se um escondido tocado tem luz (acesa ou não: +1 `veilOfScene`); `combatVeilOf` (evento com combate que tem tokens: + todos os escondidos da cena); `publishVeiledLights`.

## Publicador

- Port (`board-publisher.port.ts`): todo método com token, condição ou combate recebe o véu (`VeilCuts<…>`; `tokenChanged` recebe `TokenChangeVeil { cuts, lost }`), mais `tokensHiddenChanged(TokensHiddenChange)` e `veiledLightsChanged(VeiledLightsChange)`. Os tipos de público (`VeilAudience`) e de corte moram no port; as funções que cortam, no módulo (o adaptador não importa módulo por valor).
- Adaptador: `emitCuts(nome, evento, cortes, exceto?)` — sem cortes, o `io.to(sala do grid).emit` de sempre; com cortes, cada público pela sua sala (`masters` → `sceneMastersRoom`; `controller` → `sceneUserRoom` menos os mestres; `rest` → `sceneRoom` menos mestres e esses controladores) e o corte `null` vira `board:advanced { campaignId, sceneId, version, at }` (evento sem versão, o arraste, não manda nada). O `tokensCreated` sem véu é a mistura de sempre expressa como cortes (`mixesOf`).
- `BoardPublisherFake` (`test/support/board-publisher-fake.ts`, reexportado do `scenes-fakes.ts`): guarda os eventos como antes e, à parte, `veils` (`{ method, cuts }` só das chamadas com véu; `veilOf(método)`), `tokenChangeVeils`, `tokensHiddenChanges`, `veiledLightsChanges` (escreve `publishLights` no diário).

## Comando `token:setHiddenMany` (`token-visibility.service.ts`)

- `TokenVisibilityService.setHiddenMany(userId, campaignId, { tokenIds, hidden, sceneId? })`: `requireMaster('hide tokens')` (antes de travar) → trava só o grid (esconder nunca toca personagem; soma a versão só se algum mudou) → `tokensIn` (id de outra mesa → `TOKEN_NOT_FOUND`, nenhum muda) → `changedVisibility` (`token-rules.bo.ts`: só os que mudam) → nada muda: versão atual, sem `bump` nem evento → `setHidden` → `veilOfScene` (o depois; o antes sai dele ± os mudados) → condições dos mudados → combate → `bump` → depois do commit `tokensHiddenChanged` e as luzes veladas. Diário: `lock → setHidden → veil → bump → commit → publish → publishLights`.
- `hiddenCutsOf`: por público, quem continua vendo todos os mudados recebe `token:hiddenChanged { tokenIds, hidden }`; ao esconder, quem deixa de ver algum recebe `token:deletedMany { tokenIds: os que sumiram, combat cortado }`; ao revelar, quem passa a ver algum recebe `token:createdMany { tokens: todos os mudados como ele os vê, combat cortado }` (o reducer faz upsert, então o `hidden` dos que ele já via também atualiza).

## Snapshot (`BoardService.snapshotFor`, também o do `scene:watch`)

- Os escondidos saem das linhas do `listOfScene` já lido (**nenhuma** consulta a mais): invisível = `hidden` e `TokenAccessBo.audience()` = `others` (o mestre e o controlador veem; o espectador não). O viewer recebe só os outros tokens (e as condições deles), o combate por `combatSeenBy`, os `mainTokens` sem a escolha que aponta para um invisível e `veiledLights` = as luzes acesas dos invisíveis (mestre: `[]`).

## Eventos de token (fase 7)

| Comando                                                                                 | O que quem não vê o escondido recebe                                                                                                                                                             |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `token:move` / `moveMany`                                                               | `board:advanced` / o lote sem ele; luz acesa → `token:veiledLightsChanged` com o centro novo                                                                                                     |
| `token:dragMany`                                                                        | nada (sem versão) / o lote sem ele (`controlVeilOf` das linhas do `findDragGroup`)                                                                                                               |
| `token:delete`                                                                          | o escondido sai como `token:deletedMany { tokenIds: [id] }`: quem não o via recebe `board:advanced` (ou `{ tokenIds: [], combat }` havendo combate)                                              |
| `token:deleteMany` / `createMany` / `addPlayers`                                        | o lote sem ele e o combate cortado (`combatVeilOf`: com combate que tem tokens, + todos os escondidos da cena); colar com `hidden: true` → `board:advanced`                                      |
| `token:setLayer`, `faceMany`, `restyleMany`, `resizeMany`                               | o lote sem ele; `faceMany`/`resizeMany` e o `lightLit` do `restyleMany` mandam a luz velada nova                                                                                                 |
| `token:adjustBar`, `token:update`, `token:linkToCharacter`, `token:unlinkFromCharacter` | `board:advanced` (`changeSceneOf` + `changeVeilOf`); quem saiu do Controle de um escondido recebe `token:deleted` com o combate como passa a vê-lo; quem entrou recebe o `token:updated` inteiro |

Sem escondido tocado o véu é `NO_VEIL` e o diário dos services é o de sempre (o `veilOfScene` escreve `veil` no diário do fake só quando roda).

## Condições e combate (fase 8)

- `ConditionsService`: `apply`, `remove`, `setRounds`, `setStacks` cortam por `tokenSeenBy` e `applyMany` por `entriesSeenBy('applied')`, com o véu da linha do token do grid (`heldBy`). Condição de token ligado vai ao personagem (`character:changed`, sem véu; ver [`../characters/condicoes.md`](../characters/condicoes.md)).
- `CombatService`: o `combatIn` monta o véu pelo `controlOfScene` (que lê o `hidden`): `combat:started` e `combat:updated` por `combatEventSeenBy`, `combat:turnChanged` por `turnChangedSeenBy` (a vez numa entrada escondida = `currentCombatantId: null`; as `conditionChanges` dos escondidos não saem). Nenhuma consulta a mais.

## Armadilhas

- Num público que deixa de ver um escondido e continua vendo outro no **mesmo** comando (controlador de um só), o evento é o `token:deletedMany`; o `hidden` do que ele continua vendo só se atualiza no próximo snapshot (não cabem dois eventos na mesma versão).
