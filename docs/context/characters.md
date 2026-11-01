# Personagens

O `Character` do spec §6 (o Actor do Foundry): a entidade da mesa por trás dos tokens ligados a ela. Um por jogador, criado ao virar jogador; guarda nome, iniciais, lado, imagem, borda, abatido, aura, tamanho padrão, CA, CD, duas anotações, barras, condições, controle, as fichas e a ficha principal. O token ligado guarda o que é por grid (posição, tamanho, camada, direção, inverter, visão, cone, luz e as formas). Plano de origem: `docs/plans/2026-10-31-personagem.md` (entrega numa release só; até a Fase 13 o app ainda lê a âncora do elenco, [`tokens/character.md`](tokens/character.md), e a Ficha da mesa, [`member-cards.md`](member-cards.md)). Módulo `server/src/modules/characters/`.

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
- `active_conditions.character_id` (→ `characters`, cascade); `token_id` passou a nulo; `CHECK active_conditions_one_holder` (exatamente um dos dois) e único (`character_id`, `condition_id`). O `ConditionsDao` ainda só lê por token (`heldTokenId`, um `sql<string>` sobre o `token_id`), até a Fase 7.
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

## Armadilhas

- **FK circular `characters.main_sheet_id` ↔ `token_sheets.character_id`.** No SQL não há ovo e galinha: o `drizzle-kit generate` cria as tabelas e colunas sem FK e acrescenta todas as FKs por `ALTER TABLE … ADD CONSTRAINT` no fim, e a migração de dados preenche `token_sheets.character_id` antes do `main_sheet_id`. A circularidade morde no **TypeScript**: as duas FKs compostas moram nos `extraConfig` (`foreignKey`) e cada tabela referencia a outra, então o `tsc` acusa `TS7022` ("implicitly has type 'any' because … referenced directly or indirectly in its own initializer"). A saída é anotar o retorno dos dois callbacks (`(t): PgTableExtraConfigValue[] => [...]`).
- **Ciclo de import entre POs.** `tokens.po.ts` importa `characters.po.ts` (`tokens.character_id`) e o `characters.po.ts` usa os enums do token **ao carregar** (`tokenSide('side')`): com os enums no `tokens.po.ts`, quem carregasse o `tokens.po.ts` primeiro faria o `characters.po.ts` rodar com eles ainda em TDZ. Por isso os enums e as colunas compartilhadas moram em `tokens/token-columns.po.ts`, sem import de volta. Referência a outra tabela só dentro de função (`references(() => …)`, `foreignKey` no `extraConfig`), que o Drizzle avalia depois.
