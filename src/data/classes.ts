import type { ClassDef, ClassId, Weapon } from '../types';

export const CLASS_LIST: ClassDef[] = [
  {
    id: 'solo',
    name: 'Solo',
    desc: 'Katana. 120 HP. Corpo a corpo +1 de dano.',
    hp: 120,
    weapon: 'katana',
  },
  {
    id: 'netrunner',
    name: 'Netrunner',
    desc: 'Pistola. 90 HP. Armas de fogo atiram 10% mais rápido.',
    hp: 90,
    weapon: 'pistol',
  },
  {
    id: 'techie',
    name: 'Techie',
    desc: 'Pistola Inteligente. 100 HP. Mira auto: alcance 360, projétil 460.',
    hp: 100,
    weapon: 'smart',
  },
];

export const CLASSES = Object.fromEntries(CLASS_LIST.map((c) => [c.id, c])) as Record<ClassId, ClassDef>;

/** Bônus de classe: afeta só o tipo de arma correspondente, sem bônus geral. */
export function applyClassToWeapon(classId: ClassId | null, w: Weapon): Weapon {
  if (classId === 'solo' && w.kind === 'melee') return { ...w, damage: w.damage + 1 };
  if (classId === 'netrunner' && w.kind === 'gun') return { ...w, delay: w.delay * 0.9 };
  if (classId === 'techie' && w.kind === 'smart') return { ...w, acquire: 360, projSpeed: 460 };
  return w;
}
