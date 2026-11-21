import Phaser from 'phaser';
import type { EnemyType, Ghost, GhostRole, Implant, State, Stats } from './types';
import { IMPLANTS } from './data/implants';
import { ENEMY } from './data/enemies';
import { loadGhosts, saveGhost } from './storage';
import { sfx } from './sfx';

const TOTAL_WAVES = 5; // MVP: 5 waves (depois 10 + modo infinito)
const WAVE_TIME = 45; // segundos (depois 60-120)
const START: Stats = { hp: 100, maxHp: 100, speed: 200, fireDelay: 300, damage: 1, humanity: 100, edinhos: 0, enemySlow: 1 };

const BUY_KEYS = ['ONE', 'TWO', 'THREE'];

const ROLE_LABEL: Record<Exclude<GhostRole, 'none'>, string> = {
  elite: 'ELITE',
  miniboss: 'MINI-BOSS',
  boss: 'BOSS',
};

type FxKey = EnemyType | 'ghost' | 'player';
type EndKind = 'dead' | 'win' | 'psycho';

const FX_COLOR: Record<FxKey, number> = {
  normal: 0xff2a6d,
  fast: 0xff9e00,
  tank: 0xb14aed,
  ghost: 0x05d9e8,
  player: 0x00f0ff,
};

const W = 960;
const H = 540;
const SPAWN_MIN_DIST = 220; // inimigos não nascem em cima do jogador
const SPAWN_TELEGRAPH = 450; // ms "fantasma" antes de poder causar dano

export class GameScene extends Phaser.Scene {
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

  private state: State = 'wave';
  private wave = 1;
  private timeLeft = WAVE_TIME;
  private overtime = false;
  private nextShot = 0;
  private iframeUntil = 0;
  private movedOnce = false;
  private shotOnce = false;
  private hintDone = false;
  private stats: Stats = { ...START };
  private implants: string[] = [];
  private shopItems: (Implant | null)[] = [];
  private rerolls = 0;

  private ghost: Ghost | null = null;
  private ghostRole: GhostRole = 'none';
  private ghostWave = 0;
  private ghostSpawned = false;
  private ghostDefeated = false;
  private ghostEnemy: Phaser.Physics.Arcade.Sprite | null = null;
  private ghostLabel: Phaser.GameObjects.Text | null = null;

  constructor() {
    super('game');
  }

  // ---------- helpers de camada ----------
  private world<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.worldLayer.add(o);
    return o;
  }

  private ui<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.uiLayer.add(o);
    return o;
  }

  create() {
    this.state = 'wave';
    this.wave = 1;
    this.timeLeft = WAVE_TIME;
    this.overtime = false;
    this.nextShot = 0;
    this.iframeUntil = 0;
    this.movedOnce = false;
    this.shotOnce = false;
    this.hintDone = false;
    this.bannerTween = null;
    this.stats = { ...START };
    this.implants = [];
    this.shopItems = [];
    this.rerolls = 0;
    this.ghost = null;
    this.ghostRole = 'none';
    this.ghostWave = 0;
    this.ghostSpawned = false;
    this.ghostDefeated = false;
    this.ghostEnemy = null;
    this.ghostLabel = null;

    this.physics.resume();
    this.time.paused = false;

    this.worldLayer = this.add.layer();
    this.uiLayer = this.add.layer();
    this.uiCam = this.cameras.add(0, 0, W, H);
    this.cameras.main.ignore(this.uiLayer);
    this.uiCam.ignore(this.worldLayer);

    // placeholders: quadrados coloridos (troca por pixel art depois)
    const g = this.add.graphics();
    const tex = (key: string, color: number, size: number) => {
      if (this.textures.exists(key)) return;
      g.clear();
      g.fillStyle(color);
      g.fillRect(0, 0, size, size);
      g.generateTexture(key, size, size);
    };
    tex('p', 0x00f0ff, 16);
    tex('e', 0xff2a6d, 14);
    tex('ef', 0xff9e00, 10);
    tex('et', 0xb14aed, 24);
    tex('b', 0xf5e642, 6);
    tex('w', 0xffffff, 4); // partículas (recebem tint)
    if (!this.textures.exists('eg')) {
      g.clear();
      g.fillStyle(0x05d9e8);
      g.fillRect(0, 0, 24, 24);
      g.fillStyle(0xff2a6d);
      g.fillRect(4, 4, 16, 16);
      g.generateTexture('eg', 24, 24);
    }
    g.destroy();

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

    this.time.addEvent({ delay: 450, loop: true, callback: () => this.spawn() });

    // pausa sozinho se a janela perder o foco
    const onBlur = () => {
      if (this.state === 'wave') this.openPauseMenu();
    };
    this.game.events.on(Phaser.Core.Events.BLUR, onBlur);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.game.events.off(Phaser.Core.Events.BLUR, onBlur));

    // sorteia um fantasma salvo (ou fallback inicial) e define como mini-boss ou boss por sorteio ponderado pela pontuação
    const ghosts = loadGhosts();
    const ghostPool: Ghost[] = ghosts.length > 0
      ? ghosts
      : [{ score: 700, wave: 3, implants: ['Mantis Blades', 'Subdermal Armor'] }];

    this.ghost = ghostPool[Math.floor(Math.random() * ghostPool.length)];
    this.ghostRole = this.pickGhostRole(this.ghost.score);
    this.ghostWave = this.ghostRole === 'boss' ? TOTAL_WAVES : Math.ceil(TOTAL_WAVES / 2);

    // interface (câmera própria, nunca treme)
    const style = { fontFamily: 'monospace', fontSize: '14px', color: '#9ef' };
    this.hud = this.ui(this.add.text(10, 8, '', style).setDepth(10));
    this.msgBg = this.ui(
      this.add.rectangle(480, 270, 10, 10, 0x05050a, 0.82).setStrokeStyle(2, 0x00f0ff, 0.6).setDepth(9).setVisible(false),
    );
    this.msg = this.ui(this.add.text(480, 270, '', { ...style, fontSize: '20px', align: 'center' }).setOrigin(0.5).setDepth(10));
    this.banner = this.ui(
      this.add
        .text(480, 96, '', { fontFamily: 'monospace', fontSize: '28px', color: '#00f0ff', stroke: '#05050a', strokeThickness: 4 })
        .setOrigin(0.5)
        .setDepth(11)
        .setAlpha(0),
    );
    this.hint = this.ui(
      this.add
        .text(480, 520, 'WASD mover  ·  mouse mira e atira  ·  ESC pausa  ·  M som', { ...style, fontSize: '13px', color: '#7a8fa6' })
        .setOrigin(0.5)
        .setDepth(10),
    );

    this.showBanner('WAVE 1');
    sfx.waveStart();
    this.scheduleGhostIfNeeded();
  }

  update(time: number, delta: number) {
    this.updateHud();

    if (Phaser.Input.Keyboard.JustDown(this.keys.M)) {
      this.showBanner(sfx.toggleMute() ? 'SOM LIGADO' : 'SOM DESLIGADO', '#9ef', 900);
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

    if (Phaser.Input.Keyboard.JustDown(this.keys.ESC)) {
      this.openPauseMenu();
      return;
    }

    // i-frames visíveis: o jogador pisca enquanto está invulnerável
    const now = this.time.now;
    this.player.setAlpha(now < this.iframeUntil && Math.floor(now / 70) % 2 ? 0.25 : 1);

    // movimento WASD
    const dir = new Phaser.Math.Vector2(
      Number(this.keys.D.isDown) - Number(this.keys.A.isDown),
      Number(this.keys.S.isDown) - Number(this.keys.W.isDown),
    );
    if (dir.lengthSq() > 0) this.movedOnce = true;
    dir.normalize().scale(this.stats.speed);
    this.player.setVelocity(dir.x, dir.y);

    // tiro com mouse (segurar o botão)
    const p = this.input.activePointer;
    if (p.isDown && time > this.nextShot) {
      this.nextShot = time + this.stats.fireDelay;
      this.shotOnce = true;
      const angle = Phaser.Math.Angle.Between(this.player.x, this.player.y, p.worldX, p.worldY);
      const b = this.world(this.bullets.create(this.player.x, this.player.y, 'b') as Phaser.Physics.Arcade.Sprite);
      this.physics.velocityFromRotation(angle, 520, b.body!.velocity);
      this.time.delayedCall(900, () => b.active && b.destroy());
      sfx.shoot();
    }

    // a dica de controles some quando o jogador já fez as duas coisas
    if (!this.hintDone && this.movedOnce && this.shotOnce) {
      this.hintDone = true;
      this.tweens.add({ targets: this.hint, alpha: 0, duration: 600 });
    }

    // inimigos perseguem o jogador
    const base = (55 + this.wave * 10) * this.stats.enemySlow;
    this.enemies.getChildren().forEach((e) =>
      this.physics.moveToObject(e as Phaser.Physics.Arcade.Sprite, this.player, base * (e.getData('mul') as number)),
    );

    // atualiza rótulo do fantasma ativo
    if (this.ghostEnemy?.active && this.ghostLabel) {
      const hp = this.ghostEnemy.getData('hp') as number;
      const maxHp = this.ghostEnemy.getData('maxHp') as number;
      const role = ROLE_LABEL[this.ghostRole as Exclude<GhostRole, 'none'>];
      this.ghostLabel.setPosition(this.ghostEnemy.x, this.ghostEnemy.y - 24).setText(`FANTASMA [${role}] ${hp}/${maxHp}`);
    }

    this.timeLeft -= delta / 1000;
    if (this.timeLeft <= 0) {
      // na wave do boss o tempo não basta: é preciso derrotar o fantasma para vencer
      if (this.ghostRole === 'boss' && this.wave === this.ghostWave && !this.ghostDefeated) {
        this.timeLeft = 0;
        if (!this.overtime) {
          this.overtime = true;
          this.showBanner('DERROTE O FANTASMA PARA VENCER', '#ff2a6d', 0);
        }
      } else {
        this.endWave();
      }
    }
  }

  // ---------- feedback ----------
  private burst(key: FxKey, x: number, y: number, count: number) {
    this.fx[key].emitParticleAt(x, y, count);
  }

  private floatText(x: number, y: number, text: string, color: string, size = 12) {
    const t = this.world(
      this.add
        .text(x, y, text, { fontFamily: 'monospace', fontSize: `${size}px`, color, stroke: '#05050a', strokeThickness: 3 })
        .setOrigin(0.5)
        .setDepth(20),
    );
    this.tweens.add({ targets: t, y: y - 26, alpha: 0, duration: 700, onComplete: () => t.destroy() });
  }

  private showBanner(text: string, color = '#00f0ff', holdMs = 1400) {
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

  // ---------- menus ----------
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
        `Lentidão Inimigos: ${slowPct}% (${s.enemySlow.toFixed(2)}x)   |   Poder: ${this.powerScore()}\n\n` +
        `--- IMPLANTES ADQUIRIDOS (${this.implants.length}) ---\n${implantsText}\n\n` +
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

  // ---------- fantasma ----------
  private pickGhostRole(score: number): 'miniboss' | 'boss' {
    // pontuação alta -> mais chance de boss final; pontuação baixa -> mais chance de mini-boss
    const weights: ['miniboss' | 'boss', number][] =
      score >= 950
        ? [['boss', 75], ['miniboss', 25]]
        : score >= 650
          ? [['boss', 40], ['miniboss', 60]]
          : [['boss', 15], ['miniboss', 85]];
    const total = weights.reduce((acc, [, w]) => acc + w, 0);
    let r = Math.random() * total;
    for (const [role, w] of weights) {
      r -= w;
      if (r <= 0) return role;
    }
    return 'miniboss';
  }

  private scheduleGhostIfNeeded() {
    if (!this.ghost || this.ghostRole === 'none' || this.ghostSpawned || this.wave !== this.ghostWave) return;
    this.ghostSpawned = true;
    this.time.delayedCall(3500, () => {
      if (this.state === 'wave' && this.wave === this.ghostWave) this.spawnGhost();
    });
  }

  private spawnGhost() {
    if (!this.ghost || this.ghostRole === 'none') return;
    const role = this.ghostRole;
    const { x, y } = this.edgePoint(SPAWN_MIN_DIST, 16);

    // escala o fantasma para a curva de poder da wave em que aparece e a pontuação salva
    const scoreFactor = Phaser.Math.Clamp(this.ghost.score / 800, 0.8, 1.4);
    const isBoss = role === 'boss';

    const baseHp = isBoss ? 36 + this.wave * 14 : 18 + this.wave * 8;
    const baseDmg = isBoss ? 16 + this.wave * 3 : 12 + this.wave * 2;
    const baseMul = isBoss ? 1.0 : 1.15;
    const baseReward = isBoss ? 160 + this.wave * 20 : 90 + this.wave * 15;
    const scale = isBoss ? 1.55 : 1.25;

    // bônus temáticos baseados nos implantes que o fantasma possuía
    const implants = this.ghost.implants ?? [];
    let hpMod = 1;
    let dmgMod = 1;
    let speedMod = 1;
    if (implants.includes('Subdermal Armor') || implants.includes('Biomonitor')) hpMod += 0.2;
    if (implants.includes('Mantis Blades') || implants.includes('Gorilla Arms')) dmgMod += 0.25;
    if (implants.includes('Reinforced Tendons') || implants.includes('Sandevistan Lite')) speedMod += 0.15;

    const hp = Math.round(baseHp * scoreFactor * hpMod);
    const dmg = Math.round(baseDmg * dmgMod);
    const mul = Number((baseMul * speedMod).toFixed(2));

    const g = this.world(this.enemies.create(x, y, 'eg') as Phaser.Physics.Arcade.Sprite);
    g.setScale(scale);
    g.setData('hp', hp);
    g.setData('maxHp', hp);
    g.setData('mul', mul);
    g.setData('dmg', dmg);
    g.setData('reward', baseReward);
    g.setData('isGhost', true);
    g.setData('fx', 'ghost');
    this.armEnemy(g, 800);
    this.ghostEnemy = g;

    this.ghostLabel = this.world(
      this.add
        .text(x, y - 24, '', { fontFamily: 'monospace', fontSize: '12px', color: '#ff2a6d', backgroundColor: '#050814' })
        .setOrigin(0.5)
        .setDepth(9),
    );

    this.showBanner(`CIBERPSICOPATA DETECTADO [${ROLE_LABEL[role]}]`, '#ff2a6d', 2200);
    sfx.ghost();
  }

  private clearGhostVisuals() {
    this.ghostEnemy = null;
    if (this.ghostLabel) {
      this.ghostLabel.destroy();
      this.ghostLabel = null;
    }
  }

  // ---------- inimigos ----------
  private pickEnemyType(): EnemyType {
    const r = Math.random();
    if (this.wave >= 3 && r < 0.15) return 'tank';
    if (this.wave >= 2 && r < 0.4) return 'fast';
    return 'normal';
  }

  // ponto na borda da arena, longe do jogador
  private edgePoint(minDist: number, margin = 0): { x: number; y: number } {
    let x = 0;
    let y = 0;
    for (let i = 0; i < 8; i++) {
      const side = Phaser.Math.Between(0, 3);
      x = side === 0 ? margin : side === 1 ? W - margin : Phaser.Math.Between(margin, W - margin);
      y = side === 2 ? margin : side === 3 ? H - margin : Phaser.Math.Between(margin, H - margin);
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
    const type = this.pickEnemyType();
    const t = ENEMY[type];
    const e = this.world(this.enemies.create(x, y, t.tex) as Phaser.Physics.Arcade.Sprite);
    e.setData('hp', Math.max(1, 1 + Math.floor(this.wave / 2) + t.hp));
    e.setData('mul', t.mul);
    e.setData('dmg', t.dmg + (type === 'tank' ? this.wave * 2 : this.wave));
    e.setData('reward', t.reward);
    e.setData('fx', type);
    this.armEnemy(e, SPAWN_TELEGRAPH);
  }

  private hitEnemy(b: Phaser.GameObjects.GameObject, e: Phaser.GameObjects.GameObject) {
    if (!b.active || !e.active) return; // duas balas no mesmo frame não podem matar duas vezes
    const spr = e as Phaser.Physics.Arcade.Sprite;
    b.destroy();
    const hp = (e.getData('hp') as number) - this.stats.damage;
    const fx = e.getData('fx') as FxKey;
    const isGhost = Boolean(e.getData('isGhost'));

    if (hp > 0) {
      e.setData('hp', hp);
      spr.setTintFill(0xffffff);
      this.time.delayedCall(60, () => spr.active && spr.clearTint());
      if (isGhost) this.floatText(spr.x, spr.y - 22, String(this.stats.damage), '#ffffff', 11);
      sfx.hit();
      return;
    }

    const reward = e.getData('reward') as number;
    this.stats.edinhos += reward;
    if (isGhost) {
      this.ghostDefeated = true;
      this.clearGhostVisuals();
      this.burst('ghost', spr.x, spr.y, 40);
      this.cameras.main.shake(260, 0.012);
      this.cameras.main.zoomTo(1.05, 80);
      this.time.delayedCall(90, () => this.cameras.main.zoomTo(1, 180));
      this.floatText(spr.x, spr.y - 20, `+${reward}`, '#05d9e8', 16);
      this.showBanner('FANTASMA ELIMINADO', '#05d9e8', 1600);
      sfx.ghostDown();
    } else {
      this.burst(fx, spr.x, spr.y, fx === 'tank' ? 12 : 6);
      if (reward >= 10) this.floatText(spr.x, spr.y - 14, `+${reward}`, '#05d9e8', 12);
      sfx.kill(fx === 'tank');
    }
    e.destroy();
  }

  private hurtPlayer(e: Phaser.GameObjects.GameObject) {
    const now = this.time.now;
    if (now < this.iframeUntil || this.state !== 'wave') return;
    if (now < ((e.getData('armedAt') as number | undefined) ?? 0)) return; // ainda está nascendo
    const dmg = e.getData('dmg') as number;
    this.iframeUntil = now + 500;
    this.stats.hp -= dmg;
    if (this.stats.hp <= 0) return this.finish('Você morreu na rua.', 'dead');

    // o golpe pesa conforme o dano
    this.cameras.main.shake(120, Phaser.Math.Clamp(dmg * 0.0007, 0.003, 0.012));
    this.burst('player', this.player.x, this.player.y, 6);
    this.player.setTintFill(0xff2a6d);
    this.time.delayedCall(80, () => this.player.active && this.player.clearTint());
    sfx.hurt();
  }

  // ---------- waves e loja ----------
  private startWave(n: number) {
    this.wave = n;
    this.timeLeft = WAVE_TIME;
    this.overtime = false;
    this.state = 'wave';
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
    this.player.setVelocity(0, 0);
    this.player.setAlpha(1);
    if (this.wave >= TOTAL_WAVES) return this.finish(`VITÓRIA! ${TOTAL_WAVES} waves sobrevividas.`, 'win');
    this.rerolls = 0;
    this.rollShop();
    this.state = 'shop';
    sfx.waveEnd();
    this.showShop();
  }

  private rollShop() {
    this.shopItems = Phaser.Utils.Array.Shuffle([...IMPLANTS]).slice(0, 3);
  }

  // cada implante já instalado encarece os próximos em 25%
  private priceOf(imp: Implant) {
    return Math.round(imp.edinhos * (1 + this.implants.length * 0.25));
  }

  private rerollCost() {
    return 40 + this.rerolls * 25;
  }

  private reroll() {
    const cost = this.rerollCost();
    if (this.stats.edinhos < cost) {
      sfx.deny();
      return this.showShop('Edinhos insuficientes para reroll.');
    }
    this.stats.edinhos -= cost;
    this.rerolls++;
    this.rollShop();
    sfx.click();
    this.showShop('Loja atualizada.');
  }

  private showShop(note = '') {
    const lines = this.shopItems
      .map((i, n) =>
        i
          ? `[${n + 1}] ${i.name}: ${i.desc}\n     ${this.priceOf(i)} edinhos, -${i.humanity} humanidade`
          : `[${n + 1}] --- (instalado)`,
      )
      .join('\n');
    this.setMsg(
      `LOJA (wave ${this.wave} concluída)  Implantes: ${this.implants.length}\n\n${lines}\n\n` +
        `[R] reroll (${this.rerollCost()} edinhos)   [ESPAÇO] próxima wave\n\n${note}`,
    );
  }

  private buy(i: number) {
    const imp = this.shopItems[i];
    if (!imp) return;
    const price = this.priceOf(imp);
    if (this.stats.edinhos < price) {
      sfx.deny();
      return this.showShop('Edinhos insuficientes.');
    }
    this.stats.edinhos -= price;
    this.stats.humanity -= imp.humanity;
    imp.apply(this.stats);
    this.implants.push(imp.name);
    this.shopItems[i] = null;
    if (this.stats.humanity <= 0) return this.finish('CIBERPSICOSE. Você virou o inimigo.', 'psycho');
    sfx.buy();
    this.showShop(`${imp.name} instalado.`);
  }

  private powerScore() {
    const s = this.stats;
    return Math.round(s.damage * 10 + (1000 / s.fireDelay) * 10 + s.maxHp / 2 + (1 / s.enemySlow) * 20 + this.implants.length * 50 + this.wave * 100);
  }

  private finish(text: string, kind: EndKind) {
    this.state = 'over';
    this.hideBanner();
    this.clearGhostVisuals();
    this.physics.pause();
    this.player.setVelocity(0, 0);
    this.player.setAlpha(1);
    const score = this.powerScore();

    let note = '';
    if (kind === 'psycho') {
      const saved = saveGhost({ score, wave: this.wave, implants: this.implants });
      if (!saved) note = '\n(não foi possível salvar o fantasma neste navegador)';
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

    this.setMsg(`${text}\n\nPoder: ${score}${note}\n\n[R] recomeçar`);
  }

  private updateHud() {
    const s = this.stats;
    let ghostHud = '';
    if (this.ghost) {
      if (this.ghostDefeated) ghostHud = `   Fantasma ${this.ghost.score} (eliminado)`;
      else if (this.ghostRole !== 'none') ghostHud = `   Fantasma ${this.ghost.score} (${ROLE_LABEL[this.ghostRole]} W${this.ghostWave})`;
      else ghostHud = `   Fantasma ${this.ghost.score}`;
    }
    const time = this.overtime ? '--' : Math.max(0, Math.ceil(this.timeLeft));
    this.hud.setText(
      `HP ${Math.max(0, Math.round(s.hp))}/${s.maxHp}   Edinhos ${s.edinhos}   Humanidade ${s.humanity}   ` +
        `Wave ${this.wave}/${TOTAL_WAVES}   Tempo ${time}s${ghostHud}`,
    );
  }
}

export default GameScene;
