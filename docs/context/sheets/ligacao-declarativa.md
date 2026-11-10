# Fichas — ligação declarativa e listas

O que o autor do modelo escreve no HTML para ligar campos aos valores sem JS (`data-lk`, `data-lk-roll`) e as listas repetíveis com id estável (`lorkarium.lists`). Vive dentro do frame, no texto serializado de `client/src/sheet-sandbox/sheet-frame-bindings.ts`. Hub: [`../sheets.md`](../sheets.md); bootstrap e SDK: [`sandbox.md`](sandbox.md).

## Arquivo

`sheet-frame-bindings.ts` (puro) — `SHEET_FRAME_BINDINGS_SOURCE` (o texto de `createFrameBindings(scope, parts)` → `{ lists }`, serializado como o sanitizador e o console) e os tipos estruturais `SheetBoundElement`, `SheetBindingDocument`, `SheetBindingObserverClass`, `SheetBindingScope`, `SheetBindingParts`, `SheetListItem`, `SheetFrameLists`, `SheetFrameBindingsFactory`. Fora do bootstrap pelo teto de 500 linhas. O bootstrap o chama antes do código do autor com as próprias peças (`onState`, o `values.patch`, o `dice.roll`, o `html.sanitize` e o `console.error` do frame): a ligação não tem canal próprio, todo efeito é um pedido comum do SDK que o host e o servidor reautorizam. `document`, `MutationObserver`, `crypto.getRandomValues`, `JSON`, `Object.keys`, `Number.isFinite/isInteger` e `Math` são capturados nessa hora. Um `window` sem `document` (os fakes unit do SDK) recebe só as listas.

## `data-lk="caminho"`

- Caminho: 1 a 8 chaves separadas por `.`, cada uma `[A-Za-z0-9_-]{1,64}` e nunca `__proto__`, `constructor`, `prototype` (a regra do `sheetValuePathPatchesDto`, repetida à mão porque o arquivo não importa nada). Caminho inválido → **um** `console.error` por elemento citando o caminho e a tag (`data-lk "forca..base" on <input> is not a value path; …`); os outros campos seguem ligados.
- Mostrar: a cada `state`, todo `[data-lk]` da página recebe o valor do caminho (ausente = vazio). `checkbox` → `checked = valor === true`; `radio` → marcado se o valor (texto) = o `value` dele; `input`/`textarea`/`select` → `value` (só texto, número ou booleano); `contenteditable` (≠ `"false"`) → `innerHTML` pelo `html.sanitize`; outro elemento → `textContent` (só mostra). O elemento com foco (ou que contém o foco) **não** é sobrescrito. Antes do 1º `state` nada é tocado (o HTML fica com o que escreveu).
- Elemento criado depois (item de lista) se liga sozinho: um `MutationObserver` no `documentElement` (`childList` + `subtree`) preenche os nós novos e os `[data-lk]` dentro deles.
- Gravar: ouvintes de `input` e `change` no `document` em captura, só no próprio alvo com `data-lk`. Envia `values.patch([{ path, value }])`: texto → string; `number`/`range` → número (vazio → `null`, apaga; texto que não é número não envia); `checkbox` → booleano; `radio` só quando marcado; `contenteditable` → `innerHTML` sanitizado. O mesmo valor repetido pelo mesmo elemento (o `input` seguido do `change`) sai uma vez só. Ficha só de leitura (`canEdit` não `true`) não envia nada. Recusa do host → `console.error` (`data-lk "x" was not saved`) com o erro.

## `data-lk-roll="expressão"`

- Clique (no botão ou em algo dentro dele, por `closest`) troca cada `@caminho` pelo número do valor e chama `dice.roll`; `data-lk-label` e `data-lk-visibility` (`masters`) vão como `label` e `visibility`.
- `@caminho` sem chaves para no `-` (`@mod-@pen` é subtração); chave com hífen vai entre chaves: `@{golpe-duplo.dano}`.
- O valor precisa ser inteiro (número ou texto de um inteiro). O sinal fica um só: `+@a` com `a = -2` vira `-2`, `-@a` vira `+2` (a notação lê um sinal por termo). Valor ausente, fracionário ou texto → `console.error` (`data-lk-roll "1d20+@bonus" needs @bonus, which is not a whole number in the values`) e **nenhuma** rolagem.

## `lorkarium.lists`

- `add(lista, item?)` → `Promise<id>`: id novo `[a-z0-9]{8}` (8 bytes do `crypto.getRandomValues` mod 36; sorteia de novo se a lista já tem o id) e um `values.patch` de `[...lista, id]` = `item` (`{}` se faltar; só objeto simples, senão `TypeError`). Resolve com o id depois do `result`.
- `remove(lista, id)` → `values.patch` com `null` naquele caminho só.
- `items(lista)` → `[{ id, value }]` do último `state`, cópias JSON; `[]` se o caminho não guarda objeto. **Ordem não garantida** (o `jsonb` reordena as chaves): o autor que quer ordem guarda um campo no item.
- Caminho da lista com 1–7 chaves (o id é a 8ª); inválido → `add`/`remove` rejeitam com `TypeError` sem enviar e `items` lança. `lists` está congelado.

## O que está provado

`client/test/sheet-sandbox/sheet-bridge-bootstrap-bindings.spec.ts` roda o texto serializado do bootstrap com o `BoundSheetFrameFake` (o `window` do SDK + `document` e `MutationObserver` de um iframe do jsdom por teste, e o `SequenceRandomFake` como `crypto`; os dois em `client/test/support/sheet-frame-fakes.ts`): preencher (número aninhado, checkbox, select, `span`, caminho ausente, antes do 1º `state`, elemento criado depois, foco, `contenteditable` sanitizado), gravar (texto, número e vazio, checkbox uma vez, select, `contenteditable` sanitizado, só leitura, patch aceito pelo `sheetValuePathPatchesDto`), caminho inválido (`..`, `__proto__`, 9 chaves, acento), `data-lk-roll` (troca, sinal, chaves, `masters`, clique num filho, ausente/fracionário/texto recusados), listas (id e patch, item vazio, id repetido sorteado de novo, `remove`, `items` com cópia, `[]`, recusas, congelado) e o texto do `createFrameBindings` rodando sozinho. Oito inversões da fonte (foco, sanitizar, sorteio repetido, recusa da rolagem, antes do `state`, só leitura, repetição, teto de 8 chaves) deixaram o spec vermelho. A referência da API (`sheet-api-reference-content.ts`) documenta `lists.*` e o exemplo "Campos ligados a valores (data-lk)"; o `sheet-api-reference.spec.tsx` confere que toda chamada citada existe no SDK.

## Armadilhas

- O e2e ainda não roda a ligação no Chromium (só jsdom): `isContentEditable` não existe no jsdom, por isso a regra lê o atributo `contenteditable`.
- Script do modelo é clássico: `await` no topo é erro de sintaxe; o exemplo da referência usa `.then`.
