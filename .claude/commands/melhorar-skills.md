---
description: Faz a retrospectiva da conversa atual — o que foi pedido, quais skills/comandos/ferramentas foram usados, o que ajudou ou atrapalhou — e propõe melhorias mínimas nos comandos e skills do projeto, aplicando só após aprovação.
argument-hint: [foco opcional da retrospectiva]
allowed-tools: Read, Grep, Glob, Edit, Write, AskUserQuestion, Bash(ls:*), Bash(find:*), Bash(date:*), Bash(git log:*), Bash(git diff:*), Bash(node:*)
---

# /melhorar-skills — Retrospectiva e melhoria contínua dos comandos

Analise a conversa atual e melhore os comandos/skills do projeto para que a próxima execução seja melhor. O produto são **edições mínimas e aprovadas** nos arquivos de `.claude/` deste projeto — nada de reescrever tudo.

## Regras invioláveis

1. **Só altere arquivos dentro de `.claude/` DESTE projeto.** Nunca crie ou edite nada em `~/.claude/` ou em outros repositórios.
2. **Toda proposta de mudança precisa de evidência da conversa atual.** "Poderia ser melhor" sem um momento concreto onde algo atrapalhou não vira edição. Sem evidência, não mexa.
3. **Mudança mínima.** Corrija a causa do problema observado; não aproveite para reformatar, reorganizar ou "melhorar de graça" o resto do arquivo.
4. **Nenhuma edição sem aprovação.** Mostre o antes/depois de cada trecho via AskUserQuestion antes de aplicar.
5. **A `description` de um comando diz QUANDO usá-lo, não resume o fluxo.** Se editar frontmatter, preserve isso.
6. **Driver mudou, autoteste prova.** Edição num `.mjs` de `.claude/skills/<skill>/` entra com a linha na fixture e a expectativa no `autoteste.mjs`, e só é dada por pronta com `node .claude/skills/<skill>/autoteste.mjs` verde.

## Passo a passo

### 1. Reconstituir o pedido original

Releia o início da conversa e resuma em 2–3 frases: o que o usuário pediu, qual era o resultado esperado e o que de fato foi entregue. Se `$ARGUMENTS` indicar um foco, restrinja a retrospectiva a ele.

### 2. Inventariar o que foi usado

Liste em uma tabela:

| Item | Tipo (skill/comando/ferramenta/MCP) | Para quê foi usado |
| ---- | ----------------------------------- | ------------------ |

Inclua também o que **deveria ter sido usado e não foi** (ex.: um comando do projeto que cobria o caso, uma skill ignorada) — isso costuma ser o achado mais valioso.

### 3. Avaliar com evidência

Para cada item relevante, classifique:

- **Ajudou** — cumpriu o papel; nada a fazer.
- **Atrapalhou** — gerou retrabalho, saída errada ou fricção. Cite o momento exato da conversa.
- **Faltou** — lacuna: instrução ambígua, passo inexistente, ferramenta não permitida no `allowed-tools`, gatilho da description que não disparou, falso positivo ou negativo de um driver.

Verifique também sinais comuns: perguntas que o comando deveria ter respondido sozinho, permissões negadas, passos executados fora de ordem, retrabalho por instrução ambígua.

### 4. Propor e aplicar melhorias

Para cada "atrapalhou"/"faltou" com causa em um arquivo de `.claude/`:

1. Leia o arquivo atual.
2. Formule a menor edição que corrige a causa (frase nova, regra explícita, ajuste de `allowed-tools`, exemplo melhor, guardião novo na fixture do driver).
3. Apresente via AskUserQuestion: trecho atual → trecho proposto → por que resolve (com a evidência do passo 3).
4. Aplique apenas o que for aprovado, com Edit. Se tocou driver, rode o autoteste da skill.

Se não houver nada com evidência suficiente, diga isso e encerre — retrospectiva sem mudança é um resultado válido.

### 5. Lacunas que pedem skill/comando novo

Se um padrão da conversa se repetiu, não é coberto por nenhum comando existente e tende a voltar em tarefas futuras, pergunte ao usuário (AskUserQuestion) se quer criar um comando novo, apresentando: nome sugerido, quando seria acionado e o que faria. Só crie se aprovado, em `.claude/commands/`, seguindo o formato dos comandos existentes (frontmatter com `description` de gatilho, regras invioláveis, passo a passo, `$ARGUMENTS` no final quando fizer sentido).

Não crie comando para coisa pontual desta conversa — o critério é recorrência provável.

### 6. Resumo final

Encerre com: o que foi avaliado, o que mudou (arquivo + uma linha por edição), o que foi proposto e recusado, e o que ficou apenas anotado por falta de evidência.

## Foco opcional do usuário

$ARGUMENTS
