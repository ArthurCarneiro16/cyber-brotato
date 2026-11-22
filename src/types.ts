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
