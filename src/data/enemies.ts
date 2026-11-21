import type { EnemyConfig, EnemyType } from '../types';

export const ENEMY: Record<EnemyType, EnemyConfig> = {
  normal: { tex: 'e', mul: 1, hp: 0, dmg: 6, reward: 5 },
  fast: { tex: 'ef', mul: 1.8, hp: -1, dmg: 4, reward: 4 },
  tank: { tex: 'et', mul: 0.6, hp: 4, dmg: 12, reward: 12 },
};

export const ENEMIES = ENEMY;
