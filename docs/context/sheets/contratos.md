# Contratos das fichas

Fontes: `packages/contracts/src/sheets/`, exportadas por `@lorkarium/contracts`. Só Zod. O byte UTF-8 é contado por `utf8Length` (`packages/contracts/src/utf8-length.ts`), porque o contracts compila sem a lib DOM e não tem `TextEncoder` tipado.

## Modelo (`sheet-template.dto.ts`)

- O código é `files` (lista ordenada de `{ path, content }`, até 512 KiB somados): contrato e mensagens em [`arquivos.md`](arquivos.md). `SHEET_TEMPLATE_NAME_MAX_LENGTH` (60; nome aparado, 1–60) e `UNNAMED_SHEET_TEMPLATE_NAME` ("Modelo sem nome").
- `sheetTemplateSummaryDto`: `id`, `folderId` (nulo = raiz), `name`, `version`, `updatedAt`, **sem código**. É a linha do agregado da biblioteca do mestre (o `campaignLibraryDto` ainda não o leva).
- `sheetTemplateDto`: o resumo mais `files` e `manifest` (obrigatório). É o que o editor do mestre lê.
- `sheetTemplateCodeDto`: `name`, `version`, `files` e `manifest`. É o código que a ficha roda e vai junto da leitura da ficha. O `name` monta o rótulo do dado ("Ficha Tormenta · Ataque").
- `createSheetTemplateRequestDto`: `name?`, `folderId?` (nullable), `files` obrigatório, `manifest?` (ausente = um que não declara nada). Sem `actionId`, como os grids e pastas da biblioteca.
- `updateSheetTemplateRequestDto`: `expectedVersion` (conflito entre mestres), `name?`, `folderId?` (nulo move à raiz), `manifest?` (inteiro) e `files?` (a lista inteira; só outra ordem já é mudança). Sem alteração nenhuma, a mensagem é "changes is empty; expected at least one of name, folderId, files, manifest".
- `sheetTemplateParamsDto` (`campaignId`, `templateId`) e `sheetTemplateResponseDto` (`{ template }`).
- `sheetTemplateNameDto` é exportado para o arquivo do modelo compor sem duplicar.

## Manifesto do modelo (`sheet-manifest.dto.ts`)

O que o modelo declara: as permissões que o host concede e as barras que o dono deve ter. Valores, `bars.adjust` e dados não precisam de permissão.

- `SHEET_MANIFEST_PERMISSIONS`: `character:stats` (gravar CA e CD), `character:portrait` (trocar o retrato), `sheet:images` (enviar imagens). `sheetManifestPermissionDto` recusa outra citando-a e as conhecidas: `permission "network"; expected one of character:stats, character:portrait, sheet:images`.
- `sheetManifestBarDto` (estrito): `label` (aparado, 1–`BAR_LABEL_MAX_LENGTH` = 24), `color` (só nome do `BAR_PALETTE`, nunca hex: `bar color "#ff0000"; expected one of gold, …`) e `max` (inteiro 1–`BAR_VALUE_LIMIT`).
- `sheetTemplateManifestDto` (estrito): `permissions`, `bars` (até `MAX_BARS_PER_TOKEN` = 8: `bars has 9; expected at most 8`) e `assets` (as fontes e imagens do modelo, ver [`arquivos.md`](arquivos.md)), cada lista com **padrão `[]`**, para um manifesto guardado antes de uma lista nova continuar legível. Recusa permissão repetida (`permission "sheet:images" repeats; …`) e rótulo repetido sem caixa nem acento (`bar labels "HP" and "hp" repeat; …`; a mesma chave do `resolveSheetBar`, reescrita porque o contracts só depende do zod).
- `emptySheetTemplateManifest()`: `{ permissions: [], bars: [], assets: [] }` novo a cada chamada (o padrão do create e da coluna).

## Arquivo do modelo (`sheet-template-file.dto.ts`)

O `.lksheet` que o mestre exporta e importa: um JSON com o nome, os arquivos, o manifesto e os bytes dos assets de um modelo, nunca fichas, valores, dono ou versão.

- Constantes: `SHEET_TEMPLATE_FILE_FORMAT` (`"lorkarium.sheet-template"`), `SHEET_TEMPLATE_FILE_VERSION` (2), `SHEET_TEMPLATE_FILE_LEGACY_VERSION` (1), `SHEET_TEMPLATE_FILE_EXTENSION` (`.lksheet`) e `SHEET_TEMPLATE_FILE_MAX_BYTES` (12 MiB: o escape do JSON infla o código e o base64 infla os 8 MiB de assets; o arquivo maior é recusado antes da leitura e os orçamentos reais ficam com o DTO).
- Leitura em duas etapas:
  - `sheetTemplateFileHeaderDto` (objeto solto): `format` literal e `formatVersion` inteiro ≥ 1. Um arquivo de versão mais nova passa aqui, e o client diz "versão mais nova" em vez de "campo a mais";
  - `sheetTemplateFileDto` (estrito, formato 2): `format`, `formatVersion` literal 2, `exportedAt?` (ISO), `name` (aparado, 1–60), `files` (o `sheetTemplateFilesDto`), `manifest` (`prefault({})`) e `assets` (padrão `[]`, ver [`arquivos.md`](arquivos.md));
  - `sheetTemplateFileV1Dto` (estrito, formato 1): `html`, `css`, `js` com o refine de orçamento próprio (`html + css + js have N bytes; …`) e o `manifest`; o client o lê como três arquivos.
- Mensagens: `format "outra.coisa"; expected lorkarium.sheet-template` e `formatVersion 1; expected 2`. Campo a mais (como `values`) é recusado pelo estrito.

## Valores (`sheet-values.dto.ts`)

- `SheetValueDto` é JSON fechado: string, número finito, booleano, `null`, array e objeto simples. `SheetValuesDto` é `Record<string, SheetValueDto>`.
- Orçamento: `SHEET_VALUES_MAX_BYTES` (256 KiB de JSON em UTF-8), `SHEET_VALUES_MAX_DEPTH` (8: o valor de uma chave da raiz está no nível 1), `SHEET_VALUES_MAX_KEYS` (1000 chaves somadas na árvore toda, as aninhadas também) e `SHEET_VALUE_KEY_MAX_LENGTH` (64).
- Chave: `[A-Za-z0-9_-]{1,64}`, nunca `__proto__`, `constructor` nem `prototype`. A recusa cita a chave entre aspas. Acento e espaço são recusados.
- Travessia iterativa, no molde do `documentContentDto`: chaves, profundidade, folhas e contagem são conferidas antes de serializar. Mais valores do que bytes do orçamento já é estouro, e um array maior que o orçamento é recusado antes de ser percorrido. Só objeto simples entra (`Date`, função, `undefined`, `NaN` e `±Infinity` caem). O resultado é uma cópia nova (`JSON.parse` do JSON medido), sem referência à entrada.
- `sheetValuesDto` são os valores guardados. `sheetValuesPatchDto` é o mesmo validador com ao menos uma chave: cada chave substitui a guardada inteira, e `null` apaga. O server confere de novo o resultado da mescla com `sheetValuesDto`.
- `updateSheetValuesRequestDto`: `{ actionId, changes?, patches? }`, ao menos um ("changes and patches are both absent; expected at least one of them"), **sem** `expectedVersion`. A última escrita vence por chave ou caminho, como as barras.
- `sheetValuePathPatchesDto` (`SheetValuePathPatchDto` = `{ path, value }`, estrito): 1 a `SHEET_VALUE_PATCHES_MAX` (100) trocas, cada uma num caminho de 1 a 8 chaves (`Sheet value path has 9 keys; expected 1 to 8`); `null` apaga o caminho. O valor é conferido **onde vai ficar** (as chaves do caminho passam pela mesma regra de chave, e a profundidade conta o caminho: 7 chaves + `{ a: { b } }` = 9 níveis, recusado). Cópia nova, como os valores.
- `applySheetValueEdits(valores, { changes?, patches? })`: a mescla única de server e client. `changes` primeiro (chave inteira, `null` apaga), depois cada caminho na ordem: objetos criados no caminho, número ou array no caminho vira objeto, `null` apaga a folha e caminho que não existe continua não existindo. Árvore nova (a entrada não muda); o resultado ainda passa pelo `sheetValuesDto` (orçamento).

## Ficha (`sheet.dto.ts`)

- `sheetVisibilityDto`: `controllers` (padrão: mestres e controladores) | `table` (a mesa toda lê, e só mestres e controladores editam).
- `SHEET_NAME_MAX_LENGTH` (60) e `sheetNameDto` (aparado, 1–60).
- `sheetHolderDto`: `{ tokenId }` | `{ memberId }` (cada um estrito: os dois juntos, nenhum ou `userId` são recusados). O server resolve `{ memberId }` para o personagem do jogador e `{ tokenId }` de um token ligado para o personagem dele (Fase 9; não há `{ characterId }` no contrato).
- `sheetSummaryDto` (a linha da biblioteca, **sem valores**): `id`, `name`, `folderId` (nulo = raiz), `templateId`, `tokenId` (o token solto que guarda; nulo na ficha de personagem e na sem dono), `memberId` (o jogador do personagem que guarda; nulo em token solto, sem dono ou personagem sem jogador), `visibility`, `version`. O client lê `tokenId === null && memberId === null` como "sem dono". O DTO ainda descreve o `tokenId` como "a âncora de um personagem" (comentário velho em `packages/contracts`, não editado nesta fase).
- `sheetDto`: o resumo mais `values`, `canEdit` (escreve valores e barras) e `canManage` (nome, pasta, dono, visibilidade, modelo e exclusão: mestres).
- `sheetResponseDto`: `{ sheet, template: sheetTemplateCodeDto }`, para `GET …/sheets/:sheetId`. `tokenSheetsResponseDto`: `{ sheets: sheetSummaryDto[] }`, para `GET …/tokens/:tokenId/sheets` e `GET …/characters/:characterId/sheets` (mesma forma; o id do personagem na URL é validado pelo `setMainSheetCommandDto.shape.characterId`, não há `characterSheetParamsDto`).
- `campaignLibraryDto.sheets?` (`library/campaign-library.dto.ts`): resumos; o mestre recebe todas, os outros as que leem.
- Comandos, todos com `actionId`:
  - `createSheetRequestDto`: `templateId`, `name`, `folderId?` (nullable), `visibility?` e `holder?` (ausente = sem dono). Não há `tokenId` na raiz: o token vai em `holder`;
  - `updateSheetRequestDto`: `name?`, `folderId?` (nulo = raiz), `visibility?`, `templateId?` e `holder?` (`null` tira do dono), com ao menos um ("changes is empty; expected at least one of name, folderId, visibility, templateId, holder");
  - `deleteSheetRequestDto`: `{ actionId }`.
- `sheetParamsDto` (`campaignId`, `sheetId`) e `tokenSheetParamsDto` (`campaignId`, `tokenId`).
- `sheetReceiptDto`: `actionId`, `sheetId`, `version`, `operation` (`create` | `update` | `values` | `delete`) e `skippedBars` (rótulos das barras do manifesto que não couberam no dono ao dar a ficha, até 8; padrão `[]`, então recibo gravado antes lê vazio), sem valores. `sheetWriteResponseDto` é `{ sheet, receipt }`.
- `sheetChangedEventDto` (`sheet:changed`): `campaignId`, `sheetId`, `version` e `at`. **Sem valores**: cada client relê pela rota, como no `library:changed`.
- `sheetSpendBarsCommandDto` (`sheet:spendBars`): `actionId`, `campaignId`, `sheetId` e `costs` (1 a 8 `sheetBarCostDto` `{ barId, amount }`, `amount` inteiro de 1 a `BAR_VALUE_LIMIT`; a mesma barra pode repetir e soma). Estrito como o `sheet:adjustBar` (sem `tokenId`, `sceneId`, `userId`). Tudo ou nada pelo atual; falta → `INSUFFICIENT_BAR` com a mensagem do server. Em `SHEET_EVENTS.spendBars` e `SheetClientEvents` com o mesmo ack.
- `sheetAdjustBarCommandDto` (`sheet:adjustBar`): `actionId`, `campaignId`, `sheetId`, `barId` e `change`, que é o `barChangeDto` do `token:adjustBar` (`add` | `set` | `max` | `temp`). Não leva `tokenId` nem `sceneId`: o server resolve o dono da ficha (token solto → barra do token; personagem → barra do personagem e `character:changed`; sem dono → `SHEET_HAS_NO_TOKEN`). Ligado (B6) em `sheet-events.ts`: `SHEET_EVENTS` (`adjustBar: 'sheet:adjustBar'`, `changed: 'sheet:changed'`), `SheetClientEvents` (`'sheet:adjustBar': (command: SheetAdjustBarCommandDto, ack: (answer: BoardCommandAckDto) => void) => void`, o mesmo ack dos comandos do board) e `SheetServerEvents` (`'sheet:changed': (event: SheetChangedEventDto) => void`), somados a `TableClientEvents` e `TableServerEvents` no `board.dto.ts`. O `import type` do `BoardCommandAckDto` é um ciclo só de tipo, como o do `character.dto.ts`.

## Ponte frame ↔ host (`sheet-bridge.dto.ts`)

Mensagens pelo `MessagePort`, validadas nas duas pontas. Nenhuma mensagem do frame leva `tokenId`, `campaignId` ou `sheetId`, porque o host sabe qual ficha o frame é.

- `sheetBridgeRequestIdDto`: `[A-Za-z0-9_-]{1,64}` (`SHEET_BRIDGE_REQUEST_ID_MAX_LENGTH`). Um contador do SDK basta, porque só casa o `result`/`error` com o pedido.
- `sheetFrameMessageDto`, frame → host, discriminada por `type`. Todas levam `requestId`:
  - `ready`;
  - `bars.adjust`: `bar` (texto 1–64, `SHEET_BRIDGE_BAR_REFERENCE_MAX_LENGTH`: o id **ou** o rótulo da barra; o host resolve para o `barId` do `sheet:adjustBar`) e `change` (`barChangeDto`). O antigo `barId` é recusado (objeto estrito);
  - `dice.roll`: `expression` (a mesma regra da parte do `dice:roll`, aparada, 1–200), `label?` (`diceRollLabelDto`) e `visibility` (`public` | `masters`, padrão `public`);
  - `values.set`: `changes` (`sheetValuesPatchDto`);
  - `values.patch`: `patches` (`sheetValuePathPatchesDto`: 1–100 `{ path, value }`, caminho de 1–8 chaves válidas, `null` apaga);
  - `bars.spend`: `costs` (1–`MAX_BARS_PER_TOKEN` de `{ bar, amount }`: `bar` como no `bars.adjust`, `amount` o do `sheetBarCostDto`, inteiro ≥ 1; `barId` é recusado: o host resolve o nome);
  - `character.set`: `changes` estrito só com `armorClass?`/`difficultyClass?` (inteiro 0–`CHARACTER_STAT_MAX`, sem `null`: a ficha não apaga a CA; a recusa cita o valor), ao menos um ("changes is empty; expected at least one of armorClass, difficultyClass"); `name` e o resto são recusados;
  - `character.setImage` e `assets.upload`: `image` `{ type, bytes }` com `type` PNG/JPEG/WebP (o GIF fica para a aura; SVG nunca) e `bytes` um `ArrayBuffer` de até `ASSET_MAX_BYTES` ("image has N bytes; expected at most 20971520");
  - `assets.read`: `assetId` (uuid);
  - `console` (sem `requestId`, o host nunca responde): `level` (`SHEET_CONSOLE_LEVELS`: `log`, `info`, `warn`, `error`, `debug`), `message` (até `SHEET_CONSOLE_MESSAGE_MAX_LENGTH` = 2000) e `at` (até `SHEET_CONSOLE_POSITIONS_MAX` = 8 `sheetConsolePositionDto` `{ line ≥ 1, column ≥ 0 }` do `srcdoc`, o topo da pilha primeiro);
  - `console.dropped`: `count` (≥ 1) de linhas que o frame não mandou pelo limite de taxa.
  - Tipos: `SheetConsoleMessageDto` (as duas acima) e `SheetFrameRequestDto` (as que o host responde).
- `sheetHostMessageDto`, host → frame:
  - `state`: `token` (`sheetFrameTokenDto`: `name` e `image`, que é `{ type: assetMimeTypeDto, bytes: ArrayBuffer }` ou `null`; o `token` todo é `null` na ficha sem token, com `bars: []`), `bars` (os `tokenBarDto` que o leitor já recebe, redigidos pelo server, até 8), `values`, `canEdit` e `character` (obrigatório: `sheetFrameCharacterDto` estrito `{ name, armorClass, difficultyClass }`, CA/CD pelo `characterStatDto`, sem id; `null` fora da ficha de personagem);
  - `result`: `{ requestId, value? }`, `value` = `sheetBridgeResultValueDto`: `{ assetId }` (`assets.upload`) ou `sheetFrameImageDto` `{ type, bytes }` (`assets.read`); os outros pedidos respondem sem `value`;
  - `error`: `requestId` (nulo quando a mensagem nem pôde ser lida), `code` em `UPPER_SNAKE` (até 64; repassa o código do server ou o do host, como `RATE_LIMITED`) e `message` (até 500, `SHEET_BRIDGE_ERROR_MESSAGE_MAX_LENGTH`).
- Códigos do host além dos do server: `INVALID_MESSAGE`, `RATE_LIMITED`, `NO_TOKEN`, `NO_CHARACTER`, `ASSET_NOT_FOUND`, `PERMISSION_NOT_DECLARED` (o pedido exige uma permissão que o manifesto não declara; a mensagem cita o pedido e a permissão).
- Tipos de entrada `SheetFrameMessageInput` e `SheetHostMessageInput`, porque o `visibility` do dado tem padrão.
- Specs: `sheet-bridge.dto.spec.ts` e `sheet-bridge-capabilities.dto.spec.ts` (personagem no `state`, cada pedido novo, 20 MiB e +1, GIF/SVG, `value` do `result`).

## Provas

Os specs ficam em `packages/contracts/test/sheets/` e em `test/utf8-length.spec.ts`. Cobrem os limites exatos e o excesso de uma unidade (512 KiB, 256 KiB, chave 64/65, profundidade 8/9, 1000/1001 chaves, `requestId` 64/65), além das chaves proibidas também aninhadas, `NaN`/`Infinity`, os campos de escolha do frame, o `tokenId`/`sceneId`/`userId` no `sheet:adjustBar`, os valores no `sheet:changed`, o nome 60/61, o `holder` (token, jogador, os dois, nenhum, `userId`, `null` no update) e o resumo sem valores (inclusive no `campaignLibraryDto.sheets`).

Treze mutações na fonte deixaram o spec certo vermelho pela asserção, e todas foram desfeitas:

- deny-list vazia;
- `>` por `>=` na profundidade, no orçamento e nas chaves;
- `json.length` no lugar dos bytes;
- `Number.isFinite` retirado;
- a cópia trocada pela entrada;
- a guarda de código parcial;
- a checagem de `ArrayBuffer`;
- `z.object` no lugar do estrito;
- o "changes is empty";
- o `.nullable()` do `state.token` e o teto de 64 do `bar` .

Driver do `/testar` sem achado.

## Armadilhas

- `JSON.parse('{"__proto__":1}')` cria a chave própria `__proto__`, mas o literal `{ __proto__: 1 }` muda o protótipo e não cria chave. O spec usa o `JSON.parse`, porque é o que chega pela rede.
- `ArrayBuffer` vindo de outro realm (o frame opaco) falha no `instanceof`. A imagem é conferida por `Object.prototype.toString`.
- O rótulo do dado montado pelo host ("<modelo> · <rótulo>") pode passar dos 40 caracteres do `diceRollLabelDto`. O host corta antes de enviar o `dice:roll`.
