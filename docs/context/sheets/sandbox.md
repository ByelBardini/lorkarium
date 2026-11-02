# Fichas — sandbox do client

O iframe onde roda o código do autor da ficha e o SDK que vive dentro dele. Hub: [`../sheets.md`](../sheets.md). A ponte do **host** (validar pelo `sheetFrameMessageDto`, limite de frequência, comandos) fica em [`../client/sheets.md`](../client/sheets.md).

## Arquivos (`client/src/sheet-sandbox/`)

- `sheet-srcdoc.ts` (puro) — `SHEET_CONTENT_SECURITY_POLICY`, `SHEET_BASE_STYLE`, `SheetSource { html, css, js }`, `buildSheetSrcdoc(source): string`, `authorScriptStartOf(source)` e `authorScriptPositionOf(source, positions)` (posição do `srcdoc` → linha/coluna do arquivo JS do editor, ou `null`). Importa o bootstrap por caminho **relativo**, nunca `@/`: o e2e importa este arquivo de fora do client.
- `sheet-bridge-bootstrap.ts` (puro) — `SHEET_BRIDGE_BOOTSTRAP` (o texto do script), `SHEET_PORT_HANDOFF` (`'lorkarium:port'`) e os tipos `LorkariumSdk`, `SheetSdkPort`, `SheetFrameScope`, `SheetFrameMessageEvent`, `SheetBarChange`, `SheetDiceRequest`. Tipos estruturais, sem DOM, para o `tsc` do e2e (só tipos do Node).
- `sheet-frame.tsx` — `SheetFrame({ srcdoc, title, onConnect(port), onReloaded(), createChannel? })` e `SheetChannel`.

## Flags do iframe

`<iframe sandbox="allow-scripts" allow="" referrerpolicy="no-referrer" srcdoc=…>`, sem `src`.

- **Sem `allow-same-origin`:** a origem é opaca (`null`); o frame não lê o pai nem o cookie/storage do app. Somar `allow-same-origin` a `allow-scripts` anula o sandbox (o frame tira o próprio atributo). Nunca acrescentar.
- Sem `allow-popups`, `allow-forms`, `allow-top-navigation*`, `allow-modals`: `window.open` devolve `null`, `form.submit()` não sai, `top.location = …` lança.
- `allow=""`: nenhuma permissão (câmera, microfone, tela cheia, clipboard…).
- O `srcdoc` é lido **uma vez** (`useState`): trocar a prop não recarrega o frame (recarregar pareceria o 2º `load`). Código novo = `key` novo.

## CSP (primeiro `<meta>` do `srcdoc`)

```
default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; form-action 'none'; base-uri 'none'
```

Sem rede nenhuma: `fetch`, imagem, fonte, `<link>` e `import()` externos são bloqueados antes de sair. Imagem e fonte só por `data:`/`blob:` (a do token chega em bytes pelo `state`, B6). O CSP do `srcdoc` **não** cobre a navegação do próprio frame (o `navigate-to` saiu da especificação): quem a barra é o `frame-src 'self'` do **pai**, um `<meta>` no `client/index.html` — o CSP3 confere o `frame-src` do documento que embute em toda navegação do iframe, inclusive a que o próprio frame pede. O `srcdoc` continua permitido. O 2º `load` (a navegação recusada carrega a página de erro) ainda destrói o frame e mostra "Ficha recarregada".

## Ordem do `srcdoc`

`<!doctype html><html><head><meta charset="utf-8">` → `<meta http-equiv="Content-Security-Policy" …>` → `<script>` bootstrap → `<style>` `SHEET_BASE_STYLE` → `<style>` CSS do autor → `</head><body>` HTML do autor → `<script>` JS do autor → `</body></html>`.

- O bootstrap roda antes de qualquer código do autor; o JS do autor roda depois do HTML (o DOM já existe).
- O JS do autor tem `</script` → `<\/script` e `<!--` → `<\!--` (o `<!--` seguido de `<script` faria o parser pular o fechamento); o CSS tem `</style` → `<\/style`. Dentro de string JS e de CSS o significado é o mesmo. O HTML do autor entra como está (só mexe no próprio documento).
- Um `<meta>` de CSP do autor só **restringe** mais (as políticas se somam).
- **Estilo base** (`SHEET_BASE_STYLE`): `:root { color-scheme: dark; background: #101216; color: #eae5da; font-family: system-ui }`. **Decisão:** no CSS base do `srcdoc`, não no código inicial, porque o bug (texto claro do `.ficha` sobre o branco do frame) atinge qualquer modelo escrito para a sala escura, e um modelo já salvo não muda; o CSS do autor vem depois com o mesmo peso e sobrescreve. O `STARTER_SHEET_SOURCE` não mudou (armadilha do e2e no hub).
- **Linha do erro:** `authorScriptStartOf` mede o que vem antes do JS do autor (linhas e o resto da última); `authorScriptPositionOf` pega a 1ª posição (a do evento, depois a pilha) que cai dentro do JS — na 1ª linha só depois do `<script>` — e a devolve relativa ao arquivo JS. Posição no bootstrap, num `onclick` do HTML ou além do fim do JS → `null` (a linha não aparece).

## Bootstrap e SDK (`window.lorkarium`)

O bootstrap é a função `installLorkariumSdk` serializada por `toString()`: ela não pode citar nada de fora do próprio corpo (o spec roda o texto serializado por `new Function` para provar). Começa por `'use strict'`.

- Pedidos → `Promise<undefined>`: `ready()` ("estou pronta para receber dados": sem ele nenhum `state` chega), `bars.adjust(nomeOuId, change)` (manda `bar` como veio; `change` = `{ op: 'add', amount }` ou `{ op: 'set' | 'max' | 'temp', value }`, a forma do `barChangeDto`), `dice.roll({ expression, label?, visibility? })`, `values.set(changes)`. `onState(listener)` → função que desinscreve, e o ouvinte novo recebe o último `state` na hora.
- Leituras síncronas do último `state`, sem pedido ao host, sempre **cópia JSON** (mudar o devolvido não muda a próxima leitura): `values.get(chave)` (só chave própria: `values.get('toString')` é `undefined`; `undefined` sem a chave ou antes do 1º `state`), `values.all()` (`{}` antes), `bars.list()` (`[]` antes ou sem token) e `bars.get(nomeOuId)` (id exato, senão o rótulo sem caixa/acento/espaço nas pontas; `undefined` sem barra; duas com o nome → **lança** `Error` de `code` `BAR_AMBIGUOUS`). A regra repete a do `resolveSheetBar` do host porque o bootstrap não importa nada; quem vale é a do host.
- Ficha sem token: o `state` chega com `token: null` e `bars: []`.
- Mensagens frame → host (nomes do [`contratos.md`](contratos.md)): `{ type, requestId, … }` com `type` ∈ `ready`, `bars.adjust`, `dice.roll`, `values.set`; `requestId` = contador (`'1'`, `'2'`…). Nunca `tokenId`, `campaignId` nem `sheetId`; o `dice.roll` só leva `expression`, `label` e `visibility`, mesmo que o autor passe mais.
- Host → frame: `state` (o SDK entrega `{ token, bars, values, canEdit }`), `result` (resolve) e `error` (rejeita com `Error` de `code` e `message`). Outro `type`, corpo que não é objeto, `requestId` desconhecido ou já respondido → ignorado. `error` com `requestId: null` não chega ao autor.
- Pedidos feitos antes da porta ficam na fila e saem na ordem quando ela chega.
- Fechado e protegido: `JSON.parse`/`stringify`, `Number.isFinite`, `Object.freeze` e `console.error` são capturados antes do código do autor; o payload sai como **cópia JSON** (mudar o objeto depois não muda o enviado; função, `NaN` e `Infinity` rejeitam com `TypeError` sem enviar nada — o `JSON` puro trocaria `NaN` por `null`, que apaga a chave); `window.lorkarium` é não gravável e não configurável, e o SDK e os sub-objetos estão congelados. Ouvinte de `onState` que lança vai ao `console.error` sem impedir os outros.
- **Console** (`SHEET_CONSOLE_FRAME_LIMITS`: linha até 2000 caracteres, 20 linhas por segundo, 8 posições — os do contrato): o bootstrap troca `console.log/info/warn/error/debug` por um embrulho que **chama o original** e manda `{ type: 'console', level, message, at }`; escuta `error` do `window` (`message`, `lineno`/`colno` e a pilha do `error`) e `unhandledrejection` (`"Uncaught (in promise) " + motivo`; a recusa do SDK não tratada sai como `Error CODE: mensagem`). O texto é seguro: ciclo → `[circular]`, função → `[function nome]`, nó do DOM → `<tag>`, `bigint`/`symbol` em texto, getter que lança → `[unreadable value]`; nada além de string vai ao `postMessage`. Linha longa é cortada com `…`; acima do limite, as linhas da janela viram **um** `console.dropped` com a contagem (janela fixa). As posições saem do `about:srcdoc:L:C` da pilha. O console nunca quebra o código do autor.
- O autor divide o realm com o SDK: pode pegar a porta ele mesmo. Não é falha — a porta só faz o que o SDK faz, e o host/servidor reautorizam (o "gesto do usuário" não é provável; a defesa é o limite de frequência da B6).

## Porta e 2º `load` (`SheetFrame`)

- 1º `load`: cria o `MessageChannel`, manda `{ type: 'lorkarium:port' }` com o `port2` por `contentWindow.postMessage(…, '*', [port2])` (origem opaca não pode ser alvo nomeado) e entrega o `port1` ao pai por `onConnect`. O bootstrap só aceita a primeira entrega, vinda de uma janela **fora do frame** (sobe pelos `parent` até a do topo sem passar pelo próprio frame; nunca o frame nem um filho dele), com o `type` certo e exatamente uma porta. Não é `source === parent`: o `event.source` é quem chamou o `postMessage`, e na janela da ficha é a janela da sala (o portal), não a auxiliar que embute o frame.
- 2º `load` (o código do autor navegou o frame — `location = …`, `<meta refresh>`): fecha as duas pontas, desmonta o iframe e chama `onReloaded()`; o pai mostra "Ficha recarregada" (B7). Nenhuma porta sai depois do 1º `load`. Desmontar também fecha o canal.

## O que está provado

Unit (`client/test/sheet-sandbox/`, fakes em `client/test/support/sheet-frame-fakes.ts`: `SheetPortFake`, `SheetFrameWindowFake`, `HostPortFake`, `SheetChannelsFake`):

- `sheet-srcdoc.spec.ts` — doctype, CSP exata, nada antes do CSP além do charset, bootstrap antes do HTML/JS do autor, JS depois do HTML, CSS num `<style>`, `</script>` (caixa e espaço variados) e `<!--` no JS e `</style>` no CSS não fecham o elemento. Estilo base escuro depois do CSP e antes do CSS do autor; `authorScriptPositionOf` (linha/coluna do JS, 1ª linha descontada, bootstrap/`onclick`/fora do fim → `null`).
- `sheet-bridge-bootstrap.spec.ts` — porta (só do `parent`, só a 1ª, fila antes dela), cada pedido e seus campos (`bars.adjust` com `bar` por id e por nome), leituras do último `state` (`values.get`/`all`, `bars.list`/`get`, cópias, chave herdada, `BAR_AMBIGUOUS`, ficha sem token), casamento por `requestId` fora de ordem, `error` com código, resposta repetida, `NaN`/`Infinity`/função recusados, cópia, `state` e `onState`, mensagens inválidas ignoradas, SDK congelado, `JSON.stringify` trocado pelo autor.
- `sheet-bridge-bootstrap-console.spec.ts` — o original ainda loga, fila antes da porta, texto seguro (ciclo, função, nó, `bigint`, `symbol`, getter que lança), `Error` com código, corte, limites = contrato, posições da pilha, taxa (limite por janela e uma contagem), erro de listener de clique com linha/coluna, evento sem mensagem, recusa do SDK sem `catch`, toda linha válida no DTO.
- `sheet-console.spec.ts` — `consoleEntryOf` (posição só no JS do autor, `console.dropped` em palavras), `appendConsoleEntry` (numeração, 300 linhas, contagem de erros depois do corte) e `createConsoleIntake` (limite do host = 2× o do frame, o recusado volta como um `console.dropped`).
- `sheet-frame.spec.tsx` — atributos, porta no 1º `load`, 2º `load` destrói/fecha/avisa e não entrega porta, `srcdoc` lido uma vez, desmontar fecha.
- Prova de que morde: cada regra acima invertida de propósito deixou o spec vermelho.

**O e2e prova** (`e2e/test/sheet-sandbox.spec.ts`, grupo `sheets`, uma `test` por tentativa; **14/14 verdes** em 2026-10-31 no Chromium do Playwright): numa origem https roteada pelo `page.route` (com cookie e `localStorage` próprios e o mesmo `frame-src 'self'` do `index.html`), o mesmo iframe do `SheetFrame` montado pelo `buildSheetSrcdoc` e um host de teste que imita a porta e o 2º `load`. Controle positivo (o SDK sobe e a porta responde); `parent.document` e `top.location.href` → `SecurityError`; `document.cookie` e `localStorage` → erro ou vazio; `fetch`, `Image`, `<link>` de fonte e `import()` → falham sem pedido chegar à rede; `window.open` → `null` e nenhuma janela; `form.submit()` → não sai e o frame segue no 1º `load`; `top.location = …` → a página fica; `location = …` → "Ficha recarregada", sem o iframe, nada na rede. Controle negativo: **sem** o `frame-src` do pai, o `location = …` chega à rede — é o `<meta>` que protege. O host de teste é cópia do comportamento do `SheetFrame` (o componente em si é provado pelo spec de componente).

- **Import do builder pelo e2e:** relativo, `../../client/src/sheet-sandbox/sheet-srcdoc` — o Playwright transpila o TS de fora do `testDir`, e o `tsc` do e2e confere os dois arquivos (por isso nada de `@/` nem tipo de DOM neles). Conferido com `playwright test --list --project=sheets` (13 testes), sem rodar.
- **"Saiu um pedido" se mede pela rota, não pelo `page.on('request')`.** No Chromium, a carga que o CSP recusa ainda dispara `request` (e depois `requestfailed` com `csp`) sem chegar à rede: a 1ª rodada deu 3 falsos vazamentos (imagem, fonte, `import()`). O spec conta o que chega a um `context.route` (que aborta), e é isso que deve contar em qualquer e2e de ficha.

## Pendente: medição de processo

Decide se o cão de guarda da B7 basta ou se o "modo seguro" (ficha sem script) vira requisito da B7.

1. Uma ficha com `while (true) {}` atrás de um botão (para o frame carregar antes de travar), montada por `buildSheetSrcdoc` numa página do app.
2. **Chrome:** abrir `chrome://process-internals` → "Frame Trees"; conferir se o frame da ficha (origem opaca) está num processo diferente do da página. Clicar o botão e ver se a sala segue respondendo (rolar o mapa, abrir um menu).
3. **Casca desktop (WebView2):** `pnpm desktop:dev` e inspecionar pela porta CDP 9333 (ver `docs/context/desktop.md`); mesmo procedimento, abrindo `chrome://process-internals` (ou `edge://process-internals`) num alvo do DevTools remoto da casca.
4. Registrar aqui: navegador, versão, mesmo processo ou não, e se a sala travou.

## Armadilhas

- **O frame herda o CSP do pai.** O app tem só `frame-src 'self'` (`client/index.html`). Tirá-lo reabre a navegação do frame para fora (vaza o IP de quem olha); um CSP maior no app precisa manter `frame-src 'self'` e permitir o `srcdoc` (`about:srcdoc`), senão toda ficha some sem erro visível; e o CSP do pai se soma ao do `srcdoc` dentro do frame. Servir o app com um cabeçalho CSP no server é o reforço natural (o `<meta>` vale também no `pnpm dev` e na casca).
- **Nunca `allow-same-origin`** junto de `allow-scripts` (ver Flags).
- **O bootstrap não importa nada:** qualquer referência fora de `installLorkariumSdk` (constante do módulo, helper, Zod) quebra só dentro do frame. O spec do bootstrap roda o texto serializado e pega isso.
