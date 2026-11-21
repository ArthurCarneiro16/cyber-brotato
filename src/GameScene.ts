import Phaser from 'phaser';
import type { EnemyType, Ghost, GhostRole, Implant, State, Stats } from './types';
import { IMPLANTS } from './data/implants';
import { ENEMY } from './data/enemies';

const TOTAL_WAVES = 5; // MVP: 5 waves (depois 10 + modo infinito)
const WAVE_TIME = 45; // segundos (depois 60-120)
const START: Stats = { hp: 100, maxHp: 100, speed: 200, fireDelay: 300, damage: 1, humanity: 100, edinhos: 0, enemySlow: 1 };

const BUY_KEYS = ['ONE', 'TWO', 'THREE'];

const ROLE_LABEL: Record<Exclude<GhostRole, 'none'>, string> = {
  elite: 'ELITE',
  miniboss: 'MINI-BOSS',
  boss: 'BOSS',
};

export class GameScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private bullets!: Phaser.Physics.Arcade.Group;
  private enemies!: Phaser.Physics.Arcade.Group;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private hud!: Phaser.GameObjects.Text;
  private msg!: Phaser.GameObjects.Text;

  private state: State = 'wave';
  private wave = 1;
  private timeLeft = WAVE_TIME;
  private nextShot = 0;
  private iframeUntil = 0;
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

  create() {
    this.state = 'wave';
    this.wave = 1;
    this.timeLeft = WAVE_TIME;
    this.nextShot = 0;
    this.iframeUntil = 0;
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
    if (!this.textures.exists('eg')) {
      g.clear();
      g.fillStyle(0x05d9e8);
      g.fillRect(0, 0, 24, 24);
      g.fillStyle(0xff2a6d);
      g.fillRect(4, 4, 16, 16);
      g.generateTexture('eg', 24, 24);
    }
    g.destroy();

    this.player = this.physics.add.sprite(480, 270, 'p').setCollideWorldBounds(true);
    this.bullets = this.physics.add.group();
    this.enemies = this.physics.add.group();
    this.keys = this.input.keyboard!.addKeys('W,A,S,D,ONE,TWO,THREE,SPACE,R,ESC') as Record<string, Phaser.Input.Keyboard.Key>;

    this.physics.add.overlap(this.bullets, this.enemies, (b, e) =>
      this.hitEnemy(b as Phaser.GameObjects.GameObject, e as Phaser.GameObjects.GameObject),
    );
    this.physics.add.overlap(this.player, this.enemies, (_p, e) => this.hurtPlayer(e as Phaser.GameObjects.GameObject));

    this.time.addEvent({ delay: 450, loop: true, callback: () => this.spawn() });

    // sorteia um fantasma salvo (ou fallback inicial) e define como mini-boss ou boss por sorteio ponderado pela pontuação
    let ghosts: Ghost[] = [];
    try {
      ghosts = JSON.parse(localStorage.getItem('ghosts') ?? '[]');
    } catch {
      ghosts = [];
    }
    const ghostPool: Ghost[] = ghosts.length > 0
      ? ghosts
      : [{ score: 700, wave: 3, implants: ['Mantis Blades', 'Subdermal Armor'] }];

    this.ghost = ghostPool[Math.floor(Math.random() * ghostPool.length)];
    this.ghostRole = this.pickGhostRole(this.ghost.score);
    this.ghostWave = this.ghostRole === 'boss' ? TOTAL_WAVES : Math.ceil(TOTAL_WAVES / 2);

    const style = { fontFamily: 'monospace', fontSize: '14px', color: '#9ef' };
    this.hud = this.add.text(10, 8, '', style).setDepth(10);
    this.msg = this.add
      .text(480, 270, '', { ...style, fontSize: '20px', align: 'center' })
      .setOrigin(0.5)
      .setDepth(10);

    this.scheduleGhostIfNeeded();
  }

  update(time: number, delta: number) {
    this.updateHud();
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

    // movimento WASD
    const dir = new Phaser.Math.Vector2(
      Number(this.keys.D.isDown) - Number(this.keys.A.isDown),
      Number(this.keys.S.isDown) - Number(this.keys.W.isDown),
    );
    dir.normalize().scale(this.stats.speed);
    this.player.setVelocity(dir.x, dir.y);

    // tiro com mouse (segurar o botão)
    const p = this.input.activePointer;
    if (p.isDown && time > this.nextShot) {
      this.nextShot = time + this.stats.fireDelay;
      const angle = Phaser.Math.Angle.Between(this.player.x, this.player.y, p.worldX, p.worldY);
      const b = this.bullets.create(this.player.x, this.player.y, 'b') as Phaser.Physics.Arcade.Sprite;
      this.physics.velocityFromRotation(angle, 520, b.body!.velocity);
      this.time.delayedCall(900, () => b.active && b.destroy());
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
    if (this.timeLeft <= 0) this.endWave();
  }

  private openPauseMenu() {
    this.state = 'pause';
    this.physics.pause();
    this.time.paused = true;
    this.player.setVelocity(0, 0);
    this.msg.setText(
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
    this.msg.setText('');
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

    this.msg.setText(
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
    this.msg.setText(
      '=== REINICIAR RUN? ===\n\n' +
        'Tem certeza que deseja reiniciar a run?\n' +
        'O progresso da run atual será perdido.\n' +
        '(Os registros de fantasmas no localStorage serão preservados)\n\n' +
        '[1] Confirmar (Reiniciar)\n' +
        '[2] Cancelar (Voltar)',
    );
  }

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
    const side = Phaser.Math.Between(0, 3);
    const x = side === 0 ? 16 : side === 1 ? 944 : Phaser.Math.Between(40, 920);
    const y = side === 2 ? 16 : side === 3 ? 524 : Phaser.Math.Between(40, 500);

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
    const reward = baseReward;

    const g = this.enemies.create(x, y, 'eg') as Phaser.Physics.Arcade.Sprite;
    g.setScale(scale);
    g.setData('hp', hp);
    g.setData('maxHp', hp);
    g.setData('mul', mul);
    g.setData('dmg', dmg);
    g.setData('reward', reward);
    g.setData('isGhost', true);
    this.ghostEnemy = g;

    this.ghostLabel = this.add
      .text(x, y - 24, '', { fontFamily: 'monospace', fontSize: '12px', color: '#ff2a6d', backgroundColor: '#050814' })
      .setOrigin(0.5)
      .setDepth(9);

    this.msg.setText(`CIBERPSICOPATA DETECTADO [${ROLE_LABEL[role]}]`);
    this.time.delayedCall(2500, () => {
      if (this.state === 'wave') this.msg.setText('');
    });
  }

  private clearGhostVisuals() {
    this.ghostEnemy = null;
    if (this.ghostLabel) {
      this.ghostLabel.destroy();
      this.ghostLabel = null;
    }
  }

  private pickEnemyType(): EnemyType {
    const r = Math.random();
    if (this.wave >= 3 && r < 0.15) return 'tank';
    if (this.wave >= 2 && r < 0.4) return 'fast';
    return 'normal';
  }

  private spawn() {
    if (this.state !== 'wave') return;
    const side = Phaser.Math.Between(0, 3);
    const x = side === 0 ? 0 : side === 1 ? 960 : Phaser.Math.Between(0, 960);
    const y = side === 2 ? 0 : side === 3 ? 540 : Phaser.Math.Between(0, 540);
    const type = this.pickEnemyType();
    const t = ENEMY[type];
    const e = this.enemies.create(x, y, t.tex) as Phaser.Physics.Arcade.Sprite;
    e.setData('hp', Math.max(1, 1 + Math.floor(this.wave / 2) + t.hp));
    e.setData('mul', t.mul);
    e.setData('dmg', t.dmg + (type === 'tank' ? this.wave * 2 : this.wave));
    e.setData('reward', t.reward);
  }

  private hitEnemy(b: Phaser.GameObjects.GameObject, e: Phaser.GameObjects.GameObject) {
    b.destroy();
    const hp = (e.getData('hp') as number) - this.stats.damage;
    if (hp <= 0) {
      this.stats.edinhos += e.getData('reward') as number;
      if (e.getData('isGhost')) {
        this.ghostDefeated = true;
        this.clearGhostVisuals();
      }
      e.destroy();
    } else e.setData('hp', hp);
  }

  private hurtPlayer(e: Phaser.GameObjects.GameObject) {
    if (this.time.now < this.iframeUntil || this.state !== 'wave') return;
    this.iframeUntil = this.time.now + 500;
    this.stats.hp -= e.getData('dmg') as number;
    if (this.stats.hp <= 0) this.finish('Você morreu na rua.', false);
  }

  private startWave(n: number) {
    this.wave = n;
    this.timeLeft = WAVE_TIME;
    this.state = 'wave';
    this.msg.setText('');
    this.scheduleGhostIfNeeded();
  }

  private endWave() {
    this.enemies.clear(true, true);
    this.bullets.clear(true, true);
    this.clearGhostVisuals();
    this.player.setVelocity(0, 0);
    if (this.wave >= TOTAL_WAVES) return this.finish(`VITÓRIA! ${TOTAL_WAVES} waves sobrevividas.`, false);
    this.rerolls = 0;
    this.rollShop();
    this.state = 'shop';
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
    if (this.stats.edinhos < cost) return this.showShop('Edinhos insuficientes para reroll.');
    this.stats.edinhos -= cost;
    this.rerolls++;
    this.rollShop();
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
    this.msg.setText(
      `LOJA (wave ${this.wave} concluída)  Implantes: ${this.implants.length}\n\n${lines}\n\n` +
        `[R] reroll (${this.rerollCost()} edinhos)   [ESPAÇO] próxima wave\n\n${note}`,
    );
  }

  private buy(i: number) {
    const imp = this.shopItems[i];
    if (!imp) return;
    const price = this.priceOf(imp);
    if (this.stats.edinhos < price) return this.showShop('Edinhos insuficientes.');
    this.stats.edinhos -= price;
    this.stats.humanity -= imp.humanity;
    imp.apply(this.stats);
    this.implants.push(imp.name);
    this.shopItems[i] = null;
    if (this.stats.humanity <= 0) return this.finish('CIBERPSICOSE. Você virou o inimigo.', true);
    this.showShop(`${imp.name} instalado.`);
  }

  private powerScore() {
    const s = this.stats;
    return Math.round(s.damage * 10 + (1000 / s.fireDelay) * 10 + s.maxHp / 2 + (1 / s.enemySlow) * 20 + this.implants.length * 50 + this.wave * 100);
  }

  private finish(text: string, psycho: boolean) {
    this.state = 'over';
    this.clearGhostVisuals();
    const score = this.powerScore();
    if (psycho) {
      const ghosts = JSON.parse(localStorage.getItem('ghosts') ?? '[]');
      ghosts.push({ score, wave: this.wave, implants: this.implants });
      localStorage.setItem('ghosts', JSON.stringify(ghosts.slice(-20)));
    }
    this.msg.setText(`${text}\n\nPoder: ${score}\n\n[R] recomeçar`);
  }

  private updateHud() {
    const s = this.stats;
    let ghostHud = '';
    if (this.ghost) {
      if (this.ghostDefeated) ghostHud = `   Fantasma ${this.ghost.score} (eliminado)`;
      else if (this.ghostRole !== 'none') ghostHud = `   Fantasma ${this.ghost.score} (${ROLE_LABEL[this.ghostRole]} W${this.ghostWave})`;
      else ghostHud = `   Fantasma ${this.ghost.score}`;
    }
    this.hud.setText(
      `HP ${Math.max(0, Math.round(s.hp))}/${s.maxHp}   Edinhos ${s.edinhos}   Humanidade ${s.humanity}   ` +
        `Wave ${this.wave}/${TOTAL_WAVES}   Tempo ${Math.max(0, Math.ceil(this.timeLeft))}s${ghostHud}`,
    );
  }
}

export default GameScene;
