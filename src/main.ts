import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, COLORS } from './game/config';
import { GameScene } from './game/scenes/GameScene';

new Phaser.Game({
  type: Phaser.AUTO,
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: COLORS.background,
  pixelArt: true,
  physics: { default: 'arcade', arcade: { debug: false } },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [GameScene],
});
