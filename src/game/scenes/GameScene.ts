import Phaser from 'phaser';
import { createEnemy, createEnemyTexture } from '../entities/Enemy';
import { createPlayer, updatePlayerAttachments, updatePlayerMovement, type PlayerEntity } from '../entities/Player';
import { ARENA, COLORS, ENEMY, GAME_HEIGHT, GAME_WIDTH, PLAYER } from '../config';
import { isInsideMeleeArc } from '../rules/combat';

type MoveKeys = Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;

export class GameScene extends Phaser.Scene {
  private player!: PlayerEntity;
  private enemy!: Phaser.Physics.Arcade.Image;
  private moveKeys!: MoveKeys;
  private restartKey!: Phaser.Input.Keyboard.Key;
  private playerHealth = PLAYER.maxHealth;
  private enemyHealth = ENEMY.maxHealth;
  private nextAttackAt = 0;
  private nextDamageAt = 0;
  private finished = false;
  private aimAngle = 0;
  private playerHealthText!: Phaser.GameObjects.Text;
  private enemyHealthText!: Phaser.GameObjects.Text;
  private message!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;

  constructor() {
    super('game');
  }

  preload(): void {
    this.load.image('edgerunner', '/player-base.png');
    this.load.image('katana', '/katana.png');
  }

  create(): void {
    this.game.canvas.tabIndex = 0;
    this.game.canvas.setAttribute('aria-label', 'Arena de Cyber Brotato. WASD move, mouse mira, clique ataca e R reinicia.');
    this.game.canvas.focus();

    this.playerHealth = PLAYER.maxHealth;
    this.enemyHealth = ENEMY.maxHealth;
    this.nextAttackAt = 0;
    this.nextDamageAt = 0;
    this.finished = false;

    this.drawArena();
    this.physics.world.setBounds(ARENA.x + 12, ARENA.y + 16, ARENA.width - 24, ARENA.height - 32);
    createEnemyTexture(this);

    this.player = createPlayer(this, GAME_WIDTH * 0.38, GAME_HEIGHT * 0.62);
    this.enemy = createEnemy(this, GAME_WIDTH * 0.5, GAME_HEIGHT * 0.56);
    this.physics.add.collider(this.player.body, this.enemy);

    this.moveKeys = this.input.keyboard!.addKeys('W,A,S,D') as MoveKeys;
    this.restartKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.R);

    this.createHud();
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => this.aimAt(pointer.worldX, pointer.worldY));
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.aimAt(pointer.worldX, pointer.worldY);
      if (pointer.leftButtonDown()) this.attack();
    });
    this.aimAt(this.enemy.x, this.enemy.y);
    this.updateHealthHud();
  }

  update(): void {
    if (this.finished) {
      if (Phaser.Input.Keyboard.JustDown(this.restartKey)) this.scene.restart();
      return;
    }

    updatePlayerMovement(this.player.body, this.moveKeys);
    this.physics.moveToObject(this.enemy, this.player.body, ENEMY.speed);
    this.enemy.setDepth(this.enemy.y);
    updatePlayerAttachments(this.player, this.aimAngle);

    if (this.input.activePointer.isDown && this.time.now >= this.nextAttackAt) this.attack();
    this.damagePlayerOnContact();
  }

  private drawArena(): void {
    const floor = this.add.graphics().setDepth(-20);
    floor.fillStyle(0x080b12);
    floor.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    floor.fillStyle(COLORS.floor);
    floor.fillRect(ARENA.x, ARENA.y, ARENA.width, ARENA.height);

    floor.lineStyle(1, COLORS.grid, 0.8);
    for (let row = ARENA.y - 20; row < ARENA.y + ARENA.height + 20; row += 22) {
      for (let column = ARENA.x - 32; column < ARENA.x + ARENA.width + 32; column += 44) {
        const offset = Math.round((row - ARENA.y) / 22) % 2 === 0 ? 0 : 22;
        const centerX = column + offset;
        floor.beginPath();
        floor.moveTo(centerX, row - 11);
        floor.lineTo(centerX + 22, row);
        floor.lineTo(centerX, row + 11);
        floor.lineTo(centerX - 22, row);
        floor.closePath();
        floor.strokePath();
      }
    }

    floor.lineStyle(3, COLORS.border, 0.75);
    floor.strokeRect(ARENA.x, ARENA.y, ARENA.width, ARENA.height);
    floor.lineStyle(1, COLORS.cyan, 0.35);
    floor.strokeRect(ARENA.x + 6, ARENA.y + 6, ARENA.width - 12, ARENA.height - 12);
  }

  private createHud(): void {
    const style: Phaser.Types.GameObjects.Text.TextStyle = {
      fontFamily: 'monospace',
      fontSize: '16px',
      color: '#f4f7fb',
      stroke: '#080b12',
      strokeThickness: 4,
    };
    this.add.text(22, 18, 'CYBER BROTATO  /  DISTRICT 09', {
      ...style, fontSize: '14px', color: '#62f3e2', letterSpacing: 2,
    }).setScrollFactor(0).setDepth(100);
    this.playerHealthText = this.add.text(24, 43, '', style).setScrollFactor(0).setDepth(100);
    this.enemyHealthText = this.add.text(GAME_WIDTH - 24, 18, '', {
      ...style, color: '#ff7a9d',
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(100);
    this.hint = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 18,
      'W A S D  mover     MOUSE  mirar     SEGURAR CLIQUE  atacar', {
        ...style, fontSize: '13px', color: '#91a5b3',
      }).setOrigin(0.5, 1).setScrollFactor(0).setDepth(100);
    this.message = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, '', {
      ...style, fontSize: '27px', align: 'center', color: '#62f3e2',
      backgroundColor: '#080b12dd', padding: { x: 24, y: 18 },
    }).setOrigin(0.5).setScrollFactor(0).setDepth(1000).setVisible(false);
  }

  private aimAt(x: number, y: number): void {
    this.aimAngle = Phaser.Math.Angle.Between(this.player?.body.x ?? 0, this.player?.body.y ?? 0, x, y);
  }

  private attack(): void {
    this.nextAttackAt = this.time.now + PLAYER.attackCooldownMs;
    if (!isInsideMeleeArc(
      { x: this.player.body.x, y: this.player.body.y - 22 },
      { x: this.enemy.x, y: this.enemy.y },
      this.aimAngle,
      PLAYER.attackRange,
      PLAYER.attackArc,
    )) return;

    this.enemyHealth -= 1;
    this.enemy.setTint(0xffffff);
    this.time.delayedCall(90, () => this.enemy?.clearTint());
    this.updateHealthHud();
    if (this.enemyHealth <= 0) this.finish('ALVO NEUTRALIZADO', 'R  ·  REINICIAR');
  }

  private damagePlayerOnContact(): void {
    if (this.time.now < this.nextDamageAt) return;
    const touching = Phaser.Math.Distance.Between(
      this.player.body.x, this.player.body.y - 16, this.enemy.x, this.enemy.y,
    ) < ENEMY.contactRange;
    if (!touching) return;

    this.nextDamageAt = this.time.now + PLAYER.hitCooldownMs;
    this.playerHealth -= ENEMY.contactDamage;
    this.player.body.setTint(0xff3978);
    this.time.delayedCall(130, () => this.player?.body.clearTint());
    this.updateHealthHud();
    if (this.playerHealth <= 0) this.finish('EDGERUNNER ELIMINADO', 'R  ·  TENTAR NOVAMENTE');
  }

  private updateHealthHud(): void {
    const full = '♥'.repeat(Math.max(0, this.playerHealth));
    const empty = '·'.repeat(Math.max(0, PLAYER.maxHealth - this.playerHealth));
    this.playerHealthText.setText('VITALIDADE  ' + full + empty);
    this.enemyHealthText.setText('ALVO  ' + this.enemyHealth + '/' + ENEMY.maxHealth);
  }

  private finish(title: string, action: string): void {
    this.finished = true;
    this.physics.pause();
    this.message
      .setText(title + '\n\n' + action + '\n\nCLIQUE PARA REINICIAR')
      .setInteractive()
      .on('pointerdown', () => this.scene.restart())
      .setVisible(true);
    this.hint.setVisible(false);
  }
}
