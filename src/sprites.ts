import Phaser from 'phaser';
import { PAL, css } from './palette';

// Sprites procedurais em pixel art: cada letra do mapa é uma cor da paleta.
// Cada "pixel" do mapa vira um bloco de PX x PX na textura, então o tamanho final
// é igual ao dos quadrados antigos (a colisão e o balanceamento não mudam).
// Quando houver arte de verdade (Aseprite), troque só esta função.

const PX = 2;

type SpriteDef = { rows: string[]; legend: Record<string, number> };

const SPRITES: Record<string, SpriteDef> = {
  // jogador 16x16
  p: {
    legend: { c: PAL.cyan, d: PAL.cyanDark, w: PAL.white, k: PAL.panel },
    rows: [
      '..dccd..',
      '.dccccd.',
      'dcwkkwcd',
      'dcckkccd',
      'dccccccd',
      '.dccccd.',
      '.dc..cd.',
      '..d..d..',
    ],
  },
  // inimigo normal 14x14
  e: {
    legend: { r: PAL.pink, R: PAL.pinkDark, y: PAL.yellow },
    rows: [
      '.RrrrR.',
      'RrrrrrR',
      'RryryrR',
      'RrrrrrR',
      'RrRRRrR',
      'RrrrrrR',
      '.R...R.',
    ],
  },
  // inimigo rápido 10x10
  ef: {
    legend: { o: PAL.orange, O: PAL.orangeDark, y: PAL.yellow },
    rows: ['.ooo.', 'ooyoo', 'ooooo', '.ooo.', '..O..'],
  },
  // tank 24x24
  et: {
    legend: { p: PAL.purple, P: PAL.purpleDark, l: PAL.purpleLight, y: PAL.yellow },
    rows: [
      '..PPPPPPPP..',
      '.PppppppppP.',
      'PpllppppllpP',
      'PppyppppyppP',
      'PppppppppppP',
      'PpPPPPPPPPpP',
      'PppppppppppP',
      'PpppPppPpppP',
      'PppppppppppP',
      '.PppppppppP.',
      '.PP.PPPP.PP.',
      '..PP....PP..',
    ],
  },
  // fantasma 24x24
  eg: {
    legend: { c: PAL.teal, d: PAL.cyanDark, r: PAL.pink, w: PAL.white },
    rows: [
      '...dccccd...',
      '..dccccccd..',
      '.dccccccccd.',
      'dcccrrrrcccd',
      'dccrrwwrrccd',
      'dccrrwwrrccd',
      'dcccrrrrcccd',
      '.dccccccccd.',
      '.dcccddcccd.',
      '..dcd..dcd..',
      '..dd....dd..',
      '...d....d...',
    ],
  },
  // bala 6x6
  b: {
    legend: { y: PAL.yellow, w: PAL.white },
    rows: ['.y.', 'ywy', '.y.'],
  },
  // partícula 4x4 (recebe tint)
  w: {
    legend: { w: PAL.white },
    rows: ['ww', 'ww'],
  },
  // sombra pixelada sob os pés (cada pixel lógico tem 2x2 px)
  sh: {
    legend: { s: PAL.panel },
    rows: ['..sssssss..', '.sssssssss.', '..sssssss..'],
  },
  // fallback da katana: lâmina escura com fio claro, guarda e cabo magenta
  katana: {
    legend: { p: PAL.pink, k: PAL.panel, d: PAL.cyanDark, c: PAL.cyan, w: PAL.white },
    rows: ['...........w', '......ddddw.', 'pppppkddddcw', '.......ddddc', '...........d'],
  },
};

export function buildSprites(scene: Phaser.Scene) {
  for (const [key, def] of Object.entries(SPRITES)) {
    if (scene.textures.exists(key)) continue; // o scene.restart() reaproveita as texturas
    const h = def.rows.length;
    const w = def.rows[0].length;
    const tex = scene.textures.createCanvas(key, w * PX, h * PX);
    if (!tex) continue;
    const ctx = tex.getContext();
    def.rows.forEach((row, y) => {
      [...row].forEach((ch, x) => {
        const color = def.legend[ch];
        if (color === undefined) return; // '.' = transparente
        ctx.fillStyle = css(color);
        ctx.fillRect(x * PX, y * PX, PX, PX);
      });
    });
    tex.refresh();
  }
}
