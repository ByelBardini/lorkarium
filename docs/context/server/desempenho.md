# Server — desempenho

Detalhe do hub [`server.md`](../server.md).

## Desempenho

- `test/support/query-count.ts` — `CountingQueryLog` (`queries`, `count`, `matching(/^begin/i)`, `reset()`); o `useTokenTable` o liga por `openTestDatabase({ queryLog })` e o expõe como `live.queries` (zerado a cada `seed`). Para contar um comando: `live.queries.reset()` logo antes de mandá-lo e ler `count` depois do ack. O Drizzle registra também `begin` e `commit`.
- `test/integration/query-budget.spec.ts` — o teto de consultas de cada comando quente (`BUDGET`); uma consulta a mais num DAO deixa o `it` vermelho. Quando um número baixa, o teto desce junto.

| Comando (cenário do spec)                      | Sem memória | Atual | Regras que seguram |
| ---------------------------------------------- | ----------- | ----- | ------------------ |
| `token:dragMany` de jogador (0 `begin`)        | 9           | 1     | 1, 2, 4            |
| `token:move` de jogador numa cena com paredes  | 12          | 9     | 1, 2               |
| o próximo `token:move` do mesmo jogador        | 12          | 8     | 1, 2, 3            |
| `token:createMany` de 64                       | 394         | 9     | 1, 2, 7, 9         |
| `combat:nextTurn` com 4 entradas e 3 condições | 19          | 10    | 1, 2, 8            |
| `board:sync` (com `begin`/`commit` do retrato) | 16          | 15    | 1, 2, 10           |

Os números contam `begin`/`commit`. "Sem memória" é o custo medido antes das regras abaixo.

### Regras de desempenho (não desfazer)

Cada regra diz onde mora e quantas consultas voltam se for quebrada. Mexeu num DAO, num service do tabuleiro ou no encanamento do Socket.IO: rode o `query-budget.spec.ts` antes e depois.

1. **A identidade fica na conexão** (`src/realtime/realtime-server.ts`, `ConnectionIdentityBo`): `reauthenticate` só relê a sessão a partir do `recheckAt`, e o logout derruba os sockets da sessão pela `SessionEndedPort`. Reler a cada comando volta 2 consultas (sessão e usuário) em **todo** comando de mesa, inclusive a prévia de arraste.
2. **Participação em memória, só positiva** (`CachedMemberships`, `modules/campaigns/cached-memberships.ts`): os módulos do tabuleiro recebem o `members` do `campaigns.memberships` pelo plugin (nunca `new CampaignMembersDao(db)` próprio), e o `rosterOf` do `session:join` passa por ela e a aquece. Um DAO próprio num plugin volta 1 consulta por comando daquele módulo; lembrar "não é membro" barra quem entra pelo código logo depois.
3. **Paredes da cena em memória, enchidas só sob a trava e esquecidas ao gravar** (`SceneWallsService`, `modules/walls/scene-walls.service.ts`; ver `walls.md`): o move e a porta de jogador não releem as paredes, e o array devolvido é o mesmo enquanto nada muda (o `preparedWalls` do game-core é reaproveitado). Ler pelo DAO direto volta 1 consulta por move/porta de jogador **e** a preparação das paredes a cada comando; encher fora da trava ou esquecer o `forget` ao gravar = parede velha barrando (ou deixando passar) o token.
4. **`token:dragMany` sem transação, numa consulta** (`TokensDao.findDragGroup`, `TokensService.dragMany`; ver `tokens/arraste.md`): a prévia não grava, então não trava a cena nem segura conexão. Voltar para `transaction` + `findActiveOf` + `findManyInScene` volta 5 consultas (`begin`, cena, tokens, barras, controladores, `commit`) por prévia, até 10/s por jogador, e a prévia passa a esperar a trava dos comandos que gravam.
5. **Pool e tempos por env** (`createDatabase(url, env.database)`, `src/config/env.ts`): `lock_timeout` de 2 s e `statement_timeout` de 5 s em toda conexão. Sem eles, uma rajada que segura a trava de uma cena deixa as conexões esperando para sempre e as outras mesas ficam sem pool; não custa consulta, custa a mesa inteira travada.
6. **Fila de comandos por mesa** (`CampaignCommandQueue`, `src/realtime/campaign-command-queue.ts`, aplicada no `write` do `board.gateway.ts`): comando que grava espera a vez fora do pool. Tirar a fila não muda a contagem de consultas, mas com o pool pequeno uma rajada de 20 moves numa mesa faz o `board:sync` de outra mesa responder por último (o `board.spec.ts` prova com `poolMax: 2`); pôr o `token:dragMany` ou o `board:sync` na fila atrasa a prévia atrás das gravações.
7. **Escrita de grupo em lote** (`updateManySql`, `src/database/update-many.ts`; `TokensDao.insertMany`): mover, virar e redimensionar tokens, mover paredes e desenhos são **um** `UPDATE` com `scene_id` no `WHERE`; colar tokens são 2 comandos (tokens; barras + controladores num `WITH`), sem reler condições do token novo. Voltar ao laço por item custa 1 consulta por item no mover (64 num grupo grande) e ~5 por token no colar (o `createMany` de 64 voltava a 391), tudo dentro da trava da cena.
8. **Combate enxuto + índice** (`CombatService`, `TokensDao.controlOfScene`, `ConditionsDao.decrementRemaining`, `combatants_combat_idx`): o comando de combate lê só id e controladores dos tokens (não a cena inteira com barras), o `nextTurn` tica as condições da entrada em lote e o evento da vez sai da linha já lida. Voltar ao `listOfScene` custa 2 consultas por comando de combate (e as barras de todos os tokens), a releitura do combate +3 em cada vez, e o tique por condição +1 por condição da entrada; sem o índice, cada leitura das entradas varre `combatants`.
9. **Teto de 500 tokens por cena** (`TokenRulesBo.admit`, `TOKENS_PER_SCENE_MAX`; ver `tokens.md`, Regra): o `create` e o `createMany` contam a cena dentro da trava (+1 consulta, o `COUNT`, que entra no 9 do `createMany`) e recusam o lote inteiro. Sem ele, uma cena cresce sem limite e o snapshot, o filtro de visão do client e o render passam do orçamento da escala-alvo (300 tokens).
   - **Token invisível sem consulta no caminho comum**: o véu sai das linhas já lidas; o `TokensDao.veilOfScene` (+1) só roda quando um escondido tocado tem luz, num evento com combate que tem tokens, no `token:setHiddenMany` e quando alguém perde o Controle de um escondido. O `board:sync` não ganha consulta (os escondidos vêm do `listOfScene`).
10. **Snapshot numa transação `repeatable read` `read only`** (`runInSnapshot`, `BoardService.snapshotFor`): as ≈13 leituras do `board:sync` veem o mesmo instante (custa o `begin` e o `commit`: 13 → 15). Tirar a transação devolve 2 consultas, mas um comando que grava entre duas leituras volta a entregar um tabuleiro misturado (tokens novos com paredes velhas, versão que não bate).
11. **Socket.IO pelos limites do contracts** (`realtimeServerOptions()`, `REALTIME_MESSAGE_MAX_BYTES`, `REALTIME_COMPRESSION_THRESHOLD_BYTES`; `realtimeClientOptions()` no client): buffer de 5 MiB, compressão a partir de 4 KB e websocket primeiro. Voltar ao buffer de 1 MB derruba a conexão de quem cola 64 desenhos grandes (o `drawings.spec.ts` prova); compressão sem limiar gasta CPU em cada prévia de arraste; polling primeiro custa uma volta HTTP a mais em cada conexão e reconexão. Não custa consulta.
