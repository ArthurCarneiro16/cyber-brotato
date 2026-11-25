// Estados possíveis da máquina de estados do jogo
export type State = 'select' | 'wave' | 'shop' | 'over' | 'pause' | 'build' | 'confirm_restart';

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

// ---------- armas e classes ----------
export type WeaponKind = 'gun' | 'smart' | 'melee';
export type WeaponId = 'pistol' | 'smg' | 'shotgun' | 'smart' | 'katana' | 'gorilla';

export type Weapon = {
  id: WeaponId;
  name: string;
  desc: string;
  kind: WeaponKind;
  damage: number; // dano base (por projétil nas armas de tiro)
  delay: number; // ms entre ataques
  price: number; // edinhos (armas nunca custam humanidade)
  bonusMul: number; // fração do bônus de dano dos implantes que a arma recebe
  projSpeed: number; // px/s (só tiro)
  life: number; // ms de vida do projétil (define o alcance)
  pellets: number; // projéteis por disparo
  spread: number; // abertura do cone em graus
  acquire: number; // alcance de aquisição de alvo em px (só smart)
  range: number; // alcance do golpe em px (só melee)
  arc: number; // arco do golpe em graus (só melee)
  pushMs: number; // empurrão em ms (mesmo sistema do Gorilla Arms; só melee)
};

export type ClassId = 'solo' | 'netrunner' | 'techie';

export type ClassDef = {
  id: ClassId;
  name: string;
  desc: string;
  hp: number;
  weapon: WeaponId; // arma inicial
};
