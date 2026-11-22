// Gerador com seed (mulberry32). Todo sorteio de GAMEPLAY passa por aqui.
// Aleatoriedade cosmética (partículas, variação de tom dos sons) fica de fora.
export class Rng {
  private s: number;

  constructor(seed: number) {
    this.s = seed >>> 0;
  }

  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** inteiro entre min e max, inclusive */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(list: readonly T[]): T {
    return list[this.int(0, list.length - 1)];
  }

  /** embaralha uma cópia (Fisher-Yates) */
  shuffle<T>(list: readonly T[]): T[] {
    const a = [...list];
    for (let i = a.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  get state(): number {
    return this.s;
  }

  set state(v: number) {
    this.s = v >>> 0;
  }
}

/** Só usado para ESCOLHER a seed de uma run nova. */
export function randomSeed(): number {
  return (Math.random() * 4294967296) >>> 0 || 1;
}
