# AGENTS.md — Cyber-Brotato

## Contexto e Stack
- Jogo web roguelike arena (estilo Brotato) ambientado em Cyberpunk 2077 (dev solo, estudante de ADS).
- **Stack:** Phaser 3 + TypeScript + Vite.
- **Comandos:**
  - `npm install` / `npm run dev` (nunca usar Live Server; o TypeScript precisa do Vite).
  - `npx tsc --noEmit` (validação de tipos).
  - `npm run build` (build de produção).
- **Preferências de trabalho:** responder sempre em português do Brasil, de forma direta e curta. Ao alterar código, modificar apenas o necessário e manter tipagem estrita.

## Regras de Design (GDD)
- **Controles:** `WASD` move, mouse mira, segurar clique atira. Na wave: `ESC` abre o menu de pausa (Continuar, Ver Build, Reiniciar). Na loja: `1/2/3` compra, `R` faz reroll, `ESPAÇO` inicia a próxima wave. No fim de run: `R` reinicia (`scene.restart()`).
- **Moeda:** chamar sempre de **edinhos** (nunca *eddies*).
- **Humanidade e Implantes:**
  - Humanidade começa em `100`, só desce e nunca recupera durante a run.
  - Implantes custam edinhos e humanidade (custo de humanidade sobe com a raridade).
  - Todos os implantes empilham; cada implante instalado encarece os próximos em `+25%`.
  - Armas (a implementar) custam apenas edinhos, sem custo de humanidade.
- **Ciberpsicose e Fantasma:**
  - Se `humanity <= 0`, a run acaba em Ciberpsicose e salva `{ score, wave, implants }` em `localStorage['ghosts']` (máximo de 20 registros).
  - Em runs futuras, um fantasma é sorteado e recebe papel por sorteio ponderado pela pontuação (`elite`, `miniboss` ou `boss`), escalado para a wave em que aparece.
- **Estrutura de Waves e Inimigos:**
  - MVP: 5 waves de 45s (jogo completo: ~10 waves de 1–2 min + modo infinito).
  - Inimigos atuais: `normal`, `fast` (wave >= 2) e `tank` (wave >= 3).
  - Meta-progressão futura: apenas desbloqueios (classes, armas, implantes), sem atributos permanentes.
- **Visual:** placeholders atuais são texturas procedurais (quadrados coloridos). Meta final: pixel art cyberpunk (neon, chuva, sprites pequenos).

## Arquitetura e Estado Atual
- Arquivos modulares: `src/types.ts` (tipos), `src/data/implants.ts` (implantes), `src/data/enemies.ts` (inimigos) e `src/GameScene.ts` (cena principal).
- Todo o estado da run (`Stats`, listas e flags) é resetado dentro de `create()` para garantir compatibilidade com `this.scene.restart()`.
- **Já implementado:** loop de 5 waves, 3 tipos de inimigos, loja com sorteio de 3 entre 8 implantes + inflação + reroll, cálculo de `powerScore()`, refatoração de tipos/catálogos (Passo 1) e Fantasma da Ciberpsicose como mini-boss (wave 3) ou boss (wave 5) com sorteio ponderado por pontuação e escalonamento por wave + implantes (Passo 2).

## Próximos Passos (Escopo do MVP)
1. ~~**Refatoração:** extrair tipos (`src/types.ts`) e catálogos (`src/data/implants.ts`, `src/data/enemies.ts`) de `GameScene.ts`.~~ (Concluído)
2. ~~**Bosses / Fantasma:** O Fantasma aparece como mini-boss ou boss, com sorteio ponderado por pontuação e escalonamento para a wave em que aparece.~~ (Concluído)
3. **Classes:** criar 2 classes iniciais jogáveis (ex.: `Solo` e `Netrunner`, dentre Solo, Netrunner, Techie e Nomad) com passivas próprias.
4. **Armas:** adicionar ~5 armas compráveis exclusivamente com edinhos.
5. **Pós-MVP:** modo infinito após a wave 5 e substituição dos placeholders por pixel art.