# Tokens — autoria e as chaves dos jogadores

Detalhe do hub [`../tokens.md`](../tokens.md). As duas chaves da mesa (`players_create_tokens`, `players_delete_tokens`, ver [`../campaigns/papeis.md`](../campaigns/papeis.md)) abrem ao jogador criar, editar e excluir os tokens que **ele criou**. A regra mora uma vez no game-core (`canCreateTokens`, `tokenRightsOf` em `token-rights.ts`, ver [`../game-core.md`](../game-core.md)); o server a aplica pelo `TokenAuthorshipBo`, o client esconde os botões com a mesma função.

## Coluna (`0063_token_created_by`)

- `tokens.created_by` → `users.id` **set null**, nulo permitido. Todo token criado por `token:create` e `token:createMany` grava quem mandou (o `userId` da conexão, nunca o payload): `newTokenRowOf(sceneId, regra, token, createdBy)` (`token-transaction.ts`).
- Nulo = token de antes da autoria (a migração não preenche o que existe) ou a conta do autor foi apagada: só o mestre edita e exclui. O token fica.
- Os tokens ligados que o "Adicionar jogadores" põe nascem com `created_by` nulo: token ligado é do mestre de todo jeito.
- `copyScene` (Duplicar da biblioteca) copia o autor (`copyRowsSql` leva a coluna).
- `toTokenDto` devolve `createdBy` igual aos dois públicos (não é segredo). Num token ligado, o `createdBy` é o do token do grid, não vem do personagem (`composedTokenRow` não o empresta).

## Regra (`token-authorship.bo.ts`)

`TokenAuthorshipBo(campaignAccess, { create, delete })`, montado por `toTokenAuthorshipBo(access, colunas | undefined)` (`tokens.mapper.ts`; mesa sumida = chaves desligadas). O mestre passa em tudo sem ler as chaves; o espectador cai no `requireMember` (`FORBIDDEN`).

| Método                       | O jogador passa quando                                                                                                                                      | Recusa (`FORBIDDEN`, citando o jogador e a mesa)                                                                   |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `requireCreate(criação)`     | chave de criar, camada `tokens` (ausente = `tokens`) e visão padrão (`sight`/`light` nulos ou ausentes, `sightAngle` 360 ou ausente)                        | "create a token"; "on the objects layer"; "with sight" / "with light" / "with sightAngle"                          |
| `newControllersOf(ids)`      | — (o jogador entra primeiro, sem repetir; o mestre fica com a lista como veio)                                                                              | —                                                                                                                  |
| `requireEdit(token, edição)` | `tokenRightsOf(...).edit` (criou, sem ligação, chave de criar); `sight`/`light`/`sightAngle` ausentes ou iguais aos atuais; ele continua em `controllerIds` | "edit token X"; "change the sight of token X"; "leave the control of token X" ("the creator stays in the control") |
| `requireDelete(tokens)`      | todos com `tokenRightsOf(...).delete`                                                                                                                       | "delete token X" do primeiro que não é dele (nenhum sai)                                                           |
| `copyOf(cópia)`              | — a cópia colada pelo jogador vira o token novo dele: camada `tokens`, `hidden: false`, sem `combatantId`, `sight`/`light` nulos, `sightAngle` 360          | — (o `requireCreate` decide depois)                                                                                |

- O mapper entrega `toAuthoredToken(linha)` (`{ tokenId, createdBy, characterId }`; o `ownedTokenOf` do BO o entrega ao `tokenRightsOf` do game-core, que lê o `characterId`) e `toEditedToken(linha)` (mais a visão como o fio a leva: `sight`/`light` em números, `sightAngle`), para comparar com o que o comando mandou.
- Só o `token:update` mexe nos controladores; outro jogador não edita o token, então "nenhum jogador tira o criador" é a trava do próprio criador. O mestre tira (o próximo evento chega redigido para ele).

## Onde os services leem as chaves

- `CampaignsDao.tokenRightsOf(campaignId)` → `CampaignTokenRightsPo` (as duas colunas) ou `undefined`, no **pool**, antes da trava: dep `tokenRights: TokenRightsReader` de `TokensService` e `TokenBatchService` (o `tokens.plugin.ts` monta um `CampaignsDao(db)`). `authorshipOf(reader, access)` (`token-transaction.ts`) só lê quando quem pede não é mestre. Recusa de criação não trava o grid.
- `create`: `requireCreate` → `newControllersOf` → trava → `newTokenRowOf(…, userId)`. `update`: dentro da trava, `requireEdit(toEditedToken(found), comando)` antes de gravar. `delete`: `requireDelete([toAuthoredToken(found)])`. `createMany`: cada item passa por `copyOf` + `requireCreate` + `newControllersOf` antes da trava (tudo ou nada). `deleteMany` (também o desfazer da colagem): `requireDelete(linhas)` antes do `requireAt`.
- Seguem só do mestre: `token:setLayer`, `token:setHiddenMany`, `token:linkToCharacter`/`unlinkFromCharacter` (e o legado `linkToCard`/`unlinkFromCard`), `token:addPlayers`. O teto de 500 por cena vale igual para o jogador.

## Testes

- Unit: `token-authorship.bo.spec.ts` (cada método, as duas chaves, ligado, sem autor, espectador, visão igual × diferente, `copyOf`); `tokens.mapper.spec.ts` (`createdBy` aos dois públicos e nulo, `toEditedToken`, `toTokenAuthorshipBo` sem colunas); `player-tokens.service.spec.ts` (Bia cria com ela no controle, recusa sem gravar nem publicar, o mestre não lê as chaves, editar, sair do controle, excluir com a chave desligada/ligada, colar fora do combate e visível, lote com token do Caio, desfazer a colagem). Fake `TableTokenRightsFake` (`test/support/tokens-fakes.ts`: `turnOn(mesa, chaves)`, `reads`), dep obrigatória de todo `TokensService`/`TokenBatchService` dos specs.
- Integração: `tokens-dao-authorship.spec.ts` (`insert`/`insertMany` gravam, sem autor = nulo, apagar a conta → nulo e o token fica, `copyScene` copia) e `player-tokens.spec.ts` (Socket.IO real: sem chave `FORBIDDEN`; a Bia cria e cada público recebe `createdBy`; dá controle ao Caio e não sai; o mestre a tira e o evento chega redigido; token do mestre `FORBIDDEN`; chave de excluir desligada; espectador; token da Quelm `TOKEN_NOT_FOUND`; 501º `TOKEN_LIMIT`).
