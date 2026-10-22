# Token principal

O token que o rodapé (`TokenDock`) de cada pessoa mostra quando nada está selecionado. É o "personagem atribuído" do Foundry, mas aponta para o **token da cena**, porque o `Character` do spec §6 ainda não existe: por isso a escolha é **por cena**. Hub: [`../tokens.md`](../tokens.md).

## Tabela (`main-tokens.po.ts`, migração `0031_main_tokens`)

- `main_tokens`: `scene_id` (→ `scenes`, cascade), `user_id` (→ `users`, cascade), `token_id` (→ `tokens`, cascade, indexado em `main_tokens_token_id_idx`) e `chosen_at` (`timestamptz`, `defaultNow`). PK (`scene_id`, `user_id`): **um principal por pessoa por cena**. Duas pessoas podem escolher o mesmo token. Apagar o token apaga as escolhas (cascade).
- Sem escolha gravada, o client cai no automático (o mais antigo da camada Tokens com a pessoa no Controle): a linha só existe quando alguém escolhe.

## DAO (`main-tokens.dao.ts`)

- `MainTokensDao(db | tx)`: `listOfScene(sceneId)` → `MainTokenChoicePo[]` (`{ userId, tokenId }`, por `chosen_at`); `choose(sceneId, userId, tokenId)` (`insert … onConflictDoUpdate` na PK: a segunda escolha troca no lugar); `dropLostControl(tokenId, keptUserIds)` apaga as escolhas do token feitas por quem não está em `keptUserIds` (vazio apaga todas as do token).

## Regra (`token-access.bo.ts`)

- `TokenAccessBo.requireListed(ação)`: só passa quem está no `controllerIds` do token; **o poder de mestre não conta** (diferente do `requireControl`). O mestre só tem principal se estiver no Controle. Fora → `FORBIDDEN` citando quem, "`<ação>` token `<id>`" e "being listed in its control". O service usa a ação `'choose as main'`.
- `TokenAccessBo.requireChooseMainFor(playerId)`: para si mesmo = `requireListed`; para outro jogador, `requireMaster('choose the main token of <id>')` e o jogador tem de estar no `controllerIds` (senão `FORBIDDEN` "choose token `<id>` as main of `<jogador>`").
- A camada **não** conta na escolha explícita (o baú da camada Objetos pode ser o principal de quem o escolhe); só o automático do client olha a camada Tokens.

## Contrato

`token-main.dto.ts` (ver [`../contracts/tabuleiro.md`](../contracts/tabuleiro.md)): `setMainTokenCommandDto` `{ actionId, campaignId, tokenId, playerId? }` sem `userId` (o `userId` forjado continua `INVALID_BODY`); o `playerId` é o jogador para quem o **mestre** escolhe; o evento `mainTokenChangedDto` `{ campaignId, version, at, userId, tokenId }`. Não existe "tirar o principal": para trocar, escolhe outro.

## Service (`main-token.service.ts`)

- `MainTokenService({ members, transaction, publisher, clock })`, entregue pelo `tokens.plugin.ts` como `mainToken`. `choose(userId, campaignId, { tokenId, playerId? })` (alvo = `playerId ?? userId`): `memberAccessOf` → `inLockedScene` → `tokenIn` (token de outra mesa → `TOKEN_NOT_FOUND`) → `requireChooseMainFor(alvo)` → `MainTokensDao.choose(cena, alvo, token)` → `bumpVersion` → **depois do commit** `BoardPublisherPort.mainTokenChanged` com o `userId` do alvo (o adaptador emite `token:mainChanged` à sala `campaign:<id>` inteira). A escolha soma versão como todo evento do tabuleiro, mas **não** entra no Ctrl+Z (é preferência, não edição).
- `TokenWriteDaos.mainTokens` (`choose`, `dropLostControl`), preso ao `tx` no runner do plugin.
- **Limpeza no `update`** (`tokens.service.ts`): depois do `TokensDao.update`, `dropLostControl(token, controladores conferidos)` na mesma transação — quem saiu do Controle perde o principal. O client faz o mesmo no reducer ao receber o `token:updated` (não há evento próprio da limpeza). Apagar o token limpa pela cascata.
- Fakes: `MainTokensDaoFake(journal, choices)` (`test/support/tokens-fakes.ts`; escreve `'choose'` / `'dropLostControl'` no diário e guarda `drops`), 7º parâmetro do `TokenTransactionRunnerFake`; `BoardPublisherFake.mainTokenChanges`.

## Borda e snapshot

- `board.gateway.ts`: `token:setMain` → `mutate(setMainTokenCommandDto, mainToken.choose)` (dep `mainToken: Pick<MainTokenService, 'choose'>`, entregue pelo `wireRealtime` a partir do `tokens.plugin.ts`).
- `board:sync`: `boardStateDto.mainTokens` (`{ userId, tokenId }[]` da cena ativa, igual para todo público) pelo `BoardService` (dep `mainTokens: Pick<MainTokensDao, 'listOfScene'>`) e o `toBoardStateDto`.

## Testes

- Integração `main-tokens-dao.spec.ts` (escolha, troca no lugar, duas pessoas no mesmo token, cascade do token, `dropLostControl` com um, os dois e nenhum mantido, isolamento pela cena da Quelm) e `main-tokens.spec.ts` (três clientes: a Bia escolhe e Ana e Caio recebem, o sync de todos traz; trocar deixa só o novo; o Caio e a Ana mestre fora do Controle → `FORBIDDEN` sem evento; token da Quelm → `TOKEN_NOT_FOUND`; `campaignId` da Quelm → `CAMPAIGN_NOT_FOUND` e o sync da Quelm vem vazio; `userId` forjado → `INVALID_BODY`; tirar do Controle e apagar o token somem com a escolha; reinício mantém; a Ana mestre escolhe pela Bia com `playerId` e a Bia recebe o evento com o id dela; o Caio jogador com `playerId` da Bia → `FORBIDDEN`).
- Unit `token-access.bo.spec.ts` (`requireListed`, `requireChooseMainFor`), `main-token.service.spec.ts` (diário `lock → choose → bump → commit → publish`, `FORBIDDEN`, `TOKEN_NOT_FOUND`, `CAMPAIGN_NOT_FOUND`; `for a player`: o mestre pela Bia, o jogador pela Bia, o mestre pelo Caio fora do Controle) e `tokens.service.spec.ts` (`update and the main tokens`: `dropLostControl` antes do `bump`, controle vazio, recusa não limpa).
- E2E `e2e/test/main-token.spec.ts` (ver [`../ci/e2e.md`](../ci/e2e.md)): a Bia vê a Lyra sem selecionar, troca pelo Kael e volta, faz o Lobo principal e o reload mantém.
- Client: [`../client/token-dock.md`](../client/token-dock.md).
- Fixtures com `mainTokens: []`: `vharnBoard` (`client/test/support/table-session-fixtures.ts`) e o estado do `board.dto.spec.ts`.
