# Tokens: visão mágica

Detalhe do hub [`tokens.md`](../tokens.md). O token com visão mágica enxerga tokens e objetos invisíveis (`hidden`, ver [`invisivel.md`](invisivel.md)). A decisão de **quem recebe** é do server; o filtro fino (alcance, parede, luz) é do client, como a visão normal ([`../client/vision.md`](../client/vision.md)). Regra no game-core: [`../game-core/visao-e-luz.md`](../game-core/visao-e-luz.md) (Visão mágica). Contrato: `magicSight` no `TokenDto` ([`../contracts/tabuleiro.md`](../contracts/tabuleiro.md)).

> Custo aceito: quem controla um token com visão mágica no grid recebe **todos** os invisíveis desse grid, mesmo fora do alcance (o DevTools mostra). Refazer o véu no server a cada movimento, arraste e patrulha foi descartado.

## Coluna e contrato

- `tokens.magic_sight` (`numeric(6,2)`, nulo = sem visão mágica), migração `0122_token_magic_sight`, `CHECK tokens_magic_sight_range` (nulo ou 0–100). Em casas; a unidade da cena só no formulário.
- `TokenDto.magicSight` (`number | null`, `magicSightDto`, `MAGIC_SIGHT_MAX` = 100): igual a todo público (não é segredo). Opcional em `token:create`, `token:update` e no colar (`newTokenDto`); ausente mantém. Recusa cita o valor: "magicSight 101 is invalid; expected 0 to 100 cells or null".
- Mapper: `toTokenMagicSightPo` (ao centésimo; `null` limpa), `magicSightOfToken`; o `toTokenUpdatePo` só escreve o que veio. `splitUpdate` deixa no token (por grid, nunca no personagem). O `copyScene` copia; o colar grava o da cópia (`newTokenLookOf`).

## Quem liga

| Quem                                    | Pode                                                                                    |
| --------------------------------------- | --------------------------------------------------------------------------------------- |
| Mestre                                  | ligar, mudar o alcance e desligar (`token:create`, `update`, `createMany`)              |
| Jogador (criador, ou controla o ligado) | nada: `FORBIDDEN` "create a token with magicSight" / "change the magicSight of token X" |
| Jogador que cola uma cópia              | a cópia nasce `magicSight: null` (`PLAYER_COPY`)                                        |

- Trava no `TokenAuthorshipBo` (`VISION_FIELDS`, `NEW_TOKEN_VISION`): reenviar o valor atual passa.
- **Plano:** recurso de função `magicSight` (`false` no Grátis e no Apoiador, `true` do Narrador para cima). `TokenPlanBo.requireChange`/`requireNew`: ligar (mandar alcance a um token sem) é `PLAN_LIMIT` `magicSight` `room`; desligar sempre passa; o token que já tinha (`tokenPlanHoldOf` → `magicSight: true`) muda o alcance mesmo depois que o plano cai (excedente).

## O público `seer` (quem vê pela visão mágica)

- **Vidente** = quem controla um token com visão mágica no grid (o ligado, pelos controladores do personagem). `TokensDao.magicSeersOfScene(sceneId)` → os ids, cada um uma vez (**uma** consulta, só da cena).
- `TokenVeil.seerIds?` (`seenVeil(véu, ids)` põe; `joinedVeil` une). `VeilAudience` ganhou `{ kind: 'seer', userId }`: vê todo invisível redigido como "outros" (`versionFor` dá `others`: barras de quem não controla, `canControl: false`, sem as formas). O vidente que também controla um escondido fica num público só, o `controller`, com `invisible` vazio. O `rest` tira os videntes (`controllerIds` = todos com corte próprio). `invisibleTo(véu, id)` devolve vazio para um vidente; as luzes veladas dele são `[]` (ele recebe os tokens).
- Adaptador: `seer` sai pelo `sceneUserRoom` dele, menos os mestres (como o `controller`). O espectador listado no controle não está no `sceneUserRoom`: cai no `rest` e nunca recebe invisível.
- **Snapshot** (`BoardService.snapshotFor`): vidente = alguma linha do `listOfScene` com `magicSight` e audiência `privileged` (o `TokenAccessBo` já exclui o espectador): **nenhuma** consulta a mais. Ele recebe os escondidos com `others`, o combate inteiro e `veiledLights: []`.

### Onde o véu ganha os videntes

`withSeersOf(daos, cena, véu)` (`token-veil.ts`): lê os videntes **só com véu não vazio** (comando que não toca escondido não paga nada). Entra no `veiledWriteOf`, `combatVeilOf`, `changeSceneOf` (escondido: sempre; com perda de controle, também o véu da cena), arraste (`dragGroups.magicSeersOfScene`, fora de transação), `setLayer`, `restyle` sem luz, combate (`combatIn`), condições (`applyMany`, `onHolder`), patrulha pausada e `setHiddenMany` (uma leitura serve ao antes e ao depois). `changeVeilOf` dá ao vidente `change.others`; quem perdeu o controle e é vidente recebe o `others`, não o `token:deleted`.

## A troca de quem vê

- Muda o conjunto: `token:create`/`update`/`delete`, `token:createMany`/`deleteMany`, `token:linkToCharacter`/`unlink` de um token com visão mágica (antes ou depois). `seersBeforeOf(daos, cena, podeMudar)` lê antes da escrita (nada quando não pode); `seersShiftOf(daos, cena, antes, agora)` depois: sem mudança, ou sem escondido no grid → `null` e nada mais.
- Com mudança: **soma a versão uma vez a mais** (o client descarta um segundo evento na mesma versão), monta os escondidos (`listOfScene` + condições) e `seersCutsOf`: quem passou a ver recebe `token:createdMany` com os que não controla (como "outros") e o combate inteiro; quem deixou de ver, `token:deletedMany` deles com o combate cortado por ele. Os outros (mestres inclusive) recebem `board:advanced`. Porta: `seersChanged(SeersChange)`; as luzes veladas novas de cada um que mudou vão depois (`token:veiledLightsChanged`).
- Ordem: `publishSeers` (versão v+1) **antes** do evento do comando (v+2, cortado já com os videntes de depois). Ack devolve a v+2.
- Fora: mudar os controladores do personagem pela ficha ou pelo `character:*` (fora de um comando de grid) não recalcula os videntes; vale no próximo `session:join`/`board:sync`.

## Client

- Filtro: `boardSightOf` (`client/src/lib/board-sight.ts`): token `hidden` que nenhum olho é (não controlado, ou fora da prévia) aparece só no alcance de um olho com `magicSight`, no nível que o mesmo olho daria a um token visível (`magicSightLevel` do game-core: silhueta na penumbra, o Fundo inteiro); fora dele, `hidden`. Com a visão `off`, `offSightOf` só confere esses (alcance e parede) e segue `active: false`. `BoardSight.magicEyes` guarda os olhos e o alcance. Detalhe em [`../client/vision.md`](../client/vision.md).
- Diálogo: seção "Visão mágica" na aba "Visão e luz" ([`../client/token-dialog.md`](../client/token-dialog.md)); gate do plano em [`../plans/client-controles.md`](../plans/client-controles.md).

## Testes

- game-core `magic-sight.spec.ts`; contracts `token.dto.spec.ts` ("magic sight") e `plan-limits.spec.ts`.
- Server unit: `token-authorship.bo.spec.ts`, `token-plan.bo.spec.ts`, `tokens.mapper.spec.ts`, `linked-token.spec.ts`, `token-veil.mapper.spec.ts` (o público `seer`), `token-hidden.mapper.spec.ts` (`changeVeilOf`, `hiddenCutsOf`, `seersCutsOf`), `board.service.spec.ts` (snapshot do vidente e do espectador). Os diários do `token-veil.spec.ts` e `token-visibility.service.spec.ts` contam o `seers`.
- Integração: `board-magic-sight.spec.ts` (só o mestre, plano, ligado, isolamento, colar, `copyScene`) e `board-magic-seers.spec.ts` (ligar, mover, desligar, apagar, tirar do controle, colar, combate, arraste, espectador, `magicSeersOfScene`).
- Client: `board-sight.spec.ts` ("with magic sight"), `magic-sight-form.spec.ts`, `token-form-state.spec.ts`, `vision-light-tab.spec.tsx`, `board-reducer.spec.ts` (upsert). E2E: `magic-sight.spec.ts` (grupo `scene`).
