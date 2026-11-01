# Combat: a lista de condições no fluxo da mesa

Detalhe do hub [`combat.md`](../combat.md) (Condições). Desde a limpeza do plano do personagem (`docs/plans/2026-10-31-personagem.md`, Fase 13) a lista de condições da mesa saiu do elenco e anda no **fluxo da mesa**: a mesma versão dos personagens (`campaigns.characters_version`, ver [`../characters.md`](../characters.md)).

## Escrita

- `ConditionsService.define` e `ConditionCatalogService.update` / `delete` / `restoreDefaults` travam e somam a versão do fluxo da mesa pelo `inLockedCharacters(transaction, mesa, work)` (`characters/locked-characters.ts`), seja qual for o `sceneId` do comando (aceito e ignorado). O `ConditionTransactionRunner` entrega o `CharactersDao` do `tx` (`lockVersion`/`bumpVersion`); nenhum grid é travado nem somado.
- Nada muda (nome repetido no `define`, nada faltando no `restoreDefaults`): devolve a versão atual, sem somar nem publicar.
- O evento abre com `charactersEventBase(mesa, versão, relógio)` → `TableEventBase` `{ campaignId, version, at }` (o `tableEventShape` do contrato, **sem** `sceneId`).

## Publicação

- `BoardPublisherPort.conditionDefined` / `conditionDefinitionUpdated` / `conditionDefinitionDeleted` / `conditionDefaultsRestored` recebem o DTO puro (não `GridEvent`) e o `SocketIoBoardPublisher` emite à `campaignRoom(mesa)`: **todo membro**, espectador incluso, com qualquer grid aberto. A lista não é segredo.
- **Uma mensagem por versão para cada um:** o `character:changed` de cada versão também chega a todos (inteiro, redigido ou como `character:removed`, ver `characters.md`, Salas), e a lista vai inteira a todos; então quem acompanha o fluxo nunca vê um buraco.
- **Condições dos personagens que mudam com a lista** (renomear, mudar cor/stacks, excluir): o server **não** publica `character:changed` junto; uma versão, um evento. O client aplica o `condition:definitionUpdated` às condições dos personagens que guarda (nome, aparência, `maxStacks` cortando os stacks) e o `condition:definitionDeleted` tirando a condição deles. O `character:sync` seguinte já vem com o estado gravado.

## Leitura

- `character:sync` → `characterSyncDto` `{ version, characters, conditionDefinitions }`: a lista lida no mesmo `runInSnapshot` dos personagens (`CharacterReadDaos.conditions`), na mesma versão. É a autoridade da lista.
- `board:sync` ainda leva `conditionDefinitions` (conveniência para desenhar o grid); o client trata o fluxo da mesa como a fonte.

## Testes

- Unit `condition-catalog.service.spec.ts` (diário `lock characters → save → bump characters → commit → publish`; nada faltando → `['lock characters', 'commit']`; evento sem `sceneId`) e `conditions.service.spec.ts` (`define` na versão do fluxo; nomeando a Torre: grids sem soma, evento sem `sceneId`); fakes `ConditionTransactionRunnerFake` com `CharactersDaoFake(journal, [], { [VHARN_ID]: 2 })`, `CharacterSnapshotRunnerFake(characters, conditions)`.
- Integração `grid-pieces.spec.ts` (`condition:define` e `character:update` nomeando a Torre: acks na versão do `character:sync` +1 e +2, evento sem `sceneId`, grid do grupo intacto) e `scene-activation.spec.ts` (depois de mover o grupo, `character:changed` e `condition:defined` ainda chegam à Bia).
- Da lista e da permissão (antes da Fase 13, sem mudança): unit `condition-catalog.service.spec.ts` (jogador e espectador `FORBIDDEN` antes de travar), `condition-rules.bo.spec.ts` (`missingDefaults`, `requireNameFree`, os nomes do server = `DEFAULT_CONDITION_NAMES`), `conditions.service.spec.ts` (jogador aplica, tira e ajusta em token alheio; espectador recusado); integração `condition-catalog.spec.ts` (clientes reais: edição ao vivo, uso 2 no grid do grupo e na Torre, exclusão que some dos dois snapshots, restauração, `CONDITION_NAME_TAKEN`, 501 → `INVALID_BODY`, Quelm isolada), `conditions-dao.spec.ts` (`countActiveOf` em grid, Torre e Estrada) e `condition-descriptions-migration.spec.ts` (`0050` mantém linhas e ativas). O `conditions-migration.spec.ts` (0030) e o `condition-descriptions-migration.spec.ts` (0050) leem por SQL cru: param antes da última migração e o DAO atual já pede colunas mais novas (`color` da `0052`, `image_asset_id` da `0056`); nenhum `*-migration.spec.ts` lê condição pelo DAO.
