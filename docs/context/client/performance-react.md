# Client · desempenho do React (stores e painéis)

O lado React das regras de desempenho: o que impede painel, lista e sala de re-renderizar a cada evento, prévia de arraste ou passo de patrulha. O hub é [`performance.md`](performance.md) (regra 15 aponta para cá); a visão dos painéis está em [`vision.md`](vision.md).

## Regras (não desfazer)

1. **`apply` sem mudança devolve o mesmo estado** (`changedPatchOf`, `src/lib/state-patch.ts`). O `set` do Zustand com um objeto parcial notifica **sempre**, até `set({})`: cada evento de chat, dado ou presença notificava as 3–4 stores da mesa, e todo seletor rodava de novo. As stores calculam o patch e só chamam `set` quando um campo muda de identidade (`table-presence-store`, `board-store`, `board-interaction-store` no `pointer`, `setReadOnly` e `dropPreview`). Peças que seguram isso:
   - `board-store`: `withoutTokens` devolve o próprio `dragged` quando ninguém dos ids está sendo arrastado (um `tokensMoved` sem arraste não troca o objeto);
   - `board-interaction-store`: o estado inicial e o `dropPreview` usam o mesmo `NO_PREVIEWS` (`board-pointer-intents.ts`), então largar as prévias duas vezes não muda nada;
   - a casa sob o ponteiro não é estado: é o ref `hover` (`HoverCellRef`, `hover.current`), escrito pelo `afterIntent` sem notificar ninguém; só o colar (`use-edit-shortcuts.ts`) o lê;
   - `open-tables-store`: `campaignUpdated` que não muda nome, capa nem chaves dos tokens mantém o mesmo array `tables`.

   Campo novo em store que um evento comum reescreve com o mesmo valor: passe pelo `changedPatchOf`. Valor recalculado (array ou objeto novo com o mesmo conteúdo) conta como mudança: devolva a referência antiga quando nada mudar.

2. **Painel que só nomeia o visto usa `useBoardSeen`, nunca `useBoardSight`** (`features/board/use-board-sight.ts`; hoje `scene-token-list.tsx` e `token-dock.tsx`). O `useBoardSight` assina `dragged`, `drag` e `patrol`: o painel re-renderizava a cada casa de todo arraste remoto (10/s) e a cada passo de patrulha. O `useBoardSeen` lê as stores por `useSyncExternalStore` e devolve a visão anterior enquanto níveis, olhos e modo forem os mesmos (`sameSeen`). Por baixo, o `sightWithMovedOf` devolve a própria visão anterior quando nenhum nível mudou, e a memória do `sightNowOf` é uma por grid (`WeakMap` pela `scene`), então grupo e aba mostrada não se refazem a frio. Provado em `scene-token-list.spec.tsx` (`RenderCounter` num `<Profiler>`: arraste dentro da luz → 0 renders; para o escuro → 1).

3. **Painel que não mostra onde o token está lê os tokens pelo `useTokensBesidesPose`** (`features/board/use-board-tokens.ts`): o mesmo array enquanto só `col`, `row` e `facing` mudaram (`sameTokensBesidesPose`, comparação rasa campo a campo, que vale porque o reducer só troca o token tocado e mantém os arrays dele). Hoje a voz do chat (`use-speak-as-voice.tsx`), o combate inteiro (`combatant-list.tsx`, `combat-header.tsx`, `turn-line.tsx`, a preparação do `combat-panel.tsx`, todos com o `combat` por seletor) e a condição nos selecionados (`selection-conditions.tsx`). Painel nunca assina `s => s.board` inteiro: todo evento troca o `board`, e a sala re-renderia o painel a cada arraste confirmado, presença ou versão.

4. **Lista longa assina a store uma vez, na lista; a linha recebe o valor pronto** (`useChatTokenFaces` no `chat-feed.tsx`): cada linha com o próprio `useSyncExternalStore` multiplica ouvintes e snapshots pelo número de linhas a cada evento do board. O valor por linha mantém a identidade enquanto não muda (para o `memo` da linha valer).

## Armadilhas

- **Teste de notificação conta assinante, não estado**: `NotificationCounter` (`client/test/support/notification-counter.ts`) assina a store e conta; `toEqual` no estado passa mesmo com notificação à toa.
- **Contar render com `<Profiler>`** (`RenderCounter`, `client/test/support/render-counter.ts`): zere o contador depois do `render` inicial e conte só o que o evento provoca.
