# Client · armadilhas da biblioteca

Hub: [`library.md`](library.md).

- **Quem está na mesa vem da presença, não do loader:** o `campaign.members` da rota da sala fica parado; lista de jogadores para agir ("Dar a", dono da ficha nova) lê `table.presence` (regressão em `library-sheets.spec.tsx`, "joined after the room opened").
- O jsdom não tem `DataTransfer`: o `fireEvent.dragStart(el, { dataTransfer })` só copia o objeto dado; use o `DataTransferFake`. O hook guarda o arrastado em estado (não relê o `dataTransfer` no `drop`).
- `dragstart`/`drop`/`click`/`focus` de um `treeitem` aninhado sobem para o da pasta mãe: os handlers param a propagação (ou conferem `target === currentTarget`).
- Abrir um documento numa aba põe o painel por trás da gaveta, que segue montada. Ela não é modal (nada de `aria-hidden`/`inert` nem foco preso), então o `focus()` no nome vai na hora. O `DocumentPanel` segue focando pelo `focusWhenUncovered` (`src/lib/`), que só espera se outro modal (`[role=dialog][data-state=open]`) ou `aria-hidden`/`inert` cobre o campo. O e2e `createDocument` confere esse foco.
- O Esc da gaveta é um `onKeyDown` dela: tecla de um menu ou diálogo em portal (o "Novo item", o menu da árvore) sobe pela árvore do React até ela, por isso só conta alvo que a gaveta `contains`.
- `DropdownMenu` que abre `Dialog` ou campo: `modal={false}` e `onCloseAutoFocus` com `preventDefault`, senão o foco volta ao gatilho por cima do campo.
- Item aberto da árvore contém os filhos: no Playwright, `click()` (e o botão direito) no `treeitem` de uma pasta aberta cai no **centro**, que é um filho (o botão direito numa pasta aberta abriu o menu de um filho). Mire a linha do item (`position: { x: 60, y: 16 }`); no jsdom o `fireEvent` vai ao próprio elemento.
- `ContextMenuTrigger` aninhado: o Radix só abre o mais interno (o `preventDefault` do filho barra o pai), mas aí cada item precisaria do seu menu. Um gatilho só, na área, com `closest('[data-tree-key]')` no `onContextMenu` (que roda antes do do Radix), dá o alvo, inclusive pela tecla de menu sobre o item focado.
- Grid numa pasta fechada não está no DOM: no e2e, `pickGrid(biblioteca, nome)` busca o nome (a busca abre as pastas), clica e limpa a busca.
