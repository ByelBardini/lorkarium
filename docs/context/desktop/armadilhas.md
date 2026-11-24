# Desktop — armadilhas

Detalhe de [`../desktop.md`](../desktop.md).

- **Download do updater sem prazo prende a splash**: o reqwest não tem prazo por padrão, e uma conexão parada (sem cair) deixava "Baixando atualização" para sempre — o player só saía reinstalando pelo site. Por isso o `read_timeout` (prazo por leitura, não total: rede lenta que segue recebendo nunca é cortada). O `configure_client` recebe o `reqwest::ClientBuilder` do plugin: subir o reqwest de um lado só quebra a compilação.

- **Lorkarium instalado aberto barra o `pnpm desktop:dev`**: mesmo identificador, então o `single-instance` foca o instalado (até escondido na bandeja) e o dev sai com código 0 logo depois do `Running`. Encerrar o instalado (bandeja → Sair) antes.

- **Escondido na bandeja o site continua vivo**: o Socket.IO segue ligado e a presença na mesa não cai (a aba do navegador minimizada faz o mesmo). Quem quiser sair da mesa usa o "Sair" da bandeja.

- **Comparar origem por prefixo de texto** deixa `app.lorkarium.com.br.evil.com` e `evil.com/?r=https://app.lorkarium.com.br` entrarem. A regra é `Url::origin()` (esquema, host **e porta**), em `AppOrigin::contains`.
- **`dragDropEnabled` precisa ficar `false`**: com o padrão `true`, o Tauri intercepta o arraste no Windows e soltar imagem no `ImagePicker`/avatar para de funcionar.
- **O repo não pode publicar outra release marcada como "latest"** que não seja do desktop: o `releases/latest/download/latest.json` passaria a apontar para ela e o updater de todo mundo quebraria (cai no "sem update", sem erro visível).
- A splash precisa **escutar antes** de pedir o início (`begin_startup` vem da splash, não do `on_page_load`): o `listen` é assíncrono e o primeiro evento se perderia.
- **`conventional-changelog-conventionalcommits` fica no 9**: o 10 exige o `conventional-changelog-writer` 9, e o `@semantic-release/release-notes-generator` 14 ainda traz o 8; as notas quebram com "Missing helper". O PR major do Dependabot só entra junto com um notes-generator que use o writer 9 (o spec das notas em `desktop/test/release/` acusa).
- **`CARGO_PKG_VERSION` não é a versão do app**: o release carimba só o `desktop/package.json` (que o `tauri.conf.json` lê); o `Cargo.toml` fica no 0.1.0. O user-agent usava o do Cargo, e todo relato vinha com "Lorkarium 0.1.0". A versão é a do `package_info()`.
- **Release ficou em rascunho** (o `build` falhou): "Re-run failed jobs". Nunca apagar a tag `desktop-v*` à mão sem apagar o rascunho junto, senão o próximo semantic-release refaz a mesma versão.
- O UA é trocado pelo COM depois da splash; quem lê o sufixo é o site (a próxima navegação), nunca a splash.
- **`OPERATION_CANCELED` nunca volta à splash**: a própria guarda de navegação (`OpenExternal`/`Block`) cancela no `NavigationStarting`, e o WebView2 completa com `IsSuccess = false` e o `Source` ainda na origem do app. Tratado como erro, todo link externo jogaria a janela na splash "Sem conexão": o `load_failure_of` olha o cancelado antes de tudo.
- **4xx não é falha de carga**: o WebView2 dá `IsSuccess = false` em 4xx e 5xx; só ≥ 500 e "sem resposta" (`HttpStatusCode` 0) voltam à splash.
- **Casca sem moldura só depois do client**: casca nova + client antigo = janela sem barra nenhuma. O `decorations: false` só entra na `main` com o client que lê `LorkariumTitleBar/1` já no ar.
- **Release publicada sem arquivos (1.6.2):** a listagem `GET /releases` ainda não trazia o rascunho recém-criado, o `release-id` saiu vazio e a `tauri-action` registrou "No releaseId or tagName provided, skipping all uploads" sem falhar; o `--latest` publicou a release vazia e a landing caiu no fallback ("Não foi possível consultar a versão mais recente"). Agora o id é buscado com novas tentativas e a publicação exige os três arquivos. Se acontecer de novo: `gh release view desktop-v<v> --json assets` vazio confirma; `gh release edit desktop-v<anterior> --latest` devolve o download na hora; para refazer a versão, apagar a release vazia **e** a tag `desktop-v<v>` e disparar o workflow (o semantic-release recria a mesma versão). "Re-run failed jobs" não serve: o `build` reaproveita o `release-id` vazio do `version`.
