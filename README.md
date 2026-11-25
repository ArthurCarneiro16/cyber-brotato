# Cyber Brotato — V2 Foundation

Primeira entrega jogável de um roguelike de arena cyberpunk, reconstruída em Phaser 3, TypeScript strict e Vite.

## Executar

Requer Node.js e npm. Na raiz do projeto:

~~~sh
npm install
npm run dev
~~~

Abra o endereço local exibido pelo Vite. Use Vite, não Live Server.

## Controles

- WASD: mover o Edgerunner.
- Mouse: mirar a katana.
- Segurar o botão esquerdo: atacar.
- R: reiniciar depois de vencer ou perder.
- Também é possível clicar na mensagem final para reiniciar.

## Primeira entrega

- Arena delimitada com perspectiva 3/4.
- Edgerunner Punk com a katana como objeto visual independente.
- Um inimigo que persegue o jogador, recebe dano e causa dano por contato.
- Vida do jogador e do inimigo, vitória, derrota e reinício.
- Arte aprovada carregada de public/assets/characters/edgerunner/.
- Chão, inimigo, efeitos e elementos de interface desenhados em código.

As regras puras de movimento e alcance de ataque ficam em src/game/rules/; entidades e cena ficam em src/game/entities/ e src/game/scenes/. Os sistemas anteriores foram mantidos nos arquivos existentes, mas a aplicação nova não os importa.

## Validação

~~~sh
npm test
npm run build
npm run preview
~~~

O build valida os tipos TypeScript e gera os arquivos em dist/.
