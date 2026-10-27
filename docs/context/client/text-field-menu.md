# Client · menu dos campos de texto (app desktop)

Hub: [`../client.md`](../client.md). A casca (user-agent, permissão de leitura da área de transferência): [`../desktop.md`](../desktop.md).

A casca desktop (Tauri/WebView2) desliga o menu de contexto do navegador. Nos campos de texto o Lorkarium põe o dele: **Recortar, Copiar, Colar, Selecionar tudo** (com o atalho ao lado). No navegador nada muda: o `TextFieldMenu` não escuta nada e o menu do navegador segue.

## Peças

- `src/lib/desktop-shell.ts` — `isDesktopShell(ua)`: `true` só com o token ` LorkariumDesktop/<versão>` que a casca **acrescenta** ao user-agent; sem versão (`LorkariumDesktop`, `LorkariumDesktop/`) ou grudado em outra palavra → `false`. O `main.tsx` injeta `isDesktop: isDesktopShell(navigator.userAgent)` no `AppDependencies`. `desktopShellOf(ua)` → `{ version, titleBar }` ou `null`: `titleBar` só com a segunda marca ` LorkariumTitleBar/1` (casca sem moldura, ver [`title-bar.md`](title-bar.md)); a marca sem `LorkariumDesktop/<versão>` não conta.
- `src/features/text-field-menu/text-field-target.ts` — `editableFieldOf(alvo)`: `textarea` ou `input` de tipo `text`, `search`, `email`, `password`, `url`, `tel`, `number` (checkbox, rádio, faixa, arquivo, cor → `null`). `textFieldStateOf(campo)` → `{ hasSelection, readOnly, disabled, empty, password }`; `email`/`number` respondem `null` ao `selectionStart`, e a seleção vem do `document.getSelection()` (o Chromium a informa).
- `src/features/text-field-menu/text-field-menu-items.ts` — `textFieldMenuItemsOf(estado)` → os 4 itens `{ action, label, shortcut, enabled }` em ordem. Sem seleção → sem Recortar/Copiar; `readOnly` → sem Recortar/Colar (Copiar fica); vazio → sem Selecionar tudo; `password` → **nunca** Recortar/Copiar; `disabled` → tudo desabilitado.
- `src/features/text-field-menu/text-field-menu.tsx` — `TextFieldMenu({ isDesktop, clipboard, fieldEditing })`, montado uma vez pela rota `root` do `buildRoutes`. Escuta `contextmenu` no `document` (roda depois do listener do React na raiz): evento com `defaultPrevented` — um `ContextMenu` do Radix que já tratou o clique — é ignorado; fora de campo de texto também (sem cancelar). No campo, cancela o evento e abre um `DropdownMenu` controlado, ancorado num `span` `fixed` de tamanho zero no ponteiro (cada clique remonta pelo `serial`).
- A ação roda no `onCloseAutoFocus`, depois de devolver o foco ao campo (ver [`armadilhas.md`](armadilhas.md)). "Colar" lê `clipboard.readText()`; `null` (recusa) não faz nada.
- `src/services/clipboard.ts` — `readText()` no `Clipboard` / `NavigatorClipboard` (`navigator.clipboard.readText`, recusa → `null`). No desktop a casca concede a leitura à origem do app; sem isso o WebView2 pediria permissão.
- `src/services/field-editing.ts` — `FieldEditing` / `DocumentFieldEditing(commands)` (`commands` = `document`): `insertText`, `cut`, `copy` por `execCommand`, que preserva o Ctrl+Z e dispara o `input` do campo controlado do React (atribuir `value` não faria nenhum dos dois); `selectAll` por `select()`. Cada um foca o campo antes.

## Testes

- `client/test/lib/desktop-shell.spec.ts`, `client/test/features/text-field-menu/*` (itens e alvo sem React; o componente com Testing Library) e `client/test/services/{clipboard,field-editing}.spec.ts` (`EditingCommandsFake` no lugar do `execCommand`, que o jsdom não tem).
- `FieldEditingFake` (`calls`): o `insertText` imita o navegador (setter nativo do `value` + `input` borbulhando), então o `onChange` controlado dispara. `ClipboardFake.pasteText` é o que o `readText` devolve; `new ClipboardFake(true)` recusa.
- `testDependencies()` traz `isDesktop: false`; o `router.spec.tsx` liga com `{ ...deps, isDesktop: true }` e prova o menu no campo de e-mail do login.
