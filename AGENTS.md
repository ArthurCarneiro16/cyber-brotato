# AGENTS.md — Cyber-Brotato

## Contexto e Stack
- Jogo web roguelike arena (estilo Brotato) ambientado em Cyberpunk 2077 (dev solo, estudante de ADS).
- **Stack:** Phaser 3 + TypeScript + Vite.
- **Comandos:**
  - `npm install` / `npm run dev` (nunca usar Live Server; o TypeScript precisa do Vite).
  - `npx tsc --noEmit` (validação de tipos).
  - `npm run test` (regras da run, sem Phaser) e `npm run sim` (simulador de balanceamento).
  - `npm run build` (build de produção).
- **Preferências de trabalho:** responder sempre em português do Brasil, de forma direta e curta. Ao alterar código, modificar apenas o necessário e manter tipagem estrita. Sempre enviar arquivos completos, nunca trechos picotados.

## Regras de Design (GDD)
- **Controles:** `WASD` move, mouse mira, segurar clique atira (armas corpo a corpo atacam sozinhas). No início da run: `1/2/3` escolhe a classe. Na wave: `Q` troca de arma, `ESPAÇO` ativa o Sandevistan (se instalado), `ESC` abre o menu de pausa (Continuar, Ver Build, Reiniciar). Na loja: `1/2/3` compra implante, `4/5` compra arma, `R` faz reroll, `ESPAÇO` inicia a próxima wave. No fim de run: `R` reinicia (`scene.restart()`).
- **Moeda:** chamar sempre de **edinhos** (nunca *eddies*).
- **Humanidade e Implantes:**
  - Humanidade começa em `100`, só desce e nunca recupera durante a run.
  - Implantes custam edinhos e humanidade (custo de humanidade sobe com a raridade).
  - Todos os implantes empilham; cada implante instalado encarece os próximos em `+25%`.
- **Armas (6):** Pistola, Submetralhadora, Escopeta, Pistola Inteligente (mira automática), Katana e Braços de Gorila (corpo a corpo automático em arco). Custam apenas edinhos (sem humanidade, sem inflação de implantes). A loja oferece 2 por rolagem (sorteio com Rng próprio); a arma comprada já fica equipada. Dano final = dano da arma + bônus dos implantes (escopeta recebe metade do bônus por projétil). Cadência = delay da arma escalado pelos implantes de cadência e pelo Sandevistan (piso de 60 ms). Empurrão do Gorilla Arms e dos Braços de Gorila usam o mesmo sistema (`pushUntil`).
- **Classes (3):** `Solo` (120 HP, katana, corpo a corpo +1 dano), `Netrunner` (90 HP, pistola, armas de fogo 10% mais rápidas), `Techie` (100 HP, pistola inteligente, alcance de aquisição 360 e projétil 460). Bônus afetam só o tipo de arma correspondente. `Nomad` fica para depois do MVP.
- **Ciberpsicose e Fantasma:**
  - Se `humanity <= 0`, a run acaba em Ciberpsicose e salva `{ score, wave, implants }` em `localStorage['ghosts']` (máximo de 20 registros).
  - Em runs futuras, um fantasma é sorteado e recebe papel por sorteio ponderado pela pontuação (`elite`, `miniboss` ou `boss`), escalado para a wave em que aparece.
- **Estrutura de Waves e Inimigos:**
  - MVP: 5 waves de 45s (jogo completo: ~10 waves de 1–2 min + modo infinito).
  - Inimigos atuais: `normal`, `fast` (wave >= 2) e `tank` (wave >= 3).
  - Meta-progressão futura: apenas desbloqueios (classes, armas, implantes), sem atributos permanentes.
- **Visual:** placeholders atuais são texturas procedurais (quadrados coloridos). Meta final: pixel art cyberpunk (neon, chuva, sprites pequenos).

## Arquitetura e Estado Atual
- Arquivos modulares: `src/types.ts` (tipos), `src/data/implants.ts`, `src/data/enemies.ts`, `src/data/weapons.ts` (armas), `src/data/classes.ts` (classes e bônus), `src/rules/run.ts` (regras sem Phaser), `src/sim/balance.ts` (simulador) e `src/GameScene.ts` (cena principal).
- Todo o estado da run (`Stats`, listas e flags) é resetado dentro de `create()` para garantir compatibilidade com `this.scene.restart()`. A classe só é aplicada em `run.setClass()` depois da escolha no menu inicial; sem ela (testes e simulador) a run usa os stats base.
- **Já implementado:** loop de 5 waves, 3 tipos de inimigos, loja com sorteio de 3 entre 8 implantes + inflação + reroll, cálculo de `powerScore()`, refatoração de tipos/catálogos (Passo 1) Fantasma da Ciberpsicose como mini-boss (wave 3) ou boss (wave 5) com sorteio ponderado por pontuação e escalonamento por wave + implantes (Passo 2), seleção de classe (Solo, Netrunner, Techie) e 6 armas com troca em wave (Passos 3 e 4).

## Próximos Passos (Escopo do MVP)
1. ~~**Refatoração:** extrair tipos (`src/types.ts`) e catálogos (`src/data/implants.ts`, `src/data/enemies.ts`) de `GameScene.ts`.~~ (Concluído)
2. ~~**Bosses / Fantasma:** O Fantasma aparece como mini-boss ou boss, com sorteio ponderado por pontuação e escalonamento para a wave em que aparece.~~ (Concluído)
3. ~~**Classes:** Solo, Netrunner e Techie.~~ (Concluído)
4. ~~**Armas:** 6 armas compráveis com edinhos.~~ (Concluído)
5. **Pós-MVP:** modo infinito após a wave 5, classe Nomad, mais armas (rifle de precisão, torretas) e substituição dos placeholders por pixel art.
