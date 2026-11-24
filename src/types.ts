// Estados possíveis da máquina de estados do jogo
export type State = 'wave' | 'shop' | 'over' | 'pause' | 'build' | 'confirm_restart';

export type Stats = {
  hp: number;
  maxHp: number;
  speed: number;
  fireDelay: number;
  damage: number;
  humanity: number;
  edinhos: number;
  enemySlow: number;
  dmgTaken: number; // multiplicador do dano de contato recebido (1 = normal, menor = mais defesa)
  slowmo: number; // cópias do Sandevistan instaladas (0 = sem a ativa)
  mantis: number; // cópias do Mantis Blades (0 = sem o corte automático)
  gorilla: number; // cópias do Gorilla Arms (0 = tiros sem empurrão)
};

export type Ghost = {
  score: number;
  wave: number;
  implants: string[];
  seed?: number; // seed da run que gerou este fantasma
};

export type GhostRole = 'none' | 'elite' | 'miniboss' | 'boss';

export type Implant = {
  name: string;
  desc: string;
  edinhos: number;
  humanity: number;
  apply: (s: Stats) => void;
};

export type EnemyType = 'normal' | 'fast' | 'tank';

export type EnemyConfig = {
  tex: string;
  mul: number;
  hp: number;
  dmg: number;
  reward: number;
};