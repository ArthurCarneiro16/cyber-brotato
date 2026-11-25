import Phaser from 'phaser';
import { ENEMY } from '../config';

export function createEnemyTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists('gangoon')) return;
  const graphic = scene.make.graphics({ x: 0, y: 0 });
  graphic.fillStyle(0x080b12, 0.5);
  graphic.fillEllipse(20, 39, 31, 9);
  graphic.fillStyle(0x4b1d3c, 1);
  graphic.fillPoints([
    { x: 8, y: 35 }, { x: 6, y: 22 }, { x: 10, y: 11 }, { x: 18, y: 5 },
    { x: 28, y: 9 }, { x: 34, y: 21 }, { x: 31, y: 35 }, { x: 24, y: 38 }, { x: 13, y: 38 },
  ], true);
  graphic.fillStyle(0xff3978, 1);
  graphic.fillRect(12, 17, 16, 3);
  graphic.fillStyle(0x62f3e2, 1);
  graphic.fillRect(24, 17, 4, 3);
  graphic.generateTexture('gangoon', 40, 42);
  graphic.destroy();
}

export function createEnemy(scene: Phaser.Scene, x: number, y: number): Phaser.Physics.Arcade.Image {
  const enemy = scene.physics.add.image(x, y, 'gangoon');
  enemy.setScale(1.2).setCollideWorldBounds(true).setDepth(y);
  enemy.setCircle(12, 8, 10);
  enemy.setData('health', ENEMY.maxHealth);
  return enemy;
}
