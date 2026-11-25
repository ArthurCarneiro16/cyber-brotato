import Phaser from 'phaser';
import { PLAYER } from '../config';

export type PlayerEntity = {
  body: Phaser.Physics.Arcade.Sprite;
  katana: Phaser.GameObjects.Image;
};

export function createPlayer(scene: Phaser.Scene, x: number, y: number): PlayerEntity {
  const body = scene.physics.add.sprite(x, y, 'edgerunner');
  body.setOrigin(0.5, 1).setScale(1.35).setCollideWorldBounds(true);
  body.setSize(14, 8).setOffset(9, 38);
  body.setDepth(y);

  const shadow = scene.add.ellipse(x, y - 1, 34, 11, 0x020509, 0.58).setDepth(y - 0.1);
  body.setData('shadow', shadow);

  const katana = scene.add.image(x, y, 'katana').setOrigin(0.14, 0.5).setDepth(y + 0.2);
  return { body, katana };
}

export function updatePlayerMovement(
  body: Phaser.Physics.Arcade.Sprite,
  keys: Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>,
  speed = PLAYER.speed,
): void {
  const horizontal = Number(keys.D.isDown) - Number(keys.A.isDown);
  const vertical = Number(keys.S.isDown) - Number(keys.W.isDown);
  const length = Math.hypot(horizontal, vertical);

  if (length === 0) {
    body.setVelocity(0, 0);
    return;
  }

  body.setVelocity((horizontal / length) * speed, (vertical / length) * speed);
  if (horizontal !== 0) body.setFlipX(horizontal < 0);
}

export function updatePlayerAttachments(player: PlayerEntity, angle: number): void {
  const scale = player.body.scaleX;
  const handX = player.body.x + 10 * scale * (player.body.flipX ? -1 : 1);
  const handY = player.body.y - 24 * scale;
  const front = Math.sin(angle) >= 0;

  player.katana
    .setPosition(handX, handY)
    .setRotation(angle)
    .setDepth(player.body.y + (front ? 0.2 : -0.2))
    .setVisible(true);

  const shadow = player.body.getData('shadow') as Phaser.GameObjects.Ellipse;
  shadow.setPosition(player.body.x, player.body.y - 1).setDepth(player.body.y - 0.1);
  player.body.setDepth(player.body.y);
}
