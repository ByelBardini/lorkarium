# Tokens — aura

Detalhe do hub [`tokens.md`](../tokens.md): a aura em volta do token (cor, efeito pronto animado ou imagem da mesa, quadrada ou redonda), vista por todos. Plano de origem: `docs/plans/2026-10-25-auras-dos-tokens.md`. DTO em [`contracts/aura.md`](../contracts/aura.md) (`tokenAuraDto`); regra do raio e da opacidade em [`game-core.md`](../game-core.md) (`aura.vo.ts`); a imagem (GIF animado incluso) pela finalidade `aura` de [`assets.md`](../assets.md).

## Tabela (`tokens.po.ts`, migrações `0058_token_aura` e `0061_aura_image_shape`)

Uma aura por token, em sete colunas da própria `tokens` (como a luz), sem tabela filha:

| Coluna                | Tipo                                                    | O quê                                                                 |
| --------------------- | ------------------------------------------------------- | --------------------------------------------------------------------- |
| `aura_kind`           | enum `token_aura_kind` (`color` \| `effect` \| `image`) | nulo = sem aura                                                       |
| `aura_radius`         | `numeric(6,2)`                                          | casas **além da borda** do token, de 0 (só a pegada) a 20             |
| `aura_color`          | enum `drawing_color` (`drawings.po.ts`)                 | obrigatória na `color`; opcional na `effect` (nula = a cor natural)   |
| `aura_effect`         | enum `aura_effect` (os 8 do `AURA_EFFECTS`)             | só e sempre na `effect`                                               |
| `aura_image_asset_id` | `uuid` → `assets`, **set null**                         | só na `image`; apagar o asset zera só ela (o mapper lê como sem aura) |
| `aura_opacity`        | `smallint`                                              | de 10 a 100 (%)                                                       |
| `aura_image_shape`    | enum `token_frame` (`square` \| `round`, reaproveitado) | só e sempre na `image`; fica quando o asset é apagado                 |

- `CHECK tokens_aura_shape`: as sete nulas, **ou** `kind`, raio e opacidade não nulos e nas faixas. O segundo ramo nomeia `IS NOT NULL` em cada um: um `CHECK` aceita `NULL` (a armadilha do `tokens_sight_range`), então "só o `kind`" passaria sem isso.
- `CHECK tokens_aura_fields`: cor obrigatória na `color`; efeito presente se e só se `kind = 'effect'`; cor só na `color` e na `effect`; imagem só na `image` (pode ser nula depois do set null); forma presente se e só se `kind = 'image'`. Comparações com `IS [NOT] DISTINCT FROM`, que nunca dão `NULL`.
- Os dois enums (`tokenAuraKind`, `auraEffect`) são exportados em `server/src/database/schema.ts` (sem isso o `drizzle-kit` não gera o `CREATE TYPE`).
- `TokenAuraPo` = as sete colunas, escritas sempre juntas (o mapper monta todas, nulas para tirar). Entra inteira no `TokenStylePo` (o `restyle`, que recebe `Partial`) e parcial no `TokenFieldsPo` (o `update`/`updateFields`).

## DAO

Nenhum método novo: as colunas andam pelos caminhos genéricos do `TokensDao`.

- `insert`/`insertMany` gravam o `NewTokenPo` inteiro; `restyle(ids, style)` e `update`/`updateFields` espalham o que vier (campo ausente não é escrito; a aura nula vem com as sete colunas `null`).
- `copyScene` (Duplicar da biblioteca, ver [`library.md`](../library.md)) copia toda coluna pelo `copyRowsSql`: a cópia leva a aura.
- O `restyle` não filtra a cena: o isolamento é do service, que só passa ids achados pelo `tokensIn` do grid endereçado.

## Mapper (`token-aura.mapper.ts`)

Arquivo próprio, ao lado do `tokens.mapper.ts` (que o usa no `toTokenDto` e no `toTokenUpdatePo`):

- `toTokenAuraPo(aura | null)` → as sete colunas (a `image` grava a forma em `aura_image_shape`): raio ao centésimo (`cellsNumeric`: 2,345 → `"2.35"`), e todo campo que o `kind` não usa vai `null` (trocar de cor para imagem não deixa a cor para trás); `null` → `NO_AURA_PO` (as sete nulas).
- `toTokenAuraDto(token)` → `TokenAuraDto | null`, conferindo raio e opacidade pelo VO do game-core (`auraRadius`, `auraOpacity`); linha fora da regra lança `RangeError` "Token <id> has an invalid aura: Aura radius 21 is invalid: …" (com `cause`). **Imagem perdida = sem aura**: `kind = 'image'` com `aura_image_asset_id` nulo (o asset foi apagado, set null) volta `null`. Efeito sem cor → `color: null` (a cor natural). A imagem volta com `shape` (coluna nula → `square`).
- `toTokenStylePo(style)` → o que o `restyle` grava: o resto do estilo como veio e a `aura` como as sete colunas (ausente = nenhuma coluna escrita).
- `lookAssetIdsOf({ imageAssetId?, aura? })` → `[imagem do token, imagem da aura]`, para o `requireAssetsOf`.
- O `toTokenDto` manda a mesma `aura` aos dois públicos: **sem redação** (a aura some só junto com o token que o viewer não recebe — ver [`invisivel.md`](invisivel.md)). O `newTokenRowOf` (`token-transaction.ts`) grava a aura do `token:create` e do `token:createMany` (a colagem leva a aura); o `toTokenUpdatePo` só escreve a aura quando o `token:update` a manda (`null` tira).

**Migração `0061_aura_image_shape`:** adiciona a coluna, põe `square` em toda aura de imagem que já existia (`UPDATE` escrito à mão entre o `ADD COLUMN` e os `CHECK`) e recria os dois `CHECK`.

## Comandos

Sem comando nem evento novo (tirar a aura é `style: { aura: null }`):

- `token:restyleMany { style: { aura } }` — mestre e quem controla, em qualquer camada (`requireControl('restyle')`, o espectador em `controllerIds` é inerte). O `TokenAppearanceService.restyleMany` passa `lookAssetIdsOf(style)` ao `requireAssetsOf` (a imagem da aura tem de ser asset **da mesa**: de outra mesa → `ASSET_NOT_FOUND` antes de gravar), separa o estilo **como veio** (`splitStyle`, genérico sobre o DTO, para cada parte ser também o `style` do seu evento) e converte cada parte com `toTokenStylePo` na hora do `TokensDao.restyle`. O `token:restyledMany` leva `style.aura` ao grid todo.
- `token:create` e `token:update` (só mestre) aceitam `aura` (o diálogo do mestre); o `token:createMany` (colar) também, pelo `newTokenDto`. Os três conferem a imagem da aura pelo `lookAssetIdsOf`.

## Token ligado

A aura é do **personagem**: está no `TokenIdentityPo`/`identityOf` (`linked-token.ts`), então o ligado mostra a aura do personagem (`characters.aura_*`) em todo grid, desligar a copia para o token (`unlinkWith`) e o "Adicionar jogadores" nasce com a da âncora. `splitStyle` põe `aura` (inclusive `null`) no compartilhado; `splitUpdate` manda as sete colunas ao personagem (as formas ficam no token). Ver a tabela de [`../characters/token-ligado.md`](../characters/token-ligado.md).

## Testes

- `server/test/integration/token-auras-dao.spec.ts` (Postgres descartável): as seis colunas lidas de volta, sem aura = seis nulas, `restyle` troca só a aura (nome, borda e luz intactos), aura nula zera, `restyle` sem aura não toca, raio 0 e raio 20 / opacidade 10 valem, `updateFields` grava, apagar o asset da aura de imagem zera só a imagem, `copyScene` leva a aura, os `CHECK` recusam (`23514`) cor sem cor, efeito sem efeito, efeito com imagem, imagem com efeito ou cor, só o `kind`, raio 20,01, opacidade 9 e 101, cor e raio sem `kind`; isolamento: `findManyInScene` da cena da Quelm não acha o token da Vharn e o `restyle` do token da Vharn não muda a aura do da Quelm.
- Unit `server/test/modules/tokens/token-aura.mapper.spec.ts`: `toTokenAuraPo` de cada `kind` (raio 2,345 → `"2.35"`, efeito tingido, `null` → seis nulas), `toTokenAuraDto` (volta de cada `kind`, imagem perdida → `null`, sem aura → `null`, raio 21 e opacidade 5 lançam citando o token), `toTokenStylePo` e `lookAssetIdsOf`. `tokens.mapper.spec.ts`: a mesma aura aos dois públicos, `aura: null` sem aura, o `update` com aura, `null` e sem. `linked-token.spec.ts`: `identityOf` com a aura, o ligado mostra a da âncora, `splitStyle` (`aura` e `aura: null` no compartilhado), `splitUpdate`. `token-appearance.service.spec.ts`: a Bia põe Fogo (diário `lock → save → bump → commit → publish` e o evento com a aura), `aura: null`, imagem da Quelm → `ASSET_NOT_FOUND` só com `lock`, imagem da mesa grava, Caio e Duda (espectador no controle) → `FORBIDDEN`. `linked-writes.spec.ts`: a aura da Lyra ligada vai à âncora, um evento só, do elenco.
- Integração `server/test/integration/token-auras.spec.ts` (três clientes do `token-table.ts`): a Bia põe Ouro de 2 casas e Ana e Caio recebem; o reinício mantém no `board:sync`; a Ana cria com Fogo e troca por `token:update`; `aura: null` tira; Caio → `FORBIDDEN` sem evento; `kind: 'glow'` → `INVALID_BODY`; imagem da Quelm → `ASSET_NOT_FOUND` sem evento nem mudança; imagem da mesa chega a todos; a Lyra ligada mostra a aura nos dois grids; a Quelm não ouve, não acha (`TOKEN_NOT_FOUND`) e não muda o token da Vharn.
