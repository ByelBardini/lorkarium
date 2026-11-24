# Fichas — teclas da sala dentro do frame

Hub: [`../sheets.md`](../sheets.md). Atalhos da sala: [`../client/board-atalhos.md`](../client/board-atalhos.md).

## Por quê

Com a ficha clicada, o foco é do documento do iframe (origem opaca): a `window` do app não ouve nenhum `keydown`, e ⇧F (sua ficha / voltar), ⇧M e ⇧B paravam de funcionar até clicar fora da ficha. O host não pode escutar dentro do frame, então o frame repassa.

## Como

- Frame (`client/src/sheet-sandbox/sheet-frame-keys.ts`, `installFrameShiftKeys`, serializada no `srcdoc` como o view e chamada pelo bootstrap): escuta `keydown` na `window` do frame e manda `{ type: 'shortcut', key }` quando é ⇧+letra (maiúscula, ou minúscula com Caps Lock), `isTrusted`, sem `repeat`, sem `defaultPrevented` (o autor pode ficar com a tecla), sem Ctrl/⌘/Alt e fora de `input`/`textarea`/`select`/`contenteditable`. Antes da porta, entra na fila do SDK.
- Contrato: `shortcut` com `key` `/^[A-Za-z]$/`, sem `requestId` e sem resposta ([`contratos.md`](contratos.md)).
- Host da sala (`sheet-bridge-host.ts`): chama `onShortcut(key)`; sem ele, descarta. O `sheet-panel` liga ao `pressShiftKey` (`client/src/features/sheets/press-shift-key.ts`), que reemite o `keydown` com Shift na `window`, onde o `useHomeShortcut` e os atalhos da sala já decidem. A prévia do editor (`sheet-preview-host.ts`) ignora: lá não há sala.

## Testes

`client/test/sheet-sandbox/sheet-bridge-bootstrap-keys.spec.ts` (o texto do bootstrap no fake: manda, espera a porta, fica no campo, não manda repetida/mantida/sintética/sem Shift/não-letra), o `describe` "a key pressed in the frame" do `sheet-bridge-host.spec.ts`, `client/test/features/sheets/press-shift-key.spec.ts` (o `homeShortcutFor` lê a tecla reemitida) e o `describe` do `shortcut` em `packages/contracts/test/sheets/sheet-bridge.dto.spec.ts`. Prova de que morde: sem a chamada no bootstrap, ou sem o `isTrusted`, o spec do bootstrap fica vermelho.
