# Desktop — instalador (NSIS próprio)

Índice: [`../desktop.md`](../desktop.md). Template, hooks e arte em `desktop/src-tauri/nsis/`.

Um clique, janela escura de 520×420 em escala, logo fixo no topo (`hero-<escala>.bmp` pelo DPI), sem os botões do assistente e com a barra de título escura (DWM). Instalador: tela única → barra → "Tudo pronto.". Pasta sempre a padrão; versão instalada é atualizada no lugar, sem desinstalar antes (como o updater). O botão segue a comparação com o registro: Instalar, Atualizar, Reinstalar, "Instalar mesmo assim" (downgrade, permitido pelo padrão `allowDowngrades: true`; com `false` vira "Fechar"). No `passive` (updater) as telas pulam e só a barra aparece. Desinstalador: confirmação → barra → despedida. Só `nsDialogs` e `System::Call`, sem plugin de skin.

- O "botão" é um `STATIC` com `SS_NOTIFY` (Win32 não pinta botão sem owner-draw); o Enter segue pelo Next escondido. Funções do desinstalador levam `un.`: `LK_CHROME_FUNCTIONS UN` é inserido uma vez por lado.
- Atalho da área de trabalho e o auto-avanço do desinstalador entram pelos hooks (`NSIS_HOOK_POSTINSTALL` / `NSIS_HOOK_POSTUNINSTALL`), não pela cópia do template. O ícone do desinstalador é o `installerIcon`, definido em `LK_PAGE_HOME` (o MUI fixa o ícone já na primeira página).
- "Apagar também os dados" (desmarcado por padrão; nunca no `/S`) apaga `%APPDATA%` e `%LOCALAPPDATA%\app.lorkarium.desktop` (o perfil do WebView2, com o cookie de login) e as chaves do registro. As mesas ficam no server.
- **Atualizar o `@tauri-apps/cli`**: o `desktop/test/installer/nsis-template.spec.ts` falha de propósito (o cabeçalho cita `tauri-cli-v<versão>`), inclusive no PR do grupo minor/patch do Dependabot, que vem vermelho. Baixar o `installer.nsi` da tag nova, comparar com a cópia fora dos trechos `Lorkarium:`, portar o que mudou e trocar a versão no cabeçalho. O spec também confere os marcadores do updater, as macros `LK_*` e o BOM dos `.nsh`.
- Testar: em `desktop/`, `LORKARIUM_APP_URL=https://… pnpm tauri build --config '{"bundle":{"createUpdaterArtifacts":false}}'` (sem as chaves do updater; ou o `makensis` direto, ver Armadilhas), rodar o setup, e para o updater `<setup>.exe /P /UPDATE`. Silencioso: `/S` no setup e no `uninstall.exe`.

## Armadilhas

- **Build de teste do instalador se atualiza sozinho**: com versão 0.x, ao abrir o app instalado o updater acha a release publicada e reinstala por cima (passive). Testar as telas sem abrir o app, ou carimbar a versão. Para iterar no NSIS sem recompilar o Rust: editar `nsis/*.nsh` e rodar o `makensis` do Tauri (`%LOCALAPPDATA%\tauri\NSIS\Bin\makensis.exe -INPUTCHARSET UTF8`) no `target/release/nsis/x64/installer.nsi` gerado, que inclui os `.nsh` por caminho absoluto.
- **NSIS e cor de texto**: `SetCtlColors` não pega no status do instfiles (1006) nem no texto de checkbox com tema (fica preto no fundo escuro); por isso a linha de status e o rótulo do atalho são controles nossos. Os `.nsh` com acento ficam em UTF-8 **com BOM**.
