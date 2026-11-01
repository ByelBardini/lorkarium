# Personagens: tabelas e migrações (`0075`, `0076`)

Detalhe do hub [`../characters.md`](../characters.md).

## Tabelas e a migração de dados (`0075_characters`)

PO em `server/src/modules/characters/characters.po.ts`, exportados no `schema.ts`; `truncateAllTables` inclui as três tabelas.

- `characters`: `id`, `campaign_id` (→ `campaigns`, cascade), `user_id` (→ `users`, **set null**; sem FK composta para `campaign_members`: sair da mesa não apaga o personagem, ele fica sem jogador), `name` (`CHECK characters_name_length` 1–60), `initials`, `side` (enum `token_side`), `image_asset_id` (→ `assets`, set null), `frame` (enum `token_frame`, padrão `square`), `defeated`, as sete colunas da aura iguais às do `tokens` (`CHECK characters_aura_shape`/`characters_aura_fields`), `width`/`height` (`double precision`, padrão 1, `CHECK characters_size_half_cells` meia casa de 0,5 a 10), `armor_class`/`difficulty_class` (`smallint` nulos, 0–999), `note_one`/`note_two` (`text` nulos, ≤ 80), `main_sheet_id`, timestamps. Único `characters_campaign_id_id_unique` (`campaign_id`, `id`) para as FKs compostas; índice único parcial `characters_campaign_user_unique` (`campaign_id`, `user_id`) `WHERE user_id IS NOT NULL` (um personagem por jogador por mesa).
- `characters_main_sheet_fk` (`campaign_id`, `main_sheet_id`) → `token_sheets` (`campaign_id`, `id`) **editada à mão** para `ON DELETE SET NULL ("main_sheet_id")` (a armadilha da `0033`, [`library.md`](../library.md)): apagar a ficha principal deixa o personagem sem principal.
- `character_bars`: as colunas do `token_bars` (`position`, `label`, `current`, `max`, `color`, `visibility`, `display`) + `character_id` (cascade); único (`character_id`, `position`).
- `character_controllers`: PK (`character_id`, `user_id`), os dois cascade.
- `campaigns.characters_version` (`integer not null default 0`): a versão do fluxo dos personagens da mesa (spec §5.5), separada da de cada grid.
- `tokens.character_id` (→ `characters`, set null) + único `tokens_scene_id_character_id_unique` (um token por personagem por grid). O `anchor_token_id` saiu na `0076` (abaixo).
- `active_conditions.character_id` (→ `characters`, cascade); `token_id` passou a nulo; `CHECK active_conditions_one_holder` (exatamente um dos dois) e único (`character_id`, `condition_id`). O `ConditionsDao` lê e grava pelo dono (`{ tokenId } | { characterId }`, Fase 7: [`characters/condicoes.md`](condicoes.md)).
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

## Limpeza (`0076_characters_cleanup`, Fase 13)

Gerada pelo `drizzle-kit generate` e editada à mão (o `DISABLE ROW LEVEL SECURITY` que o gerador põe antes de cada `DROP TABLE` saiu).

1. **Guarda** (`DO $$ … $$`): para a migração, citando o que acha, se sobrou algo no modelo velho que se perderia — token com `anchor_token_id` e sem `character_id` (`token X has anchor_token_id Y but no character_id; …`), ficha (`token_sheets.token_id`) ainda numa âncora (`sheet X is still held by anchor Y; …`) ou condição ativa numa âncora (`condition X is still held by anchor Y; …`). O `migrate` do Drizzle roda as pendentes numa transação só: nada é derrubado.
2. `DROP TABLE main_tokens`, `DROP TABLE member_cards` (a Ficha da mesa já está no personagem).
3. `tokens`: sai o único `tokens_scene_id_anchor_token_id_unique`, a FK e a coluna `anchor_token_id`.
4. `DELETE FROM scenes WHERE kind = 'cast'`: o elenco de cada mesa e, por cascata, as âncoras com barras, controle e formas.
5. Saem o índice `scenes_one_cast_per_campaign`, a coluna `scenes.kind` e o enum `scene_kind`.

A lista de condições (`condition_definitions`) não muda: é da mesa, não do elenco.

Testes: integração `server/test/integration/characters-cleanup-migration.spec.ts` (migra até a `0074`, semeia o modelo velho por SQL cru — a Lyra com âncora, PV, controle, Envenenado, ficha, Ficha da mesa e token principal; um Goblin solto; a Sombra da Quelm —, aplica `0075` + `0076`): as tabelas, colunas e o enum somem; só os grids e seus tokens ficam; a Lyra mantém CA, barra, controle, condição, ficha principal e o token do Salão; a lista de condições das duas mesas e a condição do Goblin ficam; a Quelm só com o seu. Um segundo banco, migrado até a `0075`, prova a guarda: token ligado sem personagem falha citando token e âncora (e `member_cards` continua), ficha numa âncora falha citando a ficha, e sem sobra a migração roda. O `characters-migration.spec.ts` (só até a `0075`) não muda.
