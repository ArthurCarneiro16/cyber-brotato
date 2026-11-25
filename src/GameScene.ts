import Phaser from 'phaser';
import type { EnemyType, State } from './types';
import { ENEMY } from './data/enemies';
import { loadGhosts, saveGhost } from './storage';
import { sfx } from './sfx';
import { CSS, PAL } from './palette';
import { buildSprites } from './sprites';
import { Rng, randomSeed } from './rules/rng';
import {
  BEHAVIOR,
  GHOST_BEHAVIOR,
  GHOST_MANTIS_RADIUS,
  GHOST_PUSH_RESIST,
  GHOST_SLAM_PUSH_MS,
  GHOST_SLAM_RADIUS,
  GORILLA_PUSH_SPEED,
  MANTIS_ARC,
  MANTIS_INTERVAL,
  MANTIS_RANGE,
  Run,
  SLOWMO_COOLDOWN,
  SLOWMO_FACTOR,
  SLOWMO_FIRE_MUL,
  SPAWN_INTERVAL_MS,
  TOTAL_WAVES,
  WAVE_TIME,
  behaviorDmgMul,
  enemySpeed,
  enemyStats,
  ghostKind,
  ghostStats,
  gorillaPushMs,
  mantisDamage,
  newBehavior,
  slowmoDuration,
  stepBehavior,
  stepBehaviorCfg,
} from './rules/run';
import type { Behavior, GhostKind, LiveGhostRole } from './rules/run';

// A cena só desenha, lê input e mostra feedback. Estado, loja, preços, fantasma e
// sorteios vivem em ./rules/run.ts (sem Phaser, testado em tests/run.test.ts).
// Cores: sempre de ./palette. Sprites: ./sprites.

// =====================================================================
// CONSTANTES
// =====================================================================

const BUY_KEYS = ['ONE', 'TWO', 'THREE'];

const ROLE_LABEL: Record<LiveGhostRole, string> = {
  miniboss: 'MINI-BOSS',
  boss: 'BOSS',
};

type FxKey = EnemyType | 'ghost' | 'player';
type EndKind = 'dead' | 'win' | 'psycho';

const FX_COLOR: Record<FxKey, number> = {
  normal: PAL.pink,
  fast: PAL.orange,
  tank: PAL.purple,
  ghost: PAL.teal,
  player: PAL.cyan,
};

// cor do piscar de aviso de cada inimigo com investida
const TELEGRAPH_COLOR: Record<EnemyType, number> = {
  normal: PAL.white,
  fast: PAL.orange,
  tank: PAL.purple,
};

const W = 960;
const H = 540;
const GRID = 32; // grade do chão da arena
const SPAWN_MIN_DIST = 220; // inimigos não nascem em cima do jogador
const SPAWN_TELEGRAPH = 450; // ms "fantasma" antes de poder causar dano

export class GameScene extends Phaser.Scene {
  // =====================================================================
  // CAMPOS
  // =====================================================================
  private run!: Run;

  private player!: Phaser.Physics.Arcade.Sprite;
  private bullets!: Phaser.Physics.Arcade.Group;
  private enemies!: Phaser.Physics.Arcade.Group;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;

  // o mundo e a interface ficam em camadas e câmeras separadas: o shake mexe só no mundo
  private worldLayer!: Phaser.GameObjects.Layer;
  private uiLayer!: Phaser.GameObjects.Layer;
  private uiCam!: Phaser.Cameras.Scene2D.Camera;
  private fx!: Record<FxKey, Phaser.GameObjects.Particles.ParticleEmitter>;

  private hud!: Phaser.GameObjects.Text;
  private msg!: Phaser.GameObjects.Text;
  private msgBg!: Phaser.GameObjects.Rectangle;
  private banner!: Phaser.GameObjects.Text;
  private bannerTween: Phaser.Tweens.Tween | null = null;
  private hint!: Phaser.GameObjects.Text;
  private slowOverlay!: Phaser.GameObjects.Rectangle;

  private state: State = 'wave';
  private timeLeft = WAVE_TIME;
  private overtime = false;
  private nextShot = 0;
  private iframeUntil = 0;
  private playerPushUntil = 0; // onda de choque do fantasma Gorilla
  private playerPushAngle = 0;
  private movedOnce = false;
  private shotOnce = false;
  private hintDone = false;

  // Sandevistan: timers em segundos, só correm durante a wave (congelam na pausa).
  // A recarga só começa a contar quando a ativa termina.
  private slowLeft = 0;
  private slowCd = 0;

  // Mantis Blades: tempo (s) até o próximo corte automático
  private slashCd = 0;

  private ghostSpawned = false;
  private ghostEnemy: Phaser.Physics.Arcade.Sprite | null = null;
  private ghostLabel: Phaser.GameObjects.Text | null = null;

  constructor() {
    super('game');
  }

  // atalhos de leitura (o estado de verdade mora em this.run)
  private get stats() {
    return this.run.stats;
  }
  private get implants() {
    return this.run.implants;
  }
  private get wave() {
    return this.run.wave;
  }

  // =====================================================================
  // CAMADAS
  // =====================================================================
  private world<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.worldLayer.add(o);
    return o;
  }

  private ui<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.uiLayer.add(o);
    return o;
  }

  // =====================================================================
  // CREATE
  // =====================================================================
  create() {
    this.state = 'wave';
    this.timeLeft = WAVE_TIME;
    this.overtime = false;
    this.nextShot = 0;
    this.iframeUntil = 0;
    this.playerPushUntil = 0;
    this.movedOnce = false;
    this.shotOnce = false;
    this.hintDone = false;
    this.bannerTween = null;
    this.slowLeft = 0;
    this.slowCd = 0;
    this.slashCd = 0;
    this.ghostSpawned = false;
    this.ghostEnemy = null;
    this.ghostLabel = null;

    // seed da run: ?seed=123 na URL repete a mesma run (loja, fantasma, spawns)
    const params = new URLSearchParams(window.location.search);
    const urlSeed = Number(params.get('seed'));
    this.run = new Run(urlSeed > 0 ? urlSeed : randomSeed(), loadGhosts());

    // ?wave=3 na URL começa direto naquela wave (para testar)
    const startWave = Number(params.get('wave'));
    if (startWave >= 1 && startWave <= TOTAL_WAVES) this.run.wave = startWave;

    this.physics.resume();
    this.time.paused = false;

    this.worldLayer = this.add.layer();
    this.uiLayer = this.add.layer();
    this.uiCam = this.cameras.add(0, 0, W, H);
    this.cameras.main.ignore(this.uiLayer);
    this.uiCam.ignore(this.worldLayer);

    buildSprites(this);
    this.createBackground();
    this.createFx();

    this.player = this.world(this.physics.add.sprite(480, 270, 'p').setCollideWorldBounds(true));
    this.bullets = this.physics.add.group();
    this.enemies = this.physics.add.group();
    this.keys = this.input.keyboard!.addKeys('W,A,S,D,ONE,TWO,THREE,SPACE,R,ESC,M') as Record<
      string,
      Phaser.Input.Keyboard.Key
    >;

    this.physics.add.overlap(this.bullets, this.enemies, (b, e) =>
      this.hitEnemy(b as Phaser.GameObjects.GameObject, e as Phaser.GameObjects.GameObject),
    );
    this.physics.add.overlap(this.player, this.enemies, (_p, e) => this.hurtPlayer(e as Phaser.GameObjects.GameObject));

    this.time.addEvent({ delay: SPAWN_INTERVAL_MS, loop: true, callback: () => this.spawn() });

    // pausa sozinho se a janela perder o foco
    const onBlur = () => {
      if (this.state === 'wave') this.openPauseMenu();
    };
    this.game.events.on(Phaser.Core.Events.BLUR, onBlur);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.game.events.off(Phaser.Core.Events.BLUR, onBlur));

    this.createUi();

    this.showBanner(`WAVE ${this.wave}`);
    sfx.waveStart();
    this.scheduleGhostIfNeeded();
  }

  // chão da arena: grade sutil atrás de tudo
  private createBackground() {
    const g = this.world(this.add.graphics().setDepth(-10));
    g.lineStyle(1, PAL.grid, 1);
    for (let x = 0; x <= W; x += GRID) g.lineBetween(x, 0, x, H);
    for (let y = 0; y <= H; y += GRID) g.lineBetween(0, y, W, y);
  }

  private createFx() {
    const mkFx = (color: number) =>
      this.world(
        this.add.particles(0, 0, 'w', {
          speed: { min: 50, max: 190 },
          lifespan: { min: 220, max: 480 },
          scale: { start: 1.6, end: 0 },
          alpha: { start: 1, end: 0 },
          tint: color,
          emitting: false,
        }),
      );
    this.fx = {
      normal: mkFx(FX_COLOR.normal),
      fast: mkFx(FX_COLOR.fast),
      tank: mkFx(FX_COLOR.tank),
      ghost: mkFx(FX_COLOR.ghost),
      player: mkFx(FX_COLOR.player),
    };
  }

  // interface (câmera própria, nunca treme)
  private createUi() {
    const style = { fontFamily: 'monospace', fontSize: '14px', color: CSS.text };
    this.slowOverlay = this.ui(this.add.rectangle(480, 270, W, H, PAL.teal, 0.1).setDepth(1).setVisible(false));
    this.hud = this.ui(this.add.text(10, 8, '', style).setDepth(10));
    this.msgBg = this.ui(
      this.add.rectangle(480, 270, 10, 10, PAL.panel, 0.82).setStrokeStyle(2, PAL.cyan, 0.6).setDepth(9).setVisible(false),
    );
    this.msg = this.ui(this.add.text(480, 270, '', { ...style, fontSize: '20px', align: 'center' }).setOrigin(0.5).setDepth(10));
    this.banner = this.ui(
      this.add
        .text(480, 96, '', { fontFamily: 'monospace', fontSize: '28px', color: CSS.cyan, stroke: CSS.panel, strokeThickness: 4 })
        .setOrigin(0.5)
        .setDepth(11)
        .setAlpha(0),
    );
    this.hint = this.ui(
      this.add
        .text(480, 520, 'WASD mover  ·  mouse mira e atira  ·  ESC pausa  ·  M som', {
          ...style,
          fontSize: '13px',
          color: CSS.textDim,
        })
        .setOrigin(0.5)
        .setDepth(10),
    );
    this.ui(
      this.add
        .text(10, H - 6, `seed ${this.run.seed}`, { ...style, fontSize: '11px', color: CSS.textFaint })
        .setOrigin(0, 1)
        .setDepth(10),
    );
  }

  // =====================================================================
  // UPDATE
  // =====================================================================
  update(time: number, delta: number) {
    this.updateHud();

    if (Phaser.Input.Keyboard.JustDown(this.keys.M)) {
      this.showBanner(sfx.toggleMute() ? 'SOM LIGADO' : 'SOM DESLIGADO', CSS.text, 900);
    }

    if (this.state === 'over') {
      if (Phaser.Input.Keyboard.JustDown(this.keys.R)) this.scene.restart();
      return;
    }
    if (this.state === 'pause') {
      if (Phaser.Input.Keyboard.JustDown(this.keys.ONE) || Phaser.Input.Keyboard.JustDown(this.keys.ESC)) {
        this.resumeGame();
      } else if (Phaser.Input.Keyboard.JustDown(this.keys.TWO)) {
        this.openBuildMenu();
      } else if (Phaser.Input.Keyboard.JustDown(this.keys.THREE)) {
        this.openConfirmRestartMenu();
      }
      return;
    }
    if (this.state === 'build') {
      if (
        Phaser.Input.Keyboard.JustDown(this.keys.ONE) ||
        Phaser.Input.Keyboard.JustDown(this.keys.ESC) ||
        Phaser.Input.Keyboard.JustDown(this.keys.SPACE)
      ) {
        this.openPauseMenu();
      }
      return;
    }
    if (this.state === 'confirm_restart') {
      if (Phaser.Input.Keyboard.JustDown(this.keys.ONE)) {
        this.physics.resume();
        this.time.paused = false;
        this.scene.restart();
      } else if (Phaser.Input.Keyboard.JustDown(this.keys.TWO) || Phaser.Input.Keyboard.JustDown(this.keys.ESC)) {
        this.openPauseMenu();
      }
      return;
    }
    if (this.state === 'shop') {
      BUY_KEYS.forEach((k, i) => {
        if (Phaser.Input.Keyboard.JustDown(this.keys[k])) this.buy(i);
      });
      if (Phaser.Input.Keyboard.JustDown(this.keys.R)) this.reroll();
      if (Phaser.Input.Keyboard.JustDown(this.keys.SPACE)) this.startWave(this.wave + 1);
      return;
    }

    // ---- estado 'wave' ----
    if (Phaser.Input.Keyboard.JustDown(this.keys.ESC)) {
      this.openPauseMenu();
      return;
    }

    const dt = delta / 1000;
    const now = this.time.now;

    this.updateSandevistan(dt);
    this.updatePlayer(time);
    this.updateSlash(dt);

    // a dica de controles some quando o jogador já fez as duas coisas
    if (!this.hintDone && this.movedOnce && this.shotOnce) {
      this.hintDone = true;
      this.tweens.add({ targets: this.hint, alpha: 0, duration: 600 });
    }

    this.updateEnemies(dt, now);
    this.updateGhostLabel();
    this.updateWaveTimer(delta);
  }

  // Sandevistan: a recarga só corre depois que a ativa termina
  private updateSandevistan(dt: number) {
    if (this.slowLeft > 0) {
      this.slowLeft -= dt;
      if (this.slowLeft <= 0) {
        this.slowLeft = 0;
        this.slowCd = SLOWMO_COOLDOWN;
        this.slowOverlay.setVisible(false);
      }
    } else if (this.slowCd > 0) {
      this.slowCd = Math.max(0, this.slowCd - dt);
    }
    if (Phaser.Input.Keyboard.JustDown(this.keys.SPACE)) this.tryActivateSlow();
  }

  private updatePlayer(time: number) {
    // i-frames visíveis: o jogador pisca enquanto está invulnerável
    const now = this.time.now;
    this.player.setAlpha(now < this.iframeUntil && Math.floor(now / 70) % 2 ? 0.25 : 1);

    // movimento WASD (a onda de choque do fantasma Gorilla sobrescreve por um instante)
    const dir = new Phaser.Math.Vector2(
      Number(this.keys.D.isDown) - Number(this.keys.A.isDown),
      Number(this.keys.S.isDown) - Number(this.keys.W.isDown),
    );
    if (dir.lengthSq() > 0) this.movedOnce = true;
    if (now < this.playerPushUntil) {
      this.physics.velocityFromRotation(this.playerPushAngle, 380, this.player.body!.velocity);
    } else {
      dir.normalize().scale(this.stats.speed);
      this.player.setVelocity(dir.x, dir.y);
    }

    // tiro com mouse (segurar o botão); com o Sandevistan ativo a cadência sobe
    const p = this.input.activePointer;
    if (p.isDown && time > this.nextShot) {
      this.nextShot = time + this.stats.fireDelay / (this.slowLeft > 0 ? SLOWMO_FIRE_MUL : 1);
      this.shotOnce = true;
      const angle = Phaser.Math.Angle.Between(this.player.x, this.player.y, p.worldX, p.worldY);
      const b = this.world(this.bullets.create(this.player.x, this.player.y, 'b') as Phaser.Physics.Arcade.Sprite);
      b.setRotation(angle);
      this.physics.velocityFromRotation(angle, 520, b.body!.velocity);
      this.time.delayedCall(900, () => b.active && b.destroy());
      sfx.shoot();
    }
  }

  // inimigos perseguem o jogador (mais lentos com o Sandevistan); quem foi empurrado pelo
  // Gorilla Arms se afasta por um instante; fast, tank e fantasma seguem a máquina aviso -> ação
  private updateEnemies(dt: number, now: number) {
    const slow = this.slowLeft > 0 ? SLOWMO_FACTOR : 1;
    const base = enemySpeed(this.wave, this.stats.enemySlow) * slow;
    this.enemies.getChildren().forEach((e) => {
      const spr = e as Phaser.Physics.Arcade.Sprite;
      const speed = base * (spr.getData('mul') as number);
      const type = spr.getData('type') as EnemyType | undefined;
      const gkind = spr.getData('gkind') as GhostKind | undefined;
      if (now < ((spr.getData('pushUntil') as number | undefined) ?? 0)) {
        const away = Phaser.Math.Angle.Between(this.player.x, this.player.y, spr.x, spr.y);
        this.physics.velocityFromRotation(away, GORILLA_PUSH_SPEED, spr.body!.velocity);
      } else if (gkind) {
        this.moveGhost(spr, gkind, speed, dt * slow, now);
      } else if (type && BEHAVIOR[type]) {
        this.moveWithBehavior(spr, type, speed, dt * slow, now);
      } else {
        this.physics.moveToObject(spr, this.player, speed);
      }
    });
  }

  // fast e tank: persegue -> aviso (parado, piscando) -> investida em linha reta -> recuperação
  private moveWithBehavior(spr: Phaser.Physics.Arcade.Sprite, type: EnemyType, speed: number, dt: number, now: number) {
    const cfg = BEHAVIOR[type]!;
    const beh = spr.getData('beh') as Behavior;
    const prev = beh.phase;
    const dist = Phaser.Math.Distance.Between(spr.x, spr.y, this.player.x, this.player.y);
    const m = stepBehavior(type, beh, dist, dt);

    if (beh.phase !== prev) {
      if (beh.phase === 'dash') {
        // a direção trava aqui: quem se mexeu durante o aviso desvia
        spr.setData('heading', Phaser.Math.Angle.Between(spr.x, spr.y, this.player.x, this.player.y));
        spr.clearTint();
      } else if (beh.phase === 'recover' || beh.phase === 'chase') {
        spr.clearTint();
        spr.setScale(1);
      }
    }

    if (beh.phase === 'windup') {
      const k = beh.t / cfg.windup; // 0 -> 1: pisca cada vez mais rápido
      spr.setTintFill(Math.floor(now / (110 - 70 * k)) % 2 ? PAL.white : TELEGRAPH_COLOR[type]);
      if (type === 'tank') spr.setScale(1 + 0.3 * k);
    }

    if (m === 0) {
      spr.setVelocity(0, 0);
    } else if (beh.phase === 'dash') {
      this.physics.velocityFromRotation(spr.getData('heading') as number, speed * m, spr.body!.velocity);
    } else {
      this.physics.moveToObject(spr, this.player, speed * m);
    }
  }

  // fantasma: mesma máquina de fases, com a ação decidida pelos implantes que ele tinha
  private moveGhost(spr: Phaser.Physics.Arcade.Sprite, kind: GhostKind, speed: number, dt: number, now: number) {
    const cfg = GHOST_BEHAVIOR[kind];
    const beh = spr.getData('beh') as Behavior;
    const prev = beh.phase;
    const dist = Phaser.Math.Distance.Between(spr.x, spr.y, this.player.x, this.player.y);
    const m = stepBehaviorCfg(cfg, beh, dist, dt);

    if (beh.phase !== prev) {
      spr.clearTint();
      if (beh.phase === 'dash') {
        spr.setData('heading', Phaser.Math.Angle.Between(spr.x, spr.y, this.player.x, this.player.y));
        this.ghostAction(spr, kind);
      }
    }

    if (beh.phase === 'windup') {
      const k = beh.t / cfg.windup;
      spr.setTintFill(Math.floor(now / (110 - 70 * k)) % 2 ? PAL.white : PAL.pink);
    }

    if (m === 0) {
      spr.setVelocity(0, 0);
    } else if (beh.phase === 'dash') {
      this.physics.velocityFromRotation(spr.getData('heading') as number, speed * m, spr.body!.velocity);
    } else {
      this.physics.moveToObject(spr, this.player, speed * m);
    }
  }

  // o que o fantasma faz no instante em que o aviso termina
  private ghostAction(spr: Phaser.Physics.Arcade.Sprite, kind: GhostKind) {
    if (kind === 'sandevistan') return; // o dash é o próprio movimento
    const radius = kind === 'mantis' ? GHOST_MANTIS_RADIUS : GHOST_SLAM_RADIUS;
    const color = kind === 'mantis' ? PAL.cyan : PAL.orange;

    const ring = this.world(this.add.graphics().setDepth(15));
    ring.fillStyle(color, 0.35);
    ring.fillCircle(spr.x, spr.y, radius);
    ring.lineStyle(2, color, 0.9);
    ring.strokeCircle(spr.x, spr.y, radius);
    this.tweens.add({ targets: ring, alpha: 0, duration: 220, onComplete: () => ring.destroy() });

    if (Phaser.Math.Distance.Between(spr.x, spr.y, this.player.x, this.player.y) > radius) return;
    if (kind === 'gorilla') {
      this.playerPushAngle = Phaser.Math.Angle.Between(spr.x, spr.y, this.player.x, this.player.y);
      this.playerPushUntil = this.time.now + GHOST_SLAM_PUSH_MS;
      this.cameras.main.shake(200, 0.01);
    }
    this.damagePlayer(spr.getData('dmg') as number);
  }

  private updateGhostLabel() {
    if (this.ghostEnemy?.active && this.ghostLabel) {
      const hp = this.ghostEnemy.getData('hp') as number;
      const maxHp = this.ghostEnemy.getData('maxHp') as number;
      this.ghostLabel
        .setPosition(this.ghostEnemy.x, this.ghostEnemy.y - 24)
        .setText(`FANTASMA [${ROLE_LABEL[this.run.ghostRole]}] ${hp}/${maxHp}`);
    }
  }

  // fim da wave: na wave do boss o tempo não basta, é preciso derrotar o fantasma
  private updateWaveTimer(delta: number) {
    this.timeLeft -= delta / 1000;
    const status = this.run.waveStatus(this.timeLeft);
    if (status === 'overtime') {
      this.timeLeft = 0;
      if (!this.overtime) {
        this.overtime = true;
        this.showBanner('DERROTE O FANTASMA PARA VENCER', CSS.pink, 0);
      }
    } else if (status === 'done') {
      this.endWave();
    }
  }

  // =====================================================================
  // IMPLANTES: Sandevistan e Mantis Blades
  // =====================================================================
  private tryActivateSlow() {
    const copies = this.stats.slowmo;
    if (copies <= 0) return;
    if (this.slowLeft > 0) return; // já ativo
    if (this.slowCd > 0) {
      sfx.deny();
      return;
    }
    this.slowLeft = slowmoDuration(copies);
    this.slowOverlay.setVisible(true);
    this.showBanner('SANDEVISTAN', CSS.teal, 500);
    sfx.waveStart();
  }

  private resetSlow() {
    this.slowLeft = 0;
    this.slowCd = 0;
    this.slowOverlay.setVisible(false);
  }

  // Corta sozinho a cada MANTIS_INTERVAL, mas só quando há inimigo dentro do arco
  // (na direção do mouse); sem alvo, o corte fica pronto esperando.
  private updateSlash(dt: number) {
    if (this.stats.mantis <= 0) return;
    this.slashCd = Math.max(0, this.slashCd - dt);
    if (this.slashCd > 0) return;

    const px = this.player.x;
    const py = this.player.y;
    const p = this.input.activePointer;
    const aim = Phaser.Math.Angle.Between(px, py, p.worldX, p.worldY);

    const targets = (this.enemies.getChildren() as Phaser.Physics.Arcade.Sprite[]).filter((e) => {
      if (!e.active) return false;
      if (Phaser.Math.Distance.Between(px, py, e.x, e.y) > MANTIS_RANGE + e.displayWidth / 2) return false;
      const off = Phaser.Math.Angle.Wrap(Phaser.Math.Angle.Between(px, py, e.x, e.y) - aim);
      return Math.abs(off) <= MANTIS_ARC / 2;
    });
    if (targets.length === 0) return;

    this.slashCd = MANTIS_INTERVAL;
    const dmg = mantisDamage(this.stats.mantis);
    targets.forEach((t) => t.active && this.damageEnemy(t, dmg));

    // leque ciano que some rápido
    const gfx = this.world(this.add.graphics().setDepth(15));
    gfx.fillStyle(PAL.cyan, 0.55);
    gfx.slice(px, py, MANTIS_RANGE, aim - MANTIS_ARC / 2, aim + MANTIS_ARC / 2, false);
    gfx.fillPath();
    this.tweens.add({ targets: gfx, alpha: 0, duration: 140, onComplete: () => gfx.destroy() });
  }

  // =====================================================================
  // FEEDBACK
  // =====================================================================
  private burst(key: FxKey, x: number, y: number, count: number) {
    this.fx[key].emitParticleAt(x, y, count);
  }

  private floatText(x: number, y: number, text: string, color: string, size = 12) {
    const t = this.world(
      this.add
        .text(x, y, text, { fontFamily: 'monospace', fontSize: `${size}px`, color, stroke: CSS.panel, strokeThickness: 3 })
        .setOrigin(0.5)
        .setDepth(20),
    );
    this.tweens.add({ targets: t, y: y - 26, alpha: 0, duration: 700, onComplete: () => t.destroy() });
  }

  private showBanner(text: string, color: string = CSS.cyan, holdMs = 1400) {
    this.bannerTween?.stop();
    this.bannerTween = null;
    this.banner.setText(text).setColor(color).setAlpha(1).setScale(1.25);
    this.tweens.add({ targets: this.banner, scale: 1, duration: 150 });
    if (holdMs > 0) {
      this.bannerTween = this.tweens.add({ targets: this.banner, alpha: 0, delay: holdMs, duration: 300 });
    }
  }

  private hideBanner() {
    this.bannerTween?.stop();
    this.bannerTween = null;
    this.banner.setAlpha(0);
  }

  // painel atrás do texto grande, para ler por cima do jogo
  private setMsg(text: string) {
    this.msg.setText(text);
    if (!text) {
      this.msgBg.setVisible(false);
      return;
    }
    this.msgBg.setSize(this.msg.width + 48, this.msg.height + 36).setVisible(true);
  }

  private updateHud() {
    const s = this.stats;
    const r = this.run;
    const tag = r.usesFallbackGhost ? ' modelo' : '';
    const ghostHud = r.ghostDefeated
      ? `   Fantasma ${r.ghost.score} (eliminado)`
      : `   Fantasma ${r.ghost.score} (${ROLE_LABEL[r.ghostRole]} W${r.ghostWave}${tag})`;
    const time = this.overtime ? '--' : Math.max(0, Math.ceil(this.timeLeft));
    const slowHud =
      s.slowmo > 0
        ? `\nSandevistan [ESPAÇO] ${
            this.slowLeft > 0 ? `ATIVO ${this.slowLeft.toFixed(1)}s` : this.slowCd > 0 ? `recarga ${Math.ceil(this.slowCd)}s` : 'PRONTO'
          }`
        : '';
    this.hud.setText(
      `HP ${Math.max(0, Math.round(s.hp))}/${s.maxHp}   Edinhos ${s.edinhos}   Humanidade ${s.humanity}   ` +
        `Wave ${this.wave}/${TOTAL_WAVES}   Tempo ${time}s${ghostHud}${slowHud}`,
    );
  }

  // =====================================================================
  // MENUS
  // =====================================================================
  private openPauseMenu() {
    this.state = 'pause';
    this.physics.pause();
    this.time.paused = true;
    this.player.setVelocity(0, 0);
    sfx.click();
    this.setMsg(
      '=== JOGO PAUSADO ===\n\n' +
        '[1] Continuar\n' +
        '[2] Ver Build\n' +
        '[3] Reiniciar Run\n\n' +
        '[ESC] Continuar',
    );
  }

  private resumeGame() {
    this.state = 'wave';
    this.physics.resume();
    this.time.paused = false;
    sfx.click();
    this.setMsg('');
  }

  private openBuildMenu() {
    this.state = 'build';
    const s = this.stats;
    const shotsPerSec = (1000 / s.fireDelay).toFixed(1);
    const slowPct = Math.round((1 - s.enemySlow) * 100);
    const takenPct = Math.round(s.dmgTaken * 100);

    const implantCounts: Record<string, number> = {};
    for (const name of this.implants) {
      implantCounts[name] = (implantCounts[name] || 0) + 1;
    }
    const implantEntries = Object.entries(implantCounts);
    const implantsText =
      implantEntries.length > 0
        ? implantEntries.map(([name, count]) => `• ${name} x${count}`).join('\n')
        : 'Nenhum implante instalado';

    this.setMsg(
      '=== DADOS DA RUN (BUILD) ===\n\n' +
        `HP: ${Math.max(0, Math.round(s.hp))}/${s.maxHp}   |   Dano: ${s.damage}\n` +
        `Velocidade: ${s.speed}   |   Cadência: ${s.fireDelay}ms (${shotsPerSec} tiros/s)\n` +
        `Humanidade: ${s.humanity}   |   Edinhos: ${s.edinhos}\n` +
        `Lentidão Inimigos: ${slowPct}% (${s.enemySlow.toFixed(2)}x)   |   Dano recebido: ${takenPct}%\n` +
        `Poder: ${this.run.powerScore()}\n` +
        (s.slowmo > 0 ? `Sandevistan: ${slowmoDuration(s.slowmo)}s ativo / ${SLOWMO_COOLDOWN}s recarga\n` : '') +
        (s.mantis > 0 ? `Mantis Blades: corte de ${mantisDamage(s.mantis)} de dano a cada ${MANTIS_INTERVAL}s\n` : '') +
        (s.gorilla > 0 ? `Gorilla Arms: empurrão de ${s.gorilla * 40}px por tiro\n` : '') +
        `\n--- IMPLANTES ADQUIRIDOS (${this.implants.length}) ---\n${implantsText}\n\n` +
        '[1] ou [ESC] Voltar ao menu de pausa',
    );
  }

  private openConfirmRestartMenu() {
    this.state = 'confirm_restart';
    this.setMsg(
      '=== REINICIAR RUN? ===\n\n' +
        'Tem certeza que deseja reiniciar a run?\n' +
        'O progresso da run atual será perdido.\n' +
        '(Os registros de fantasmas no localStorage serão preservados)\n\n' +
        '[1] Confirmar (Reiniciar)\n' +
        '[2] Cancelar (Voltar)',
    );
  }

  // =====================================================================
  // FANTASMA
  // =====================================================================
  private scheduleGhostIfNeeded() {
    if (this.ghostSpawned || this.run.ghostWave !== this.wave) return;
    this.ghostSpawned = true;
    this.time.delayedCall(3500, () => {
      if (this.state === 'wave' && this.wave === this.run.ghostWave) this.spawnGhost();
    });
  }

  private spawnGhost() {
    const role = this.run.ghostRole;
    const { x, y } = this.edgePoint(SPAWN_MIN_DIST, 16, this.run.rng.ghost);
    const gs = ghostStats(this.run.ghost, role, this.wave);

    const g = this.world(this.enemies.create(x, y, 'eg') as Phaser.Physics.Arcade.Sprite);
    g.setScale(gs.scale);
    g.setData('hp', gs.hp);
    g.setData('maxHp', gs.hp);
    g.setData('mul', gs.mul);
    g.setData('dmg', gs.dmg);
    g.setData('reward', gs.reward);
    g.setData('isGhost', true);
    g.setData('fx', 'ghost');
    const kind = ghostKind(this.run.ghost);
    if (kind) {
      g.setData('gkind', kind);
      g.setData('beh', newBehavior());
    }
    this.armEnemy(g, 800);
    this.ghostEnemy = g;

    this.ghostLabel = this.world(
      this.add
        .text(x, y - 24, '', { fontFamily: 'monospace', fontSize: '12px', color: CSS.pink, backgroundColor: CSS.label })
        .setOrigin(0.5)
        .setDepth(9),
    );

    this.showBanner(`CIBERPSICOPATA DETECTADO [${ROLE_LABEL[role]}]`, CSS.pink, 2200);
    sfx.ghost();
  }

  private clearGhostVisuals() {
    this.ghostEnemy = null;
    if (this.ghostLabel) {
      this.ghostLabel.destroy();
      this.ghostLabel = null;
    }
  }

  // =====================================================================
  // INIMIGOS: spawn, dano e empurrão
  // =====================================================================

  // ponto na borda da arena, longe do jogador (sorteio sempre pelo Rng da run)
  private edgePoint(minDist: number, margin = 0, rng: Rng = this.run.rng.spawn): { x: number; y: number } {
    let x = 0;
    let y = 0;
    for (let i = 0; i < 8; i++) {
      const side = rng.int(0, 3);
      x = side === 0 ? margin : side === 1 ? W - margin : rng.int(margin, W - margin);
      y = side === 2 ? margin : side === 3 ? H - margin : rng.int(margin, H - margin);
      if (Phaser.Math.Distance.Between(x, y, this.player.x, this.player.y) >= minDist) break;
    }
    return { x, y };
  }

  // inimigo recém-nascido aparece "fantasma" e não causa dano até ficar sólido
  private armEnemy(e: Phaser.Physics.Arcade.Sprite, ms: number) {
    e.setData('armedAt', this.time.now + ms);
    e.setAlpha(0.3);
    this.tweens.add({ targets: e, alpha: 1, duration: ms });
  }

  private spawn() {
    if (this.state !== 'wave') return;
    const { x, y } = this.edgePoint(SPAWN_MIN_DIST);
    const type = this.run.pickEnemyType();
    const s = enemyStats(type, this.wave);
    const e = this.world(this.enemies.create(x, y, ENEMY[type].tex) as Phaser.Physics.Arcade.Sprite);
    e.setData('hp', s.hp);
    e.setData('mul', s.mul);
    e.setData('dmg', s.dmg);
    e.setData('reward', s.reward);
    e.setData('fx', type);
    e.setData('type', type);
    e.setData('beh', newBehavior());
    this.armEnemy(e, SPAWN_TELEGRAPH);
  }

  // dano em um inimigo (tiro ou corte); true se ele morreu
  private damageEnemy(spr: Phaser.Physics.Arcade.Sprite, dmg: number): boolean {
    const hp = (spr.getData('hp') as number) - dmg;
    const fx = spr.getData('fx') as FxKey;
    const isGhost = Boolean(spr.getData('isGhost'));

    if (hp > 0) {
      spr.setData('hp', hp);
      spr.setTintFill(PAL.white);
      this.time.delayedCall(60, () => spr.active && spr.clearTint());
      if (isGhost) this.floatText(spr.x, spr.y - 22, String(dmg), CSS.white, 11);
      sfx.hit();
      return false;
    }

    const reward = spr.getData('reward') as number;
    this.stats.edinhos += reward;
    if (isGhost) {
      this.run.ghostDefeated = true;
      this.clearGhostVisuals();
      this.burst('ghost', spr.x, spr.y, 40);
      this.cameras.main.shake(260, 0.012);
      this.cameras.main.zoomTo(1.05, 80);
      this.time.delayedCall(90, () => this.cameras.main.zoomTo(1, 180));
      this.floatText(spr.x, spr.y - 20, `+${reward}`, CSS.teal, 16);
      this.showBanner('FANTASMA ELIMINADO', CSS.teal, 1600);
      sfx.ghostDown();
    } else {
      this.burst(fx, spr.x, spr.y, fx === 'tank' ? 12 : 6);
      if (reward >= 10) this.floatText(spr.x, spr.y - 14, `+${reward}`, CSS.teal, 12);
      sfx.kill(fx === 'tank');
    }
    spr.destroy();
    return true;
  }

  // Gorilla Arms: o tiro que não mata empurra o inimigo (o fantasma resiste)
  private pushEnemy(spr: Phaser.Physics.Arcade.Sprite) {
    const copies = this.stats.gorilla;
    if (copies <= 0) return;
    const resist = spr.getData('isGhost') ? GHOST_PUSH_RESIST : 1;
    spr.setData('pushUntil', this.time.now + gorillaPushMs(copies) * resist);
  }

  private hitEnemy(b: Phaser.GameObjects.GameObject, e: Phaser.GameObjects.GameObject) {
    if (!b.active || !e.active) return; // duas balas no mesmo frame não podem matar duas vezes
    const spr = e as Phaser.Physics.Arcade.Sprite;
    b.destroy();
    if (!this.damageEnemy(spr, this.stats.damage)) this.pushEnemy(spr);
  }

  private hurtPlayer(e: Phaser.GameObjects.GameObject) {
    if (this.time.now < ((e.getData('armedAt') as number | undefined) ?? 0)) return; // ainda está nascendo
    const beh = e.getData('beh') as Behavior | undefined;
    const type = e.getData('type') as EnemyType | undefined;
    this.damagePlayer((e.getData('dmg') as number) * (beh && type ? behaviorDmgMul(type, beh) : 1));
  }

  // dano no jogador (contato ou ação do fantasma), respeitando os i-frames
  private damagePlayer(dmg: number) {
    const now = this.time.now;
    if (now < this.iframeUntil || this.state !== 'wave') return;
    this.iframeUntil = now + 500;
    if (this.run.hurt(dmg)) return this.finish('Você morreu na rua.', 'dead');

    // o golpe pesa conforme o dano
    this.cameras.main.shake(120, Phaser.Math.Clamp(dmg * 0.0007, 0.003, 0.012));
    this.burst('player', this.player.x, this.player.y, 6);
    this.player.setTintFill(PAL.pink);
    this.time.delayedCall(80, () => this.player.active && this.player.clearTint());
    sfx.hurt();
  }

  // =====================================================================
  // WAVES E LOJA
  // =====================================================================
  private startWave(n: number) {
    this.run.wave = n;
    this.timeLeft = WAVE_TIME;
    this.overtime = false;
    this.state = 'wave';
    this.resetSlow(); // a ativa começa pronta em toda wave
    this.slashCd = 0;
    this.playerPushUntil = 0;
    this.setMsg('');
    this.showBanner(`WAVE ${n}`);
    sfx.waveStart();
    this.scheduleGhostIfNeeded();
  }

  private endWave() {
    this.enemies.clear(true, true);
    this.bullets.clear(true, true);
    this.clearGhostVisuals();
    this.hideBanner();
    this.resetSlow();
    this.player.setVelocity(0, 0);
    this.player.setAlpha(1);
    if (this.wave >= TOTAL_WAVES) return this.finish(`VITÓRIA! ${TOTAL_WAVES} waves sobrevividas.`, 'win');
    this.run.openShop();
    this.state = 'shop';
    sfx.waveEnd();
    this.showShop();
  }

  private reroll() {
    if (!this.run.reroll()) {
      sfx.deny();
      return this.showShop('Edinhos insuficientes para reroll.');
    }
    sfx.click();
    this.showShop('Loja atualizada.');
  }

  private showShop(note = '') {
    const lines = this.run.shopItems
      .map((i, n) =>
        i
          ? `[${n + 1}] ${i.name}: ${i.desc}\n     ${this.run.priceOf(i)} edinhos, -${i.humanity} humanidade`
          : `[${n + 1}] --- (instalado)`,
      )
      .join('\n');
    this.setMsg(
      `LOJA (wave ${this.wave} concluída)  Implantes: ${this.implants.length}\n\n${lines}\n\n` +
        `[R] reroll (${this.run.rerollCost()} edinhos)   [ESPAÇO] próxima wave\n\n${note}`,
    );
  }

  private buy(i: number) {
    const res = this.run.buy(i);
    if (!res.ok) {
      if (res.reason === 'poor') {
        sfx.deny();
        this.showShop('Edinhos insuficientes.');
      }
      return;
    }
    if (res.psycho) return this.finish('CIBERPSICOSE. Você virou o inimigo.', 'psycho');
    sfx.buy();
    this.showShop(`${res.implant.name} instalado.`);
  }

  // =====================================================================
  // FIM DE RUN
  // =====================================================================
  private finish(text: string, kind: EndKind) {
    this.state = 'over';
    this.hideBanner();
    this.clearGhostVisuals();
    this.resetSlow();
    this.physics.pause();
    this.player.setVelocity(0, 0);
    this.player.setAlpha(1);
    const score = this.run.powerScore();

    let note = '';
    if (kind === 'psycho') {
      if (!saveGhost(this.run.ghostRecord())) note = '\n(não foi possível salvar o fantasma neste navegador)';
      this.cameras.main.shake(300, 0.01);
      this.cameras.main.flash(300, 5, 217, 232);
      sfx.psycho();
    } else if (kind === 'dead') {
      this.burst('player', this.player.x, this.player.y, 30);
      this.player.setVisible(false);
      this.cameras.main.shake(320, 0.015);
      this.cameras.main.flash(250, 255, 42, 109);
      sfx.death();
    } else {
      this.cameras.main.flash(200, 0, 240, 255);
      sfx.win();
    }

    this.setMsg(`${text}\n\nPoder: ${score}   Seed: ${this.run.seed}${note}\n\n[R] recomeçar`);
  }
}

export default GameScene;