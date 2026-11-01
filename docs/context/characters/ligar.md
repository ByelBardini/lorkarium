# Ligar, desligar e "Adicionar jogadores" (Fase 8)

Detalhe do hub [`../characters.md`](../characters.md). Desde a Fase 8 o token de grid liga **direto ao personagem** (`tokens.character_id`), sem âncora no elenco: nada novo nasce no elenco, a Ficha da mesa não muda e `tokens.anchor_token_id` fica `null` em todo token ligado ou desligado por aqui (a coluna sai na Fase 13).

## Comandos

| Comando                     | Quem   | Payload                                        | Ack                                                                                                                                                | Evento                               |
| --------------------------- | ------ | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `token:linkToCharacter`     | mestre | `{ …boardCommandShape, tokenId, characterId }` | `{ ok, version }` (do grid) · `CHARACTER_ALREADY_PLACED`, `CHARACTER_NOT_FOUND`, `TOKEN_NOT_FOUND`, `FORBIDDEN`, `SCENE_NOT_FOUND`, `INVALID_BODY` | `token:updated` no grid, por público |
| `token:unlinkFromCharacter` | mestre | `{ …boardCommandShape, tokenId }`              | `{ ok, version }` (do grid) · `TOKEN_NOT_LINKED`, `TOKEN_NOT_FOUND`, `FORBIDDEN`, `SCENE_NOT_FOUND`                                                | `token:updated` no grid, por público |
| `token:addPlayers`          | mestre | `{ …boardCommandShape, center }`               | `addPlayersAckDto` `{ ok, version, createdIds, skippedMemberIds }` · `NO_FREE_CELLS`, `OUT_OF_SCENE`, `FORBIDDEN`, `SCENE_NOT_FOUND`               | um `token:createdMany` no grid       |

- Ligados em `board/character-commands.ts` (`bindLinkCommands`, pelo `mutate`, fila da mesa; o `token:addPlayers` pelo `write`). Dep `tokenLink: Pick<TokenLinkService, 'link' | 'linkToCard' | 'unlink'>` (também no `BoardGatewayDeps`).
- **Legado até a Fase 13:** `token:linkToCard` agora **delega** ao fluxo novo (`TokenLinkService.linkToCard`: o personagem do jogador da ficha, `characters.findOfUser`; sem personagem — o mestre, um estranho → `MEMBER_NOT_FOUND`); `token:unlinkFromCard` é o mesmo `unlink`. O client não manda mais nenhum dos dois; nenhum cria âncora.

## Regra (`tokens/character-link.bo.ts`, `CharacterLinkBo`)

- `requireFree(token)`: token que já veste um personagem (`characterId` ≠ `null`) → `CHARACTER_ALREADY_PLACED` ("token X already wears character C; expected an unlinked token").
- `requireNotPlaced(tokenId, characterId, placed)`: o grid já tem um token do personagem → `CHARACTER_ALREADY_PLACED` citando os dois tokens e o personagem. O mesmo personagem em **outro** grid é permitido (é o ponto do personagem).
- `linkedOf(token)` → o `characterId`; solto → `TOKEN_NOT_LINKED` ("token X wears no character").
- `requirePlayer` fica só para o `SheetHolderService` até a Fase 9.
- Erros em `tokens.error.ts`: `CharacterAlreadyPlacedError(tokenId, placedTokenId, characterId)` (o 3º campo era `memberId`), `TokenNotLinkedError`.

## Service (`tokens/token-link.service.ts`, `TokenLinkService`)

- `link(usuário, mesa, { sceneId?, tokenId, characterId })`: `memberAccessOf` + `requireMaster` (sem trava) → `inLockedCharactersAndGrid` (personagens → grid, sempre; o personagem é lido sob trava) → `tokenIn` → `requireFree` → `characterIn(daos, mesa, id)` (outra mesa → `CHARACTER_NOT_FOUND`) → `characterLinks.placedOn(grid, personagem)` → `requireNotPlaced` → `characterLinks.adopt` → relê o token composto + condições → `changeSceneOf` (véu se o controle mudou num oculto) → commit; **só o grid soma** (`characters: false`: o personagem não mudou, sem `character:changed`).
- `unlink(usuário, mesa, { sceneId?, tokenId })`: mesmas travas → `tokenIn` (composto: a identidade já é a do personagem) → `linkedOf` → `characterLinks.release(token, personagem, identityOf(token))` → relê → só o grid soma.
- Recusa não grava, não soma nem publica (o ack de erro sai antes de qualquer evento).

## DAO (`tokens/token-character-link.dao.ts`, `TokenCharacterLinkDao`, no `tx`)

`TokenWriteDaos.characterLinks: Pick<TokenCharacterLinkDao, 'placedOn' | 'adopt' | 'release'>` (fiação no `tokens.plugin.ts`). Separado do `TokenAnchorsDao`, que sai inteiro na Fase 13.

- `placedOn(grid, personagem)` → `{ id }` do token do personagem no grid (o índice único `tokens_scene_id_character_id_unique` garante no máximo um).
- `adopt(token, personagem)`: apaga as barras, os controladores e as condições **do token** (`active_conditions.token_id`) e grava `character_id` (e `anchor_token_id = null`).
- `release(token, personagem, identidade)`: apaga o que o token tinha, copia `character_bars` → `token_bars` (ids novos, mesma posição; colunas comuns lidas do PO), `character_controllers` → `token_controllers`, as condições do personagem (`active_conditions.character_id`) → linhas novas com `token_id` (ids novos, mesmas rodadas e stacks; `copyRowsSql`), grava a identidade e zera `character_id`/`anchor_token_id`. O personagem fica como estava.
- Não mexe no `ConditionsDao` (da Fase 7): as condições do token/personagem são lidas e escritas por SQL aqui.

## "Adicionar jogadores" (`TokenBatchService.addPlayers`)

- `requireMaster` → jogadores da mesa (`orderedMembers`, só `player`) → `inLockedCharactersAndGrid` (personagens lidos sob trava, nunca escritos) → `characters.listOfCampaign` → `playersCharactersOf`: o personagem de cada jogador na ordem dos jogadores; jogador **sem personagem** vai para `skippedMemberIds` (todo jogador ganha um ao virar jogador, então sai `[]` na prática) → quem já tem token do seu personagem no grid é pulado (sem entrar em `skippedMemberIds`) → ninguém a pôr: zero criados, **sem somar nem publicar** → `placeCharacters` com o **tamanho do personagem** (`width`/`height`) → `TokenRulesBo.admit` → `insertMany` dos ligados (identidade do personagem, camada `tokens`, direção 0, sem visão nem luz, `characterId`, `anchorTokenId` nulo) → relê compostos → um `token:createdMany` na versão do grid.
- `NO_FREE_CELLS` ("scene X has no free cells for 1 of the 2 characters") e `OUT_OF_SCENE` como antes (`character-placement.bo.ts`).

## Testes

- Unit: `test/modules/tokens/character-link.bo.spec.ts` (as três regras e as mensagens), `token-link.service.spec.ts` (diário `lock characters → lockInCampaign → adopt → bump → commit → publish`, sem `character:changed`; o Kael adota a Lyra e perde PV, controle e Envenenado; segundo token no grid e token já ligado → `CHARACTER_ALREADY_PLACED` sem escrita; personagem da Quelm → `CHARACTER_NOT_FOUND`; `FORBIDDEN` sem trava; token da Quelm; `linkToCard` delega e o mestre é `MEMBER_NOT_FOUND`; desligar copia barras com ids novos, controle e a condição do personagem, diário com `release`; `TOKEN_NOT_LINKED`), `add-players.spec.ts` (Lyra 1×1 e Bram 2×2, ninguém pulado; diário `lock characters → … → bump`; redação; jogador sem personagem é o único pulado; quem já está é pulado; todos já lá = versão 7 sem `bump`; `NO_FREE_CELLS`; `FORBIDDEN`, Quelm e elenco).
- Integração: `token-link.spec.ts` (Ana, Bia e Caio ouvem `token:updated` do Kael vestindo a Lyra, o Caio sem o PV, ack = versão do evento; o Vigor e o Envenenado do Kael somem e a versão dos personagens não anda; `CHARACTER_ALREADY_PLACED` ×2; o mesmo personagem na Estrada; personagem e token da Quelm; `FORBIDDEN`/`userId` forjado; reinício; `token:linkToCard` delega; desligar: cópia com ids novos, controle e Envenenado do personagem, a Lyra intacta; o PV copiado anda sozinho; `TOKEN_NOT_LINKED`) e `add-players.spec.ts` (Lyra e Bram ligados sem âncora, Bram 2×2; PV e Envenenado do personagem; segunda vez = zero na mesma versão; apagar a Lyra e adicionar de novo põe só ela; `FORBIDDEN`, Quelm e elenco).
- Suporte: `TokenCharacterLinkDaoFake` (`test/support/token-character-link-fakes.ts`; diário `adopt`/`release`; copia as condições do personagem do `ConditionsDaoFake.active` pelo `characterId`), 11º parâmetro do `TokenTransactionRunnerFake` e `CharacterTableFake.characterLinks`; integração `linkToCharacter`/`unlinkFromCharacter` em `test/support/characters.ts` e `poisonCharacter` (Envenenado direto no personagem) em `test/support/table-characters.ts`.
