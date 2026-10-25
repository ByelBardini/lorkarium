# Client · versão nova depois do deploy

O detalhe que saiu do hub [`../client.md`](../client.md). A página aberta descobre que um deploy trocou o client e recarrega quando ninguém perde nada. Existe por causa do app desktop ([`../desktop.md`](../desktop.md)): a casca desliga o F5 e o X só esconde na bandeja, então sem isso a versão nova só valia fechando pelo "Sair" e abrindo de novo. Vale igual no navegador. Nenhuma mudança na casca nem no server.

## Como sabe que mudou

- `src/lib/client-build.ts` — `buildFingerprintOf(página)`: os `src`/`href` sob `/assets/` do `<script type="module">` de entrada e dos `<link rel="stylesheet">`, ordenados e juntos. O Rolldown põe no hash da entrada tudo o que ela importa (inclusive os nomes com hash dos chunks preguiçosos), então qualquer mudança no client move a impressão; deploy só de server a mantém. `''` no Vite de dev (`/src/main.tsx`): nunca fica velho.
- A impressão da página **em execução** é lida do `document` no `main.tsx`, antes de qualquer rota `lazy`: o Vite acrescenta `<link>` de `/assets/` ao carregar chunk preguiçoso, e lida depois daria diferente da publicada.
- `src/services/published-build.ts` — `PublishedBuild` / `FetchPublishedBuild(fetch)`: `GET /` com `cache: 'no-store'` (o server já manda o `index.html` com `no-cache`, ver [`../server.md`](../server.md)) e a mesma conta no HTML recebido pelo `DOMParser`. Não-2xx ou erro de rede → `null`.
- `src/stores/app-update-store.ts` — `createAppUpdateStore({ running, published })` (Zustand vanilla) e `useAppUpdateStale(store)`. Estado `{ stale, check }`. `check()` não pergunta com `running` vazio nem depois de `stale`; resposta `null` ou `''` não é notícia (o server pode estar no meio do deploy); pedidos simultâneos (foco + visibilidade) dividem a mesma requisição.

## Quando pergunta

- A cada `connected` do `RealtimeTransport` (ligado no `main.tsx`): o deploy reinicia o server e o socket que volta é o primeiro sinal. Só quem tem mesa aberta tem socket.
- A cada `APP_UPDATE_CHECK_MS` (5 min), no `focus` da janela e quando a página volta a ficar visível. Cada pergunta é um `GET /` a mais no registro de acesso ([`../access-log.md`](../access-log.md)); por isso o intervalo é longo.

## O que faz (`src/features/app-update/`)

- `AppUpdateNotice({ appUpdate, reloadPage })`, montado uma vez no `RootRoute` (`router.tsx`), roda o `useAppUpdateWatch` e, com `stale`, mostra no topo, por cima de qualquer tela, "Saiu uma versão nova do Lorkarium." + **Recarregar** (`role="status"`).
- `useAppUpdateWatch` recarrega sozinho quando é seguro:
  - página escondida (janela na bandeja, aba em segundo plano) **sem campo de texto focado** (`editableFieldOf(document.activeElement)` do menu dos campos) — inclusive se já estava escondida quando achou;
  - a próxima navegação de rota (a chave do `location` diferente da de quando ficou velho): a recarga cai na rota nova.
- A recarga é `AppDependencies.reloadPage` (`location.reload()` no app). As mesas abertas voltam pelo `sessionStorage` ([`realtime.md`](realtime.md)).

## Testes

- `test/lib/client-build.spec.ts`, `test/services/published-build.spec.ts` (`PageServerFake`), `test/stores/app-update-store.spec.ts` e `test/features/app-update/app-update-notice.spec.tsx` (visibilidade por `defineProperty` no `document`, intervalo por timers falsos).
- `testDependencies()` traz `publishedBuild` (`PublishedBuildFake`, publicando `TEST_BUILD`) e `pageReloads` (`PageReloadFake`): spec que quer o deploy faz `deps.publishedBuild.publish(outro)` e `check()`.

## Armadilhas

- Rascunho não salvo sem foco (barra de alterações de "Minha conta" ou das configurações da mesa) se perde na recarga com a página escondida. Aceito: o caso comum é a janela na bandeja entre sessões.
- Mudar o `index.html` para carregar a entrada de outro jeito (outro `type`, fora de `/assets/`) zera a impressão em silêncio: o aviso para de aparecer, sem erro.
