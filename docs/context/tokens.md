# Tokens

Os tokens da cena (spec §3.4, §3.6, §3.9): quem pode o quê, as N barras de cada um (a vida generalizada) e o que cada público recebe. Server em `server/src/modules/tokens/`; a borda Socket.IO é o gateway do `board` (ver [`board.md`](board.md)); DTOs em [`contracts.md`](contracts.md) (`token.dto.ts`); regra da barra em [`game-core.md`](game-core.md). O client fica em [`client/board.md`](client/board.md).

## Tabelas (`tokens.po.ts`, migração `0003_tokens`)

- `tokens`: `id`, `scene_id` (cascade, indexado), `name`, `initials`, `side` (enum `token_side`), `size` (casas), `col`, `row`, timestamps.
- `token_controllers`: PK (`token_id`, `user_id`), os dois cascade — o `TokenController` do §6.
- `token_bars`: `id`, `token_id` (cascade), `position`, `label`, `current`, `max`, `color` (enum `bar_color`), `visibility` (enum `bar_visibility`); único (`token_id`, `position`). Generaliza o `currentHp`/`maxHp` do §6.

## DAO (`tokens.dao.ts`)

- `TokenRow` = `{ token, bars (por posição), controllerIds }`. `insert(row)`, `listOfScene(sceneId)`, `findInScene(sceneId, tokenId)` (só acha na própria cena: id de outra mesa → `undefined`), `move`, `setBarCurrent(barId, valor)`, `update(tokenId, { fields, bars, controllerIds })` (troca as barras e os controladores inteiros), `delete` (cascade). As escritas de várias tabelas rodam no DAO montado com o `tx`.

## Regra

- `TokenAccessBo(campaignAccess, { tokenId, controllerIds })`: o mestre controla tudo; quem está em `controllerIds` controla o token. `requireControl(ação)` → `FORBIDDEN` citando quem, a ação e o token; `audience()` → `privileged` (mestre ou controlador) | `others`.
- `TokenRulesBo({ scene, memberIds, barLimit })`: `place(célula, tamanho)` pelo `footprintFits` (fora → `OutOfSceneError` `OUT_OF_SCENE` citando a célula, o tamanho e a cena; sem colisão, §12); `controllers(ids)` só aceita membros, sem repetir (`InvalidControllerError` `INVALID_CONTROLLER` citando quem não é); `adjustBar(atual, mudança)` pelo `applyBarChange` com o `BAR_VALUE_LIMIT` (passado pelo plugin).
- Erros (`tokens.error.ts`): `TOKEN_NOT_FOUND` (também para token de outra mesa), `BAR_NOT_FOUND`, `OUT_OF_SCENE`, `INVALID_CONTROLLER`. Permissão de mesa (`FORBIDDEN`, `CAMPAIGN_NOT_FOUND`) vem do `CampaignAccessBo`.

## Redação por público

- `toTokenDto(row, audience)` (`tokens.mapper.ts`): `privileged` recebe tudo com `canControl: true`; `others` recebe `canControl: false` **sem** as barras `controllers` — e as barras que vêm guardam a `position` (a 2ª não vira "a primeira").
- Evento com token (`token:created`, `token:updated`): o `BoardPublisherPort.tokenChanged` leva as duas versões; o adaptador emite a inteira para `campaign:<id>:masters` + `campaign:<id>:user:<controlador>` e a redigida para `campaign:<id>` **exceto** essas salas. `token:moved` e `token:deleted` não têm nada a redigir e vão à mesa toda.
- O snapshot do `board:sync` redige token a token para quem pede (`BoardService.snapshotFor`).
- Tirar alguém dos controladores (`token:update`) faz o próximo evento chegar redigido para ele.

## Service (`tokens.service.ts`)

`TokensService.create | update | move | adjustBar | delete(userId, campaignId, comando)` → versão nova. Participação → permissão (`requireMaster` para criar, editar e excluir; `requireControl` para mover e ajustar barra) → transação (`lockActiveOf` → token **da cena da mesa** → regra → grava → `bumpVersion`) → **depois do commit** publica. Recusa não grava nem publica. `TokenTransactionRunner` entrega `ScenesDao` e `TokensDao` presos ao `tx`; `tokens.plugin.ts` (`createTokensModule({ db, publisher, clock })`) monta o service, ligado no `wireRealtime` e entregue ao `board`.

| Comando           | Quem                  | Evento                                    |
| ----------------- | --------------------- | ----------------------------------------- |
| `token:create`    | mestre                | `token:created` `{ token }` (por público) |
| `token:update`    | mestre                | `token:updated` `{ token }` (por público) |
| `token:move`      | mestre, quem controla | `token:moved` `{ tokenId, col, row }`     |
| `token:adjustBar` | mestre, quem controla | `token:updated` `{ token }` (por público) |
| `token:delete`    | mestre                | `token:deleted` `{ tokenId }`             |

## Testes

- Unit: `server/test/modules/tokens/` (acesso, regra, mapper, service com o diário `lock → save → bump → commit → publish`); fakes `TokensDaoFake` e `TokenTransactionRunnerFake` (`test/support/tokens-fakes.ts`), fixtures `lyraRow`, `pvBar`, `inspirationBar` (`tokens-factories.ts`).
- Integração: `tokens-dao.spec.ts` (DAO, isolamento por cena, índice único) e `tokens.spec.ts` (três clientes reais: redação no evento e no sync, `FORBIDDEN`, `OUT_OF_SCENE`, `TOKEN_NOT_FOUND` de outra mesa, mesa fora da conexão, `userId` forjado, reinício do app).

## Armadilhas

- Um comando com `as const` no spec vira tupla `readonly` e não cabe no tipo do DTO (arrays mutáveis): tipe a fixture (`const NEW_TOKEN: CreateToken = …`).
