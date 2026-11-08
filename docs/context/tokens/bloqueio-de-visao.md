# Tokens — bloqueio de visão

Detalhe do hub [`../tokens.md`](../tokens.md). O interruptor "Bloqueia a visão": o token corta a visão e a luz como uma cortina, sem barrar a passagem.

Esta página cobre o **campo, o teto e a porta vista** (Fases 5 e 6). A forma e a pose saem de `sight-blocker.ts` do game-core ([`../game-core/visao-e-luz.md`](../game-core/visao-e-luz.md)) e o contorno vem do asset ([`../assets/contorno.md`](../assets/contorno.md)). O uso no client está em [`../client/sight-blockers.md`](../client/sight-blockers.md).

## Coluna (`0081_token_blocks_sight`)

- `tokens.blocks_sight`: `boolean not null default false`. Linha antiga e token novo não bloqueiam.
- Pertence ao token, **por grid**, como a visão e a luz: num token ligado, o `splitUpdate` o deixa no token e o `composedTokenRow` não o sobrescreve (o personagem não tem esse campo).
- `copyScene` (Duplicar da biblioteca) leva o valor, porque o `copyRowsSql` copia toda coluna.
- Não é segredo: `toTokenDto` o entrega igual aos dois públicos, porque o client desenha a névoa com ele.

## Quem liga

Só o mestre. `blocksSight` entra em `VISION_FIELDS` e no `NEW_TOKEN_VISION` (`token-authorship.bo.ts`), a mesma trava de `sight`, `light` e `sightAngle`:

| Caso                                             | Resultado                                                                   |
| ------------------------------------------------ | --------------------------------------------------------------------------- |
| Jogador cria com `true`                          | `FORBIDDEN`: "create a token with blocksSight", citando "the master role"   |
| Jogador cria com `false` ou sem o campo          | passa, é o valor de token novo                                              |
| Jogador autor, ou quem controla o ligado, altera | `FORBIDDEN`: "change the blocksSight of token X", citando "the master role" |
| Jogador reenvia o valor que o token já tem       | passa (a regra compara com o atual, como a visão)                           |
| Jogador cola uma cópia que bloqueia              | a cópia nasce com `false` (`PLAYER_COPY`), sem recusa                       |
| Mestre cola                                      | a cópia leva o valor                                                        |
| Quelm altera o token de Vharn                    | `TOKEN_NOT_FOUND` (`tokenIn`, só acha na cena endereçada)                   |
| `blocksSight: "sim"`                             | `INVALID_BODY` na borda (`z.boolean()` nos três comandos)                   |

No `token:update`, campo ausente mantém o valor (`toTokenUpdatePo` só escreve o que veio); no `token:create`, ausente grava `false` (`newTokenLookOf`).

## Teto: 50 por cena

- `TOKEN_SIGHT_BLOCKERS_PER_SCENE_MAX` (contracts) chega pelo `tokens.plugin.ts` como `blockerLimit`, ao lado do `barLimit` e do `tokenLimit`, nos deps de `TokensService` e `TokenBatchService` e em `TokenLimits`.
- `TokenRulesBo.admitBlockers(guardados, novos)` devolve o total ou lança `TokenBlockerLimitError` (`TOKEN_BLOCKER_LIMIT_CODE` = `TOKEN_BLOCKER_LIMIT`), citando o total, as partes e o limite: "the scene would have 51 sight-blocking tokens (50 stored + 1 added); the limit is 50".
- `admitBlockersOf(daos, sceneId, regra, novos)` (`token-transaction.ts`) lê `TokensDao.countBlockersOfScene(sceneId)` **dentro da trava do grid**, antes de gravar. Com `novos` 0 não lê nada: mesa que não usa o recurso não paga consulta.
- Onde é conferido: `TokensService.create` (`true` conta 1), `TokensService.update` (conta 1 só quando o token ainda não bloqueia; reenviar `true` não conta duas vezes; desligar nunca recusa) e `TokenBatchService.createMany` (conta as cópias com `true`, tudo ou nada). Recusa não grava, não sobe versão nem publica.
- A contagem é da cena: outro grid da mesa e outra mesa contam à parte. O `hidden` conta, porque volta a bloquear assim que é mostrado.
- `copyScene` não confere: a cena copiada já cabe no teto. `token:addPlayers` cria tokens que não bloqueiam.
- A borda traduz pelo `PUBLIC_MESSAGE` (`board-command-edge.ts`): `{ code: 'TOKEN_BLOCKER_LIMIT', message: 'A scene keeps at most 50 tokens that block sight' }`. O texto interno, com as contas, fica no log.

## A porta vista

A única regra de visão do server (`doorSeen`, `walls.service.ts`; ver [`../walls.md`](../walls.md)). O jogador não abre a porta escondida atrás de uma estátua.

- **Quem bloqueia:** os tokens da cena com `blocksSight` e sem `hidden` (o invisível não denuncia o lugar). O `TokensDao.listOfScene` devolve o ligado composto, então imagem e borda são as do personagem, e a forma ativa já está no token.
- **Mapeadores** (`tokens.mapper.ts`, `lights.mapper.ts`, `walls.mapper.ts`), com `blockers` opcional, para quem não usa não mudar nada:

| Função                                  | O que faz                                                                                                                                                            |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tokenBlockerOf(linha, contorno, cena)` | Linha + contorno do asset → `SightBlocker`. Valida pelo `sightOutline`; contorno que o game-core recusa lança "token X has an outline saved broken", citando o valor |
| `tokenEyeOf(linha, bloqueadores)`       | `ignores` do olho: `blockersIgnoredAt(centro, bloqueadores, token.id)`: os que o contêm e sempre ele mesmo                                                           |
| `tokenLightOf(linha, bloqueadores)`     | O mesmo para a luz do token                                                                                                                                          |
| `lightSourceOfRow(linha, bloqueadores)` | `ignores` da luz do mapa: `blockersIgnoredAt(ponto, bloqueadores)`                                                                                                   |
| `sightWallsOf(paredes, bloqueadores)`   | A lista única: as paredes da cena primeiro (as mesmas instâncias, inclusive a da porta), depois as dos bloqueadores. Sem bloqueador, o **mesmo** array               |

- **A memória `sceneWalls` não muda:** guarda só as paredes de verdade. A lista com os bloqueadores é montada a cada `setDoor` e não fica guardada. `blockedPassage` e `requirePassage` seguem só com as paredes da cena: o bloqueador não barra a passagem.
- **Isolamento:** o contorno vem do `AssetsDao.outlinesOf(scene.campaignId, ids)`. Imagem de outra mesa fica fora do mapa e o token bloqueia pelo retângulo. Bloqueador de outro grid não entra, porque o `listOfScene` é da cena travada.

### Orçamento

| Caso                                      | Consultas a mais                                       |
| ----------------------------------------- | ------------------------------------------------------ |
| Mestre                                    | nenhuma; não lê token, luz nem contorno                |
| Jogador com a cena `off`                  | menos que antes: não lê token nem luz                  |
| Jogador sem bloqueador na cena            | nenhuma: `outlinesOf` com lista vazia não vai ao banco |
| Bloqueador sem imagem ou de borda `round` | nenhuma: não há contorno a ler                         |
| Bloqueador `square` com imagem            | 1, para todas as imagens juntas (cada id uma vez)      |

Provado em `query-budget.spec.ts` (ver [`../server/desempenho.md`](../server/desempenho.md)).

## Testes

- Unit: `tokens.service-blockers.spec.ts` (mestre, permissão, teto nos três comandos, contagem por cena, ligado, isolamento, nenhuma leitura sem ligar: `TokensDaoFake.blockerCounts`), `token-authorship.bo.spec.ts`, `token-rules.bo.spec.ts`, `tokens.mapper.spec.ts`, `token-transaction.spec.ts`, `linked-token.spec.ts`.
- Integração: `token-sight-blockers.spec.ts` (Socket.IO real: evento e sync, permissão, teto com o texto público, `hidden` conta, outra cena e outra mesa, colar, `copyScene`, valor forjado).
- Contracts: `token.dto.spec.ts` (obrigatório na saída, opcional nos comandos, o valor forjado).
- Porta, unit: `walls.service-blockers.spec.ts` (estátua no caminho, desligada, movida, Luz do dia; "L" com a linha no vazio, a mesma imagem na `round`, imagem antiga, imagem de outra mesa; olho dentro, olho dentro de uma e atrás de outra, o próprio bloqueador; tocha atrás, dentro e a lanterna do bloqueador; `hidden`, outro grid; o que lê: `AssetsDaoFake.lookups`), `tokens.mapper-blockers.spec.ts` (forma, pose, cena que encolheu, contorno quebrado, `ignores` do olho e da luz), `lights.mapper.spec.ts`, `walls.mapper.spec.ts`. Fábrica: `statueRow` (1×4 em (5, 3), entre a Lyra e a `cellDoorPo`).
- Porta, integração: `doors.spec.ts` ("doors behind a token that blocks sight", Socket.IO real) e `query-budget.spec.ts` ("wall:setDoor and the tokens that block sight").

## Armadilhas

- **Olho e luz levam o `blockers`, nunca o `.map(tokenEyeOf)` direto:** o segundo parâmetro pegaria o índice do `map`. O `tsc` recusa, e o Vitest não.
- `TokenVision` exige `blocksSight`: fixture de `EditedToken` sem ele não compila, e a comparação do `requireEdit` passa a recusar se o campo faltar do lado do token.
