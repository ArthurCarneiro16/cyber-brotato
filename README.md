# ⚡ CYBER BROTATO

<p align="center">
  <strong>Um roguelike de sobrevivência em uma Night City dominada pelo caos.</strong>
</p>

<p align="center">
  Desenvolvido com Phaser 3, TypeScript e Vite.
</p>

---

## 🎮 Sobre o projeto

Cyber Brotato é um jogo web inspirado em Brotato, ambientado no universo cyberpunk de Night City.

Enfrente ondas de inimigos, compre armas e implantes cibernéticos, gerencie sua humanidade e sobreviva enquanto sua própria tecnologia ameaça consumir quem você é.

Cada escolha tem um preço. Quanto mais poderoso você fica, mais perto pode estar da ciberpsicose.

## 🚀 Tecnologias

- **Phaser 3** — Engine do jogo.
- **TypeScript** — Linguagem principal.
- **Vite** — Ambiente de desenvolvimento e build.
- **HTML5 Canvas** — Renderização do jogo.
- **LocalStorage** — Persistência dos fantasmas de runs anteriores.

## ⚙️ Como executar

É necessário ter Node.js e npm instalados.

Clone o repositório:

```bash
git clone https://github.com/SEU_USUARIO/cyber-brotato.git
```

Entre na pasta:

```bash
cd cyber-brotato
```

Instale as dependências:

```bash
npm install
```

Inicie o servidor:

```bash
npm run dev
```

Acesse o endereço exibido pelo Vite no terminal.

**Importante:** utilize o Vite para executar o projeto. Não utilize Live Server.

## 🕹️ Controles

| Tecla / Ação | Função |
|---|---|
| WASD | Movimentação |
| Mouse | Mirar |
| Segurar botão esquerdo | Atirar |
| ESC | Abrir menu de pausa |
| 1 / 2 / 3 | Comprar itens na loja |
| R | Reroll na loja |
| ESPAÇO | Iniciar próxima wave |
| M | Ativar/desativar áudio |

O menu de pausa também permite visualizar a build atual e reiniciar a run.

## 🧠 Mecânicas principais

### Humanidade e implantes

- A run começa com 100 pontos de humanidade.
- A humanidade diminui conforme os implantes são instalados.
- Implantes podem ser empilhados.
- O custo dos implantes aumenta conforme novas instalações são realizadas.
- Armas custam apenas dinheiro.

### Ciberpsicose e fantasmas

Quando a humanidade chega a zero, o personagem sofre ciberpsicose e a run termina.

O jogo salva os dados da run como um fantasma, incluindo:

- Pontuação de poder.
- Wave alcançada.
- Implantes utilizados.

Os fantasmas podem retornar em runs futuras como inimigos especiais, elites, mini-bosses ou bosses.

### Waves e inimigos

O MVP possui cinco waves, com duração de 45 segundos cada.

Tipos atuais de inimigos:

- Normal.
- Fast.
- Tank.

A dificuldade aumenta conforme o avanço das waves.

## 💾 Persistência

Os dados dos fantasmas são armazenados localmente no navegador usando LocalStorage.

O sistema possui versionamento de save, migração de formato antigo e tratamento de dados corrompidos.

## 🛠️ Scripts disponíveis

```bash
npm run dev
```
Inicia o servidor de desenvolvimento.

```bash
npx tsc --noEmit
```
Verifica os tipos do TypeScript.

```bash
npm run build
```
Gera a build de produção.

## 📌 Roadmap

- [x] Estrutura inicial do jogo.
- [x] Movimentação e combate.
- [x] Sistema de waves.
- [x] Loja de implantes.
- [x] Sistema de humanidade.
- [x] Ciberpsicose.
- [x] Sistema de fantasmas.
- [x] Fantasma como mini-boss e boss.
- [x] Sistema de pausa.
- [x] Visualização da build.
- [x] Efeitos visuais e sonoros.
- [x] Persistência de dados versionada.
- [ ] Classes jogáveis (Solo, Netrunner, Techie e Nomad).
- [ ] Sistema de armas.
- [ ] Modo infinito.
- [ ] Pixel art cyberpunk definitiva.

## 👨‍💻 Desenvolvimento

Projeto independente desenvolvido por um estudante de Análise e Desenvolvimento de Sistemas (ADS).

**Objetivo:** desenvolver um roguelike completo, combinando sobrevivência em arena, progressão de personagem e elementos do universo cyberpunk.

---

<p align="center">
  <strong>NO FUTURE WITHOUT CHROME.</strong>
</p>

<p align="center">
  Cyber Brotato — Em desenvolvimento.
</p>
