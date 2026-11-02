# Client · formas do token: estado, comando, menu e teclas 1–8

Trocar de forma no mapa (imagem, borda e tamanho guardados no token, também no ligado: as formas são dele). A aba "Formas" do Editar token, onde elas se cadastram, está em [`token-dialog.md`](token-dialog.md); o contrato em [`../contracts/formas.md`](../contracts/formas.md). Plano de origem: [`2026-10-27-formas-do-token.md`](../../plans/2026-10-27-formas-do-token.md). Hub: [`../client.md`](../client.md).

## Estado (`src/stores/`)

- `board-events.ts` valida o `token:formChanged` pelo `tokenFormChangedDto` → `{ type: 'tokenFormChanged' }` (caixa com 1,25 → descartado e resync). A `board-store` aplica pela regra de versão de sempre (evento ≤ versão é duplicado).
- `board-reducer.ts` (`withForm`): **com `box`** (evento do grid) o token `tokenId` recebe `imageAssetId`, `frame`, `activeFormId` e a caixa (`col`, `row`, `width`, `height`); **sem `box`** só esse token recebe a imagem, a borda e o `activeFormId`, e a caixa fica. Redimensionar à mão tira a forma de **qualquer** token, o ligado também (como o server).
- O server zera o `activeFormId` quando a imagem, a borda ou o tamanho mudam fora da troca; o reducer espelha (`restyledToken`): `token:restyledMany` com imagem **diferente** da do token ou `frame` diferente põe `activeFormId: null` (a mesma imagem ou borda mantém, como o `IS DISTINCT FROM` do server); `token:resizedMany` zera quando o tamanho muda. A prévia da troca (`token-form-flow.ts`) é só a caixa: a imagem e a borda chegam com o evento.
- `src/lib/linked-tokens.ts`: `forms` e `activeFormId` **não** estão no `SHARED_FIELDS`: são do token (a imagem e a borda do ligado vêm do personagem).
- `token-form-flow.ts` — `setTokenFormOf` (na `board-interaction-store`: `setTokenForm({ token, formId, scene })`, `TokenFormSwitch`/`ShapeshiftingToken`): a caixa da forma aparece na hora na `resizePreview` (`formBoxIn` do game-core, o canto de cima à esquerda recuando para caber), vai **um** `setTokenForm`, o ack limpa a prévia; confirmado → anúncio "Lyra agora é Lobo atroz." e, **só vindo de outra forma**, a entrada `tokenFormChanged` na pilha de desfazer; recusa → a caixa volta e a linha de status diz o motivo. Não envia nada: em `readOnly`, com a forma já ativa, com forma que o token não tem, ou com forma maior que a cena (`formBoxIn` lança → "Fora da cena.", `out_of_scene`).
- Desfazer (`src/lib/edit-history.ts`, `table-edit-store.ts`): op `{ kind: 'tokenFormChanged', tokenId, from, to }` (ids das formas); o inverso troca `from` e `to`; o run manda `setTokenForm(scope, { tokenId, formId: to, expect: { activeFormId: from } })` (`STALE_UNDO` tira da pilha, como os outros). A troca a partir de `activeFormId: null` não entra na pilha: o `token:setForm` não volta a "nenhuma forma".

## Comando (`src/services/`)

- `token-appearance-commands.ts` — `TokenAppearanceCommands` / `RealtimeTokenAppearanceCommands(sender)`: `resizeTokens`, `restyleTokens` (vindos do `table-board-commands.ts`, que passou do teto de linhas) e `setTokenForm(scope, TokenFormTarget)` → `token:setForm { tokenId, formId, expect? }` (o `expect` só quando vem; o payload passa no `setTokenFormCommandDto`). O `TableBoardCommands` estende a interface e delega. `TokenFormTarget` em `board-command-targets.ts`.
- `board-command-sender.ts`: `TOKEN_FORM_NOT_FOUND` → `token_not_found`.
- Fake: `TableBoardCommandsFake.setTokenForm` grava `setTokenForm` com o alvo inteiro.

## Menu "Trocar forma ▸" (`src/features/board/token-form-items.tsx`)

- `TokenFormItems({ token, board, interaction, onEditForms? })`, no `TokenContextMenu` logo depois de "Tirar aura": só com `token.canControl` e `forms` não vazio (quem não controla recebe `forms: []`). Um `menuitemradio` por forma (`DropdownMenuRadioGroup` com o `activeFormId`), a ativa marcada e o número da tecla (`DropdownMenuShortcut`, 1–8) nas outras; escolher chama `interaction.setTokenForm` com a cena do tabuleiro. Age só nesse token, nunca na seleção.
- "Editar formas…" (separado embaixo) só com `onEditForms` e `useViewerTokenRights(board).of(token).edit` (o mestre, ou quem criou o token solto com a chave de criar). O `TokenContextMenu.onEditForms` vem da `play-room-page`: o estado `tokenDialog` é `TokenDialogRequest = { tokenId, initialTab?: 'forms' }`, espalhado no `RoomTokenDialog` (`initialTab` → abre na aba Formas).
- Textos: `SWITCH_FORM_TITLE` ("Trocar forma"), `EDIT_FORMS_LABEL` ("Editar formas…").

## Teclas 1–8 (`use-board-keyboard.ts`, `src/lib/board-keys.ts`)

- `formSlotOf(tecla)`: `1`…`8` sem Ctrl/⌘/Alt → posição 0…7; outra tecla (o `9`, o `0` do enquadrar) → `null`.
- Com o tabuleiro focado, **um** token selecionado (`singleSelectedOf`) que o viewer controla e que tem a forma daquela posição: `setTokenForm` (a forma ativa não envia nada, mas a tecla é tomada). Dois selecionados, espectador, forma inexistente ou tecla fora de 1–8: nada (a tecla segue adiante).
- **Conflito com 1 / 2 / 3 do mestre** (camada ativa, `use-room-shortcuts.ts` na `window`): quando a tecla troca a forma, o handler chama `preventDefault` + `stopPropagation` e a camada não muda; sem troca (token sem formas, dois selecionados), o 1 / 2 / 3 seguem mudando a camada como antes.

## Testes

- Sem DOM: `test/stores/board-reducer-forms.spec.ts`, `test/stores/token-form-flow.spec.ts`, `test/services/token-appearance-commands.spec.ts`, casos em `board-events.spec.ts`, `board-store.spec.ts` (duplicado), `linked-tokens.spec.ts`, `edit-history.spec.ts`, `table-edit-store.spec.ts` (desfazer/refazer) e `board-keys.spec.ts` (`formSlotOf`).
- Componentes: `test/features/board/token-form-items.spec.tsx` (pelo `TokenContextMenu`), `board-keyboard-forms.spec.tsx` (Ana: a tecla 2 troca e mantém a camada; sem formas, o 2 vai para Objetos) e `play-room-page-forms.spec.tsx` ("Editar formas…" abre na aba Formas).
- Fixtures `test/support/token-form-fixtures.ts`: `LYRA_FORMS` (Lyra base 1×1, "Lobo atroz" 2×2, "Corvo" 0,5), `BASE_FORM_ID`, `WOLF_FORM_ID`, `RAVEN_FORM_ID`, `WOLF_IMAGE_ID`, `shapeshiftingLyra()`, `formChangedAt(versão, campos)` (do grid) e `formSwitchedAt(versão, tokenId)` (sem `box`). `lyra()` já vem com `forms: []` e `activeFormId: null`.
