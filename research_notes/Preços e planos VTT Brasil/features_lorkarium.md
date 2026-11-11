# Inventário de features do Lorkarium (para decidir plano grátis × planos pagos)

Fonte: só o repositório local (`C:/Users/gabry/Documents/Projetos/lorkarium`, branch `main`, commit `118d037e`, 2026-11-10). Toda citação é um caminho relativo à raiz do repositório. Nenhuma busca na web foi feita.

Legenda de custo de operação (para o operador): **S3** = armazenamento/saída no bucket de assets · **CPU** = processamento no servidor além do trivial · **RT** = banda/fan-out do Socket.IO · **DB** = linhas/volume no Postgres · **MAIL** = e-mail SMTP · **baixo** = só uma linha pequena ou evento efêmero.
Papéis: **dono** (criador da mesa), **co-mestre** (`master`), **jogador** (`player`), **espectador** (`spectator`), **juggernaut** (admin global com modo ligado na mesa), **admin** (papel global).

## 1. Que features existem hoje, por área, quem usa e qual custo geram?

### Takeaway

O Lorkarium já é um VTT completo de combate e campanha (grid com visão/névoa/luz/paredes, tokens ricos, combate, dados 3D com física no servidor, chat, biblioteca com documentos, mapas interativos e fichas programáveis em sandbox), muito além do MVP do spec. Os custos reais concentram-se em S3 (imagens de mesa, mapas até 8192 px, documentos, fichas), CPU da física dos dados e do `sharp`, e fan-out de tempo real; chat, ping e dados são efêmeros (sem linha no banco).

### Cited Findings

**Contas e perfil**

- Login por e-mail ou @ + senha, sessão por cookie `lk_session`, papel global `user`/`admin`; e-mail guardado cifrado (AES-GCM) com índice cego, senha em Argon2id (19 MiB, t=2) — custo CPU/memória por login. Todos os usuários. — [docs/context/auth.md](docs/context/auth.md) (linhas 3, 59, 94)
- Login em 2 etapas com TOTP (2FA) e códigos de recuperação; troca de senha, "onde você está conectado" (sessões ativas), troca de e-mail por link, avisos "se não foi você" por e-mail (MAIL). Todos. — [docs/context/account-security.md](docs/context/account-security.md) (linhas 3-5)
- Perfil: apelido (1–32), cor (paleta ou hex), "Sobre você" (até 190), foto normalizada em WebP 256 px (envio até 5 MiB, GIF animado continua animado), e aparência do dado (textura própria até 5 MiB + cor do número). Foto e textura ficam no S3 (`avatars/`, `dice-textures/`). Todos. Custo: S3 + CPU (`sharp`). — [docs/context/profiles.md](docs/context/profiles.md) (linhas 3, 15-35); [packages/contracts/src/account/avatar.dto.ts:5,15](packages/contracts/src/account/avatar.dto.ts)
- Cores salvas por conta (até 24), usadas em qualquer seletor, qualquer mesa; sem evento em tempo real. Todos. Custo: baixo (DB). — [docs/context/saved-colors.md](docs/context/saved-colors.md); [packages/contracts/src/account/saved-colors.dto.ts:5](packages/contracts/src/account/saved-colors.dto.ts)
- Contas só nascem por **convite** emitido por admin (link de 7 dias; a pessoa escolhe @ e senha e aceita Termos/Privacidade) e "link de nova senha" (1 h). Não existe cadastro aberto: o seed de dev existe "enquanto o cadastro não existe". MAIL. — [docs/context/account-links.md](docs/context/account-links.md) (linhas 3, 36-39); [docs/context/auth.md:86](docs/context/auth.md)

**Mesas (campanhas) e sessão ao vivo**

- Criar mesa com nome (até 80), sistema, status (`building`/`recruiting`/`ongoing`/`finished`), descrição (até 500), visibilidade pública/privada, senha opcional (mín. 4, Argon2id), capa desenhada ou imagem, avisos de conteúdo e até 8 tags; código de entrada de 8 caracteres, regerável. Dono/co-mestre editam; só o dono (ou juggernaut) exclui. — [docs/context/campaigns.md](docs/context/campaigns.md) (linhas 35-61); [docs/context/client/home.md:63](docs/context/client/home.md); [packages/contracts/src/campaigns/campaign-tags.dto.ts:3](packages/contracts/src/campaigns/campaign-tags.dto.ts)
- "Explorar": lista de mesas públicas (até 200, mais nova primeiro, com mestre online e jogadores online) e entrada sem código numa mesa pública. — [docs/context/campaigns.md:47-48](docs/context/campaigns.md); [server/src/modules/campaigns/campaign-members.dao.ts:40](server/src/modules/campaigns/campaign-members.dao.ts)
- A própria mesa é a sessão ao vivo (não há tabela `sessions`): presença online, "ausente há N min", snapshot e versão; até 5 mesas abertas ao mesmo tempo por conexão/aba. RT. — [docs/context/sessions.md](docs/context/sessions.md) (linhas 3, 18-41); [packages/contracts/src/sessions/session.dto.ts:11](packages/contracts/src/sessions/session.dto.ts)
- Chaves por mesa: "jogadores criam tokens" e "jogadores excluem tokens" (padrão desligado). Dono/co-mestre. — [docs/context/campaigns/papeis.md](docs/context/campaigns/papeis.md) (seção "Chaves de token dos jogadores")

**Tabuleiro (grid/cena)**

- Vários grids (cenas) por mesa, de 1 a 100 casas por lado, distância por casa configurável (até 9999), fundo por imagem, grid com opacidade, "movimento livre" (passo de 1/64 de casa), grid do grupo (ativado pelo mestre, leva todos) e abas pessoais de outros grids. Mestre cria/configura; jogadores veem grids públicos e o do grupo. Custo: DB + S3 (fundo até 4096 px) + RT. — [docs/context/board.md](docs/context/board.md); [docs/spec.md:109-127](docs/spec.md); [packages/contracts/src/board/scene.dto.ts:4-8](packages/contracts/src/board/scene.dto.ts)
- Tokens: imagem (1024 px), tamanho 0,5–10 casas, até 8 barras (vida generalizada, com temporário e exibição em %/valor), camadas tokens/objetos, direção, borda, marca de abatido, controle por jogadores, cone de visão, luz própria, aura (imagem ou GIF animado), até 8 formas (troca de aparência), token invisível, token que bloqueia visão (contorno do alfa calculado no servidor), patrulha automática em loop, colar/duplicar em grupo, arraste ao vivo visto por todos. Mestre tudo; jogador o que controla. Custo: DB + S3 + RT (arraste a cada 100 ms) + CPU (contorno da imagem até ~21 ms). — [docs/context/tokens.md](docs/context/tokens.md) (linhas 6-20); [docs/context/assets/contorno.md:26](docs/context/assets/contorno.md); [docs/context/client/tokens.md:15](docs/context/client/tokens.md)
- Paredes e portas (bloqueiam visão e passagem do token do jogador; o mestre passa por tudo), visão por token (plena/penumbra, enxergar no escuro), névoa calculada no client, luzes do mapa (ponto, alcance, cor, cone, acesa/apagada; só o mestre vê o ícone). Mestre desenha; afeta todos. Custo: DB + CPU moderada no servidor (conferência de passagem, até 1.000.000 checagens por comando) — a névoa roda no navegador. — [docs/context/walls.md](docs/context/walls.md); [docs/context/lights.md](docs/context/lights.md); [docs/context/client/vision.md](docs/context/client/vision.md); [server/src/modules/walls/wall-checks.bo.ts:4](server/src/modules/walls/wall-checks.bo.ts)
- Desenhos (mão livre, quadrado, círculo, triângulo, cor, dono) e áreas de efeito (quadrado, círculo, semicírculo, cones, linha, emanação), vistos pela mesa toda. Mestre e jogador. DB + RT. — [docs/context/drawings.md](docs/context/drawings.md); [docs/context/effect-areas.md](docs/context/effect-areas.md)
- Ping no mapa (anel com o nome, ~3 s), efêmero, sem gravação. Mestre e jogador (espectador não). RT baixo. — [docs/context/pings.md](docs/context/pings.md)
- Régua, zoom 25%–400%, desfazer (Ctrl+Z), duplicar grid inteiro (tokens, paredes, luzes, desenhos, áreas). — [docs/context/client/board-renderer.md:7](docs/context/client/board-renderer.md); [docs/context/library.md:83-88](docs/context/library.md)

**Combate e condições**

- Lista de condições por mesa (nome, descrição, cor, imagem quadrada de 256 px, acumula com stacks até 99, translúcido), aplicadas em tokens/personagens com duração em rodadas (0–99, 0 = sem limite) que desce no fim do turno. Tracker de iniciativa por cena: entradas com 0–N tokens, até 64 entradas, iniciativa até 999, desempate, turno/rodada; jogador passa o turno da entrada que controla. DB + RT. — [docs/context/combat.md](docs/context/combat.md) (linhas 3, 12-35); [packages/contracts/src/board/combat.dto.ts:8-11](packages/contracts/src/board/combat.dto.ts); [packages/contracts/src/board/condition.dto.ts:11-13](packages/contracts/src/board/condition.dto.ts)

**Personagens**

- Um personagem por jogador por mesa, criado ao virar jogador (nome, imagem, lado, CA, CD, anotações, barras, formas, condições, fichas); o token ligado em cada grid herda dele. DB. — [docs/context/characters.md](docs/context/characters.md) (linhas 3, 77-92)

**Dados**

- Rolagem pelo servidor com **física simulada (cannon-es)** para d4, d6, d8, d10, d12, d20 e d100; d2, d7, d1000 etc. por sorteio crypto; ondas (explosão/rerrolagem), vantagem, rolagem secreta (só mestres veem), trajeto 3D transmitido a todos e desenhado em three.js; rótulo; rolagens salvas com pastas (por membro e mesa). Mestre e jogador (espectador não rola). Custo: **CPU** (~13–16 ms por onda de 20 dados; no máximo ~30 ms/s de CPU por conexão) + **RT** (trajeto de 20 dados ≈ 7600 inteiros enviados a toda a sala) + DB só nas salvas. — [docs/context/dice.md](docs/context/dice.md) (linhas 3, 39-58); [docs/context/dice/fisica.md:62](docs/context/dice/fisica.md); [docs/context/dice/salvas.md](docs/context/dice/salvas.md)

**Chat**

- Mesa (todos), sussurro, privado e grupo (2–30 pessoas), falar como token; mensagens até 2000 caracteres; **efêmero** (não grava, histórico só no client); o mestre não vê conversas privadas dos outros. Todos, espectador incluído. RT baixo, DB zero. — [docs/context/chat.md](docs/context/chat.md) (linhas 3-25); [packages/contracts/src/chat/chat.dto.ts:10-14](packages/contracts/src/chat/chat.dto.ts)

**Biblioteca**

- Itens em pastas aninhadas (até 5 níveis), públicos/privados, pasta privada esconde o conteúdo: grids, imagens (até 4096 px, 20 MiB), documentos, mapas, modelos de ficha e fichas. Mestre cria/organiza; jogador vê os públicos. — [docs/context/library.md](docs/context/library.md) (linhas 3, 32-45, 107-130)
- Apresentar imagem a todos ("Mostrar a todos", versão por clique). Mestre. RT + S3. — [docs/context/library/images.md](docs/context/library/images.md) (linhas 3, 13)
- Documentos ricos (Tiptap): abas (até 200, cada uma com versão própria), fontes, tabelas (até 100×20), links, imagens no armazenamento da mesa (até 50 por conteúdo, 4096 px), abas "só mestres", donos jogadores que editam; salvamento automático com detecção de conflito. Mestre cria; dono jogador edita; outros leem públicos. Custo: **DB** (até 512 KiB de JSON por aba × 200 abas) + **S3**. — [docs/spec.md:305-313](docs/spec.md); [docs/context/documents/contratos.md:9-33](docs/context/documents/contratos.md)
- Mapas interativos: imagem própria até 8192 px e 20 MiB, lugares (polígonos ou pinos com ícone) que levam a documento/aba, grid, imagem ou outro mapa; spoilers por permissão; um mapa "Principal" por mesa; "mostrar a todos". Mestre cria; todos exploram. Custo: **S3** (as maiores imagens do sistema) + DB. — [docs/spec.md:331-343](docs/spec.md); [docs/context/library-maps.md](docs/context/library-maps.md)
- Fichas personalizadas: o mestre escreve modelo em HTML/CSS/JS (até 64 arquivos, 512 KiB), com fontes WOFF2 e imagens (até 8 MiB por modelo); ficha roda em iframe sandbox sem rede e fala pelo SDK `window.lorkarium` (ler/ajustar barras, rolar dados com física, gravar valores no servidor até 256 KiB, CA/CD, retrato, criar barras, ler documentos públicos, imagens próprias); exportar/importar `.lksheet` (até 12 MiB) entre mesas; editor com CodeMirror, prévia e console. Mestre escreve; jogador/controlador usa. Custo: DB (valores, código) + S3 (fontes/imagens) + CPU baixa (o código roda no navegador). — [docs/spec.md:317-329](docs/spec.md); [docs/context/sheets.md](docs/context/sheets.md)

**Backoffice (admin global)**

- Lista de contas e convites, trocar papel, suspender/reativar (derruba sessões e sockets), conferir e excluir conta (bloqueado se é dono de mesa com outros membros), teste de e-mail com 11 amostras; modo juggernaut por mesa. Admin. MAIL. — [docs/context/user-admin.md](docs/context/user-admin.md) (linhas 13-40); [docs/context/campaigns/juggernaut.md:3](docs/context/campaigns/juggernaut.md)
- Termos e Privacidade abertos pelo app (redirect à landing), aceite com versão no convite. — [docs/context/legal.md](docs/context/legal.md)
- Registro de acesso (Marco Civil art. 15): IP, hora, conta, rota e status de cada requisição e conexão Socket.IO, guardado 6 meses num bucket S3 próprio. Custo: S3 (cresce com o tráfego, não com o plano). — [docs/context/access-log.md](docs/context/access-log.md) (linhas 3-14)

### Inferences

- As features "pesadas" em armazenamento (mapas 8192 px, documentos com imagens, fontes/imagens de modelos de ficha, imagens da biblioteca) estão todas do lado do **mestre** — é natural que o mestre/dono seja o pagante, e que jogadores fiquem grátis.
- Chat, ping e dados não gravam nada; seu custo é só banda/CPU na hora, proporcional ao tempo de sessão ao vivo e ao número de pessoas na sala.

### Gaps

- Não há medição de quanto um mestre típico ocupa em S3 nem de banda média por sessão; os únicos números de desempenho são de CPU dos dados e de casos de teste.

## 2. O que está planejado no spec e ainda não existe?

### Takeaway

Boa parte do §12 "Funcionalidades futuras" do spec já foi construída (névoa, visão, luz, dados, chat, app desktop); faltam grid hexagonal, automação de regras, áudio sincronizado, replay, marketplace, API pública, importação de outros VTTs, cadastro aberto e "sair da mesa".

### Cited Findings

- Lista do spec §12 (não MVP): grid hexagonal, fog of war, visão individual, iluminação dinâmica, colisões complexas, pathfinding, medição avançada de áreas, sistema de dados, automação de regras, partículas, áudio sincronizado, chat, histórico/replay de combate, aplicativo desktop, marketplace de extensões, API pública, importação de outros VTTs. — [docs/spec.md:1019-1041](docs/spec.md)
- **Já construídos** desse lista: névoa/visão individual ([docs/context/walls.md:3](docs/context/walls.md) "antecipa o §12"), iluminação dinâmica ([docs/context/lights.md:3](docs/context/lights.md)), dados ([docs/context/dice.md](docs/context/dice.md)), chat efêmero ([docs/context/chat.md](docs/context/chat.md)), app desktop Windows ([docs/context/desktop.md:3](docs/context/desktop.md)); áreas de efeito existem só como gabarito visual — "contar alvos e aplicar efeito é do §12" ([docs/context/effect-areas.md:3](docs/context/effect-areas.md)).
- **Não construídos** (sem doc nem código encontrado): grid hexagonal (grep por "hexagonal" não acha nada no game-core), automação de regras, partículas, áudio sincronizado (o som dos dados é local), replay de combate, marketplace, API pública, importação de outros VTTs. — [docs/spec.md:1023-1039](docs/spec.md)
- Cadastro aberto não existe ("enquanto o cadastro não existe"). — [docs/context/auth.md:86](docs/context/auth.md)
- Não há rota de sair da mesa. — [docs/context/characters.md:81](docs/context/characters.md)
- "Registro de atividade" do backoffice é futuro (hoje só log pino). — [docs/context/user-admin.md:26](docs/context/user-admin.md)
- Fora das entregas de documentos: colaboração CRDT/OT, histórico de versões, offline. — [docs/spec.md:313](docs/spec.md)
- Fora das fichas: API de chat/condições/combate/mover token no SDK, rede dentro da ficha, modelo escrito por jogador, importação de fichas de outros VTTs, histórico de versões do modelo. — [docs/spec.md:329](docs/spec.md)
- Fora dos mapas: camadas/grupos de marcadores, cursores e ping no mapa, janela separada no desktop, ficha como alvo, edição por jogador, ladrilhos, trocar imagem, duplicar e exportar. — [docs/spec.md:343](docs/spec.md)
- Desktop só Windows; Mac/Linux são mandados ao navegador pela landing. — [docs/context/site.md:57](docs/context/site.md)

### Inferences

- Itens futuros como áudio sincronizado, API pública, marketplace e importação de outros VTTs são candidatos naturais a "feature de plano pago" quando existirem; hoje não podem entrar na grade de preços.

### Gaps

- Não há roadmap datado nem priorização desses itens no repositório.

## 3. Quais limites e tetos já existem no código?

### Takeaway

Todos os tetos atuais são **técnicos/antiabuso, por objeto** (por cena, por token, por documento, por modelo), iguais para todo mundo. Não há nenhum teto por conta ou por mesa em quantidade de mesas, membros, grids, imagens ou armazenamento total.

### Cited Findings

**Conta/perfil**

- Cores salvas: 24 por conta — [packages/contracts/src/account/saved-colors.dto.ts:5](packages/contracts/src/account/saved-colors.dto.ts)
- Foto/textura do dado: envio até 5 MiB, foto salva em 256 px — [packages/contracts/src/account/avatar.dto.ts:5,15](packages/contracts/src/account/avatar.dto.ts)
- Apelido 32, bio 190; 30 PATCH/min; 10 fotos/min — [docs/context/contracts/conta.md:12](docs/context/contracts/conta.md); [docs/context/profiles.md:28](docs/context/profiles.md)

**Mesa/sessão**

- Tags por mesa: 8 — [packages/contracts/src/campaigns/campaign-tags.dto.ts:3](packages/contracts/src/campaigns/campaign-tags.dto.ts)
- Mesas públicas listadas: 200 — [server/src/modules/campaigns/campaign-members.dao.ts:40](server/src/modules/campaigns/campaign-members.dao.ts)
- Mesas abertas ao mesmo tempo por conexão: 5 — [packages/contracts/src/sessions/session.dto.ts:11](packages/contracts/src/sessions/session.dto.ts)
- Entrada por código: 10 tentativas/min por usuário — [docs/context/campaigns.md:54](docs/context/campaigns.md)
- Comandos do tabuleiro: balde de 40, 20/s por conexão — [server/src/realtime/command-rate.bo.ts:2-4](server/src/realtime/command-rate.bo.ts)
- Dados: balde 6, 2/s; chat: balde 8, 2/s — [server/src/realtime/command-rate.bo.ts:16,20](server/src/realtime/command-rate.bo.ts)
- Mensagem de tempo real: 5 MiB — [packages/contracts/src/realtime-limits.ts:5](packages/contracts/src/realtime-limits.ts)

**Cena/tabuleiro**

- Cena 1–100 casas por lado — [packages/contracts/src/board/scene.dto.ts:4-5](packages/contracts/src/board/scene.dto.ts)
- Tokens por cena: 500; barras por token: 8; bloqueadores de visão por cena: 50 — [packages/contracts/src/board/token.dto.ts:24-31](packages/contracts/src/board/token.dto.ts)
- Formas por token: 8 — [packages/contracts/src/board/token-form.dto.ts:9](packages/contracts/src/board/token-form.dto.ts)
- Patrulhas ligadas por grid: 30; pontos por patrulha: 32 — [packages/contracts/src/board/token-patrol.dto.ts:9,16](packages/contracts/src/board/token-patrol.dto.ts)
- Desenhos por cena: 500 (2000 pontos por traço) — [packages/contracts/src/board/drawing.dto.ts:8-10](packages/contracts/src/board/drawing.dto.ts)
- Paredes por cena: 500, segmentos 4000 — [packages/contracts/src/board/wall.dto.ts:7-12](packages/contracts/src/board/wall.dto.ts)
- Luzes por cena: 100 — [packages/contracts/src/board/light.dto.ts:14](packages/contracts/src/board/light.dto.ts)
- Áreas de efeito por cena: 100 — [packages/contracts/src/board/effect-area.dto.ts:10](packages/contracts/src/board/effect-area.dto.ts)
- Entradas de combate: 64; comandos em grupo: 64 itens — [packages/contracts/src/board/combat.dto.ts:9](packages/contracts/src/board/combat.dto.ts); [packages/contracts/src/board/token-id-group.dto.ts:4](packages/contracts/src/board/token-id-group.dto.ts)
- Rodadas e stacks de condição: 99 — [packages/contracts/src/board/condition.dto.ts:11-13](packages/contracts/src/board/condition.dto.ts)

**Dados**

- Até 20 dados com modelo físico por rolagem (o excedente sai do sorteio crypto); 10 peças por rolagem — [packages/contracts/src/dice/dice.dto.ts:13,22](packages/contracts/src/dice/dice.dto.ts); [docs/context/dice.md:41](docs/context/dice.md)
- Rolagens salvas: 50 por membro por mesa; pastas: 50; 30 escritas/min — [packages/contracts/src/dice/saved-roll.dto.ts:7-9](packages/contracts/src/dice/saved-roll.dto.ts); [docs/context/dice/salvas.md:84](docs/context/dice/salvas.md)

**Imagens (assets)**

- Envio até 20 MiB; 20 envios/min por usuário e rota — [packages/contracts/src/assets/asset.dto.ts:4](packages/contracts/src/assets/asset.dto.ts); [docs/context/assets.md:15](docs/context/assets.md)
- Normalização por finalidade (lado máximo): fundo/imagem da biblioteca/documento/ficha 4096 px, mapa 8192, token 1024, capa 1600, condição 256 (quadrada), aura 512 (GIF até 120 quadros, 16 MP decodificados) — [packages/contracts/src/assets/asset.dto.ts:33-56](packages/contracts/src/assets/asset.dto.ts)
- Teto de decodificação 100 MP; regravação no mesmo formato (JPEG/WebP qualidade 90), EXIF/GPS removidos, SVG recusado — [server/src/infrastructure/image-processor/sharp-image-processor.ts:14](server/src/infrastructure/image-processor/sharp-image-processor.ts); [docs/context/assets.md:55-59](docs/context/assets.md)

**Biblioteca**

- Profundidade de pasta: 5 — [packages/contracts/src/library/library.dto.ts:9](packages/contracts/src/library/library.dto.ts)
- Mapa: 300 lugares, polígono até 1024 vértices — [packages/contracts/src/library/library-map.dto.ts:11-13](packages/contracts/src/library/library-map.dto.ts)
- Documento: 200 abas; conteúdo 512 KiB, 100.000 caracteres, 10.000 nós, 50 imagens — [packages/contracts/src/documents/document-tab.dto.ts:5](packages/contracts/src/documents/document-tab.dto.ts); [packages/contracts/src/documents/document-content.dto.ts:3-9](packages/contracts/src/documents/document-content.dto.ts)
- Modelo de ficha: código 512 KiB / 64 arquivos; assets 8 MiB / 32 por modelo, fonte 2 MiB; arquivo `.lksheet` 12 MiB; valores 256 KiB, 1000 chaves, 8 níveis — [packages/contracts/src/sheets/sheet-template-files.dto.ts:4-5](packages/contracts/src/sheets/sheet-template-files.dto.ts); [packages/contracts/src/sheets/sheet-template-asset.dto.ts:16-19](packages/contracts/src/sheets/sheet-template-asset.dto.ts); [packages/contracts/src/sheets/sheet-template-file.dto.ts:24](packages/contracts/src/sheets/sheet-template-file.dto.ts); [packages/contracts/src/sheets/sheet-values.dto.ts:4-7](packages/contracts/src/sheets/sheet-values.dto.ts)
- SDK da ficha: 10 rolagens/10 s, 10 envios de imagem/min, 120 leituras/min, 10 barras criadas/min — [docs/spec.md:325](docs/spec.md)

**Chat**

- Mensagem 2000 caracteres; grupo 2–30 pessoas — [packages/contracts/src/chat/chat.dto.ts:10-14](packages/contracts/src/chat/chat.dto.ts)

**Segurança/abuso**

- Login 5/min por IP + identificador; 2FA 5/min por usuário; links de conta 20 por 10 min por admin e 10/min por IP nas públicas — [docs/context/auth.md:28](docs/context/auth.md); [docs/context/account-security.md:35](docs/context/account-security.md); [docs/context/account-links.md:32](docs/context/account-links.md)

### Inferences

- Não há constante de "mesas por conta", "membros por mesa", "grids por mesa", "imagens por mesa" nem cota de armazenamento: a busca por `*_MAX`/`*_LIMIT` em `packages/contracts/src`, `packages/game-core/src` e `server/src` não achou nenhuma (inferência a partir da ausência). Toda quota de plano seria código novo.
- Os tetos por cena (500 tokens etc.) existem por desempenho, não por negócio; usá-los como diferenciação de plano seria artificial.

### Gaps

- Não verifiquei limite de frequência de cada rota da biblioteca/documentos individualmente; só os citados acima.

## 4. Como funcionam os papéis e a relação mesa–jogadores?

### Takeaway

Cada mesa tem um dono fixo (o criador), co-mestres promovidos por ele, jogadores e espectadores; quem entra pelo código chega como espectador e só vira jogador quando um mestre promove. O admin global tem o modo "juggernaut" de emergência. Uma conta pode ter papéis diferentes em várias mesas.

### Cited Findings

- Papéis: dono (tudo, inclusive gerir mestres e excluir; ninguém rebaixa), `master`/co-mestre (grids privados, configurações, código, todo token, troca jogador ↔ espectador; não gere mestres nem exclui), `player` (os próprios tokens, desenho, ping, ficha própria), juggernaut (admin com poder de dono, travado, visto só online), `spectator` (só lê, sem ping, sem rastro). — [docs/context/campaigns/papeis.md](docs/context/campaigns/papeis.md) (tabela "O papel")
- Quem entra pelo código é espectador; o mestre promove a jogador. — [docs/spec.md:278](docs/spec.md); [docs/context/campaigns/papeis.md](docs/context/campaigns/papeis.md)
- Só o dono promove a co-mestre; o co-mestre tem tudo menos gerir mestres e excluir a mesa. — [docs/spec.md:280](docs/spec.md)
- Juggernaut: admin liga mesa a mesa, "break glass", vai ao log e cai quando a conta perde o admin. — [docs/context/campaigns/juggernaut.md:3](docs/context/campaigns/juggernaut.md)
- Papel global `user`/`admin` em `users.role`. — [docs/context/auth.md:59](docs/context/auth.md)
- Tabela `campaign_members` com PK (mesa, usuário) e `role`; excluir a mesa apaga em cascata membros, cenas, fichas, condições, pastas e assets (linhas), mas os objetos do S3 ficam. — [docs/context/campaigns.md:58-61](docs/context/campaigns.md)
- Jogador ganha um personagem ao ser promovido; mestre não ganha. — [docs/context/characters.md:79](docs/context/characters.md)
- Excluir uma conta é bloqueado se ela é dona de mesa com outros membros (`OWNS_SHARED_CAMPAIGNS`). — [docs/context/user-admin.md:18,30](docs/context/user-admin.md)
- Isolamento por mesa no servidor (critério 14): quem não é membro recebe 404. — [docs/context/campaigns.md:52](docs/context/campaigns.md)

### Inferences

- O "dono" é a unidade natural de cobrança (é quem cria, é dono da biblioteca e quem não pode ser rebaixado). Co-mestres e jogadores herdariam o plano da mesa, não o deles.
- Espectadores são baratos (só leem, não rolam) e poderiam ficar fora de qualquer contagem de "jogadores por mesa".

### Gaps

- Não existe transferência de posse da mesa; um plano por dono teria de tratar isso.

## 5. Quais são os custos de infraestrutura do operador?

### Takeaway

Um VPS com Coolify (app + landing), Postgres 17, três buckets S3 na AWS (assets, backups, registro de acesso) e um provedor SMTP. O custo que cresce com uso é o S3 — em especial a **saída** de imagens, porque o servidor entrega cada asset pela própria origem — e nada é apagado do S3 quando uma mesa é excluída.

### Cited Findings

- Produção: Coolify num VPS Linux (Traefik), Postgres 17 como recurso do Coolify, assets num bucket S3 da AWS, e-mail por SMTP. — [docs/context/deploy.md:3](docs/context/deploy.md)
- Três buckets: assets; backups do Postgres; registro de acesso com ciclo de vida de 184 dias. — [docs/context/deploy.md:22-26](docs/context/deploy.md)
- Região: o runbook diz `sa-east-1`, mas a produção atual está em `us-east-2`. — [docs/context/deploy/aws.md:7,52](docs/context/deploy/aws.md); [docs/context/site.md:68](docs/context/site.md)
- "Tráfego de saída é o custo que cresce": o servidor baixa o asset do S3 e o entrega pela origem; o `Cache-Control: immutable` de 1 ano faz cada navegador baixar cada imagem uma vez; trocar para Cloudflare R2 (sem custo de saída) é só env. Conta AWS nova não tem mais S3 "sempre grátis". — [docs/context/deploy/aws.md:88-93](docs/context/deploy/aws.md)
- Assets da mesa nunca são apagados do S3 (só o perfil apaga foto); excluir a mesa deixa os objetos órfãos. — [docs/context/assets.md:40](docs/context/assets.md); [docs/context/campaigns.md:59](docs/context/campaigns.md); [docs/context/user-admin.md:36](docs/context/user-admin.md)
- Física dos dados: rolagem síncrona; ~13–16 ms por onda de 20 dados; com o balde de 6/2 por segundo uma conexão ocupa no máximo ~30 ms/s de CPU. — [docs/context/dice.md:58](docs/context/dice.md); [docs/context/dice/fisica.md:62](docs/context/dice/fisica.md)
- CPU de imagens: `sharp` em todo envio (redimensionar, regravar, contorno do alfa do token até ~21 ms no pior caso). — [docs/context/assets.md:51-61](docs/context/assets.md); [docs/context/assets/contorno.md:26](docs/context/assets/contorno.md)
- E-mail: SMTP obrigatório em produção (Amazon SES, Resend ou Brevo sugeridos); 11 e-mails, todos transacionais (segurança, convite, nova senha, suspensão, admin), nenhum de marketing nem convite de mesa. — [docs/context/deploy.md:28-36](docs/context/deploy.md); [docs/context/mail.md:24-46](docs/context/mail.md)
- Registro de acesso: grava a cada 5 min, até 10.000 linhas por objeto, até 200.000 linhas pendentes na memória. — [server/src/modules/access-log/access-log.service.ts:29-31](server/src/modules/access-log/access-log.service.ts); [docs/context/access-log.md:34](docs/context/access-log.md)
- Backups guardados 30 dias (texto da Política de privacidade). — [docs/context/site.md:68](docs/context/site.md)
- Uma instância de backend, sem escala horizontal no MVP. — [docs/spec.md:800-804](docs/spec.md); [docs/spec.md:1107](docs/spec.md)

### Inferences

- Como o servidor é uma instância só, a física dos dados e o fan-out do Socket.IO limitam quantas mesas ao vivo cabem por VPS; o custo marginal por sessão ao vivo é real, mas pequeno.
- Os órfãos no S3 fazem o armazenamento crescer para sempre; uma cota por plano precisaria de contagem de bytes por mesa/dono (hoje inexistente) e, idealmente, de limpeza dos órfãos.

### Gaps

- Não há números de custo mensal, tamanho atual do bucket ou número de usuários ativos no repositório.

## 6. Como são o app desktop e a landing?

### Takeaway

O app desktop é uma casca Tauri 2 só para Windows que abre o site publicado (mesmo client, mesmo servidor), com updater, bandeja e janelas auxiliares; a landing é um site Astro estático que apresenta o produto e leva ao download do `.exe` e a "Pedir convite".

### Cited Findings

- Desktop: casca Tauri 2 que navega para o site publicado (`LORKARIUM_APP_URL`); o navegador continua funcionando. — [docs/context/desktop.md:3](docs/context/desktop.md)
- Por que remota: mesma origem (cookie, Socket.IO, imagens); cada deploy do front chega sem instalador; sem rede nada abre. — [docs/context/desktop.md:5-9](docs/context/desktop.md)
- Recursos: splash com checagem de atualização (updater) e health, bandeja do Windows (o X esconde, o Socket.IO segue ligado), instância única, estado da janela, janela sem moldura, janelas auxiliares de Chat, Dados e Imagens apresentadas; instalador NSIS próprio. — [docs/context/desktop.md:67-82,84-106,161-163](docs/context/desktop.md)
- Licença do app Windows: pessoal, gratuita, não exclusiva; atualiza sozinho. — [site/src/content/legal/termos.md](site/src/content/legal/termos.md) (§11)
- Landing: Astro estático em `site/`, sem sessão nem Socket.IO; app em `mesa.`, landing no domínio raiz. — [docs/context/site.md:3](docs/context/site.md)
- Conteúdo: uma noite de jogo em seis atos (cena, grupo, iniciativa, combate, dados, chat), dez recursos (grid, iniciativa, condições, barras, biblioteca, visão/luz/paredes, dados 3D, chat, formas/auras, fichas programáveis), FAQ, download e página "obrigado" com "Pedir convite". — [docs/context/site.md:37-41](docs/context/site.md)
- Download: lê a última release do GitHub no navegador (cache de 10 min por aba por causa do limite de 60 pedidos/h); Mac/Linux → aviso para usar o navegador; celular → "é pra computador". — [docs/context/site.md:49-58](docs/context/site.md)
- O JSON-LD da landing declara `SoftwareApplication` com `offers.price "0"` em BRL. — [docs/context/site.md:36](docs/context/site.md)

### Inferences

- O app desktop não custa nada a mais por usuário (é o mesmo servidor), então não há motivo de custo para trancá-lo num plano; pode ser diferencial de marketing do plano grátis.
- A landing promete "Pedir convite": hoje a aquisição é manual e controlada pelo operador.

### Gaps

- Não achei suporte a celular/tablet declarado no app além do aviso da landing.

## 7. Já existe algo de cobrança, planos, cotas ou contas pagas?

### Takeaway

Não. Não há código de cobrança, planos, assinaturas ou cotas; a única menção é a cláusula de preço dos Termos, que diz que hoje é grátis e que planos pagos virão com aviso de 30 dias.

### Cited Findings

- Busca por `billing|subscription|stripe|premium|assinatura|pagamento|mercado pago|quota|paywall|pricing|preço` em `server/src`, `client/src`, `packages`, `site/src`, `desktop/src` e docs achou só usos irrelevantes (subscription de eventos no client, "assinatura WOFF2") e a cláusula dos Termos. — busca local; [site/src/content/legal/termos.md](site/src/content/legal/termos.md)
- Termos §9 "Preço": hoje é gratuito; planos pagos podem vir, com 30 dias de aviso, termos próprios e cobrança só com contratação expressa. — [site/src/content/legal/termos.md](site/src/content/legal/termos.md) (§9)
- Termos §10: aviso de 30 dias antes de encerrar o serviço. — [site/src/content/legal/termos.md](site/src/content/legal/termos.md) (§10)
- Contas: só por convite de admin; papel global `user`/`admin`; suspensão e exclusão pelo backoffice. — [docs/context/account-links.md:3](docs/context/account-links.md); [docs/context/user-admin.md](docs/context/user-admin.md)
- Operadora: Evolutiva Sistemas (marca e contato de privacidade nos Termos). — [site/src/content/legal/termos.md](site/src/content/legal/termos.md) (§8, §12)
- AWS: a doc manda ligar um alerta de orçamento (Budget) antes de abrir para jogadores. — [docs/context/deploy/aws.md:92](docs/context/deploy/aws.md)

### Inferences

- Pôr planos exigiria: tabela de plano/assinatura por conta, integração de pagamento (nova lib atrás de porta, conforme as regras do projeto), contagem de uso (mesas, bytes) e cadastro aberto (hoje inexistente), além de novos Termos.
- O compromisso de 30 dias de aviso e de não cobrar sem contratação expressa já limita como migrar usuários atuais.

### Gaps

- Nenhum documento de estratégia comercial ou de preços no repositório.

## 8. Candidatos naturais a limite

### Takeaway

As grandezas medíveis que hoje não têm teto e que crescem com o custo são: mesas como dono, membros por mesa, armazenamento (bytes no S3) por dono/mesa, quantidade de mapas e a resolução deles, modelos de ficha, documentos, e o uso de dados físicos/tempo ao vivo.

### Cited Findings

- Mesas como dono: sem teto; `campaigns.owner_id` liga mesa ao dono. — [docs/context/campaigns.md:58](docs/context/campaigns.md)
- Membros por mesa (jogadores/co-mestres/espectadores): sem teto; `campaign_members`. — [docs/context/campaigns.md:60](docs/context/campaigns.md)
- Armazenamento: cada envio vira objeto `assets/<uuid>` com bytes conhecidos na tabela `assets` (tamanho, largura, altura, finalidade); nada é apagado. — [docs/context/assets.md:21-40](docs/context/assets.md)
- Grids por mesa: sem teto (só os por cena: 500 tokens, 500 paredes, 100 luzes...). — [packages/contracts/src/board/token.dto.ts:26](packages/contracts/src/board/token.dto.ts)
- Mapas interativos (imagem até 8192 px/20 MiB) e "mapa Principal". — [docs/spec.md:333-341](docs/spec.md)
- Modelos de ficha (até 8 MiB de assets cada) e fichas (valores até 256 KiB). — [docs/spec.md:325](docs/spec.md)
- Documentos (até 200 abas × 512 KiB) e imagens de documento. — [docs/context/documents/contratos.md:15,33](docs/context/documents/contratos.md)
- Imagens da biblioteca e apresentação. — [docs/context/library/images.md:3](docs/context/library/images.md)
- Dados com física: até 20 modelos por rolagem (o resto já cai em sorteio crypto, mecanismo pronto para um teto menor). — [docs/context/dice.md:41](docs/context/dice.md)
- Rolagens salvas (50 por membro e mesa), cores salvas (24 por conta) — já com teto. — [packages/contracts/src/dice/saved-roll.dto.ts:7](packages/contracts/src/dice/saved-roll.dto.ts); [packages/contracts/src/account/saved-colors.dto.ts:5](packages/contracts/src/account/saved-colors.dto.ts)
- Mesas abertas ao mesmo tempo (5 por conexão) — já com teto. — [packages/contracts/src/sessions/session.dto.ts:11](packages/contracts/src/sessions/session.dto.ts)

### Inferences

- Lista de métricas sugeridas por plano (medíveis com o modelo atual): (1) mesas que a conta é dona; (2) jogadores ativos por mesa (sem contar espectadores); (3) MB de armazenamento por dono (soma do tamanho dos `assets` das mesas dele + fichas/documentos); (4) número de mapas interativos e resolução máxima do mapa (4096 × 8192 px); (5) modelos de ficha personalizados e importação `.lksheet`; (6) documentos/abas; (7) co-mestres por mesa; (8) imagens animadas (aura em GIF); (9) dados com física por rolagem (ex.: 20 × menos, o resto por crypto); (10) mesas abertas ao mesmo tempo (hoje 5).
- Métricas a evitar: tetos por cena (tokens, paredes, luzes) — são de desempenho; chat e ping — custo quase nulo; segurança (2FA, sessões) — não deve ser paga.

### Gaps

- Não há tabela de uso por conta para estimar a distribuição real de cada métrica.

## 9. Diferenciais

### Takeaway

Os diferenciais mais fortes encontrados no código são: fichas programáveis em sandbox com SDK, dados 3D com física simulada no servidor (resultado autoritativo, à prova de trapaça), servidor autoritativo em todo o estado, app desktop Windows, e produto inteiro em pt-BR com conformidade LGPD/Marco Civil.

### Cited Findings

- Fichas programáveis: modelo em HTML/CSS/JS, iframe sem `allow-same-origin` e sem rede, SDK `window.lorkarium` por `MessagePort`, servidor reautoriza cada pedido, exportar/importar `.lksheet`, editor com console e prévia. — [docs/spec.md:317-327](docs/spec.md); [docs/context/sheets.md](docs/context/sheets.md)
- Dados: o servidor simula a física e o valor é a face em que o dado parou; o trajeto é enviado a todos; rolagem secreta só para mestres; textura própria do dado por conta. — [docs/context/dice.md:3](docs/context/dice.md); [docs/context/profiles.md:3](docs/context/profiles.md)
- Servidor autoritativo e isolamento por mesa como princípio. — [docs/spec.md:64-68,88-90](docs/spec.md)
- Independente de sistema de RPG (condições são marcadores, sem regras de D&D embutidas). — [docs/spec.md:56-62](docs/spec.md)
- Visão/névoa/luz/paredes/portas, tokens com formas, aura animada, patrulha automática e bloqueio de visão. — [docs/context/tokens.md](docs/context/tokens.md); [docs/context/walls.md](docs/context/walls.md); [docs/context/lights.md](docs/context/lights.md)
- Mapas interativos com spoilers por permissão e links para documentos/grids/outros mapas. — [docs/spec.md:331-341](docs/spec.md)
- Documentos com abas "só mestres" invisíveis ao jogador por qualquer via. — [docs/spec.md:311](docs/spec.md)
- App desktop Windows com bandeja e janelas separadas de Chat, Dados e Imagens. — [docs/context/desktop.md:67-82](docs/context/desktop.md)
- Interface, e-mails e textos legais em pt-BR (ex.: mensagens "A cena já tem o máximo de 500 tokens."), horário de Brasília nos e-mails, Termos com CDC e registro de acesso do Marco Civil por 6 meses. — [docs/context/client/tokens.md:18](docs/context/client/tokens.md); [docs/context/mail.md:26](docs/context/mail.md); [docs/context/access-log.md:3](docs/context/access-log.md); [site/src/content/legal/termos.md](site/src/content/legal/termos.md) (§13)
- Segurança da conta: 2FA TOTP, e-mail cifrado, avisos "não fui eu" com link de recuperação. — [docs/context/account-security.md:3](docs/context/account-security.md); [docs/context/auth/cifra.md](docs/context/auth/cifra.md)

### Inferences

- Comparação com concorrentes não foi feita aqui (escopo só local); os "diferenciais" acima são o que o código traz, e cabe ao relatório confirmar quais faltam em Roll20/Foundry/Owlbear etc.
- Fichas programáveis e mapas interativos são diferenciais de mestre "avançado" — bons candidatos a plano pago; dados físicos e pt-BR são diferenciais de experiência que vendem o plano grátis.

### Gaps

- Sem dados de concorrentes neste arquivo (pesquisa web fora do escopo desta tarefa).
