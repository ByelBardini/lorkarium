# Personagem global (elenco e âncora)

O token do personagem de cada jogador vale em todo grid: uma **âncora** guardada fora dos grids, no **elenco** da mesa, e tokens de grid **ligados** a ela. Hub: [`../tokens.md`](../tokens.md).

## O elenco

- `scenes.kind` (enum `scene_kind`: `grid` | `cast`, padrão `grid`; `sceneKind` em `scenes.po.ts`, exportado no `schema.ts`). Índice único parcial `scenes_one_cast_per_campaign` (`campaign_id`) `WHERE kind = 'cast'`: **um elenco por mesa**. Migração `0035_cast_scenes` (desvio do `0034` do plano: a `0034` já era o índice do combate) cria o tipo, a coluna, o índice e um elenco ("Elenco", `CAST_SCENE_NAME`) para cada mesa que existia.
- Mesa nova nasce com o elenco na mesma transação do `CampaignsService.create` (depois do `setActiveScene`, antes da lista de condições).
- **Nunca listado nem editado pela biblioteca:** `ScenesDao.listOfCampaign`, `findLibraryRow`, `findInCampaign`, `updateLibrary`, `moveScenes` e `delete` filtram `kind = 'grid'` (`IS_LIBRARY_GRID`). Por isso `PATCH`, `copies`, `DELETE` e `scene:activate` no elenco dão `SCENE_NOT_FOUND`.
- `ScenesDao.findCastOf(campaignId)` (sem trava) e `lockCastOf(campaignId)` (`FOR UPDATE OF scenes`, no DAO do `tx`) → `SceneRow`. O `ScenesDaoFake` escreve `lock cast` no `lockCastOf` e `bump cast` no `bumpVersion` do elenco (`bump` nos grids). Fábrica `castPo()` (`VHARN_CAST_ID`, versão 2) em `test/support/scenes-factories.ts`.
- **Acesso** (`SceneAccessBo`): `GridReach` tem `kind?` (ausente = grid). `canSee(elenco)` = todo membro; `canAct(elenco)` = ninguém, nem o mestre (a âncora muda pelos tokens ligados a ela). `requireAct` → `SCENE_NOT_FOUND`; `requireSee` só recusa o que `canSee` recusa. Em `locked-scene.ts`: `reachedGridOf` (comando: `requireAct`) e `seenGridOf` (snapshot: `requireSee`); `ReachedGrid` exige `kind` (o `DragGroupPo.scene` também lê a coluna).
- `board:sync { sceneId: elenco }` de qualquer membro traz o snapshot do elenco (`BoardService.snapshotFor` usa o `seenGridOf`). `scene:watch` do elenco → `SCENE_NOT_FOUND` (é ação); `scene:unwatch` de um grid que não era aba não sai de sala nenhuma (`grid-tabs.ts`), então não tira ninguém do elenco.
- **Salas:** o `session:join` entra nas salas do grid do grupo **e** do elenco (`enterTableGrids` no `sessions.gateway.ts`; `SceneWatchService.castSceneIdOf`). A ativação não mexe nas salas do elenco.
- `campaignDetailDto.castSceneId` (contracts; `CampaignDetailView` no `campaigns.mapper.ts`, lido pelo `ScenesDao.findCastOf`, dep `scenes` do `CampaignsService`).
- Testes: unit `scene-access.bo.spec.ts` (elenco: todo membro vê, ninguém age), `scene-watch.service.spec.ts`, `grid-tabs.spec.ts`, `campaigns.service.spec.ts` e `campaigns.mapper.spec.ts`; integração `cast-scene.spec.ts` (mesa nova com elenco fora da biblioteca, `PATCH`/`copies`/`DELETE`/`scene:activate`/`token:create`/`scene:watch` → `SCENE_NOT_FOUND`, `board:sync` de Ana, Bia e Caio, o elenco da Quelm não é achado da Vharn, a migração cria um por mesa e o índice recusa o segundo).

## Ligar e desligar da ficha

Desde a Fase 8 do plano do personagem o token liga **direto ao personagem** (`token:linkToCharacter`/`token:unlinkFromCharacter`), sem criar âncora: comandos, regra, DAO e testes em [`../characters/ligar.md`](../characters/ligar.md). O que sobra do modelo velho até a Fase 13:

- **Banco** (`0036_token_anchor`): `tokens.anchor_token_id` (→ `tokens`, set null; único por grid) e `member_cards.anchor_token_id` ainda existem; o fluxo novo grava `anchor_token_id = null`. As âncoras migradas (`0075`) seguem no elenco, sem uso pelos comandos de ligar.
- `TokenAnchorsDao` (`token-anchors.dao.ts`: `linkToAnchor`, `unlinkWith`, `moveStateTo`, `copyStateTo`, `dropState`) e o `TokenAnchorsDaoFake` ficaram **sem chamador** no server; saem na Fase 13.
- `token:linkToCard`/`token:unlinkFromCard` (contracts) delegam ao fluxo novo (o personagem do jogador da ficha). `tokenDto.anchorTokenId` e `memberCardDto.anchorTokenId` continuam no contrato. Colar um ligado nasce solto (o client manda o estado composto).
- Arnês de integração `test/support/characters.ts` (`castIdOf`, `gridState`, `tokenIn`, `poison`, `lyraPoisonedAtVharn`, `linkToCard`, e agora `linkToCharacter`/`unlinkFromCharacter`) e fakes `test/support/character-fakes.ts` (`CharacterTableFake`, `lyraAnchorRow`, `linkedLyraRow`, `kaelRow`).

## Escritas compartilhadas

Desde a Fase 6 do plano do personagem, barra, identidade, aparência compartilhada, aura e controle do token ligado vão ao **personagem** (`character:changed`), não à âncora: tabela, travas (`inLockedGridWithCharacters`) e testes em [`../characters/token-ligado.md`](../characters/token-ligado.md). Desde a Fase 7, as **condições** também: [`../characters/condicoes.md`](../characters/condicoes.md) (a âncora não guarda condição; `stateHolderIdOf`/`stateHolderIn` saíram).

## Ficha personalizada mora na âncora

`POST …/sheets` com `holder: { tokenId }` de um token ligado grava a ficha (`token_sheets.token_id`) na **âncora**; a Lyra de qualquer grid abre as mesmas fichas (`GET …/tokens/:t/sheets` resolve pelo `anchor_token_id`; um personagem tem **várias**). `holder: { memberId }` (criar ou `PATCH`) dá a ficha ao personagem do jogador; sem âncora, o `SheetHolderService` cria a âncora no elenco (nome do personagem da Ficha da mesa, senão o apelido; iniciais; `ally`; 1×1 em (0, 0); o jogador no controle), grava `member_cards.anchor_token_id` na mesma transação (mesa → elenco travados) e publica `token:created` ao elenco e `member:cardChanged` na versão seguinte. Desligar deixa a ficha na âncora; apagar o token deixa a ficha **sem dono** (`set null`, `0074`). Ver [`../sheets/server.md`](../sheets/server.md).

## Combate com token ligado

- Desde a Fase 7, o `combat:nextTurn` de uma entrada com token ligado desce as condições do **personagem** e o publica por `character:changed`; o `condition:changedMany` ao elenco não sai mais. Ver [`../characters/condicoes.md`](../characters/condicoes.md).

## "Adicionar jogadores"

`token:addPlayers` lê os **personagens** dos jogadores desde a Fase 8 (tamanho do personagem, ninguém pulado por falta de âncora, personagens travados antes do grid): ver [`../characters/ligar.md`](../characters/ligar.md).
