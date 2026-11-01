# Personagens

O `Character` do spec §6 (o Actor do Foundry): a entidade da mesa por trás dos tokens ligados a ela. Um por jogador, criado ao virar jogador; guarda nome, iniciais, lado, imagem, borda, abatido, aura, tamanho padrão, CA, CD, duas anotações, barras, condições, controle, as fichas e a ficha principal. O token ligado guarda o que é por grid (posição, tamanho, camada, direção, inverter, visão, cone, luz e as formas). Plano de origem: `docs/plans/2026-10-31-personagem.md` (entrega numa release só; desde a Fase 7 as condições do token ligado também moram no personagem; até a Fase 13 a âncora do elenco, [`tokens/character.md`](tokens/character.md), e a Ficha da mesa, [`member-cards.md`](member-cards.md), ainda existe). Módulo `server/src/modules/characters/`.

| Arquivo                                                    | O que cobre                                                                                                                                                                                    |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`characters/token-ligado.md`](characters/token-ligado.md) | Fase 6: token ligado composto pelo personagem, travas personagens → grid, escritas compartilhadas (tabela), ligar/desligar mínimo, testes e fakes                                              |
| [`characters/ligar.md`](characters/ligar.md)               | Fase 8: `token:linkToCharacter`/`token:unlinkFromCharacter` sem âncora, `CharacterLinkBo`, `TokenCharacterLinkDao`, "Adicionar jogadores" pelos personagens, legado `token:linkToCard`, testes |
| [`characters/condicoes.md`](characters/condicoes.md)       | Fase 7: o dono da condição (token solto ou personagem), `CharacterRow.conditions`, escritas e fim do turno no personagem, testes e fakes                                                       |

## Contrato

`packages/contracts/src/board/character.dto.ts` (Fase 1; detalhe em [`contracts/tabuleiro.md`](contracts/tabuleiro.md)):

- `characterDto` `{ id, campaignId, userId (uuid | null), name (≤ 60 = TOKEN_NAME_MAX_LENGTH, o nome que os tokens ligados vestem; o plano dizia 40), initials, side, imageAssetId, frame, defeated, aura, width, height, armorClass/difficultyClass (0–999 | null), noteOne/noteTwo (≤ 80 | null), bars, conditions, controllerIds, canControl, mainSheetId }`.
- Comandos: `updateCharacterCommandDto` (`character:update`), `adjustCharacterBarCommandDto` (`character:adjustBar`), `setMainSheetCommandDto` (`character:setMainSheet`), `linkTokenToCharacterCommandDto` (`token:linkToCharacter`), `unlinkTokenFromCharacterCommandDto`, `characterSyncCommandDto` (`character:sync`).
- Eventos: `characterChangedEventDto` (`character:changed`), `characterRemovedEventDto` (`character:removed`), `characterSyncDto`/`characterSyncAckDto`; `CharacterClientEvents`/`CharacterServerEvents`.
- `tokenDto.characterId` (opcional até a Fase 13, ao lado do `anchorTokenId`).

## Tabelas e migração (`0075_characters`)

PO em `server/src/modules/characters/characters.po.ts`, exportados no `schema.ts`; `truncateAllTables` inclui as três tabelas.

- `characters`: `id`, `campaign_id` (→ `campaigns`, cascade), `user_id` (→ `users`, **set null**; sem FK composta para `campaign_members`: sair da mesa não apaga o personagem, ele fica sem jogador), `name` (`CHECK characters_name_length` 1–60), `initials`, `side` (enum `token_side`), `image_asset_id` (→ `assets`, set null), `frame` (enum `token_frame`, padrão `square`), `defeated`, as sete colunas da aura iguais às do `tokens` (`CHECK characters_aura_shape`/`characters_aura_fields`), `width`/`height` (`double precision`, padrão 1, `CHECK characters_size_half_cells` meia casa de 0,5 a 10), `armor_class`/`difficulty_class` (`smallint` nulos, 0–999), `note_one`/`note_two` (`text` nulos, ≤ 80), `main_sheet_id`, timestamps. Único `characters_campaign_id_id_unique` (`campaign_id`, `id`) para as FKs compostas; índice único parcial `characters_campaign_user_unique` (`campaign_id`, `user_id`) `WHERE user_id IS NOT NULL` (um personagem por jogador por mesa).
- `characters_main_sheet_fk` (`campaign_id`, `main_sheet_id`) → `token_sheets` (`campaign_id`, `id`) **editada à mão** para `ON DELETE SET NULL ("main_sheet_id")` (a armadilha da `0033`, [`library.md`](library.md)): apagar a ficha principal deixa o personagem sem principal.
- `character_bars`: as colunas do `token_bars` (`position`, `label`, `current`, `max`, `color`, `visibility`, `display`) + `character_id` (cascade); único (`character_id`, `position`).
- `character_controllers`: PK (`character_id`, `user_id`), os dois cascade.
- `campaigns.characters_version` (`integer not null default 0`): a versão do fluxo dos personagens da mesa (spec §5.5), separada da de cada grid.
- `tokens.character_id` (→ `characters`, set null) + único `tokens_scene_id_character_id_unique` (um token por personagem por grid). O `anchor_token_id` fica até a Fase 13.
- `active_conditions.character_id` (→ `characters`, cascade); `token_id` passou a nulo; `CHECK active_conditions_one_holder` (exatamente um dos dois) e único (`character_id`, `condition_id`). O `ConditionsDao` lê e grava pelo dono (`{ tokenId } | { characterId }`, Fase 7: [`characters/condicoes.md`](characters/condicoes.md)).
- `token_sheets.character_id` com FK composta `token_sheets_character_fk` (`campaign_id`, `character_id`) → `characters` editada à mão para `SET NULL ("character_id")`, índice (`campaign_id`, `character_id`) e `CHECK token_sheets_one_holder` (no máximo um de `token_id`/`character_id`).
- Colunas compartilhadas com o token em `tokens/token-columns.po.ts`: os enums do token (reexportados pelo `tokens.po.ts`), `auraColumns()`, `barColumns()`, `boxSizeColumns()`, `auraShapeSql`, `auraFieldsSql`, `halfCellSizeSql` (o `tokens.po.ts` usa os mesmos; o `db:generate` não viu diferença no `tokens`).

**Dados** (SQL à mão no fim da `0075`, numa tabela temporária `character_seeds` `ON COMMIT DROP`):

1. Um personagem por **âncora** (token de cena `kind = 'cast'`), com o membro da Ficha da mesa que aponta para ela; âncora sem ficha (o jogador saiu da mesa, a cascata levou a ficha) → personagem com `user_id` nulo, para os tokens ligados não perderem o vínculo.
2. Um por **Ficha da mesa** sem personagem ainda (qualquer papel: o espectador rebaixado guarda o dele; o mestre que tinha ficha também).
3. Um por **jogador** sem ficha (`role = 'player'` ou `role_before_juggernaut = 'player'`). Mestre sem ficha (a Ana) não ganha.

- Nome: `member_cards.character_name` (aparado), senão o da âncora, senão o apelido (`users.name`). Iniciais, lado, imagem, borda, abatido, aura e tamanho: da âncora; sem âncora, lado `ally`, 1×1 e as iniciais pela regra do `initialsOf` do game-core reescrita em SQL (primeira letra das duas primeiras palavras que não são conectivo `de/da/do/das/dos/e/a/o`, ou as duas primeiras letras de uma palavra só, em maiúscula pelo `upper` do banco). CA, CD e anotações: da ficha.
- Barras da âncora → `character_bars` (mesma posição, visibilidade e exibição); controladores da âncora → `character_controllers`; sem âncora, o controlador é o próprio jogador. Condições da âncora: `character_id` = o personagem, `token_id` nulo.
- `tokens.character_id` em todo token cujo `anchor_token_id` é a âncora (a âncora não ganha).
- Fichas da âncora: `character_id` = o personagem, `token_id` nulo; `main_sheet_id` = a mais antiga (`created_at`, depois `id`).
- **Formas ficam por token** (decisão do orquestrador): cada token ligado troca as formas próprias (que não apareciam) por uma cópia das da âncora com ids novos, e o `active_form_id` aponta para a cópia da forma que a âncora mostrava.
- `characters_version` começa em 0.

Testes: integração `server/test/integration/characters-migration.spec.ts` (migra até a `0074`, semeia por SQL cru, aplica a `0075`): Lyra da Bia (ficha CA 15 + âncora PV 25/30 + Mana, Envenenado, controle [Bia], imagem, aura, 2×2), os tokens dela no Salão e na Estrada, as duas fichas e a principal, as formas copiadas; Caio sem nada ("Caio do Vale" → `CV`); Duda espectadora com ficha ("Mira", CD 12); Eli só com CA; Ana mestre sem nada; Gorm, âncora de quem saiu; Quelm isolada; versão 0; o índice único, os dois `one_holder` e o nome de 61 recusados.

## DAO (`characters.dao.ts`)

`CharactersDao(db | tx)`; toda leitura filtra pela mesa (§2.6). `CharacterRow = { character: CharacterPo, bars (por posição), controllerIds, holderRole, conditions }` (`WornCharacterRow` = sem `conditions`, o que o `findManyAtSceneTable` devolve) — `holderRole` é o papel do jogador na mesa **agora** (`left join campaign_members` pelo par mesa/usuário; `null` = sem jogador ou saiu). Três consultas por leitura: personagens + controladores (`array_agg` em subconsulta, ordenado por `user_id`) + papel, depois as barras de todos, depois as condições de todos (`ConditionsDao.listOfCharacters`; o `findManyAtSceneTable` para nas duas primeiras).

- Leituras: `listOfCampaign(mesa)` (todos, guardados inclusive, mais antigo primeiro), `findManyInCampaign(mesa, ids)` (em lote: id de outra mesa fica de fora; **é a leitura da Fase 6** para os personagens dos tokens ligados de um grid), `findInCampaign(mesa, id)`, `findOfUser(mesa, usuário)`, `versionOf(mesa)` (sem trava, para o sync).
- Escritas (as de várias tabelas no DAO do `tx`): `insert(NewCharacterRow)` (personagem + barras + controladores, relido), `update(id, CharacterChangesPo)` (patch: ausente mantém, `null` limpa), `setBarValues(barra, { current, max })`, `replaceBars(id, barras)`, `replaceControllers(id, usuários)` (repetido entra uma vez), `setUser(id, usuário | null)`.
- Versão: `lockVersion(mesa)` (`SELECT characters_version … FOR NO KEY UPDATE`; mesa inexistente → `undefined`) e `bumpVersion(mesa)` (+1, devolve).
- PO auxiliares em `characters.po.ts`: `CharacterBarInputPo`, `CharacterChangesPo`.

## Regra (`character.bo.ts`) e redação

- `CharacterBo(access, CharacterSeat { characterId, userId, holderRole, controllerIds })`:
  - `isSeen()`: o mestre vê todos; o resto da mesa só o personagem cujo jogador é `player` ou `master` (`isSeenByTable(holderRole)`). O de espectador (rebaixado) e o sem jogador ficam **guardados, só para o mestre**.
  - `canControl()`/`audience()`: `privileged` = mestre, o jogador e os controladores (`privilegedUserIdsOf`), nunca um espectador (inerte); `others` = o resto.
  - `requireEdit(ação)`: espectador → `FORBIDDEN` (`requireMember`); não visto → `CHARACTER_NOT_FOUND` (`CharacterNotFoundError`, cita mesa e id); sem controle → `FORBIDDEN` "… <ação> character <id> … requires being its player, one of its controllers or the master role".
  - `adjustBar(barras, barra, mudança, limite)`: `requireEdit` → barra do personagem (senão `BAR_NOT_FOUND`, `CharacterBarNotFoundError` "character X has no bar Y") → `adjustBarValues` do game-core (`BAR_VALUE_LIMIT` por parâmetro).
- Mapper (`characters.mapper.ts`): `toCharacterSeat`, `toCharacterBo`, `toCharacterDto(row, audiência)` (`others` sem as barras `controllers`, posição mantida; aura por `toTokenAuraDto`, barra por `toTokenBarDto`, agora exportado do `tokens.mapper.ts`), `toCharacterView(row)` (as duas versões + `seenByTable` + `privilegedUserIds`, para o publicador), `toCharacterChangesPo`, `toSeatedCharacterRow(mesa, usuário, apelido)`. `conditions` vem de `row.conditions` (Fase 7).
- Testes: unit `test/modules/characters/{character.bo,characters.mapper}.spec.ts`; integração `test/integration/characters-dao.spec.ts` (leituras, patch, barras, controle, `setUser(null)`, papel do espectador e de quem saiu, CHECK da CA 1000, índice único, versão e isolamento Vharn × Quelm). Fábricas `characterPo`, `characterBarPo`, `characterManaPo`, `characterRow` (Lyra da Bia) em `test/support/characters-factories.ts`.

## Travas (`locked-characters.ts`)

- `inLockedCharacters(transaction, mesa, work)` → `SavedInCharacters { value, version, changed }`: trava a versão dos personagens → `work({ daos, campaignId, version })` devolve `{ value, changed }` → soma a versão só se `changed`. Quem publica é o chamador, depois do commit.
- Peças para a Fase 6 (personagens **antes** do grid, sempre nessa ordem, como o elenco hoje): `lockCharacters(daos, mesa)` → `LockedCharacters` (dentro de uma transação já aberta; trave o grid depois) e `savedVersionOf(locked, changed)` (soma ou mantém); `charactersEventBase(mesa, versão, relógio)` abre o evento. Tipos `CharactersLockDaos`, `CharactersTransaction<Daos>`.

## Service, contrato e borda

- `CharactersService({ members, transaction, snapshot, publisher, clock, barLimit })` (`characters.plugin.ts`, `createCharactersModule({ db, members, publisher, clock })` → `{ service, seats, seatIn }`, montado no `wireRealtime`):
  - `update(usuário, mesa, { characterId, changes })` e `adjustBar(usuário, mesa, { characterId, barId, change })` → versão: `memberAccessOf` (fora da mesa `CAMPAIGN_NOT_FOUND`, espectador `FORBIDDEN`, os dois **sem trava**) → `inLockedCharacters` → `findInCampaign` (outra mesa → `CHARACTER_NOT_FOUND`) → BO → grava → relê → soma → commit → `charactersChanged`. Recusa não grava, não soma nem publica.
  - `sync(usuário, mesa)` → `CharacterSyncDto { version, characters }`: `viewerAccessOf` (o espectador lê), `runInSnapshot` (versão + lista consistentes), só os que o leitor vê, cada um na sua audiência.
  - `setMainSheet` fica para a Fase 9 (o comando `character:setMainSheet` ainda não é ligado).

| Comando               | Quem                              | Ack                                                                                                                            | Evento                       |
| --------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------- |
| `character:update`    | jogador, controladores, mestre    | `{ ok, version }` (dos personagens) · `FORBIDDEN`, `CHARACTER_NOT_FOUND`, `CAMPAIGN_NOT_FOUND`, `INVALID_BODY`, `RATE_LIMITED` | `character:changed` (abaixo) |
| `character:adjustBar` | idem                              | idem + `BAR_NOT_FOUND`                                                                                                         | `character:changed`          |
| `character:sync`      | todo membro, espectador inclusive | `characterSyncAckDto` `{ ok, version, characters }` · `CAMPAIGN_NOT_FOUND`                                                     | —                            |

- Borda: `board/character-commands.ts` (`bindCharacterCommands(socket, { bind, mutate, write }, deps)`; dep `characters` no `BoardGatewayDeps`/`createBoardModule`): os dois comandos pelo `mutate` (fila da mesa), o `character:sync` pelo `bind` (leitura, fora da fila). `CHARACTER_NOT_FOUND: 'Character not found'` no `PUBLIC_MESSAGE` e `CharacterError` entre os erros conhecidos (`board-command-edge.ts`). Payload estrito: `userId` forjado → `INVALID_BODY`.

## Salas (`character-publisher.port.ts`, `infrastructure/character-publisher/`)

- `CharacterPublisherPort.charactersChanged(CharactersChange { campaignId, version, at, characters: CharacterView[] })`. Adaptador `SocketIoCharacterPublisher` (em `src/infrastructure/`, como os outros publicadores; o plano dizia `src/realtime/`):
  - `campaignMastersRoom`: `character:changed` com todos inteiros.
  - `campaignUserRoom(u)` de cada jogador/controlador (menos a sala dos mestres): os vistos pela mesa, inteiros os dele, redigidos os outros.
  - `campaignRoom` menos as salas acima (o resto, espectadores inclusive): os vistos pela mesa, redigidos.
  - **Uma mensagem por versão para cada um:** quem não vê nenhum personagem do evento (todos guardados) recebe `character:removed { characterId }` na mesma versão, nunca um buraco. Um espectador listado no controle não está na `campaignUserRoom`, então recebe o redigido.
- Testes: unit `characters.service.spec.ts` (diário `lock characters → update → bump characters → commit → publish`; fakes `CharactersDaoFake`, `CharacterTransactionRunnerFake`, `CharacterSnapshotRunnerFake`, `CharacterPublisherFake` em `test/support/characters-fakes.ts`) e `locked-characters.spec.ts`; integração `characters.spec.ts` (`useTokenTable()`; Ana inteira, Caio sem o PV, versão do ack = do sync, mestre escreve a anotação, `adjustBar`, reinício, `FORBIDDEN` sem evento, `CHARACTER_NOT_FOUND`, `userId` forjado, Quelm isolada, sync da Duda espectadora redigido e sem personagem de espectador, mudança num guardado = `character:removed` a Caio e Duda). Suporte `test/support/table-characters.ts` (`charactersSynced`, `characterOfUser`, `giveBars`, `characterUpdate`, `CHARACTER_PV`/`CHARACTER_MANA`).

## Ciclo de vida (`character-seat.service.ts`, `character-seat.bo.ts`)

- `seatMoveOf({ from, to, stored })` → `create` (vira `player` sem personagem) · `reveal` (sai de espectador com o guardado) · `hide` (vira espectador com ele) · `leave` (saiu da mesa) · `keep`. Mestre não ganha personagem (mesa nova: o dono é mestre; espectador → mestre sem guardado: nada); jogador ↔ mestre mantém; promover de novo a mesma pessoa traz o **mesmo** (o `user_id` não muda ao rebaixar).
- `CharacterSeatService({ transaction, publisher, clock })`: `seatIn(daos)` → `MemberSeatPort.roleSaved(mudança)` (na transação do papel) e `memberRemoved(remoção)` (transação própria; a forma do `MemberRemovedPort`). Cada movimento: `lockCharacters` → `findOfUser` → `create`: `toSeatedCharacterRow` (nome = `users.name` cortado em 60, iniciais `initialsOf`, `ally`, 1×1, sem barras, controle = ele); `reveal`/`hide`: nada grava no personagem (o `holderRole` lido no `tx` já é o novo); `leave`: `setUser(null)` + tira o jogador do controle → soma a versão → devolve o aviso, que publica `charactersChanged` (o rebaixado e o sem jogador saem `seenByTable: false`: mestres recebem `character:changed`, o resto `character:removed`). `keep` não soma nem publica.
- **Mesma transação do papel** (aprovado pelo usuário): `MemberRoleService` recebe `transaction: MemberRoleTransactionRunner` (`MemberRoleWriteDaos { members: updateRole, seat: MemberSeatPort }`, porta nova `campaigns/member-seat.port.ts`); `memberRoleTransactionOver(db, seatIn)` em `campaigns.plugin.ts`; `CampaignOutlets.seatIn`. Ordem: `updateRole → roleSaved → commit → forget → memberRoleChanged (salas) → aviso do personagem` (o promovido já está na sala dele). O seed de estresse usa o mesmo (`build-stress-seed.ts`, publicador mudo).
- Sair da mesa: `removedInOrder(sessions, characters.seats)` (`src/app/member-outlets.ts`) é o `memberRemoved` do `wireRealtime`. Hoje só o fim do juggernaut de quem não era membro avisa (sem personagem); **não há rota de sair da mesa** ainda. Conta excluída: a FK `user_id` → `users` set null e o controle cai por cascata, sem evento.
- Testes: unit `character-seat.bo.spec.ts` (a tabela), `character-seat.service.spec.ts` (criar com o apelido e iniciais, mestre → jogador cria, esconder/revelar sem escrever, `keep` sem soma, Quelm, sair da mesa), `campaigns/member-role.service.spec.ts` (diário `updateRole → seat → commit → forget → memberRoleChanged → notice`; assento que falha desfaz tudo; fakes `MemberSeatFake`, `MemberRoleTransactionRunnerFake` em `member-role-fakes.ts`); integração `characters-seat.spec.ts` (mesa nova sem personagem do mestre, Bia e Caio com o apelido na versão 2, Duda pelo código sem personagem e promovida ouvida por Ana e Bia, rebaixar e promover devolve a mesma CA, sair da mesa: Ana vê sem jogador e Caio não, Quelm isolada). Como o `joinByCode` promove pela rota, **todo** spec de integração já nasce com personagens para os jogadores.

## Condições e combate

Condição em token ligado mora no personagem (`active_conditions.character_id`): `condition:apply`/`applyMany`/`remove`/`setRounds`/`setStacks` gravam nele (personagens travados antes do grid) e publicam `character:changed` com o personagem inteiro na versão dos personagens; só os soltos ganham evento do grid (`applyMany` misto = um de cada). O `combat:nextTurn` desce as condições do personagem da entrada e as publica pelo `character:changed`; o `combat:turnChanged` leva só os soltos; o `condition:changedMany` não sai mais. Snapshot, eventos de token e `character:sync` leem as condições pelo dono. Detalhe em [`characters/condicoes.md`](characters/condicoes.md).

## Armadilhas

- **FK circular `characters.main_sheet_id` ↔ `token_sheets.character_id`.** No SQL não há ovo e galinha: o `drizzle-kit generate` cria as tabelas e colunas sem FK e acrescenta todas as FKs por `ALTER TABLE … ADD CONSTRAINT` no fim, e a migração de dados preenche `token_sheets.character_id` antes do `main_sheet_id`. A circularidade morde no **TypeScript**: as duas FKs compostas moram nos `extraConfig` (`foreignKey`) e cada tabela referencia a outra, então o `tsc` acusa `TS7022` ("implicitly has type 'any' because … referenced directly or indirectly in its own initializer"). A saída é anotar o retorno dos dois callbacks (`(t): PgTableExtraConfigValue[] => [...]`).
- **Ciclo de import entre POs.** `tokens.po.ts` importa `characters.po.ts` (`tokens.character_id`) e o `characters.po.ts` usa os enums do token **ao carregar** (`tokenSide('side')`): com os enums no `tokens.po.ts`, quem carregasse o `tokens.po.ts` primeiro faria o `characters.po.ts` rodar com eles ainda em TDZ. Por isso os enums e as colunas compartilhadas moram em `tokens/token-columns.po.ts`, sem import de volta. Referência a outra tabela só dentro de função (`references(() => …)`, `foreignKey` no `extraConfig`), que o Drizzle avalia depois.
- **A trava da versão é `FOR NO KEY UPDATE`, não `FOR UPDATE`.** A versão mora na linha de `campaigns`, e todo `INSERT` numa tabela com FK para a mesa (token, desenho, condição…) toma `FOR KEY SHARE` nela: um `FOR UPDATE` faria qualquer criação da mesa esperar um comando de personagem. `NO KEY UPDATE` só conflita com outra escrita da linha.
- **Versão sem buraco com personagem escondido.** Uma mudança num personagem guardado (rebaixado, sem jogador) só vai inteira aos mestres; ao resto o publicador manda `character:removed` na mesma versão (no-op no client que não o tem), porque o contrato não tem um `character:advanced`.
