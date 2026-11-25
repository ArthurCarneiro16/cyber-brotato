export const GAME_WIDTH = 960;
export const GAME_HEIGHT = 540;

export const ARENA = {
  x: 92,
  y: 72,
  width: 776,
  height: 396,
} as const;

export const PLAYER = {
  speed: 190,
  maxHealth: 8,
  hitCooldownMs: 1000,
  attackCooldownMs: 360,
  attackRange: 88,
  attackArc: Math.PI / 2.3,
} as const;

export const ENEMY = {
  speed: 66,
  maxHealth: 3,
  contactDamage: 1,
  contactRange: 27,
} as const;

export const COLORS = {
  background: '#080b12',
  floor: 0x101822,
  grid: 0x1b2935,
  border: 0x20cbd2,
  cyan: 0x62f3e2,
  pink: 0xff3978,
  white: 0xf4f7fb,
  muted: 0x91a5b3,
} as const;
