# RPG VTT — Documento de Planejamento e Arquitetura

**Versão:** 0.1.0  
**Status:** Planejamento inicial  
**Tipo:** Projeto pessoal / Plataforma Web Multiplayer  
**Linguagem principal:** TypeScript  
**Arquitetura:** Monólito modular, client-server  
**Público-alvo:** Mestres e jogadores de RPG de mesa

---

## 1. Visão geral

O RPG VTT (Virtual Tabletop) será uma plataforma web voltada à execução e ao gerenciamento de combates em RPG de mesa.

A aplicação permitirá que mestres criem cenários de combate utilizando mapas e grids personalizáveis, posicionem personagens e criaturas, acompanhem rodadas, turnos, pontos de vida e condições e compartilhem essas informações em tempo real com outros participantes pela internet.

O sistema terá como princípio a independência de regras: não ficará limitado a D&D, Pathfinder, Tormenta ou qualquer outro sistema específico.

Inicialmente, funcionará como um gerenciador visual e interativo de combate. Futuramente, poderá evoluir para ferramentas de gerenciamento de campanhas, personagens, mapas e automações.

### 1.1. Problema que pretende resolver

Durante sessões de RPG, mestres frequentemente utilizam ferramentas separadas para:

- Exibir mapas de combate.
- Controlar a posição dos personagens.
- Acompanhar iniciativas e rodadas.
- Gerenciar pontos de vida.
- Identificar condições e efeitos.
- Compartilhar informações com os jogadores.

O projeto pretende centralizar essas atividades em uma interface única, com sincronização em tempo real.

### 1.2. Objetivo principal

Construir um sistema visual, flexível e acessível pelo navegador, capaz de administrar combates de RPG com múltiplos participantes conectados simultaneamente.

### 1.3. Objetivos específicos

- Permitir criação e personalização de cenas.
- Importar imagens para utilização como mapas.
- Implementar grids quadrados, com possibilidade futura de grids hexagonais.
- Permitir criação, posicionamento e movimentação de tokens.
- Sincronizar modificações em tempo real.
- Desenvolver um tracker de combate baseado em turnos e rodadas.
- Gerenciar pontos de vida e condições.
- Diferenciar permissões de mestres, jogadores e espectadores.
- Salvar e recuperar sessões.
- Manter uma arquitetura extensível e modular.

---

## 2. Princípios do projeto

### 2.1. Independência de sistemas de RPG

O sistema deve fornecer ferramentas genéricas para gerenciamento de combate.

Regras específicas de RPG deverão ser implementadas posteriormente como configurações, módulos ou extensões.

Por exemplo, uma condição poderá representar "Atordoado", mas o sistema não deverá presumir inicialmente quais penalidades essa condição aplica.

### 2.2. Servidor autoritativo

O backend será a autoridade sobre o estado compartilhado.

O frontend poderá solicitar operações, mas será responsabilidade do servidor validar permissões, executar mudanças e comunicar os resultados aos participantes autorizados.

### 2.3. Separação entre lógica e representação

As regras de combate e a representação gráfica deverão existir em módulos independentes.

O motor de combate não deverá depender diretamente de React, PixiJS, Fastify ou Socket.IO.

### 2.4. Desenvolvimento incremental

O sistema deverá ser desenvolvido em entregas pequenas e funcionais.

Cada etapa deverá produzir uma funcionalidade testável, evitando implementar muitos sistemas parcialmente concluídos.

### 2.5. Simplicidade operacional

A infraestrutura inicial deverá exigir poucos serviços e permitir execução local e implantação em uma VPS.

Não serão utilizados microserviços, Kubernetes ou infraestrutura distribuída no MVP.

### 2.6. Segurança desde o início

Autenticação, autorização, validação de entrada e isolamento dos dados entre campanhas deverão fazer parte da arquitetura inicial, não ser adicionados somente ao final.

---

## 3. Escopo funcional

### 3.1. Gerenciamento de campanhas

O mestre poderá:

- Criar campanhas.
- Definir nome e descrição.
- Criar múltiplas cenas em uma campanha.
- Selecionar a cena ativa.
- Gerenciar participantes.
- Abrir e encerrar sessões.

Uma campanha poderá conter diversos combates e cenas reutilizáveis.

### 3.2. Gerenciamento de cenas

Uma cena será o ambiente visual no qual os tokens serão posicionados.

Funcionalidades:

- Criar, editar e excluir cenas.
- Importar uma imagem de fundo.
- Definir dimensões da cena.
- Configurar tamanho e origem do grid.
- Mostrar ou ocultar linhas do grid.
- Alterar opacidade e aparência do grid.
- Salvar posições dos tokens.
- Reabrir cenas anteriormente configuradas.

Inicialmente, somente grids quadrados serão implementados.

O modelo de dados deverá permitir adicionar outros formatos posteriormente.

### 3.3. Motor gráfico

O motor gráfico será responsável por:

- Renderizar mapas.
- Renderizar grid.
- Renderizar tokens.
- Permitir movimentação da câmera.
- Aplicar zoom.
- Selecionar elementos.
- Arrastar e posicionar tokens.
- Exibir informações sobre os tokens.
- Exibir barras de vida e condições.
- Animar movimentações.

O motor gráfico será executado no navegador.

### 3.4. Sistema de tokens

Um token representa visualmente uma entidade dentro de uma cena.

Propriedades iniciais:

- Identificador único.
- Referência à cena.
- Referência opcional a um personagem ou criatura.
- Nome.
- Imagem.
- Posição X e Y.
- Tamanho em células.
- Rotação.
- Visibilidade.
- Pontos de vida atuais.
- Pontos de vida máximos.
- Condições ativas.
- Participantes autorizados a controlá-lo.

Funcionalidades:

- Criar token.
- Editar token.
- Duplicar token.
- Remover token.
- Arrastar token.
- Selecionar múltiplos tokens (evolução posterior).
- Vincular token a personagem.
- Exibir barras de vida.
- Exibir identificadores e condições.

A posição visual deverá ser derivada de coordenadas de mundo, não de coordenadas da tela.

### 3.5. Gerenciamento de combate

O módulo de combate permitirá:

- Iniciar e encerrar combate.
- Adicionar e remover participantes.
- Definir iniciativa.
- Ordenar participantes pela iniciativa.
- Identificar o participante ativo.
- Avançar turno.
- Avançar rodada.
- Alterar ordem de iniciativa manualmente.
- Registrar condições.
- Ajustar pontos de vida.
- Sincronizar informações com os participantes conectados.

O controle de rodadas deverá ser independente das regras específicas de cada sistema.

### 3.6. Sistema de pontos de vida

Cada token poderá possuir:

- HP atual.
- HP máximo.
- HP temporário (previsto).
- Barra visual de HP.
- Preferências de exibição da barra.

O mestre poderá modificar os valores numericamente.

A interface deverá refletir imediatamente mudanças confirmadas pelo servidor.

### 3.7. Sistema de condições

As condições serão configuráveis.

Cada condição terá:

- Identificador.
- Nome.
- Descrição.
- Ícone.
- Cor visual.
- Duração opcional.
- Unidade de duração.
- Referência opcional ao turno ou rodada de expiração.

Exemplos:

- Atordoado.
- Caído.
- Envenenado.
- Invisível.
- Imobilizado.
- Amedrontado.

No MVP, condições serão marcadores informativos. A aplicação automática de efeitos mecânicos ficará para versões futuras.

### 3.8. Sessões multiplayer

O mestre poderá criar uma sessão e compartilhar um convite.

Os jogadores poderão:

- Acessar pelo navegador.
- Entrar com identificação.
- Visualizar cenas autorizadas.
- Movimentar tokens permitidos.
- Acompanhar as atualizações em tempo real.
- Reconectar sem perder o estado da sessão.

O MVP suportará um servidor central e múltiplos participantes simultâneos por sessão.

### 3.9. Permissões

Serão considerados inicialmente três papéis.

**Mestre**

- Administração da campanha.
- Controle completo das cenas.
- Controle dos tokens.
- Edição de personagens.
- Gerenciamento das rodadas.
- Gerenciamento dos participantes.

**Jogador**

- Visualização de informações permitidas.
- Controle dos próprios tokens.
- Consulta às informações públicas do combate.

**Espectador**

- Visualização de informações públicas.
- Sem permissão para modificar o estado.

Quem entra na campanha pelo código entra como espectador; qualquer mestre o promove a jogador (e pode movê-lo de volta para espectador).

O criador da mesa é o **dono**: um mestre fixo, que ninguém rebaixa. Só o dono promove um jogador ou espectador a **mestre** (co-mestre) e o rebaixa de volta; o co-mestre tem tudo do mestre, menos gerir os mestres e excluir a mesa. Um admin do Lorkarium pode ligar, mesa a mesa, o modo **juggernaut**: enquanto ligado, é mestre com os poderes do dono, ninguém o rebaixa, e a mesa só o vê enquanto ele está online.

As permissões serão validadas exclusivamente no servidor.

### 3.10. Persistência

Serão armazenados:

- Usuários.
- Campanhas.
- Cenas.
- Configurações de grid.
- Personagens.
- Tokens.
- Condições.
- Combates.
- Participantes.
- Sessões e permissões.
- Referências a imagens.
- Estado atual do combate.

O estado deverá sobreviver à atualização da página, desconexão dos participantes e reinicialização do servidor.

---

### 3.11. Documentos livres na biblioteca

Extensão aprovada em 29/10/2026: a biblioteca também organiza documentos de texto rico nas pastas da campanha. Mestres criam e administram; jogadores escolhidos como donos editam título e conteúdo, inclusive dos documentos ocultos. Outros jogadores e espectadores consultam apenas os públicos. A posse depende do papel atual de jogador e não concede administração.

O conteúdo usa JSON validado pelo servidor, com fontes locais, estilos, listas, links seguros, tabelas simples e imagens guardadas no armazenamento da campanha. O editor Tiptap é carregado ao abrir o documento. Salvamento automático usa versão esperada e recibos idempotentes; conflito preserva o rascunho e exige reconciliação explícita. Invalidação e reconexão reautorizam o documento aberto; perda de leitura desmonta conteúdo e imagens. A biblioteca transmite somente resumos autorizados, sem corpos.

**Abas (extensão de 31/10/2026).** Cada documento tem abas nomeadas (1–40 caracteres), cada uma com o próprio conteúdo e a própria versão: duas pessoas editando abas diferentes não conflitam, e só os comandos estruturais (criar, renomear, ocultar, reordenar, excluir) usam a versão do documento. Todo documento nasce com a aba "Geral", tem no máximo 200 abas e nunca fica sem nenhuma. Quem edita o documento cria, renomeia, reordena (pelo menu ou arrastando) e exclui abas; só o mestre marca uma aba como "só mestres". Essa aba e as imagens dela não chegam ao jogador por nenhuma via — nem na lista de abas, nem pelo id, nem pelos bytes —, e o jogador não tem como descobrir que ela existe; quando ele reordena as que vê, a oculta fica no mesmo lugar para o mestre. Leitores sem edição só trocam de aba.

Contratos, limites, persistência e rotas: [context/documents.md](context/documents.md). Escopo aprovado: [plano de documentos](plans/2026-10-29-documentos-na-biblioteca.md). Sem fichas mecânicas de sistemas, colaboração CRDT/OT, histórico de versões ou persistência offline nesta entrega.

---

### 3.12. Fichas personalizadas

Extensão aprovada em 31/10/2026. O mestre (co-mestre incluso) escreve na biblioteca um **modelo** de ficha em HTML, CSS e JS; jogadores não veem nem escrevem modelos. Uma **ficha** liga um modelo a um token: no personagem de um jogador ela mora na âncora do elenco e vale em todo grid; um token só tem uma ficha. Corrigir o modelo atualiza todas as fichas dele, e excluir um modelo em uso é recusado.

- **Sandbox.** A ficha roda num iframe `sandbox="allow-scripts"` **sem** `allow-same-origin` (origem opaca: não lê o app, o cookie nem o storage), com o código em `srcdoc` atrás de um CSP sem rede (`default-src 'none'`; imagem e fonte só por `data:`/`blob:`). O app declara `frame-src 'self'`, então a ficha também não navega para fora; se tentar, o frame é destruído ("Ficha recarregada"). Uma ficha que não responde em 5 s ganha o aviso "A ficha não respondeu" e o botão de recarregar. Uma moldura do app diz o nome do modelo e "Ficha da mesa · código do mestre".
- **API (`window.lorkarium`, por `MessagePort`).** Ler o token ligado (nome, retrato e barras que quem olha já vê), ajustar as barras dele, rolar dados com o rótulo "<modelo> · <rótulo>" e guardar valores próprios no servidor. Nenhuma mensagem do frame escolhe token, mesa ou ficha: o host sabe qual ficha é, e o servidor reautoriza cada pedido com a identidade da sessão. A ficha nunca faz mais do que quem está olhando faria à mão.
- **Acesso.** Editam valores e barras o mestre e quem controla o token. Veem o mestre e os controladores (padrão) **ou** a mesa toda, só leitura, por escolha do mestre ficha a ficha. Quem não pode ver recebe 404, e a ficha aberta fecha com o motivo.
- **Limites.** Código até 512 KiB (HTML + CSS + JS); valores até 256 KiB, 1000 chaves, 8 níveis, chave de até 64 caracteres; até 10 rolagens em 10 s por ficha aberta. Valores sem versão esperada: a última escrita vence por chave, como as barras.

Contratos, tabelas, rotas e provas: [context/sheets.md](context/sheets.md). Escopo aprovado: [plano de documentos com abas e fichas](plans/2026-10-31-documentos-com-abas-e-fichas.md). Fora desta entrega: API de chat, condições, combate ou mover token, rede dentro da ficha, modelo escrito por jogador, importação de fichas de outros VTTs e histórico de versões do modelo.

## 4. Tecnologias

### 4.1. Frontend

| Tecnologia       | Responsabilidade                       |
| ---------------- | -------------------------------------- |
| React            | Interface web                          |
| TypeScript       | Tipagem estática                       |
| Vite             | Ferramentas de desenvolvimento e build |
| PixiJS v8        | Renderização do tabuleiro              |
| Zustand          | Estado local da aplicação              |
| Tailwind CSS     | Estilização                            |
| shadcn/ui        | Componentes visuais base               |
| React Router     | Navegação                              |
| Socket.IO Client | Comunicação em tempo real              |
| Zod              | Validação de contratos                 |

O React será responsável por painéis, formulários, menus, tracker de combate e demais componentes da interface.

O PixiJS será responsável pela renderização e interação gráfica com o tabuleiro.

### 4.2. Backend

| Tecnologia  | Responsabilidade              |
| ----------- | ----------------------------- |
| Node.js LTS | Ambiente de execução          |
| TypeScript  | Linguagem                     |
| Fastify     | Framework HTTP                |
| Socket.IO   | Comunicação bidirecional      |
| Zod         | Validação de entrada          |
| PostgreSQL  | Banco de dados                |
| Drizzle ORM | Consultas e modelagem         |
| Pino        | Logs estruturados             |
| Vitest      | Testes unitários e integração |

A aplicação seguirá uma arquitetura de monólito modular.

### 4.3. Infraestrutura

| Tecnologia                  | Responsabilidade                                |
| --------------------------- | ----------------------------------------------- |
| Docker                      | Containers                                      |
| Docker Compose              | Ambiente local                                  |
| Coolify                     | Implantação e gerenciamento                     |
| VPS Linux                   | Hospedagem                                      |
| Cloudflare                  | DNS, proxy e proteção de borda quando aplicável |
| Armazenamento S3 compatível | Imagens e arquivos                              |
| GitHub Actions              | CI/CD                                           |

A infraestrutura poderá ser adaptada conforme a utilização.

### 4.4. Ferramentas de desenvolvimento

- pnpm para gerenciamento de pacotes.
- pnpm Workspaces para o monorepo.
- ESLint para análise estática.
- Prettier para formatação.
- TypeScript em modo strict.
- Vitest para testes.
- Playwright para testes de ponta a ponta.
- Git para versionamento.
- GitHub para repositório e automações.

---

## 5. Arquitetura técnica

### 5.1. Modelo arquitetural

Será utilizada uma arquitetura client-server, com backend centralizado.

O frontend executará as operações gráficas e apresentará o estado da aplicação.

O backend será responsável por autenticação, permissões, regras compartilhadas, gerenciamento de sessões, persistência e comunicação entre clientes.

### 5.2. Comunicação

Serão utilizados dois mecanismos.

**HTTP REST**

Responsável por operações tradicionais:

- Autenticação.
- Consulta de campanhas.
- Criação de cenas.
- Upload de arquivos.
- Recuperação de dados persistidos.
- Configurações.

**Socket.IO**

Responsável por operações em tempo real:

- Entrada e saída de participantes.
- Movimentação de tokens.
- Alterações de HP.
- Aplicação de condições.
- Mudança de turnos.
- Alteração de cenas.
- Notificações de estado.

### 5.3. Separação de responsabilidades

**Frontend**

- Renderizar interface.
- Capturar ações do usuário.
- Enviar comandos.
- Exibir estados confirmados.
- Aplicar animações.
- Gerenciar estados temporários de interação.

**Backend**

- Autenticar participantes.
- Validar comandos.
- Verificar permissões.
- Executar regras de domínio.
- Persistir alterações.
- Publicar eventos autorizados.
- Sincronizar sessões.

**Game Core**

- Representar coordenadas.
- Converter posições em células.
- Calcular distâncias.
- Validar movimentos básicos.
- Gerenciar turnos.
- Gerenciar durações de condições.
- Aplicar modificações de estado.

### 5.4. Fluxo de uma movimentação

1. Usuário seleciona token.
2. Usuário arrasta token.
3. Frontend calcula posição desejada.
4. Frontend envia comando ao backend.
5. Backend autentica o solicitante.
6. Backend verifica acesso à sessão e ao token.
7. Backend valida o movimento.
8. Backend aplica e persiste o novo estado.
9. Backend publica o evento para os participantes autorizados.
10. Frontends atualizam a posição e apresentam a animação.

O servidor deverá enviar o estado confirmado, e não confiar integralmente nas coordenadas declaradas pelo cliente.

### 5.5. Estado das sessões

Uma instância do backend manterá o estado operacional das sessões ativas em memória.

O PostgreSQL será a fonte persistente dos dados.

Mudanças relevantes serão persistidas antes de serem confirmadas como concluídas.

Os eventos deverão possuir identificadores e versões para auxiliar na detecção de duplicações ou estados desatualizados.

### 5.6. Reconexão

Ao reconectar:

1. O participante será autenticado novamente.
2. O servidor verificará sua participação na sessão.
3. O cliente receberá um snapshot autorizado do estado atual.
4. O estado visual local será reconciliado.
5. A sincronização em tempo real continuará.

Snapshots deverão possuir versão, evitando que eventos recebidos durante a reconexão sobrescrevam dados mais recentes.

### 5.7. Evolução da escala

O MVP utilizará uma única instância do servidor.

Redis, filas distribuídas e múltiplas instâncias deverão ser considerados somente quando a aplicação exigir escalabilidade horizontal.

---

## 6. Modelo de dados conceitual

### User

Representa um usuário registrado.

Campos principais: id, name, email, passwordHash ou identidade externa, createdAt.

### Campaign

Representa uma campanha.

Campos: id, ownerId, name, description, createdAt, updatedAt.

### CampaignMember

Associa usuários e convidados às campanhas, com papéis e permissões.

### Scene

Representa uma cena ou mapa.

Campos: id, campaignId, name, backgroundAssetId, gridType, gridSize, gridOriginX, gridOriginY, width, height.

### Asset

Registra arquivos armazenados externamente.

Campos: id, ownerId, storageKey, mimeType, size, createdAt.

### Character

Representa uma entidade reutilizável.

Campos: id, campaignId, name, imageAssetId, attributes.

### Token

Representa uma instância visual em uma cena.

Campos: id, sceneId, characterId opcional, x, y, width, height, rotation, currentHp, maxHp, visibility.

### TokenController

Relaciona um token aos usuários ou participantes autorizados a controlá-lo.

### Combat

Representa um combate.

Campos: id, sceneId, status, currentRound, currentTurnIndex, version.

### Combatant

Entrada de iniciativa: age numa vez só e tem de nenhum a vários tokens (todos os inimigos juntos, o boss sozinho, o "Covil" sem token).

Campos: id, combatId, name (opcional: sem ele, a tela nomeia pelos tokens), initiative, sortOrder.

### CombatantToken

Liga um token a uma entrada de iniciativa; um token está em no máximo uma.

Campos: tokenId, combatantId.

### ConditionDefinition

Define condições disponíveis em uma campanha.

Campos: id, campaignId, name, description, icon, color.

### ActiveCondition

Representa uma condição aplicada.

Campos: id, tokenId, conditionId, durationValue, durationUnit, expirationRule.

### Session

Representa uma sessão multiplayer.

Campos: id, campaignId, activeSceneId, status, createdAt, closedAt.

### SessionMember

Registra participantes e suas permissões.

Campos: id, sessionId, userId ou guestIdentityId, role, joinedAt.

### ProcessedCommand

Registra identificadores de comandos processados para evitar duplicidade de operações críticas durante retransmissões.

---

## 7. API inicial

### 7.1. API REST

**Autenticação**

- POST /auth/register
- POST /auth/login
- POST /auth/logout
- GET /auth/me

**Campanhas**

- GET /campaigns
- POST /campaigns
- GET /campaigns/:id
- PATCH /campaigns/:id
- DELETE /campaigns/:id

**Cenas**

- GET /campaigns/:id/scenes
- POST /campaigns/:id/scenes
- GET /scenes/:id
- PATCH /scenes/:id
- DELETE /scenes/:id

**Assets**

- POST /assets
- GET /assets/:id

**Sessões**

- POST /sessions
- GET /sessions/:id
- POST /sessions/:id/join
- POST /sessions/:id/leave
- POST /sessions/:id/close

Os endpoints serão protegidos de acordo com autenticação e autorização.

### 7.2. Eventos Socket.IO

**Sessões**

- session:join
- session:leave
- session:state
- session:memberJoined
- session:memberLeft

**Cenas**

- scene:activate
- scene:activated
- scene:updated

**Tokens**

- token:move
- token:moved
- token:update
- token:updated
- token:create
- token:created
- token:delete
- token:deleted

**Combate**

- combat:start
- combat:started
- combat:nextTurn
- combat:turnChanged
- combat:end
- combat:ended

**Condições**

- condition:apply
- condition:applied
- condition:remove
- condition:removed

A nomenclatura distingue comandos solicitados de eventos que informam alterações confirmadas.

### 7.3. Estrutura das mensagens

Os comandos deverão conter:

- actionId.
- Identificador da sessão.
- Tipo de comando.
- Payload validado.

As respostas deverão informar sucesso ou falha e, quando necessário, o motivo.

Os eventos de estado deverão conter:

- Tipo do evento.
- Identificador da entidade.
- Versão do estado.
- Dados alterados.
- Momento do processamento.

A identidade do usuário será obtida da conexão autenticada, nunca de um identificador arbitrário declarado no payload.

---

## 8. Segurança

### 8.1. Autenticação

O MVP utilizará contas de mestre e poderá permitir convidados através de convites temporários.

Senhas locais deverão ser armazenadas com hash apropriado, como Argon2id.

A autenticação deverá utilizar sessões seguras, com cookies HttpOnly, Secure e SameSite configurados adequadamente.

### 8.2. Autorização

Toda operação deverá verificar:

- Identidade do solicitante.
- Participação na campanha ou sessão.
- Papel do participante.
- Permissões específicas sobre recursos.
- Regras de visibilidade.

Nenhum identificador fornecido pelo cliente deverá ser tratado como prova de autorização.

### 8.3. Proteção da comunicação

O ambiente público utilizará HTTPS e WSS.

As conexões Socket.IO deverão validar autenticação, origem e acesso aos recursos.

### 8.4. Rate limiting

Deverão existir limites para:

- Tentativas de login.
- Criação de sessões.
- Uploads.
- Entrada por convite.
- Comandos de movimentação.
- Frequência de alterações de estado.

### 8.5. Uploads

Arquivos deverão passar por validações de extensão, tipo real, tamanho e dimensões.

Os arquivos não serão executados no servidor.

Os objetos serão armazenados com identificadores seguros, e não diretamente com nomes fornecidos pelos usuários.

### 8.6. Dependências e segredos

- Verificação de vulnerabilidades conhecidas.
- Dependências com versões fixadas no lockfile.
- Variáveis de ambiente para segredos.
- Ausência de credenciais no repositório.
- Atualizações regulares de segurança.
- Princípio de menor privilégio no banco de dados.

---

## 9. Requisitos não funcionais

### 9.1. Desempenho

Metas iniciais propostas para validação:

- Buscar renderização próxima de 60 FPS em computadores compatíveis.
- Evitar recriar todos os objetos PixiJS a cada alteração de estado.
- Transmitir alterações pequenas em vez de enviar todo o mapa repetidamente.
- Manter comandos interativos responsivos em condições normais de rede.

A latência de sincronização deverá ser medida separando tempo de rede, processamento e renderização.

### 9.2. Escalabilidade

A arquitetura deverá permitir sessões independentes.

O MVP não terá requisitos de escalabilidade horizontal.

### 9.3. Confiabilidade

- Restaurar estados após reinicialização.
- Recuperar conexões interrompidas.
- Evitar aplicação duplicada de comandos críticos.
- Garantir isolamento de dados por campanha.
- Utilizar transações para alterações consistentes.
- Executar backups periódicos.

### 9.4. Manutenibilidade

- Módulos separados por domínio.
- Interfaces e contratos compartilhados.
- Testes automatizados.
- Documentação das decisões técnicas.
- Padronização de código.
- Baixo acoplamento entre motor, transporte e persistência.

---

## 10. Estrutura do repositório

```text
rpg-vtt/
├── apps/
│   ├── web/
│   │   ├── src/
│   │   │   ├── app/
│   │   │   ├── components/
│   │   │   ├── features/
│   │   │   │   ├── campaigns/
│   │   │   │   ├── scenes/
│   │   │   │   ├── board/
│   │   │   │   ├── tokens/
│   │   │   │   ├── combat/
│   │   │   │   └── sessions/
│   │   │   ├── renderer/
│   │   │   ├── services/
│   │   │   └── stores/
│   │   └── package.json
│   │
│   └── server/
│       ├── src/
│       │   ├── app/
│       │   ├── modules/
│       │   │   ├── auth/
│       │   │   ├── campaigns/
│       │   │   ├── scenes/
│       │   │   ├── tokens/
│       │   │   ├── combat/
│       │   │   ├── sessions/
│       │   │   └── assets/
│       │   ├── realtime/
│       │   ├── database/
│       │   └── infrastructure/
│       └── package.json
│
├── packages/
│   ├── contracts/
│   ├── game-core/
│   └── tsconfig/
│
├── infra/
│   ├── docker/
│   └── compose/
│
├── docs/
│   ├── architecture/
│   ├── api/
│   └── decisions/
│
├── pnpm-workspace.yaml
└── package.json
```

---

## 11. Plano de implementação

### Fase 0 — Fundação

Objetivo: estruturar o repositório e validar a integração entre os principais componentes.

Tarefas:

- Criar monorepo.
- Configurar TypeScript strict.
- Configurar React e Vite.
- Configurar Fastify.
- Configurar Socket.IO.
- Configurar PixiJS.
- Criar ambiente Docker local.
- Configurar lint e testes.
- Implementar health check no backend.
- Validar conexão entre dois navegadores.

**Entrega:** ambiente funcional para desenvolvimento.

### Fase 1 — Protótipo do grid

Objetivo: implementar as operações fundamentais do tabuleiro.

Tarefas:

- Renderizar canvas.
- Renderizar grid quadrado.
- Implementar câmera.
- Implementar zoom.
- Criar tokens.
- Selecionar tokens.
- Arrastar tokens.
- Ajustar posições às células.
- Separar coordenadas de mundo e tela.
- Testar redimensionamento do navegador.

**Entrega:** tabuleiro local interativo.

### Fase 2 — Sincronização multiplayer

Objetivo: permitir que vários participantes interajam com o mesmo tabuleiro.

Tarefas:

- Criar sessões temporárias.
- Permitir entrada de participantes.
- Criar rooms Socket.IO.
- Sincronizar movimentos.
- Validar permissão de movimentação.
- Sincronizar criação e remoção de tokens.
- Tratar desconexões.
- Implementar snapshot inicial.
- Implementar reconexão com controle de versão.

**Entrega:** tabuleiro multiplayer funcional.

### Fase 3 — Persistência

Objetivo: manter o estado do projeto entre sessões.

Tarefas:

- Configurar PostgreSQL.
- Implementar Drizzle.
- Criar migrations.
- Criar entidades de campanha, cena e token.
- Salvar configurações de grid.
- Salvar estados de tokens.
- Carregar cenas existentes.
- Persistir sessões relevantes.
- Implementar autenticação e autorização persistentes.

**Entrega:** campanhas e cenas persistentes.

### Fase 4 — Combate

Objetivo: implementar gerenciamento completo do combate básico.

Tarefas:

- Criar combates.
- Adicionar participantes.
- Configurar iniciativa.
- Ordenar participantes.
- Avançar turnos.
- Avançar rodadas.
- Adicionar HP e HP máximo.
- Renderizar barras de vida.
- Implementar condições.
- Definir duração de condições.
- Sincronizar alterações.

**Entrega:** sistema de combate utilizável.

### Fase 5 — Interface do mestre

Objetivo: melhorar o gerenciamento das sessões.

Tarefas:

- Criar painel lateral.
- Criar tracker de iniciativa.
- Implementar edição de tokens.
- Criar biblioteca de condições.
- Criar gerenciamento de cenas.
- Criar biblioteca de imagens.
- Criar gerenciamento de participantes.
- Criar visão do jogador.
- Criar controles de visibilidade.

**Entrega:** experiência de utilização integrada.

### Fase 6 — Publicação

Objetivo: disponibilizar o sistema pela internet.

Tarefas:

- Criar imagens Docker de produção.
- Configurar VPS.
- Configurar proxy reverso.
- Configurar HTTPS e WSS.
- Configurar banco de produção.
- Configurar armazenamento de arquivos.
- Configurar variáveis e segredos.
- Configurar backups.
- Configurar logs.
- Executar testes de segurança.
- Executar testes de reconexão e concorrência.

**Entrega:** MVP público funcional.

---

## 12. Funcionalidades futuras

Não fazem parte do MVP inicial:

- Grid hexagonal.
- Fog of war.
- Visão individual por personagem.
- Iluminação dinâmica.
- Colisões complexas.
- Pathfinding.
- Medição avançada de áreas de efeito.
- Sistema de dados.
- Automação de regras.
- Efeitos de partículas.
- Áudio sincronizado.
- Chat.
- Histórico avançado e replay de combate.
- Aplicativo desktop.
- Marketplace de extensões.
- API pública.
- Importação de conteúdo de outros VTTs.

A implementação dessas funcionalidades dependerá da evolução da arquitetura e das necessidades reais de utilização.

---

## 13. Critérios de conclusão do MVP

O MVP será considerado funcional quando:

1. Um mestre conseguir criar uma conta e uma campanha.
2. O mestre conseguir criar uma cena com imagem de fundo.
3. O grid puder ser configurado e visualizado.
4. O mestre conseguir adicionar e movimentar tokens.
5. Um jogador conseguir entrar pela internet (pelo código, como espectador, e ser promovido a jogador pelo mestre).
6. Os participantes visualizarem movimentos em tempo real.
7. As permissões de movimentação forem respeitadas.
8. O mestre conseguir iniciar um combate.
9. O sistema conseguir controlar turnos e rodadas.
10. Tokens possuírem barras de vida e condições.
11. Alterações relevantes serem persistidas.
12. Um participante conseguir reconectar e recuperar o estado correto.
13. O sistema continuar funcional após reinicialização do servidor.
14. Uma sessão não permitir acesso não autorizado a dados de outra campanha.

---

## 14. Riscos técnicos

### Renderização

A integração entre React e PixiJS deverá evitar atualizações gráficas desnecessárias.

### Sincronização

Será necessário lidar com eventos duplicados, conexões interrompidas e comandos concorrentes.

### Consistência

O banco e o estado em memória não poderão divergir silenciosamente.

### Autorização

Todas as operações por campanha, sessão e token deverão verificar permissões.

### Evolução do domínio

O modelo deverá distinguir personagens, tokens, cenas e combates, evitando dependências que impeçam suporte a sistemas de RPG diferentes.

### Complexidade funcional

Recursos avançados de visão, iluminação e automação de regras deverão ser adicionados somente após estabilização do tabuleiro e do multiplayer.

---

## 15. Decisões técnicas iniciais

- Aplicação web, acessível pela internet.
- Backend em Node.js e TypeScript.
- Fastify para HTTP.
- Socket.IO para eventos.
- React para interface.
- PixiJS para renderização.
- PostgreSQL para persistência.
- Drizzle ORM para acesso ao banco.
- Zod para validação.
- Monólito modular.
- Servidor autoritativo.
- Uma instância de backend no MVP.
- Grid quadrado inicialmente.
- Regras genéricas.
- Desenvolvimento incremental.
- Hospedagem em VPS.
- Deploy via Docker e Coolify.

Essas decisões constituem a arquitetura de referência inicial e poderão ser revistas mediante protótipos, testes e requisitos novos.
