# Personagens — fichas e ficha principal

Detalhe do hub [`../characters.md`](../characters.md). Desde a Fase 9 a ficha de um personagem mora em `token_sheets.character_id` (`token_id` nulo); nada nasce por causa de ficha. O lado das fichas (tabelas, recibos, rotas) está em [`../sheets/server.md`](../sheets/server.md).

## Dono

- `holder: { memberId }` → o personagem do jogador (`SheetsDao.characterPlaceOfUser`, guardados inclusive) → `SheetItemBo.requirePlayerCharacter`: só passa o personagem que a mesa vê (`isSeenByTable`: o jogador é `player` ou `master`); mestre sem personagem, espectador (personagem guardado) e estranho → `MEMBER_NOT_FOUND`.
- `holder: { tokenId }` → `SheetItemBo.requireGridToken` (token de outra mesa → `TOKEN_NOT_FOUND`) → token ligado (`tokens.character_id`) entrega ao personagem; solto fica com a ficha.
- `SheetHolderService` (sem deps, nada cria): `resolve`, `placeOfSheet` (onde uma ficha salva está) e `sheetsOf` (as fichas do dono). `characterPlaceIn(daos, mesa, id)` → `CHARACTER_NOT_FOUND`.
- `CharacterPlacePo { characterId, userId, holderRole, controllerIds }` vem do `CharactersDao.findManyInCampaign`/`findOfUser` (o `SheetsDao` monta um `CharactersDao` no mesmo executor, como o `CharactersDao` monta o `ConditionsDao`). `SheetHolderPlacePo = { token } | { character }`; `SheetPlacesPo { tokens, characters }` em lote (`SheetsDao.holdersOf`, o agregado da biblioteca).

## Acesso (`SheetAccessBo`)

`SheetReach.holder` = `{ token: TokenControl, seen }` | `{ character: CharacterSeat }` | `null`. Com personagem, as duas perguntas vão ao `CharacterBo`: `seen` = `isSeen()` (mestre sempre; o resto só enquanto o jogador joga) e `controlled` = `canControl()` (jogador, controladores e mestres; espectador nunca). Daí: dono/controladores/mestre editam; `table` a mesa lê (espectadores inclusive); personagem guardado (jogador rebaixado ou que saiu) → só mestres; ilegível → `SHEET_NOT_FOUND`. Recusa de escrita cita "control of its holder".

## Resumo

`toSheetSummaryDto`: ficha de personagem → `tokenId: null`, `memberId` = o jogador do personagem (`null` se não tem jogador: o client mostra "sem dono", mas só mestres a leem). Não há `characterId` no contrato (mudança de contrato fora desta fase).

## Ficha principal (`characters.main_sheet_id`)

- Regra pura `SheetItemBo.mainSheetWritesOf(sheetId, from, to)`: o personagem que perde a ficha que era a principal fica sem (`null`); o que recebe uma ficha sem ter principal a torna principal; mesmo personagem nas duas pontas não escreve.
- `keepMainSheet(daos, mesa, sheetId, { from, to })` (`sheets/main-sheet-writes.ts`), dentro da transação da ficha (mesa já travada por `lockById`): `lockCharacters` (mesma linha de `campaigns`, já nossa) → lê os dois → escreve `CharactersDao.setMainSheet` → soma a versão dos personagens → relê os mudados. Nada mudou: `null`, sem versão gasta (sem personagem nas pontas, nem trava).
- Chamado em `create` (`from: null`), `update` com `holder` (o `from` é lido **antes** do `update`) e `delete` (`to: null`, antes do `DELETE`; a FK `SET NULL` cobriria o banco, mas o evento precisa da versão).
- Depois do commit, nesta ordem: `sheet:changed`, `library:changed`, `character:changed` (pelo `publishCharactersChange` de `tokens/character-writes.ts`; `SheetsServiceDeps.characterPublisher`, o mesmo `SocketIoCharacterPublisher` do tempo real, agora em `RealtimeOutlets.characterPublisher`).
- `character:setMainSheet { actionId, campaignId, characterId, sheetId }` → `CharactersService.setMainSheet` (fila da mesa, `mutate` em `board/character-commands.ts`): `memberAccessOf` → `inLockedCharacters` → `requireEdit('choose the main sheet of')` (Caio na da Bia → `FORBIDDEN`; guardado → `CHARACTER_NOT_FOUND`) → `SheetsDao.find` no `tx` → `CharacterBo.requireOwnSheet` (ficha de outro personagem, sem dono ou de outra mesa → `SHEET_NOT_FOUND` "sheet X held by character Y") → `setMainSheet` → soma → `character:changed`; ack `{ ok, version }` dos personagens. `CharacterWriteDaos.sheets: Pick<SheetsDao, 'find'>`.

## Leituras

- `GET /api/campaigns/:c/characters/:characterId/sheets` → `{ sheets: SheetSummaryDto[] }` (o `tokenSheetsResponseDto`): `SheetsService.listOfCharacter` → `characterPlaceIn` → `CharacterBo.requireSeen()` (outra mesa, id malformado, guardado para quem não é mestre → 404 `CHARACTER_NOT_FOUND` "Character not found") → as que o leitor lê. O id é validado pelo `setMainSheetCommandDto.shape.characterId`.
- `GET …/tokens/:t/sheets` de um token ligado → as do personagem (`resolve` + `sheetsOf`).

## Barras

`sheet:adjustBar` (`SheetBarsService`): ficha de personagem → `CharactersService.adjustBar` (regra e `character:changed` do `character:adjustBar`, ack = versão dos personagens); de token solto → `TokensService.adjustBar` com o grid do token. Sem dono → `SHEET_HAS_NO_TOKEN` (mensagem "…expected a sheet held by a token or a character"; a pública continua "This sheet is not held by a token"). O caminho da âncora (`adjustHolderBar`, `adjustCharacterOfAnchor`, `adjustAnchorBar`) saiu.

## Testes

- Unit: `test/modules/sheets/{sheet-holder.service,sheet-access.bo,sheet-item.bo,main-sheet-writes,sheets.mapper,sheets.service,sheet-bars.service}.spec.ts`; `characters/characters.service.spec.ts` (`setMainSheet`: diário `lock characters → main sheet → bump characters → commit → publish`, mestre, Caio `FORBIDDEN` sem escrita, ficha do Kael/sem dono/da Quelm `SHEET_NOT_FOUND`), `characters/character.bo.spec.ts` (`requireSeen`, `requireOwnSheet`). Fakes: `SheetsHarness` com `CharactersDaoFake` (Lyra/Bia, Kael/Caio, Mira/Duda guardada, Sombra da Quelm; `withMainSheet`, `mainSheetOf`), `CharacterTransactionRunnerFake(characters, sheets?)` com `NoSheetsDaoFake` por padrão.
- Integração `test/integration/sheets-character.spec.ts`: dar ao Caio → `library:changed` + `character:changed` com `mainSheetId` (Ana e Caio na mesma versão); segunda ficha sem `character:changed`; a Lyra dos dois grids abre as fichas pelo token e pelo personagem (Caio só a `table`); `setMainSheet` da Bia com ack = versão ouvida; Caio `FORBIDDEN` e ficha do Kael `SHEET_NOT_FOUND`; apagar a principal → `mainSheetId: null`; `sheet:adjustBar` → `character:changed` e PV 25; Quelm isolada (id malformado, personagem da Vharn na Quelm, não membro → 404; a sala da Quelm não ouve nada). `sheets.spec.ts`, `sheets-library.spec.ts` ajustados ao personagem.

## Armadilhas

- O `SheetsDaoFake.update` faz `Object.assign` na mesma linha que o `scopeOf` leu: ler `sheet.characterId` depois do `update` dá o dono **novo**. O service guarda o `from` antes de gravar.
