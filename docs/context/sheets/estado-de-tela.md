# Fichas — estado de tela (`lorkarium.view`)

O frame da ficha remonta a cada troca de aba ou janela (o `createPortal` ↔ `<div hidden>` de [`../client/sheets.md`](../client/sheets.md), Armadilhas), então tudo o que não está nos `values` se perdia: o jogador estava na aba "Origem" da ficha, ia ao grid, voltava e caía em "Perfil", no topo. O frame é isolado (origem opaca, sem `localStorage`) e gravar a aba nos `values` mudaria a tela de todo mundo que olha a ficha. O estado de tela é **de quem olha**, como a rolagem do navegador: o app o guarda em memória e o devolve ao frame novo. Hub: [`../sheets.md`](../sheets.md).

## Regras

- Nunca vai ao servidor: sem rota, sem evento, sem tabela. Recarregar o app (ou abrir outra aba do navegador) começa sem nenhum; sair da conta apaga todos.
- Não pede permissão no manifesto nem `canEdit`: quem só lê a ficha também guarda a própria aba.
- Chave = mesa + ficha. O mesmo usuário com duas fichas tem dois estados; a mesma ficha aberta de novo (na aba, na janela, depois de fechada e reaberta) recebe o último.
- Qualquer JSON com as chaves e a profundidade dos `values` (`[A-Za-z0-9_-]`, sem `__proto__`/`constructor`/`prototype`, até 8 níveis), até `SHEET_VIEW_MAX_BYTES` (4096 bytes UTF-8 do `JSON.stringify`). `null` apaga.
- Até 60 `view.set` em 10 s (`SHEET_VIEW_RATE`, pelo `admitInWindow`): generoso para rolagem, mas o autor deve esperar a rolagem parar.

## SDK (`client/src/sheet-sandbox/sheet-frame-view.ts`)

`createFrameView(maxBytes, send)` serializado por `toString()` como os outros `sheet-frame-*.ts` (fora do bootstrap pelo teto de 500 linhas); o `SHEET_BRIDGE_BOOTSTRAP` o chama com `SHEET_FRAME_VIEW_MAX_BYTES` (o 4096 repetido à mão, o spec o prende ao contrato). `JSON` e `Number.isFinite` são capturados antes do código do autor.

- `lorkarium.view.get()` → cópia do último valor, síncrona, ou `null` (antes do 1º `state` e sem nada guardado). O valor vem do `state.view`, adotado antes dos ouvintes do `onState` rodarem.
- `lorkarium.view.set(valor)` → `Promise<undefined>`. Confere antes de enviar: função, `NaN`/`±Infinity` ou `undefined` → `TypeError`; acima do teto → `TypeError` "lorkarium: view has N bytes of JSON; expected at most 4096". Recusado no frame, nada sai. Aceito, o `get` já devolve o valor novo **na hora** e sai `{ type: 'view.set', requestId, value }` (cópia JSON).
- Depois do 1º `set` do frame, o valor dele vence o `state.view`: um `state` que o host mandou antes de receber o `view.set` não desfaz a troca (nenhum outro frame escreve a mesma chave enquanto este vive).
- Recusa do host (`RATE_LIMITED`, `INVALID_MESSAGE` por uma chave inválida) rejeita com o código e devolve o `get` ao valor de antes, se ninguém trocou de novo.
- O `onState` não leva `view`: o estado de tela não é dado da ficha.

## Contrato (`packages/contracts/src/sheets/sheet-bridge.dto.ts`)

`sheetViewDto` (`z.unknown().transform`): `sheetValueProblem(valor)` do `sheet-values.dto.ts` (a travessia dos `values` sobre `{ value }`) e depois o tamanho por `utf8Length`; devolve cópia. Frame → host `view.set` (`requestId`, `value`); host → frame `state.view` (`sheetViewDto.nullable()`, **obrigatório**). Detalhe em [`contratos.md`](contratos.md).

## Host (`client/src/stores/sheet-view-store.ts`)

- `createSheetViewStore()` → `StoreApi<SheetViewStore>` (Zustand, `views` por `<campanha>:<ficha>`, `remember(campanha, ficha, valor | null)`, `clear()`), um por página: `AppDependencies.sheetViews`, criado no `main.tsx`; o "Sair" do `router.tsx` chama `clear()`.
- `sheetViewSlotOf(store, campanha, ficha)` → `SheetViewSlot` `{ current(), remember(valor) }`; `localSheetViewSlot()` → um slot que vive com quem o segura.
- A sala: `WorkspaceSheet` passa `deps.sheetViews` no `SheetPanelServices.sheetViews`; o `SheetPanel` dá à ponte `view: sheetViewSlotOf(…, campaignId, sheet.id)`. Sem `sheetViews`, a ponte usa um slot só dela (perde ao remontar).
- A ponte (`createSheetBridgeHost`, opção `view`): `view.set` vem logo depois do `dice.roll`, antes do `canEdit`; guarda no slot e responde `result` sem `value`, **sem tocar a rede e sem mandar `state`** (o frame já tem o valor; um `state` aqui seria eco em laço). Todo `state` leva `view: slot.current()`; o `state` não é reenviado só porque o view mudou.
- Prévia do editor (`createSheetPreviewHost`, opção `view`): o mesmo pedido, limite e "sem `state`". O `SheetTemplatePreview` segura um `localSheetViewSlot()` (`useState`), então "Rodar de novo" e o código novo mantêm a aba; fechar o editor esquece.
- Referência e autocompletar: `VIEW_SDK_CALLS` (`src/features/sheets/sheet-api-reference-view.ts`, com `SHEET_VIEW_MAX_BYTES` e `SHEET_VIEW_RATE`), somado ao `SDK_CALLS` pelo `sheet-api-reference-content.ts` (`lorkarium.view.` → `get`, `set`).

## Provas

`packages/contracts/test/sheets/sheet-bridge-view.dto.spec.ts` (teto 4096 e +1, UTF-8, string/número/array/`null`, `NaN`/data/função, sem `value`, `__proto__`, `sheetId`, `state.view` obrigatório e com teto); `client/test/stores/sheet-view-store.spec.ts` (nada → `null`, slot refeito lê o último, outra ficha e outra mesa não veem, `null` esquece, `clear`, slot local); `client/test/sheet-sandbox/sheet-bridge-host-view.spec.ts` (1º `state` com `null`, `result` sem rede nem `state`, frame remontado recebe, outra ficha não, próximo `state` leva, só leitura guarda, `null`, 4097 → `INVALID_MESSAGE`, 60/10 s); `sheet-preview-host-view.spec.ts`; `sheet-bridge-bootstrap-view.spec.ts` (`get` antes do `state`, cópia, `set` na hora, `null`, `state` em voo, teto e UTF-8 sem envio, `TypeError`, volta na recusa, congelado); `sheet-panel.spec.tsx` (frame montado de novo recebe), `sheet-template-preview.spec.tsx` ("Rodar de novo" mantém), `router.spec.tsx` ("Sair" esquece) a referência (`view.get`/`view.set` no `sheet-api-reference.spec.tsx`) e o autocompletar (`lorkarium.view.` em `test/lib/sheet-sdk-completions.spec.ts`). 22 mutações (teto `>=`, caracteres no lugar de bytes, `view` opcional, regra dos valores desligada, chave sem a mesa, `null` guardado, `clear` vazio, `view.set` como edição, limite 600, `state` sem o valor, eco de `state` no host e na prévia, prévia sem limite, `state` vencendo o `set`, sem volta na recusa, teto e bytes do frame, sem adotar, painel sem slot, "Sair" sem `clear`, slot por rodada) deixaram o spec certo vermelho; todas desfeitas.

## Armadilhas

- A chave do estado de tela segue a regra das chaves dos `values` (o validador é o mesmo): `{ "Aba atual": 1 }` é recusado pelo host com `INVALID_MESSAGE`, e o frame volta ao valor anterior.
