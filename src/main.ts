import Phaser from 'phaser';
import { GameScene } from './GameScene';
import { CSS } from './palette';

new Phaser.Game({
  type: Phaser.AUTO,
  width: 960,
  height: 540,
  backgroundColor: CSS.bg,
  pixelArt: true,
  physics: { default: 'arcade' },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [GameScene],
});
