// Regras da run SEM Phaser: estado, loja, preços, fantasma e pontuação.
// A cena só desenha e manda ações para cá. Isso permite testar com `node --test`
// e simular bots (src/sim/balance.ts) sem abrir navegador.
import type { ClassId, EnemyType, Ghost, Implant, Stats, Weapon, WeaponId } from '../types';
import { IMPLANTS } from '../data/implants';
import { ENEMY } from '../data/enemies';
import { WEAPON_LIST } from '../data/weapons';
import { CLASSES } from '../data/classes';
import { Rng } from './rng';

// =====================================================================
// CONSTANTES
// =====================================================================

// ---------- waves ----------
export const TOTAL_WAVES = 5; // MVP: 5 waves (depois 10 + modo infinito)
export const WAVE_TIME = 45; // segundos (depois 60-120)
export const SPAWN_INTERVAL_MS = 450;

// ---------- fantasma: cortes de pontuação do papel (usados também pelo simulador) ----------
export const GHOST_CUT_MID = 600; // a partir daqui: 40% de boss
export const GHOST_CUT_HIGH = 750; // a partir daqui: 75% de boss
export const GHOST_PUSH_RESIST = 0.3; // o fantasma é empurrado só 30% do Gorilla Arms

// ---------- Sandevistan (ativa no ESPAÇO): momento de poder, com recarga longa ----------
export const SLOWMO_FACTOR = 0.3; // velocidade dos inimigos enquanto ativo
export const SLOWMO_FIRE_MUL = 1.5; // cadência do jogador enquanto ativo
export const SLOWMO_COOLDOWN = 25; // s, contados a partir do FIM da ativa

// ---------- Mantis Blades: corte automático em arco, na direção do mouse ----------
export const MANTIS_INTERVAL = 0.6; // s entre cortes
export const MANTIS_RANGE = 64; // px
export const MANTIS_ARC = (Math.PI * 2) / 3; // 120 graus

// ---------- Gorilla Arms: tiros empurram o inimigo para longe do jogador ----------
export const GORILLA_PUSH_SPEED = 320; // px/s durante o empurrão

export const START: Readonly<Stats> = {
  hp: 100,
  maxHp: 100,
  speed: 200,
  fireDelay: 300,
  damage: 1,
  humanity: 100,
  edinhos: 0,
  enemySlow: 1,
  dmgTaken: 1,
  slowmo: 0,
  mantis: 0,
  gorilla: 0,
};

// usado até existir um fantasma real salvo (stand-in)
export const FALLBACK_GHOST: Ghost = { score: 700, wave: 3, implants: ['Mantis Blades', 'Subdermal Armor'] };

// =====================================================================
// TIPOS
// =====================================================================

export type LiveGhostRole = 'miniboss' | 'boss';
export type WaveStatus = 'running' | 'overtime' | 'done';
export type BuyResult =
  | { ok: false; reason: 'empty' | 'poor' }
  | { ok: true; implant: Implant; price: number; psycho: boolean };
export type WeaponBuyResult =
  | { ok: false; reason: 'empty' | 'poor' }
  | { ok: true; weapon: Weapon; price: number };

// =====================================================================
// FUNÇÕES PURAS: implantes
// =====================================================================

/** duração em segundos: 5s com 1 cópia, +1s por cópia extra */
export const slowmoDuration = (copies: number) => (copies > 0 ? 4 + copies : 0);

/** dano do corte do Mantis: 3 com 1 cópia, +1 por cópia extra */
export const mantisDamage = (copies: number) => (copies > 0 ? 2 + copies : 0);

/** duração do empurrão em ms: 125ms por cópia (= 40px por cópia) */
export const gorillaPushMs = (copies: number) => copies * 125;

/** distância do empurrão em px (usado no simulador) */
export const gorillaPushDist = (copies: number) => (GORILLA_PUSH_SPEED * gorillaPushMs(copies)) / 1000;

/** fração da wave com a ativa ligada (usa 1x no início e de novo assim que recarregar) */
function slowmoUptime(copies: number): number {
  const dur = slowmoDuration(copies);
  if (dur <= 0) return 0;
  const uses = Math.floor(Math.max(0, WAVE_TIME - dur) / (dur + SLOWMO_COOLDOWN)) + 1;
  return Math.min(1, (uses * dur) / WAVE_TIME);
}

/** multiplicador médio da velocidade dos inimigos considerando o tempo ativo (simulador) */
export function slowmoAvgFactor(copies: number): number {
  return 1 - slowmoUptime(copies) * (1 - SLOWMO_FACTOR);
}

/** multiplicador médio da cadência do jogador considerando o tempo ativo (simulador) */
export function slowmoAvgFire(copies: number): number {
  return 1 + slowmoUptime(copies) * (SLOWMO_FIRE_MUL - 1);
}

// =====================================================================
// FUNÇÕES PURAS: pontuação, inimigos e fantasma
// =====================================================================

export function powerScoreOf(s: Stats, implantCount: number, wave: number): number {
  return Math.round(
    s.damage * 10 +
      (1000 / s.fireDelay) * 10 +
      s.maxHp / 2 +
      (1 / s.enemySlow) * 20 +
      s.mantis * 10 +
      s.gorilla * 10 +
      implantCount * 50 +
      wave * 100,
  );
}

export function enemyStats(type: EnemyType, wave: number) {
  const t = ENEMY[type];
  return {
    hp: Math.max(1, 1 + Math.floor(wave / 2) + t.hp),
    mul: t.mul,
    dmg: t.dmg + (type === 'tank' ? wave * 2 : wave),
    reward: t.reward,
  };
}

export const enemySpeed = (wave: number, slow: number) => (55 + wave * 10) * slow;

/** pontuação alta -> mais chance de boss final; baixa -> mais chance de mini-boss */
export function pickGhostRole(score: number, rng: Rng): LiveGhostRole {
  const bossChance = score >= GHOST_CUT_HIGH ? 0.75 : score >= GHOST_CUT_MID ? 0.4 : 0.15;
  return rng.chance(bossChance) ? 'boss' : 'miniboss';
}

/** escala o fantasma pela pontuação salva e pela wave em que aparece */
export function ghostStats(ghost: Ghost, role: LiveGhostRole, wave: number) {
  const isBoss = role === 'boss';
  const scoreFactor = Math.min(1.4, Math.max(0.8, ghost.score / 800));
  const baseHp = isBoss ? 36 + wave * 14 : 18 + wave * 8;
  const baseDmg = isBoss ? 16 + wave * 3 : 12 + wave * 2;
  const baseMul = isBoss ? 1.0 : 1.15;

  // bônus temáticos pelos implantes que o fantasma tinha
  let hpMod = 1;
  let dmgMod = 1;
  let speedMod = 1;
  const has = (n: string) => ghost.implants.includes(n);
  if (has('Subdermal Armor') || has('Biomonitor')) hpMod += 0.2;
  if (has('Mantis Blades') || has('Gorilla Arms')) dmgMod += 0.25;
  if (has('Reinforced Tendons') || has('Sandevistan Lite')) speedMod += 0.15;

  return {
    hp: Math.round(baseHp * scoreFactor * hpMod),
    dmg: Math.round(baseDmg * dmgMod),
    mul: Number((baseMul * speedMod).toFixed(2)),
    reward: isBoss ? 160 + wave * 20 : 90 + wave * 15,
    scale: isBoss ? 1.55 : 1.25,
  };
}

// =====================================================================
// COMPORTAMENTO DOS INIMIGOS: aviso -> investida -> recuperação
// Usado pela cena e pelo simulador, para os dois andarem iguais.
// =====================================================================

export type Phase = 'chase' | 'windup' | 'dash' | 'recover';
export type Behavior = { phase: Phase; t: number }; // t = segundos na fase atual

export type BehaviorConfig = {
  trigger: number; // px: só começa o aviso a esta distância do jogador
  chaseMin: number; // s perseguindo antes de poder avisar de novo
  windup: number; // s parado, avisando
  dash: number; // s de investida
  dashMul: number; // velocidade da investida (multiplica a velocidade normal do inimigo)
  recover: number; // s de recuperação
  recoverMul: number; // velocidade na recuperação (0 = parado)
  dashDmg: number; // multiplicador do dano de contato durante a investida
};

export const BEHAVIOR: Partial<Record<EnemyType, BehaviorConfig>> = {
  fast: { trigger: 280, chaseMin: 0.4, windup: 0.4, dash: 0.35, dashMul: 3, recover: 0.6, recoverMul: 0.3, dashDmg: 1.0 },
  tank: { trigger: 360, chaseMin: 1.0, windup: 0.8, dash: 0.6, dashMul: 5, recover: 1.0, recoverMul: 0, dashDmg: 1.25 },
};

export const newBehavior = (): Behavior => ({ phase: 'chase', t: 0 });

/** avança a máquina de fases com uma config qualquer e devolve o multiplicador de velocidade */
export function stepBehaviorCfg(c: BehaviorConfig, b: Behavior, dist: number, dt: number): number {
  b.t += dt;
  switch (b.phase) {
    case 'chase':
      if (b.t >= c.chaseMin && dist <= c.trigger) {
        b.phase = 'windup';
        b.t = 0;
      }
      return 1;
    case 'windup':
      if (b.t >= c.windup) {
        b.phase = 'dash';
        b.t = 0;
      }
      return 0;
    case 'dash':
      if (b.t >= c.dash) {
        b.phase = 'recover';
        b.t = 0;
      }
      return c.dashMul;
    case 'recover':
      if (b.t >= c.recover) {
        b.phase = 'chase';
        b.t = 0;
      }
      return c.recoverMul;
  }
}

/** avança a máquina de fases de um inimigo comum */
export function stepBehavior(type: EnemyType, b: Behavior, dist: number, dt: number): number {
  const c = BEHAVIOR[type];
  return c ? stepBehaviorCfg(c, b, dist, dt) : 1;
}

/** dano de contato fica maior durante a investida */
export function behaviorDmgMul(type: EnemyType | null | undefined, b: Behavior): number {
  const c = type ? BEHAVIOR[type] : undefined;
  return c && b.phase === 'dash' ? c.dashDmg : 1;
}

// ---------- fantasma: comportamento pelos implantes que ele tinha ----------
export type GhostKind = 'mantis' | 'sandevistan' | 'gorilla';

export const GHOST_BEHAVIOR: Record<GhostKind, BehaviorConfig> = {
  mantis: { trigger: 80, chaseMin: 2.5, windup: 0.6, dash: 0.15, dashMul: 0, recover: 0.8, recoverMul: 0.5, dashDmg: 1 },
  sandevistan: { trigger: 300, chaseMin: 2, windup: 0.4, dash: 0.25, dashMul: 4, recover: 0.7, recoverMul: 0.4, dashDmg: 1 },
  gorilla: { trigger: 90, chaseMin: 3, windup: 0.8, dash: 0.15, dashMul: 0, recover: 1.0, recoverMul: 0.5, dashDmg: 1 },
};

export const GHOST_MANTIS_RADIUS = 70; // px do corte em volta do fantasma
export const GHOST_SLAM_RADIUS = 100; // px da onda de choque
export const GHOST_SLAM_PUSH_MS = 250; // ms que o jogador é empurrado

/** qual comportamento o fantasma usa (null = só persegue) */
export function ghostKind(g: Ghost): GhostKind | null {
  if (g.implants.includes('Mantis Blades')) return 'mantis';
  if (g.implants.includes('Sandevistan Lite')) return 'sandevistan';
  if (g.implants.includes('Gorilla Arms')) return 'gorilla';
  return null;
}

// =====================================================================
// ESTADO DA RUN
// =====================================================================

export class Run {
  readonly seed: number;
  // fluxos independentes: o que o jogador faz (spawns) nunca muda a loja nem o fantasma
  readonly rng: { spawn: Rng; shop: Rng; ghost: Rng; weapon: Rng };

  stats: Stats = { ...START };
  implants: string[] = [];
  wave = 1;
  shopItems: (Implant | null)[] = [];
  shopWeapons: (Weapon | null)[] = [];
  rerolls = 0;

  // classe e armas (a classe só vale depois de setClass; sem ela a run usa os stats base)
  classId: ClassId | null = null;
  weapons: WeaponId[] = [];
  equipped = 0;

  readonly ghost: Ghost;
  readonly ghostRole: LiveGhostRole;
  readonly ghostWave: number;
  readonly usesFallbackGhost: boolean;
  ghostDefeated = false;

  constructor(seed: number, ghosts: Ghost[]) {
    this.seed = seed >>> 0;
    this.rng = {
      spawn: new Rng(seed ^ 0x9e3779b9),
      shop: new Rng(seed ^ 0x85ebca6b),
      ghost: new Rng(seed ^ 0xc2b2ae35),
      weapon: new Rng(seed ^ 0x27d4eb2f), // fluxo próprio: o que o jogador tem nunca muda a loja de implantes
    };
    this.usesFallbackGhost = ghosts.length === 0;
    this.ghost = this.rng.ghost.pick(this.usesFallbackGhost ? [FALLBACK_GHOST] : ghosts);
    this.ghostRole = pickGhostRole(this.ghost.score, this.rng.ghost);
    this.ghostWave = this.ghostRole === 'boss' ? TOTAL_WAVES : Math.ceil(TOTAL_WAVES / 2);
  }

  get isBossWave(): boolean {
    return this.ghostRole === 'boss' && this.wave === this.ghostWave;
  }

  /** na wave do boss o tempo não basta: é preciso derrotar o fantasma */
  waveStatus(timeLeft: number): WaveStatus {
    if (timeLeft > 0) return 'running';
    return this.isBossWave && !this.ghostDefeated ? 'overtime' : 'done';
  }

  pickEnemyType(): EnemyType {
    const r = this.rng.spawn.next();
    if (this.wave >= 3 && r < 0.15) return 'tank';
    if (this.wave >= 2 && r < 0.4) return 'fast';
    return 'normal';
  }

  powerScore(): number {
    return powerScoreOf(this.stats, this.implants.length, this.wave);
  }

  /** dano de contato no jogador (já com a redução do Kerenzikov, mínimo 1); true se morreu */
  hurt(dmg: number): boolean {
    this.stats.hp -= Math.max(1, Math.round(dmg * this.stats.dmgTaken));
    return this.stats.hp <= 0;
  }

  // ----- classe e armas -----
  setClass(id: ClassId) {
    const c = CLASSES[id];
    this.classId = id;
    this.stats.maxHp = c.hp;
    this.stats.hp = c.hp;
    this.weapons = [c.weapon];
    this.equipped = 0;
  }

  get weaponId(): WeaponId {
    return this.weapons[this.equipped] ?? 'pistol';
  }

  /** troca para a próxima arma; false se só há uma */
  cycleWeapon(): boolean {
    if (this.weapons.length < 2) return false;
    this.equipped = (this.equipped + 1) % this.weapons.length;
    return true;
  }

  // ----- loja -----
  openShop() {
    this.rerolls = 0;
    this.rollShop();
  }

  private rollShop() {
    this.shopItems = this.rng.shop.shuffle(IMPLANTS).slice(0, 3);
    const pool = WEAPON_LIST.filter((w) => !this.weapons.includes(w.id));
    const picks = this.rng.weapon.shuffle(pool).slice(0, 2);
    this.shopWeapons = [picks[0] ?? null, picks[1] ?? null];
  }

  /** cada implante já instalado encarece os próximos em 25% */
  priceOf(imp: Implant): number {
    return Math.round(imp.edinhos * (1 + this.implants.length * 0.25));
  }

  rerollCost(): number {
    return 40 + this.rerolls * 25;
  }

  reroll(): boolean {
    const cost = this.rerollCost();
    if (this.stats.edinhos < cost) return false;
    this.stats.edinhos -= cost;
    this.rerolls++;
    this.rollShop();
    return true;
  }

  buy(i: number): BuyResult {
    const imp = this.shopItems[i];
    if (!imp) return { ok: false, reason: 'empty' };
    const price = this.priceOf(imp);
    if (this.stats.edinhos < price) return { ok: false, reason: 'poor' };
    this.stats.edinhos -= price;
    this.stats.humanity -= imp.humanity;
    imp.apply(this.stats);
    this.implants.push(imp.name);
    this.shopItems[i] = null;
    return { ok: true, implant: imp, price, psycho: this.stats.humanity <= 0 };
  }

  /** arma custa só edinhos (sem humanidade e sem inflação); já sai equipada */
  buyWeapon(i: number): WeaponBuyResult {
    const w = this.shopWeapons[i];
    if (!w) return { ok: false, reason: 'empty' };
    if (this.stats.edinhos < w.price) return { ok: false, reason: 'poor' };
    this.stats.edinhos -= w.price;
    this.weapons.push(w.id);
    this.equipped = this.weapons.length - 1;
    this.shopWeapons[i] = null;
    return { ok: true, weapon: w, price: w.price };
  }

  /** registro salvo quando a run termina em ciberpsicose */
  ghostRecord(): Ghost {
    return { score: this.powerScore(), wave: this.wave, implants: [...this.implants], seed: this.seed };
  }
}
