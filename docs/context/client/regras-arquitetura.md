# Client · regras de arquitetura

Hub: [`../client.md`](../client.md). Regras que valem para o client inteiro; as de uma área ficam no arquivo dela.

- Componente shadcn novo entra por `pnpm exec shadcn add <nome> -y` (rodado em `client/`) e é ajustado aos tokens do design system no próprio arquivo (raio de 4px, sem sombra nem blur, rótulos em pt-BR).
- Texto de interface em pt-BR; identificadores em inglês.
- Rede só por `src/services/` sobre `HttpTransport`; serviço devolve falha como valor, a tela só traduz o `kind` em mensagem.
- Dados de tela pelo modo data: lista e detalhe por `loader`, mutação por `action` (o router revalida sozinho); envio sem navegação por `useFetcher`. O Zustand fica para sessão, trilho e (depois) tempo real.
- Em dev, o Vite faz proxy de `/api` para `http://localhost:3333` com `ws: true` (o upgrade do Socket.IO em `/api/socket.io`) e sem `changeOrigin` (o server compara `Origin` com `Host`); o `vite preview` herda o mesmo proxy. Em produção é a mesma origem: o **server** entrega o `client/dist` (`CLIENT_DIST_DIR`, ver `server.md`) — `/assets/*` com `immutable` de um ano, o `index.html` e o resto da raiz com `no-cache`, e qualquer outro `GET` fora de `/api` e `/assets` cai no `index.html` (deep link do React Router). Por isso `/api` e `/assets/` são **reservados**: rota do client com esses prefixos nunca abre. Sem CORS e com cookie first-party.
