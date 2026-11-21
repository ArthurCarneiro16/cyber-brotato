import type { Ghost } from './types';

const KEY = 'ghosts';
const MAX_GHOSTS = 20;

const isGhost = (g: unknown): g is Ghost => {
  const x = g as Ghost;
  return (
    !!x &&
    typeof x.score === 'number' &&
    typeof x.wave === 'number' &&
    Array.isArray(x.implants) &&
    x.implants.every((i) => typeof i === 'string')
  );
};

// Save versionado: { v: 1, ghosts }. A v0 era um array puro e é migrada na leitura.
export function loadGhosts(): Ghost[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    const list = Array.isArray(data) ? data : data?.ghosts;
    if (!Array.isArray(list)) throw new Error('formato inválido');
    return list.filter(isGhost);
  } catch {
    // save quebrado: guarda uma cópia para não perder nada e começa limpo
    try {
      if (raw) localStorage.setItem(`${KEY}.bak`, raw);
    } catch {
      /* sem espaço ou bloqueado: segue sem backup */
    }
    return [];
  }
}

// Retorna false se o navegador recusou gravar (modo privado, cota cheia...).
export function saveGhost(ghost: Ghost): boolean {
  try {
    const ghosts = [...loadGhosts(), ghost].slice(-MAX_GHOSTS);
    localStorage.setItem(KEY, JSON.stringify({ v: 1, ghosts }));
    return true;
  } catch {
    return false;
  }
}
