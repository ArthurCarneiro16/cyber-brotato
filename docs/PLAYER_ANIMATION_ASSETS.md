# Assets de animação do protagonista

Este documento define o contrato dos assets Idle e Walk do Edgerunner. Ele prepara a validação dos arquivos; não representa animações já integradas ao jogo.

## Regras comuns

- Formato: PNG, sem entrelaçamento, com transparência real (canal alpha ou transparência PNG equivalente).
- Cada célula mede **32×48 px**. Não redimensione as folhas para corrigir dimensões inválidas.
- Cada direção ocupa uma linha e cada quadro ocupa uma coluna.
- A arte deve preservar o design existente: punk/Edgerunner, moicano magenta, jaqueta futurista, implante ciano, roupas escuras e perspectiva 3/4.
- Os quadros devem alinhar os pés na mesma coordenada vertical. A posição do pé de apoio pode variar na pose, mas a origem do personagem não deve saltar por transparência ou recorte inconsistentes.
- Não inclua fundo opaco. Deixe transparente o espaço não ocupado pelo personagem.
- O script reporta quadros totalmente transparentes e pixels opacos encostados na borda de uma célula. Bordas são um aviso para revisão, pois podem indicar recorte; não são automaticamente erro.

## Idle

| Propriedade | Especificação |
|---|---|
| Caminho | `public/assets/characters/edgerunner/idle.png` |
| Célula | 32×48 px |
| Colunas / quadros por direção | 4 |
| Linhas / direções | 4 |
| Dimensão da folha | **128×192 px** |
| Total | 16 quadros |
| Ordem das linhas | baixo, esquerda, direita, cima |

## Walk

| Propriedade | Especificação |
|---|---|
| Caminho | `public/assets/characters/edgerunner/walk.png` |
| Célula | 32×48 px |
| Colunas / quadros por direção | 6 |
| Linhas / direções | 8 |
| Dimensão da folha | **192×384 px** |
| Total | 48 quadros |
| Ordem das linhas | baixo, baixo-esquerda, esquerda, cima-esquerda, cima, cima-direita, direita, baixo-direita |

As dimensões são calculadas como `largura = colunas × 32` e `altura = linhas × 48`. Cada folha é uma grade row-major: a linha seleciona a direção e a coluna seleciona o quadro.

## Convenção de sockets da mão

O arquivo planejado é `public/assets/characters/edgerunner/sockets.json`. As coordenadas são pixels locais à célula de 32×48: `(0,0)` no canto superior esquerdo, X aumenta para a direita e Y para baixo. Cada animação possui exatamente uma lista por direção e um socket por quadro. `x,y` indicam o ponto de empunhadura da mão, antes da escala do objeto no Phaser.

Exemplo abreviado (o arquivo real deve incluir todos os quadros de cada direção usada):

```json
{
  "version": 1,
  "frame": { "width": 32, "height": 48, "origin": "top-left" },
  "animations": {
    "idle": {
      "baixo": [{ "x": 22, "y": 28 }, { "x": 22, "y": 28 }, { "x": 22, "y": 28 }, { "x": 22, "y": 28 }],
      "esquerda": [{ "x": 9, "y": 28 }, { "x": 9, "y": 28 }, { "x": 9, "y": 28 }, { "x": 9, "y": 28 }],
      "direita": [{ "x": 23, "y": 28 }, { "x": 23, "y": 28 }, { "x": 23, "y": 28 }, { "x": 23, "y": 28 }],
      "cima": [{ "x": 22, "y": 25 }, { "x": 22, "y": 25 }, { "x": 22, "y": 25 }, { "x": 22, "y": 25 }]
    },
    "walk": {
      "baixo": [{ "x": 22, "y": 28 }, { "x": 22, "y": 28 }, { "x": 22, "y": 28 }, { "x": 22, "y": 28 }, { "x": 22, "y": 28 }, { "x": 22, "y": 28 }]
    }
  }
}
```

Os valores acima são ilustrativos, não sockets medidos no sprite. Para Walk, completar as oito direções; para Idle, as quatro listadas. A ordem dos arrays coincide com a ordem temporal das colunas da respectiva spritesheet. O validador, quando `sockets.json` estiver presente, verifica schema básico, limites da célula e contagem de sockets por direção.

## Validação

Na raiz do projeto, execute:

```sh
node scripts/validate-player-animation-assets.mjs
```

Sem `idle.png` e `walk.png`, o comando lista cada caminho ausente e termina com código de saída diferente de zero. Quando as folhas estiverem presentes, verifica estrutura PNG, dimensões, alpha/transparência, divisibilidade pela célula, grade/quantidade de quadros, quadros vazios e possíveis pixels recortados nas bordas.

## Integração futura

Este contrato não carrega as folhas no Phaser e não muda o jogo. A integração futura deverá manter o `Arcade.Sprite` atual como corpo lógico, animar apenas o objeto visual e usar `sockets.json` para atualizar a mão da katana por animação, direção e quadro.
