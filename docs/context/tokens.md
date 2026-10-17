# Tokens

Os tokens da cena (spec §3.4, §3.6, §3.9): quem pode o quê, as N barras de cada um (a vida generalizada) e o que cada público recebe. Server em `server/src/modules/tokens/`; a borda Socket.IO é o gateway do `board` (ver [`board.md`](board.md)); DTOs em [`contracts.md`](contracts.md) (`token.dto.ts`); regra da barra em [`game-core.md`](game-core.md). O client fica em [`client/board.md`](client/board.md).

## Tabelas (`tokens.po.ts`, migrações `0003_tokens` e `0006_token_layers`)

- `tokens`: `id`, `scene_id` (cascade, indexado), `name`, `initials`, `side` (enum `token_side`), `size` (casas), `col`, `row`, `layer` (enum `token_layer`: `tokens` | `objects` | `background`, padrão `tokens`; a `0006` pôs todo token que existia em `tokens`), timestamps. A camada é do token inteiro e não é segredo: vai a todos os públicos.
- `token_controllers`: PK (`token_id`, `user_id`), os dois cascade — o `TokenController` do §6.
- `token_bars`: `id`, `token_id` (cascade), `position`, `label`, `current`, `max`, `color` (enum `bar_color`), `visibility` (enum `bar_visibility`); único (`token_id`, `position`). Generaliza o `currentHp`/`maxHp` do §6.

## DAO (`tokens.dao.ts`)

- `TokenRow` = `{ token, bars (por posição), controllerIds }`. `insert(row)`, `listOfScene(sceneId)`, `findInScene(sceneId, tokenId)` (só acha na própria cena: id de outra mesa → `undefined`), `findManyInScene(sceneId, ids)` (numa consulta; id de outra cena fica de fora), `move`, `moveMany(moves)` (um `UPDATE` por token, no `tx`), `setLayer(ids, layer)` (um `UPDATE` para o grupo), `setBarCurrent(barId, valor)`, `update(tokenId, { fields, bars, controllerIds })` (troca as barras e os controladores inteiros), `delete` (cascade). As escritas de várias tabelas rodam no DAO montado com o `tx`.

## Regra

- `TokenAccessBo(campaignAccess, { tokenId, controllerIds })`: o mestre controla tudo; quem está em `controllerIds` controla o token. `requireControl(ação)` → `FORBIDDEN` citando quem, a ação e o token; `audience()` → `privileged` (mestre ou controlador) | `others`. `requireMove(ação, camada)` (mover e arrastar, um ou em grupo) = `requireControl` + a camada: quem não é mestre só move token da camada `tokens`; fora dela → `FORBIDDEN` citando quem, a ação, o token e a camada. Barras, condições e combate não olham a camada (só `requireControl`).
- `TokenRulesBo({ scene, memberIds, barLimit })`: `place(célula, tamanho)` pelo `footprintFits` (fora → `OutOfSceneError` `OUT_OF_SCENE` citando a célula, o tamanho e a cena; sem colisão, §12); `controllers(ids)` só aceita membros, sem repetir (`InvalidControllerError` `INVALID_CONTROLLER` citando quem não é); `adjustBar(atual, mudança)` pelo `applyBarChange` com o `BAR_VALUE_LIMIT` (passado pelo plugin).
- Erros (`tokens.error.ts`): `TOKEN_NOT_FOUND` (também para token de outra mesa), `BAR_NOT_FOUND`, `OUT_OF_SCENE`, `INVALID_CONTROLLER`. Permissão de mesa (`FORBIDDEN`, `CAMPAIGN_NOT_FOUND`) vem do `CampaignAccessBo`.

## Redação por público

- `toTokenDto(row, audience)` (`tokens.mapper.ts`): `privileged` recebe tudo com `canControl: true`; `others` recebe `canControl: false` **sem** as barras `controllers` — e as barras que vêm guardam a `position` (a 2ª não vira "a primeira").
- Evento com token (`token:created`, `token:updated`): o `BoardPublisherPort.tokenChanged` leva as duas versões; o adaptador emite a inteira para `campaign:<id>:masters` + `campaign:<id>:user:<controlador>` e a redigida para `campaign:<id>` **exceto** essas salas. `token:moved` e `token:deleted` não têm nada a redigir e vão à mesa toda.
- O snapshot do `board:sync` redige token a token para quem pede (`BoardService.snapshotFor`).
- Tirar alguém dos controladores (`token:update`) faz o próximo evento chegar redigido para ele.

## Service (`tokens.service.ts`)

`TokensService.create | update | move | moveMany | setLayer | adjustBar | delete(userId, campaignId, comando)` → versão nova; `drag` e `dragMany` recebem também a conexão e devolvem a versão atual. Participação → permissão (`requireMaster` para criar, editar e excluir; `requireControl` para mover e ajustar barra) → transação (`lockActiveOf` → token **da cena da mesa** → regra → grava → `bumpVersion`) → **depois do commit** publica. Recusa não grava nem publica. `TokenTransactionRunner` entrega `ScenesDao` e `TokensDao` presos ao `tx`; `tokens.plugin.ts` (`createTokensModule({ db, publisher, clock })`) monta o service, ligado no `wireRealtime` e entregue ao `board`.

| Comando           | Quem                  | Evento                                                           |
| ----------------- | --------------------- | ---------------------------------------------------------------- |
| `token:create`    | mestre                | `token:created` `{ token }` (por público)                        |
| `token:update`    | mestre                | `token:updated` `{ token }` (por público)                        |
| `token:move`      | mestre, quem controla | `token:moved` `{ tokenId, col, row }`                            |
| `token:moveMany`  | mestre, quem controla | `token:movedMany` `{ moves }` (à mesa toda, uma versão)          |
| `token:dragMany`  | mestre, quem controla | `token:draggedMany` `{ drags }` (sem versão, menos quem arrasta) |
| `token:setLayer`  | mestre                | `token:layerChanged` `{ tokenIds, layer }` (à mesa toda)         |
| `token:adjustBar` | mestre, quem controla | `token:updated` `{ token }` (por público)                        |
| `token:delete`    | mestre                | `token:deleted` `{ tokenId }`                                    |

## Comandos de grupo

- **Tudo ou nada, uma versão.** O caso de grupo trava a cena, busca todos os ids pelo `findManyInScene` e recusa no primeiro que faltar (`TOKEN_NOT_FOUND` citando esse id, inclusive token de outra mesa) antes de gravar qualquer um; depois grava numa escrita só e soma **uma** versão.
- `moveMany` / `dragMany`: `placeGroup` confere cada token (`requireMove` com a camada da linha, `place` pelo `footprintFits`) antes de qualquer escrita; um token alheio, fora da cena ou fora da camada recusa o grupo inteiro. O `moveMany` grava pelo `TokensDao.moveMany` e publica **um** `token:movedMany` com as casas de todos; o `dragMany` não trava, não grava nem soma versão e publica `token:draggedMany` exceto a conexão de quem arrasta (`BoardPublisherPort.tokensDragged(evento, exceptConnectionId)`). O server não conhece "grupo rígido": recebe a casa final de cada token (o deslocamento é conta do client).
- `setLayer`: `requireMaster('change the layer of tokens')` → `tokensIn` → `setLayer` → `bumpVersion` → depois do commit `BoardPublisherPort.tokenLayerChanged` (sem redação: a camada não é segredo).

## Arraste ao vivo (`token:dragMany`)

- Não existe arraste de um token só no contrato: um token arrastado sozinho é um grupo de um. `TokensService.dragMany(userId, campaignId, { drags }, connectionId)`: participação → cena ativa (`findActiveOf`, **sem trava**) → `placeGroup` (todos da cena, `requireMove`, `place` de cada casa não nula). **Não grava nem soma versão**; o ack devolve a versão atual. O gateway passa `socket.id` (uma sala do Socket.IO) como a conexão a excluir. `cell: null` = arraste daquele token encerrado sem mover.
- A ordem é do client: ele só manda a próxima prévia (e o `token:move` / `token:moveMany` final) depois do ack da anterior, e o server publica antes de responder — assim o movimento confirmado é a última palavra.
- Conta no limite de frequência como qualquer comando; o client manda no máximo 10/s, uma prévia por grupo.

## Testes

- Integração da camada: `token-layers.spec.ts`; do grupo: `token-groups.spec.ts`. Fixture `bramRow()` (Bram, de Caio, em (6, 4)) ao lado da `lyraRow()`; o `BoardPublisherFake` guarda `tokenLayerChanges`, `tokensMoves` e `tokensDrags`. O `token-table.ts` (`useTokenTable()` → Ana mestre de Vharn com Bia e Caio, Caio mestre de Quelm; `tokenCommandFor`, `createdTokenOf`, `restart()`) é a montagem dos specs de três clientes do token.
- Unit: `server/test/modules/tokens/` (acesso, regra, mapper, service com o diário `lock → save → bump → commit → publish`); fakes `TokensDaoFake` e `TokenTransactionRunnerFake` (`test/support/tokens-fakes.ts`), fixtures `lyraRow`, `pvBar`, `inspirationBar` (`tokens-factories.ts`).
- Integração: `tokens-dao.spec.ts` (DAO, isolamento por cena, índice único) e `tokens.spec.ts` (três clientes reais: redação no evento e no sync, `FORBIDDEN`, `OUT_OF_SCENE`, `TOKEN_NOT_FOUND` de outra mesa, mesa fora da conexão, `userId` forjado, reinício do app).

## Armadilhas

- O enum novo só vira `CREATE TYPE` na migração se for exportado em `server/src/database/schema.ts`; sem isso o `drizzle-kit generate` cria a coluna apontando para um tipo que não existe.
- Um comando com `as const` no spec vira tupla `readonly` e não cabe no tipo do DTO (arrays mutáveis): tipe a fixture (`const NEW_TOKEN: CreateToken = …`).
