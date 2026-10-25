# Desktop

**Lorkarium para Windows**: uma casca Tauri 2 (workspace `desktop/`, `@lorkarium/desktop`) que abre uma janela própria, passa por uma splash local empacotada e **navega para o site publicado** (`LORKARIUM_APP_URL`). O client que roda na janela é o mesmo do navegador, servido pelo mesmo server; o navegador continua funcionando. Spec §12 "Aplicativo desktop".

## Por que casca remota (e não o front empacotado)

- **Mesma origem do navegador**: o cookie `lk_session` (`SameSite=Lax`), o handshake do Socket.IO (`Origin` == `Host`, ver [`server.md`](server.md)) e as imagens do WebGL servidas pela origem ([`assets.md`](assets.md)) seguem sem mudança. Um front em `http://tauri.localhost` seria outra origem: o cookie Lax não iria e `SameSite=None` exige `Secure`.
- Cada deploy do front chega ao app na hora; o updater só troca a casca (raro). Não existe "app velho contra server novo".
- Custo aceito: sem rede nada abre (a splash mostra "Sem conexão"), e a página remota **não tem IPC** — recurso nativo novo exige liberar a origem numa capability.

## Estrutura

```
desktop/
  package.json            # config do semantic-release (chave "release"); o "version" só vale no dev (o release carimba o da tag)
  release/                # plugin do semantic-release que só conta commits em desktop/ (ver Lançar uma versão)
  index.html, src/        # splash: TypeScript puro + Vite (porta 1420), sem React
  test/                   # Vitest (projeto @lorkarium/desktop), fakes em test/support/
  src-tauri/
    build.rs              # valida LORKARIUM_APP_URL com o próprio app_origin.rs (#[path]) e gera as permissões dos comandos
    tauri.conf.json       # janela "main" (create: false), NSIS, updater
    capabilities/splash.json
    icons/                # gerados de client/public/favicon.svg (só os do Windows)
    src/
      lib.rs              # run(): plugins, comandos, setup da janela
      app_origin.rs       # AppOrigin::parse(url, BuildProfile) e contains(url)
      navigation.rs       # navigation_decision / new_window_decision (puras)
      main_window.rs      # cria a janela pelo config, liga on_navigation/on_new_window, X esconde (hide_on_close), focus()
      webview2.rs         # desktop_user_agent, clipboard_read_permission (puras) + harden() (COM, #[cfg(windows)])
      startup.rs          # run_startup / check_connection sobre UpdateSource, PendingUpdate, HealthProbe (traits)
      startup_commands.rs # comandos begin_startup / retry_connection + bordas reais (updater, GET /api/health)
      tray.rs             # ícone na bandeja: tray_menu_action / tray_click_action (puras) + install()
```

Splash (`desktop/src/`): `shell-events.ts` (`readShellEvent`: Zod do payload vindo do Rust), `splash-state.ts` (`splashViewOf(previous, event)`), `splash-render.ts` (desenha no DOM do `index.html`), `splash-controller.ts` (`startSplash`: escuta antes de pedir o início), `shell-bridge.ts` (`ShellBridge` + `TauriShellBridge`, o único lugar com `@tauri-apps/api`), `splash.css` (tokens copiados de `client/src/index.css`; outro workspace, sem CSS compartilhado).

## `LORKARIUM_APP_URL` e `AppOrigin`

- Lida **em tempo de compilação**: o `build.rs` valida e reexporta por `cargo:rustc-env`; o `lib.rs` lê com `env!`. Sem valor no debug → `http://localhost:5173` (o Vite do client, com o proxy `/api`).
- `AppOrigin::parse` aceita só `http(s)://host[:porta]` (barra final tolerada); recusa caminho, query, fragmento, usuário, `file:` e vazio, citando o valor. **Release exige https**: o `build.rs` faz `panic!` com URL ausente ou sem https, então um instalador nunca sai apontando para http.
- No CI de release vem da _variável_ do repositório `LORKARIUM_APP_URL` (não é segredo).

## Navegação presa à origem

| Para onde                                                           | `navigation_decision` | `new_window_decision` (`window.open`, `target=_blank`) |
| ------------------------------------------------------------------- | --------------------- | ------------------------------------------------------ |
| mesma origem do app (esquema + host + porta; `blob:` do app também) | `Stay`                | `OpenExternal` (o site abre no navegador)              |
| a splash (`http://tauri.localhost/`; no dev, o `devUrl` 1420)       | `Stay`                | `Block`                                                |
| outro `https`/`http`/`mailto:`                                      | `OpenExternal`        | `OpenExternal`                                         |
| `javascript:`, `file:`, `data:`, `about:` e o resto                 | `Block`               | `Block`                                                |

`OpenExternal` abre no app padrão do Windows pelo `tauri-plugin-opener` e cancela a navegação. Nova janela é sempre `NewWindowResponse::Deny`: nunca existe uma segunda janela Tauri. O crédito do desenvolvedor (`developer-credit.tsx`) cai no `OpenExternal`.

## Cara de app (WebView2)

`webview2::harden` (via `with_webview` → `ICoreWebView2Settings*`), logo depois de criar a janela e antes de o site carregar:

- `AreDefaultContextMenusEnabled(false)`: botão direito não mostra o menu do navegador. Os menus do Radix (token, cena) seguem, porque são JS. Nos campos de texto o client desenha o menu dele ([`client/text-field-menu.md`](client/text-field-menu.md)).
- `AreBrowserAcceleratorKeysEnabled(false)`: F5/Ctrl+R, Ctrl+P, Ctrl+F/F3, F12, Ctrl+Shift+I, zoom por teclado. **Ctrl+C/V/X/Z/A seguem vivos de propósito** (não são aceleradores de navegador): desfazer dos desenhos e edição de texto dependem deles.
- `zoomHotkeysEnabled: false` no config desliga `IsZoomControlEnabled` e a pinça (o wry usa o mesmo valor): Ctrl+roda dá zoom no tabuleiro, nunca na página.
- User-agent **acrescido** de ` LorkariumDesktop/<versão>` (`desktop_user_agent`, sem duplicar). Nunca substituir: PixiJS e libs leem `Chrome/`/`Edg/`. O server reconhece o sufixo ("Lorkarium para Windows" em Sessões ativas, ver [`account-security.md`](account-security.md)) e o client também (`isDesktopShell`, `client/src/lib/desktop-shell.ts`).
- `PermissionRequested`: `CLIPBOARD_READ` concedida **só** para a origem do app (`clipboard_read_permission`); o resto fica no padrão (pedido do navegador). É o que deixa o "Colar" do menu dos campos usar `navigator.clipboard.readText` sem pedido. Recusada, o `readText` do client devolve `null` e o "Colar" não faz nada.
- **Bandeja do Windows** (`tray.rs`, feature `tray-icon` do crate `tauri`): o X da janela (`CloseRequested`) só **esconde** a janela (`prevent_close` + `hide`); o app segue rodando ao lado do relógio. Clique esquerdo no ícone → volta a janela; botão direito → menu "Abrir o Lorkarium" / "Sair". Só o "Sair" encerra (`app.exit(0)`; o `window-state` grava no `Exit`).
- Plugins: `single-instance` (segunda abertura, inclusive com a janela escondida na bandeja, mostra e foca a mesma janela: `main_window::focus` faz `unminimize` + `show` + `set_focus`; nunca sobe outro processo) e `window-state` (tamanho, posição, maximizado). Devtools só no debug (padrão do Tauri).

## Abertura (splash)

```
splash carrega → escuta "startup" → invoke begin_startup (uma vez; recarga não refaz)
  checking-update ─┬─ update achado → downloading{downloaded,total} … → installing → restart
                   └─ sem update | erro | passou de 8 s ─→ connecting → GET <origem>/api/health (5 s)
                                                              ├─ 2xx  → navega para a origem
                                                              ├─ outro status → server-unavailable ("em manutenção") ┐
                                                              └─ erro de rede → offline ("Sem conexão")             ┴→ "Tentar de novo" → retry_connection → connecting …
```

- Eventos casca → splash: `StartupEvent` (`startup.rs`, serde `tag = "kind"`, kebab-case) no evento `startup`; a splash valida com `readShellEvent` e evento ilegível **mantém a tela** (casca × splash de versões diferentes).
- **A checagem tem prazo e nunca bloqueia**: atualização falha, demora ou baixa pela metade → segue para o health (`update_problem` vai para o stderr). Só a checagem tem prazo; download começado vai até o fim.
- Progresso é emitido a cada 256 KiB (`PROGRESS_STEP`), não por chunk de rede. `total` nulo (sem `Content-Length`) → barra indeterminada; `downloaded > total` → 100.
- **Por que o health é pelo Rust**: o `fetch` da splash seria de outra origem (`tauri.localhost`) e não leria o 503 sem CORS. O cliente HTTP é `reqwest` sem provedor TLS próprio (usa o `ring` do updater; evita compilar `aws-lc`).
- `tauri::is_dev()` pula o updater (o dev não tem release para comparar).

## Segurança (IPC)

- Só a `capabilities/splash.json` existe: janela `main`, `local: true`, `core:event:allow-listen/unlisten`, `allow-begin-startup`, `allow-retry-connection`. As permissões dos comandos vêm do `AppManifest` no `build.rs` — comando novo precisa entrar lá **e** na capability.
- O site remoto não casa com nenhuma capability: `invoke` dele é recusado ("not allowed … allowed on: URL: local").

## Testes

- Rust: `#[cfg(test)] mod tests` dentro de cada módulo puro (`app_origin`, `navigation`, `webview2`, `startup`, `tray`). O `startup` roda sobre fakes nomeados (`UpdateSourceFake` com `UpToDate`/`Fails`/`Hangs`/`Offers`, `UpdateFake`, `HealthProbeFake::answering([...])`) e `tauri::async_runtime::block_on`; o prazo da checagem entra por parâmetro (50 ms no teste). Borda (COM, updater, HTTP, janela) não tem teste: fica fina de propósito.
- Splash: `desktop/test/*.spec.ts`. `ShellBridgeFake` (`calls`, `emit(payload)`) e `loadSplashDocument()` (o `index.html` real no jsdom, `// @vitest-environment jsdom` por arquivo) em `test/support/`; o `shell-bridge.spec.ts` usa o `mockIPC(…, { shouldMockEvents: true })` do `@tauri-apps/api/mocks` para provar os nomes de comando e do evento.

## Comandos

- `pnpm desktop:dev` — com o `pnpm dev` de pé: `tauri dev` sobe a splash (1420), compila o Rust e abre a janela apontando para `localhost:5173`.
- `pnpm desktop:build` — instalador NSIS em `desktop/src-tauri/target/release/bundle/nsis/` (exige `LORKARIUM_APP_URL` https e as chaves de assinatura do updater).
- `cargo test` / `cargo clippy --all-targets -- -D warnings` / `cargo fmt --check` em `desktop/src-tauri` (o job `desktop` do CI, ver [`ci.md`](ci.md)). Splash: `pnpm exec vitest run --project @lorkarium/desktop`.
- Inspecionar a janela de fora: `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9333 pnpm desktop:dev` e `http://localhost:9333/json` (URL atual, CDP para `navigator.userAgent`).
- Pré-requisitos: Rust estável ≥ 1.90 (`rustup`; `cargo` em `~/.cargo/bin`) e o MSVC Build Tools (C++). WebView2 já vem no Windows 10/11.

## Lançar uma versão

1. Uma vez: `pnpm --filter @lorkarium/desktop tauri signer generate -w ~/.tauri/lorkarium.key`. A chave pública vai em `plugins.updater.pubkey` do `tauri.conf.json` (enquanto for o marcador `SUBSTITUA_PELA_CHAVE_PUBLICA…`, o workflow de release recusa rodar). A privada e a senha viram os segredos `TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`; guardar cópia **offline** — perdê-la impede atualizar quem já instalou. `.env` não serve: o Tauri lê do ambiente do build.
2. **Automático, por versão semântica:** todo push na `main` que mexe em `desktop/**` (ou no próprio workflow) dispara `.github/workflows/desktop-release.yml` (`concurrency` única, sem cancelar; `workflow_dispatch` para rodar à mão). A versão vem dos **commits convencionais que tocaram `desktop/`** desde a última tag `desktop-v*`: `feat` → minor, `fix`/`perf` → patch, `!` ou `BREAKING CHANGE:` → major; `test`, `docs`, `ci`, `chore` (inclusive o Dependabot) e merge commit não geram versão. Commit só no client ou no server não conta: a casca abre o site publicado. A primeira versão é `1.0.0`.
3. Job `version` (`ubuntu-latest`, `fetch-depth: 0`): recusa a chave-marcador e roda `pnpm --filter @lorkarium/desktop release` (semantic-release, config na chave `release` do `desktop/package.json`). Ele empurra a tag `desktop-v<versão>` e cria a release como **rascunho** (`draftRelease`), com as notas em pt-BR (Novidades, Correções, Desempenho). Sem commit relevante, para aí. Job `build` (`windows-latest`): carimba a versão no `desktop/package.json` só no build (sem commit; o `version` de lá só vale no dev), a `tauri-action` sobe `Lorkarium_<v>_x64-setup.exe`, a `.sig` e o `latest.json` (`updaterJsonPreferNsis`) no rascunho pelo `releaseId`, e o `gh release edit --draft=false --latest` publica. Build que falhar: "Re-run failed jobs" refaz só o `build` sobre o mesmo rascunho.
   O filtro por pasta é o plugin local `desktop/release/desktop-commits.ts` (o semantic-release não filtra por caminho; o `semantic-release-monorepo` está parado desde 2024): `keepDesktopCommits` fica só com os commits cujo `git diff-tree` tem caminho sob `desktop/` e repassa ao `@semantic-release/commit-analyzer` e ao `release-notes-generator` com o preset `conventionalcommits`. O Node carrega o `.ts` direto (só tira os tipos), por isso o `tsconfig` do desktop liga `erasableSyntaxOnly`. Spec em `desktop/test/release/`, com `CommitFilesFake`. Prévia local: `pnpm exec semantic-release --dry-run --no-ci --branches "$(git branch --show-current)" --plugins ./release/desktop-commits.ts` dentro de `desktop/` (sem o plugin do GitHub, que pede token).
   A landing ([`site.md`](site.md)) lê a release `latest` pela API do GitHub no navegador: o instalador novo aparece nela sem rebuild.
4. O app consulta `https://github.com/ByelBardini/lorkarium/releases/latest/download/latest.json`; achando versão maior, baixa, verifica a assinatura e instala `passive` (barra sem interação); no Windows o instalador fecha e reabre o app.

Sem certificado de código: a 1ª instalação passa pelo SmartScreen ("Executar assim mesmo"); as atualizações seguintes são silenciosas. NSIS por usuário (`installMode: currentUser`, sem admin), em pt-BR.

## Armadilhas

- **Escondido na bandeja o site continua vivo**: o Socket.IO segue ligado e a presença na mesa não cai (a aba do navegador minimizada faz o mesmo). Quem quiser sair da mesa usa o "Sair" da bandeja.

- **Comparar origem por prefixo de texto** deixa `lorkarium.app.evil.com` e `evil.com/?r=https://lorkarium.app` entrarem. A regra é `Url::origin()` (esquema, host **e porta**), em `AppOrigin::contains`.
- **`dragDropEnabled` precisa ficar `false`**: com o padrão `true`, o Tauri intercepta o arraste no Windows e soltar imagem no `ImagePicker`/avatar para de funcionar.
- **O repo não pode publicar outra release marcada como "latest"** que não seja do desktop: o `releases/latest/download/latest.json` passaria a apontar para ela e o updater de todo mundo quebraria (cai no "sem update", sem erro visível).
- A splash precisa **escutar antes** de pedir o início (`begin_startup` vem da splash, não do `on_page_load`): o `listen` é assíncrono e o primeiro evento se perderia.
- **`conventional-changelog-conventionalcommits` fica no 9**: o 10 exige o `conventional-changelog-writer` 9, e o `@semantic-release/release-notes-generator` 14 ainda traz o 8; as notas quebram com "Missing helper". O PR major do Dependabot só entra junto com um notes-generator que use o writer 9 (o spec das notas em `desktop/test/release/` acusa).
- **Release ficou em rascunho** (o `build` falhou): "Re-run failed jobs". Nunca apagar a tag `desktop-v*` à mão sem apagar o rascunho junto, senão o próximo semantic-release refaz a mesma versão.
- O UA é trocado pelo COM depois da splash; quem lê o sufixo é o site (a próxima navegação), nunca a splash.
