# Client · barra de título do app desktop

Hub: [`../client.md`](../client.md). A casca (janela sem moldura, capability remota, marca no UA, splash): [`../desktop.md`](../desktop.md). Plano de origem: `docs/plans/2026-10-26-tela-barra-de-titulo.md`; mockup: `docs/pages/barra-de-titulo/TitleBar.dc.html` (base, não lei).

Na casca nova a janela não tem moldura e o client desenha a barra do topo. No navegador, e numa casca antiga (sem a marca ` LorkariumTitleBar/1` no UA), nada muda: `desktopWindow` é `null` e nenhuma barra nem IPC existe.

## Peças (`src/app/title-bar/`)

- `src/services/desktop-window.ts` — porta `DesktopWindow` (`minimize`, `toggleMaximize`, `close`, `isMaximized`, `onMaximizedChange(listener)` → promessa do `unsubscribe`) e `TauriDesktopWindow`, o único lugar do `@tauri-apps/api` no client: carrega `@tauri-apps/api/window` por `import()` na primeira chamada (fora da casca o pacote nunca baixa). Recusa do IPC → `DesktopWindowError` com o comando e o motivo; quem chama decide. O `onMaximizedChange` escuta o `onResized` e pergunta `isMaximized` a cada resize.
- `window-title-bar.tsx` — `WindowTitleBar({ desktopWindow, place, slotRef?, occupied? })`: `header` "Barra da janela" (`data-title-bar`, `data-app-region="drag"`, `data-variant` `place` | `room`, `data-focused`), logo (`BrandMark` ícone de 24 px num `Link` "Ir para Suas mesas" de 56 px, a largura do trilho recolhido), "LORKARIUM / <lugar>" (só "LORKARIUM" sem lugar), o slot, a área de arrastar (`min-w-12 flex-1`, sempre sobra onde pegar) e os controles. Altura 38 px; com o slot ocupado, 44 px. Escreve `--title-bar-height` no `<html>` enquanto montada.
- `window-controls.tsx` — `WindowControls`: Minimizar, Maximizar ↔ Restaurar (o ícone troca) e Fechar, 46 px × altura da barra, ícones de 10 px com traço de 1 px, `tabIndex={-1}` (fora do Tab, como os nativos: o teclado tem Alt+Espaço, Alt+F4, Win+setas) e `no-drag`. Hover: `accent`; o Fechar, `destructive`. Dica (tooltip) de cada um; a do maximizar cita Win+Z (os layouts de encaixe no hover ficaram fora). Falha do IPC é engolida: a barra segue e o botão continua clicável.
- `use-window-state.ts` — `useWindowMaximized(desktopWindow)` (pergunta uma vez e segue os resizes; um resize que chega antes da resposta inicial vence) e `useWindowFocused()` (eventos `focus`/`blur` da `window`, sem IPC): sem foco, a barra apaga (`group-data-[focused=false]`).
- `title-bar-place.ts` — `placeOf(useMatches())`: o `handle.place` da rota mais funda que tem um; `handle` de outra forma (o `COMPACT_RAIL_HANDLE`) é ignorado, e os dois convivem no mesmo objeto (`{ ...COMPACT_RAIL_HANDLE, place: 'Mesa' }`).
- `title-bar-frame.tsx` — `TitleBarFrame({ desktopWindow, place, children })`: sem janela, só os filhos; com ela, `flex h-svh flex-col` com a barra em cima e o resto num `relative min-h-0 flex-1 overflow-auto` (a página rola embaixo da barra), dentro do `TitleBarSlotContext`.
- `title-bar-slot.ts` — `useTitleBarSlotState()` (no frame: o elemento do slot e se está ocupado) e `useTitleBarSlot(wanted)` (na página: o elemento para o `createPortal` enquanto `wanted`, e marca o slot ocupado; `null` no navegador).

## Montagem

- O `RootRoute`, o `HydrateFallback` (splash do boot) e o `ErrorBoundary` da raiz (`rootErrorScreen`) envolvem o conteúdo no `TitleBarFrame`; a splash e o erro vão sem lugar.
- Lugares (`handle.place`, no `router.tsx` por `place()`/`withPlace()`, e nas rotas da mesa): Entrar, Confirmar e-mail, Recuperar conta, Convite, Nova senha, Backoffice, Suas mesas (home e detalhe), Explorar mesas, Minha conta, Mesa, Configurações da mesa, Condições da mesa.
- `index.css`: `--title-bar-height` (0 no `:root`), os utilitários `h-app`/`min-h-app` (`calc(100svh - var(--title-bar-height))`, no lugar dos `h-svh`/`min-h-svh` das páginas, do shell e do trilho) e as regras `[data-app-region='drag' | 'no-drag']` (`app-region` + `-webkit-app-region`). No WebView2 o wry liga o `IsNonClientRegionSupportEnabled`: o `app-region: drag` vira barra de título de verdade (arrastar, duplo clique maximiza, menu do sistema no botão direito, encaixe nas bordas).
- Diálogos (`dialog`, `sheet`, `alert-dialog`): o véu começa em `top-(--title-bar-height)` e o conteúdo centra abaixo da barra; o `onPointerDownOutside` passa por `keepOpenOnTitleBar` (`src/lib/title-bar-target.ts`): clique dentro de `[data-title-bar]` não fecha o diálogo. O `NavigationProgress` e o aviso do `app-update` descem para baixo da barra.
- O trilho perde a `RailBrand` no app (`AppShell` `brandInTitleBar` → `AppRail` `showBrand={false}`).
- **Sala** (forma da mesa): o `RoomHeader` (`inTitleBar = !covered`, vindo do `tableRoute` pela `PlayRoomPage`) faz `createPortal` do "Topo da sala" para o slot; os interativos (online, abas de grid, grupo da direita) são `no-drag`; o espaço vazio arrasta. Na barra: nome, online e abas à esquerda; o código (mestre, `lg+`) **centrado** na barra (`absolute`, relativo ao `header`), com o copiar só no ícone (`CopyCodeButton iconOnly`: nome e dica "Copiar código", o "Copiado" só lido); Biblioteca, Condições, Configurações, painel e "Sair da mesa" à direita, colados nos controles (a área de arrastar do frame encolhe para 12 px, o mesmo respiro entre os botões, e o meio vazio do topo é que arrasta). A aba de grid mede 44 px dentro da barra (`[[data-title-bar]_&]:h-11`) e o nome e o "Grupo" alinham pela linha de base. Com "Configurações" ou "Condições" cobrindo a sala, o slot solta e a barra volta a 38 px com o lugar. No modo foco o topo some e a barra fica em "LORKARIUM / Mesa". No navegador o topo de 48 px segue na sala.
- O canvas dos dados 3D (`position: fixed; inset: 0`, sem ponteiro) continua cobrindo a janela inteira: os dados podem passar por cima da barra (de propósito; o tamanho do arremesso segue o `innerWidth/innerHeight`).

## Testes

- `client/test/lib/desktop-shell.spec.ts`, `client/test/services/desktop-window.spec.ts` (`mockIPC` + `mockWindows('main')` de `@tauri-apps/api/mocks`, `emit('tauri://resize')`).
- `client/test/app/title-bar/`: `title-bar-place.spec.ts`, `window-title-bar.spec.tsx` (componente isolado), `title-bar-routes.spec.tsx` (router inteiro: lugar por rota, splash, erro, navegador sem barra, diálogo aberto, trilho sem marca) e `title-bar-slot.spec.tsx` (sala na barra, página coberta, sair, espectador, jogador).
- `DesktopWindowFake` (`calls`, `resize(maximizado)`, `new DesktopWindowFake(true)` recusa tudo); `testDependencies()` traz `desktopWindow: null` e o spec liga com `{ ...deps, desktopWindow: new DesktopWindowFake() }`. `AuthApiFake.crashMe()` faz o "quem sou eu" lançar (tela de erro da raiz).

## Armadilhas

- **Radix modal × barra.** O Radix põe `pointer-events: none` no `body` com um modal aberto; a barra leva `style={{ pointerEvents: 'auto' }}` **inline** (a classe do Tailwind não existe no jsdom, e o `user-event` recusa o clique). O `DismissableLayer` fecharia o diálogo no `pointerdown` da barra: por isso o `keepOpenOnTitleBar`. O `hideOthers` deixa a barra `aria-hidden` enquanto o modal está aberto: no spec, `getByRole(..., { hidden: true })`.
- O valor do contexto do slot é `useMemo` por elemento: um objeto novo a cada render faria o efeito da página soltar e ocupar o slot em laço.
- Tudo que tem menu ou clique na barra precisa ser `no-drag`: numa área `drag` o botão direito abre o menu do sistema e o clique não chega ao DOM.
