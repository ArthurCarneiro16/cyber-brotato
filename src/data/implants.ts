import type { Implant } from '../types';

export const IMPLANTS: Implant[] = [
  {
    name: 'Subdermal Armor',
    desc: '+30 HP máximo e cura 30',
    edinhos: 120,
    humanity: 10,
    apply: (s) => {
      s.maxHp += 30;
      s.hp = Math.min(s.maxHp, s.hp + 30);
    },
  },
  {
    name: 'Reinforced Tendons',
    desc: '+15% velocidade de movimento',
    edinhos: 110,
    humanity: 10,
    apply: (s) => {
      s.speed = Math.round(s.speed * 1.15);
    },
  },
  {
    name: 'Biomonitor',
    desc: '+15 HP máximo e cura 50',
    edinhos: 130,
    humanity: 15,
    apply: (s) => {
      s.maxHp += 15;
      s.hp = Math.min(s.maxHp, s.hp + 50);
    },
  },
  {
    name: 'Mantis Blades',
    desc: 'corta em arco sozinho (64px, a cada 0,6s). Dano 3, +1 por cópia',
    edinhos: 200,
    humanity: 20,
    apply: (s) => {
      s.mantis += 1;
    },
  },
  {
    name: 'Sandevistan Lite',
    desc: 'ESPAÇO: inimigos a 30% da velocidade e tiro 1,5x mais rápido por 5s (recarga 25s)',
    edinhos: 160,
    humanity: 25,
    apply: (s) => {
      s.slowmo += 1;
    },
  },
  {
    name: 'Kiroshi Optics',
    desc: '+1 dano e tiro 15% mais rápido',
    edinhos: 230,
    humanity: 30,
    apply: (s) => {
      s.damage += 1;
      s.fireDelay = Math.max(80, s.fireDelay * 0.85);
    },
  },
  {
    name: 'Gorilla Arms',
    desc: '+1 de dano e os tiros empurram os inimigos',
    edinhos: 200,
    humanity: 25,
    apply: (s) => {
      s.damage += 1;
      s.gorilla += 1;
    },
  },
  {
    name: 'Kerenzikov',
    desc: 'inimigos 30% mais lentos e dano de contato -15%',
    edinhos: 220,
    humanity: 30,
    apply: (s) => {
      s.enemySlow = Math.max(0.35, s.enemySlow * 0.7);
      s.dmgTaken = Math.max(0.5, s.dmgTaken * 0.85);
    },
  },
];