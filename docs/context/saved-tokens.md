# Tokens salvos

O retrato de um token que o membro guarda para pôr no mapa de novo (as invocações do necromante). É **do membro e da mesa**, como as rolagens salvas ([`dice/salvas.md`](dice/salvas.md)): só o dono vê, edita e apaga; outra mesa, outra lista. O conteúdo é o mesmo da colagem (Ctrl+V): o spawn é um `token:createMany` de um item na casa clicada, com as regras do jogador de sempre ([`tokens/autoria.md`](tokens/autoria.md)). Server em `server/src/modules/saved-tokens/`; client (aba, mira com prévia, arrastar) em [`client/saved-tokens.md`](client/saved-tokens.md).

## Contrato (`packages/contracts/src/board/saved-token.dto.ts`)

- `SAVED_TOKENS_MAX` (50) e `SAVED_TOKEN_FOLDERS_MAX` (20): os tetos técnicos por membro e mesa; o plano dá menos (grade em [`contracts/planos.md`](contracts/planos.md): Grátis 0/0, Apoiador 5/2 pessoal, Narrador 20/5, Lenda 50/20).
- `savedTokenBodyDto`: o `createTokenCommandDto` sem `actionId`, `campaignId`, `col`, `row` e `controllerIds` (estrito: `hidden` e `combatantId` também recusados), mais `forms` (até 8, `tokenFormDto` sem `id`: o spawn dá ids novos) e `activeForm` (índice da forma mostrada ou `null`; índice fora das formas → "activeForm 1 is past the 1 form(s); …").
- `savedTokenDto { id, name, folderId, token, planLocked }`, `savedTokensResponseDto { savedTokens }`, `createSavedTokenRequestDto { name (1–60, aparado), folderId?, token }`, `updateSavedTokenRequestDto { name?, folderId?, token? }` (`{}` → "changes is empty; expected at least one of name, folderId, token"), `savedTokenParamsDto`.
- Pastas: `savedTokenFolderDto { id, name }`, `savedTokenFoldersResponseDto { folders }`, `savedTokenFolderRequestDto { name (1–40) }`, `savedTokenFolderParamsDto`, `savedTokenFolderNameKey` (= `savedRollNameKey`).
- O nome do token salvo **pode repetir**; o da pasta não (sem caixa e sem acento).

## Tabelas (`saved-tokens.po.ts`, migração `0129_saved_tokens`)

- `saved_tokens`: `id`, `campaign_id`, `user_id` (FK composta `saved_tokens_member_fk` → `campaign_members`, **cascade**: sair da mesa ou apagá-la leva a lista dali), `folder_id` (→ `saved_token_folders`, set null), `name` (`CHECK` 1–60), `image_asset_id` e `aura_image_asset_id` (→ `assets`, **set null**), `active_form` (`smallint`, `CHECK` 0–7), `body` (`jsonb`, `SavedTokenBodyPo`: o resto do corpo, a aura sem a imagem), timestamps. Índices: `(campaign_id, user_id)` e parciais em `folder_id` e nas duas imagens (o set null não varre as mesas).
- `saved_token_forms`: PK (`saved_token_id` cascade, `position` 0–7), `name`, `image_asset_id` (→ `assets`, set null, índice parcial), `width`/`height` (`CHECK` de meia casa, o mesmo do token), `frame`.
- `saved_token_folders`: o molde do `saved_roll_folders` (FK composta cascade, único `(campaign_id, user_id, name_key)`, `CHECK` 1–40).
- `body` é `SavedTokenBodyPo` = `Record<string, unknown>` de propósito: o PO não conhece o DTO; o mapper grava o corpo do contrato e o lê de volta pelo `savedTokenBodyDto.parse` (linha fora do contrato lança, nunca chega meio lida ao client; json antigo ganha os padrões).
- **Imagens em coluna, não no json:** as três entram no `ASSET_FOREIGN_KEYS` ([`assets/cota-e-varredura.md`](assets/cota-e-varredura.md)), então a varredura de soltos não apaga um arquivo usado só por token salvo. Imagem apagada = iniciais no retrato e na forma; **aura de imagem perdida = sem aura** (a regra do token, [`tokens/aura.md`](tokens/aura.md)).
- `truncateAllTables` inclui as três; o `schema.ts` as exporta.

## DAO

- `SavedTokensDao(db | tx)`, tudo pelo `SavedTokenOwner { campaignId, userId }` (§2.6): `listOf` (ordem de criação, com as formas por `position` numa 2ª consulta), `findOf`, `countOf`, `rankOf` (molde do das rolagens), `insert(row, forms)`, `update(owner, id, changes, forms?)` (`forms` presente troca a lista inteira), `remove` → `boolean`. Token de outro membro ou de outra mesa → `undefined`/`false`.
- `SavedTokenFoldersDao`: `listOf`, `findOf`, `countOf`, `insert`, `rename`, `remove` (os tokens ficam fora de pasta).
- `MemberPlansDao` (`server/src/modules/plans/member-plans.dao.ts`): `lock(mesa, membro)` (`FOR NO KEY UPDATE OF campaign_members`) e `find` → `{ tableOwner, member }`. Saiu do `SavedRollsDao`, cujo `lockPlans`/`findPlans` agora delegam a ele.

## Regra (`saved-token.bo.ts`)

`SavedTokenRulesBo({ tokens, folders })` (os tetos técnicos vêm do plugin). O teto do plano é `memberSavedTokenLimitsOf({ tableOwner, member })` (`plans/plan-limits.bo.ts`, sobre o `savedTokenLimitsOf` do contracts): o maior entre a grade do dono da mesa e a pessoal do membro.

- `requireRoomFor(guardados, teto)`: `PLAN_LIMIT` `savedTokens` (com o `holder`), depois `SAVED_TOKENS_LIMIT` ("saving would keep 51 of 50 saved tokens; …").
- `requireFolderRoom(guardadas, teto)`: `PLAN_LIMIT` `savedTokenFolders` (Grátis 0), depois `SAVED_TOKEN_FOLDERS_LIMIT`.
- `requireConfigurable(rank, teto)` / `isPlanLocked(rank, teto)`: o excedente só leitura (`savedTokens` entrou no `PlanEditableResource`): nome e token travam; pôr no mapa, mover de pasta e apagar passam.

## Service

- `SavedTokensService({ members, plans, tokens, assets, transaction, maximums })`; o dono (`SavedTokenOwner`) vem da sessão + rota. Todo método começa por `memberAccessOf` (espectador → `FORBIDDEN` antes de ler; fora da mesa → `CAMPAIGN_NOT_FOUND`).
- `create`: `requireAssetsOf` (retrato, imagem da aura e das formas têm de ser imagens **da mesa**, o mesmo do token; senão `ASSET_NOT_FOUND`) **antes** da transação → `lock → count → requireRoomFor → pasta do dono → insert → commit`.
- `update`: imagens (se vier `token`) → `lock → rank (undefined → SAVED_TOKEN_NOT_FOUND) → requireConfigurable se vier nome ou token → pasta → update` (só as chaves que vieram; `token` troca colunas, corpo e formas).
- `list`: os dois planos sem trava (`MemberPlansDao.find`) → `listOf` (o índice é o rank) → `planLocked`. `remove`: `false` → `SAVED_TOKEN_NOT_FOUND`.
- `SavedTokenFoldersService`: `list`, `create` (sob o `lockedLimitsOf`), `rename`, `remove`; nome repetido (o `23505` do único) → `SAVED_TOKEN_FOLDER_NAME_TAKEN`.

## Rotas (`saved-tokens.routes.ts`, sob `/api`, todas com sessão)

| Rota                                                                | Resposta                      |
| ------------------------------------------------------------------- | ----------------------------- |
| `GET /campaigns/:campaignId/saved-tokens`                           | 200 `savedTokensResponseDto`  |
| `POST /campaigns/:campaignId/saved-tokens`                          | 201 `savedTokenDto`           |
| `PATCH /campaigns/:campaignId/saved-tokens/:savedTokenId`           | 200 `savedTokenDto`           |
| `DELETE /campaigns/:campaignId/saved-tokens/:savedTokenId`          | 204                           |
| `GET/POST /campaigns/:campaignId/saved-token-folders`               | 200 `{ folders }` / 201 pasta |
| `PATCH/DELETE /campaigns/:campaignId/saved-token-folders/:folderId` | 200 pasta / 204               |

Códigos: `INVALID_BODY` 400 · 401 · `FORBIDDEN` 403 · `PLAN_LIMIT` 403 (`withPlanLimitReply`) · `CAMPAIGN_NOT_FOUND` / `SAVED_TOKEN_NOT_FOUND` / `SAVED_TOKEN_FOLDER_NOT_FOUND` / `ASSET_NOT_FOUND` ("Image not found") 404 · `SAVED_TOKEN_FOLDER_NAME_TAKEN` 409 · `SAVED_TOKENS_LIMIT` ("You already keep 50 saved tokens at this table") e `SAVED_TOKEN_FOLDERS_LIMIT` 422 · `RATE_LIMITED` 429. **30 escritas por minuto por usuário**, somando as rotas de token e de pasta (um limitador só, como nas rolagens). `saved-tokens.plugin.ts`: `createSavedTokensModule({ db })`, registrado no `buildApp` depois das rolagens salvas.

**Spawn:** não há rota nem comando. O client manda o `token:createMany` com o corpo salvo na casa clicada; o server aplica o que já aplica à colagem (chave de criar, `copyOf` do jogador, teto de 500, imagens da mesa).

## Testes

- Contracts: `packages/contracts/test/board/saved-token.dto.spec.ts`; a grade em `test/plans/plan-limits.spec.ts` ("saved tokens in the grid", `savedTokenLimitsOf`).
- Unit: `server/test/modules/saved-tokens/{saved-token.bo,saved-tokens.mapper,saved-tokens.service}.spec.ts` (diário `lock → count → insert → commit`; imagem de outra mesa antes da trava; Apoiador 5 e a 6ª `holder: 'account'`; só leitura da 6ª; pastas) e `memberSavedTokenLimitsOf` em `test/modules/plans/plan-limits.bo.spec.ts`. Fakes em `server/test/support/saved-tokens-fakes.ts` (`MemberPlansDaoFake`, `SavedTokensDaoFake`, `SavedTokenFoldersDaoFake`, `SavedTokensTransactionRunnerFake`, `savedTokenRowPo`).
- Integração: `saved-tokens.spec.ts` (cada linha das tabelas acima, critério 14 com o Caio na Quelm, a 51ª semeada pelo DAO, a 31ª escrita), `saved-tokens-plan-limit.spec.ts` (Grátis 0, Apoiador 5 e 2 pastas, Ana descida do Narrador: a 6ª e a 7ª só leitura) e `server/test/integration/saved-tokens-dao.spec.ts` (ordem, formas, isolamento por dono e por mesa, update com e sem formas, cascatas, set null das três imagens, único da pasta, `CHECK`s, FK de membro, `MemberPlansDao` lê e serializa) e o caso do token salvo em `asset-sweep.spec.ts`. Fábricas em `server/test/support/saved-tokens-factories.ts` (`zombieBodyPo`, `savedTokenPo`, `rottenFormPo`).
