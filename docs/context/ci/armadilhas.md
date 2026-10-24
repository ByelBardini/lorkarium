# CI — Armadilhas

Pegadinhas dos testes por camada, da cobertura, do build e do e2e. Hub: [`../ci.md`](../ci.md).

- Tirar o `ws: true` do proxy do Vite **não** derruba o e2e de presença: o `socket.io-client` começa em long-polling HTTP, que passa pelo proxy comum, e só depois tenta o upgrade para websocket. O `ws: true` é o que permite o websocket; a prova de que o spec morde é quebrar a conversa (outro `path` no transporte do client), que deixa o painel sem participantes.

- No e2e, o "Entrar na mesa" do modal de detalhe tem homônimo na faixa "Continuar" da home (que aparece para quem já entrou numa mesa, como a Bia do seed depois da primeira rodada). Um `getByRole('button', { name: 'Entrar na mesa' })` solto pode resolver o da faixa antes de o modal abrir, e o clique fica interceptado pelo modal até o timeout. Escope ao diálogo: `page.getByRole('dialog').getByRole('button', …)`.
- `--coverage.include` é relativo à **pasta de cada projeto**, não à raiz: `src/**` funciona; `server/src/**` ou `packages/*/src/**` dão `Unknown% (0/0)` sem erro nenhum.
- Com algum teste vermelho o Vitest não imprime a cobertura; o relatório só sai com a suíte verde.
- `tsdown` sem `--config-loader tsx` quer o pacote `unrun` para ler o `tsdown.config.ts` (o Node 22.17 não remove tipos sozinho). O script `build` já passa a flag.
- Contexto aberto por `browser.newContext()` não é fechado pelo Playwright: com um worker (CI), as páginas dos specs anteriores seguem com socket e PixiJS ligados e deixam os seguintes lentos e intermitentes. Página de jogador nova é sempre pelo `newPlayerPage()`.
- O login aceita 5 tentativas por minuto por IP + e-mail: logar o admin pelo formulário em todo spec estoura o limite ("Muitas tentativas"). Por isso o `signIn` reaproveita o cookie.
- Local: o `reuseExistingServer` do client reaproveita **qualquer** Vite na 5173, inclusive o de um `pnpm dev` travado (aceita conexão e não responde): o e2e fica parado sem erro. Confira com `curl -m 5 http://localhost:5173`; se travou, pare o `pnpm dev` ou rode com uma config temporária que sobe o client em outra porta (`vite --port 5174 --strictPort` e o `baseURL` igual).
- No e2e, o mestre só acha o jogador em "Quem controla" do diálogo do token depois que ele entrou na mesa (o botão é de membro): o `joinByCodeAndEnter` do jogador vem antes do `createTokenFor` / `chooseController`, senão o clique espera o botão até o timeout.
- A linha de status do tabuleiro vazia é `hidden` (`empty:hidden`) e sai da árvore de acessibilidade: `getByRole('status', { name: 'Status do tabuleiro' })` não a acha e um `not.toContainText` sobre ela falha por "element(s) not found". Para provar que nada foi anunciado a quem não fez nada, procure o texto na página (`page.getByText(/marcou um ponto/)` com `toHaveCount(0)`).
