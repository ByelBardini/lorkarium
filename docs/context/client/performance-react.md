# Client · desempenho do React (stores e painéis)

O lado React das regras de desempenho: o que impede painel, lista e sala de re-renderizar a cada evento, prévia de arraste ou passo de patrulha. O hub é [`performance.md`](performance.md) (regra 15 aponta para cá); a visão dos painéis está em [`vision.md`](vision.md).

## Regras (não desfazer)

1. **`apply` sem mudança devolve o mesmo estado** (`changedPatchOf`, `src/lib/state-patch.ts`). O `set` do Zustand com um objeto parcial notifica **sempre**, até `set({})`: cada evento de chat, dado ou presença notificava as 3–4 stores da mesa, e todo seletor rodava de novo. As stores calculam o patch e só chamam `set` quando um campo muda de identidade (`table-presence-store`, `board-store`, `board-interaction-store` no `pointer`, `setReadOnly` e `dropPreview`). Peças que seguram isso:
   - `board-store`: `withoutTokens` devolve o próprio `dragged` quando ninguém dos ids está sendo arrastado (um `tokensMoved` sem arraste não troca o objeto);
   - `board-interaction-store`: o estado inicial e o `dropPreview` usam o mesmo `NO_PREVIEWS` (`board-pointer-intents.ts`), então largar as prévias duas vezes não muda nada;
   - a casa sob o ponteiro não é estado: é o ref `hover` (`HoverCellRef`, `hover.current`), escrito pelo `afterIntent` sem notificar ninguém; só o colar (`use-edit-shortcuts.ts`) o lê;
   - `open-tables-store`: `campaignUpdated` que não muda nome, capa nem chaves dos tokens mantém o mesmo array `tables`.

   Campo novo em store que um evento comum reescreve com o mesmo valor: passe pelo `changedPatchOf`. Valor recalculado (array ou objeto novo com o mesmo conteúdo) conta como mudança: devolva a referência antiga quando nada mudar.

## Armadilhas

- **Teste de notificação conta assinante, não estado**: `NotificationCounter` (`client/test/support/notification-counter.ts`) assina a store e conta; `toEqual` no estado passa mesmo com notificação à toa.
